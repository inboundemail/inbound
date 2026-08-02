import { createHash } from "node:crypto";
import type { GatewayConfig } from "./config.ts";

const VERIFY_CACHE_TTL_MS = 5 * 60_000;

export interface SendEmailPayload {
	from: string;
	to: string[];
	subject: string;
	html?: string;
	text?: string;
	cc?: string[];
	bcc?: string[];
	reply_to?: string[];
	headers?: Record<string, string>;
	attachments?: Array<{
		filename: string;
		content: string;
		content_type?: string;
		content_id?: string;
	}>;
}

export interface SendEmailResult {
	id: string;
	message_id?: string;
}

export interface SmtpFailure {
	responseCode: number;
	message: string;
}

export function smtpFailureForApiStatus(
	status: number,
	apiMessage: string | null,
): SmtpFailure {
	const detail = apiMessage ? `: ${apiMessage}` : "";
	if (status === 401 || status === 403) {
		return {
			responseCode: 550,
			message: `5.7.1 Not authorized${detail}`,
		};
	}
	if (status === 413) {
		return {
			responseCode: 552,
			message: "5.3.4 Message size exceeds fixed maximum message size",
		};
	}
	if (status === 429) {
		return {
			responseCode: 451,
			message: "4.7.0 Rate limit exceeded, try again later",
		};
	}
	if (status >= 400 && status < 500) {
		return {
			responseCode: 550,
			message: `5.6.0 Message rejected${detail}`,
		};
	}
	return {
		responseCode: 451,
		message: "4.3.0 Temporary upstream failure, try again later",
	};
}

export class SmtpRelayError extends Error {
	responseCode: number;

	constructor(failure: SmtpFailure) {
		super(failure.message);
		this.responseCode = failure.responseCode;
	}
}

async function readErrorMessage(response: Response): Promise<string | null> {
	try {
		const body = (await response.json()) as {
			error?: string;
			message?: string;
		};
		return body.error ?? body.message ?? null;
	} catch {
		return null;
	}
}

export class InboundApiClient {
	private config: GatewayConfig;
	private verifiedKeys = new Map<string, number>();

	constructor(config: GatewayConfig) {
		this.config = config;
	}

	async verifyApiKey(apiKey: string): Promise<boolean> {
		const cacheKey = createHash("sha256").update(apiKey).digest("hex");
		const cachedUntil = this.verifiedKeys.get(cacheKey);
		if (cachedUntil && cachedUntil > Date.now()) return true;
		this.verifiedKeys.delete(cacheKey);

		const response = await fetch(
			`${this.config.apiBaseUrl}${this.config.authCheckPath}`,
			{
				method: "GET",
				headers: { Authorization: `Bearer ${apiKey}` },
			},
		);
		if (response.ok) {
			this.verifiedKeys.set(cacheKey, Date.now() + VERIFY_CACHE_TTL_MS);
			return true;
		}
		if (response.status === 401 || response.status === 403) return false;
		throw new SmtpRelayError({
			responseCode: 451,
			message: "4.3.0 Authentication backend unavailable, try again later",
		});
	}

	async sendEmail(
		apiKey: string,
		payload: SendEmailPayload,
		idempotencyKey: string,
	): Promise<SendEmailResult> {
		const response = await fetch(
			`${this.config.apiBaseUrl}${this.config.sendPath}`,
			{
				method: "POST",
				headers: {
					Authorization: `Bearer ${apiKey}`,
					"Content-Type": "application/json",
					"Idempotency-Key": idempotencyKey,
				},
				body: JSON.stringify(payload),
			},
		);
		if (!response.ok) {
			const apiMessage = await readErrorMessage(response);
			throw new SmtpRelayError(
				smtpFailureForApiStatus(response.status, apiMessage),
			);
		}
		return (await response.json()) as SendEmailResult;
	}
}
