import { spawn } from "node:child_process";
import { hostname, platform } from "node:os";
import type { Credentials } from "./config";
import { HttpError, requestJson } from "./http";

const CLIENT_ID = "inboundctl";
const DEVICE_GRANT = "urn:ietf:params:oauth:grant-type:device_code";

type DeviceCodeResponse = {
	device_code: string;
	user_code: string;
	verification_uri: string;
	verification_uri_complete?: string;
	expires_in: number;
	interval?: number;
};

type DeviceTokenResponse = {
	access_token: string;
	token_type: string;
	expires_in: number;
	scope: string;
};

type ApiKeyResponse = {
	id: string;
	key: string;
};

type SessionResponse = {
	user?: {
		id?: string;
		email?: string;
		name?: string;
	};
};

export type DeviceLoginEvents = {
	onCode?: (code: DeviceCodeResponse) => void;
	onPending?: () => void;
};

export async function loginWithDeviceFlow(input: {
	baseUrl: string;
	request?: typeof fetch;
	sleep?: (milliseconds: number) => Promise<void>;
	events?: DeviceLoginEvents;
}): Promise<Credentials> {
	const request = input.request || fetch;
	const sleep = input.sleep || wait;
	const code = await requestJson<DeviceCodeResponse>({
		baseUrl: input.baseUrl,
		path: "/api/auth/device/code",
		method: "POST",
		body: { client_id: CLIENT_ID },
		request,
	});
	input.events?.onCode?.(code);

	const deadline = Date.now() + code.expires_in * 1000;
	let interval = Math.max(code.interval || 5, 1);
	let token: DeviceTokenResponse | null = null;

	while (Date.now() < deadline) {
		await sleep(interval * 1000);
		try {
			token = await requestJson<DeviceTokenResponse>({
				baseUrl: input.baseUrl,
				path: "/api/auth/device/token",
				method: "POST",
				body: {
					grant_type: DEVICE_GRANT,
					device_code: code.device_code,
					client_id: CLIENT_ID,
				},
				request,
			});
			break;
		} catch (error) {
			const deviceError = getDeviceError(error);
			if (deviceError === "authorization_pending") {
				input.events?.onPending?.();
				continue;
			}
			if (deviceError === "slow_down") {
				interval += 5;
				continue;
			}
			if (deviceError === "access_denied") {
				throw new Error("Device authorization was denied");
			}
			if (deviceError === "expired_token") {
				throw new Error(
					"Device authorization expired. Run 'inboundctl login' again.",
				);
			}
			throw error;
		}
	}

	if (!token) {
		throw new Error(
			"Device authorization expired. Run 'inboundctl login' again.",
		);
	}

	const keyName = `inboundctl-${sanitizeName(hostname())}`.slice(0, 64);
	const [apiKey, session] = await Promise.all([
		requestJson<ApiKeyResponse>({
			baseUrl: input.baseUrl,
			path: "/api/auth/api-key/create",
			method: "POST",
			token: token.access_token,
			body: { name: keyName },
			request,
		}),
		requestJson<SessionResponse>({
			baseUrl: input.baseUrl,
			path: "/api/auth/get-session",
			token: token.access_token,
			request,
		}).catch((): SessionResponse => ({})),
	]);
	await requestJson({
		baseUrl: input.baseUrl,
		path: "/api/auth/sign-out",
		method: "POST",
		token: token.access_token,
		body: {},
		request,
	});

	return {
		version: 1,
		apiKey: apiKey.key,
		apiKeyId: apiKey.id,
		user: session.user,
	};
}

export function openBrowser(url: string): void {
	const command =
		platform() === "darwin"
			? "open"
			: platform() === "win32"
				? "cmd"
				: "xdg-open";
	const args = platform() === "win32" ? ["/c", "start", "", url] : [url];
	const child = spawn(command, args, { detached: true, stdio: "ignore" });
	child.on("error", () => undefined);
	child.unref();
}

function getDeviceError(error: unknown): string | undefined {
	if (!(error instanceof HttpError)) return undefined;
	if (typeof error.body !== "object" || error.body === null) return undefined;
	const value = (error.body as Record<string, unknown>).error;
	return typeof value === "string" ? value : undefined;
}

function sanitizeName(value: string): string {
	return (
		value
			.toLowerCase()
			.replace(/[^a-z0-9-]+/g, "-")
			.replace(/^-|-$/g, "") || "device"
	);
}

function wait(milliseconds: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
