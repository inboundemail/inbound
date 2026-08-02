import type { Inbound } from "./client.js";

export interface InboundWebhookPayload {
	event: "email.received";
	timestamp: string;
	email: {
		id: string;
		messageId: string;
		subject: string;
		recipient: string;
		[key: string]: unknown;
	};
	endpoint: {
		id: string;
		name: string;
		type: string;
	};
}

export function isInboundWebhookPayload(
	value: unknown,
): value is InboundWebhookPayload {
	if (typeof value !== "object" || value === null) return false;
	const record = value as Record<string, unknown>;
	return (
		record.event === "email.received" &&
		typeof record.timestamp === "string" &&
		typeof record.email === "object" &&
		record.email !== null &&
		typeof record.endpoint === "object" &&
		record.endpoint !== null
	);
}

export async function verifyWebhookFromHeaders(
	headers: Headers | Record<string, string | string[] | undefined>,
	client: Inbound,
): Promise<boolean> {
	const getHeader = (name: string): string | null => {
		if (headers instanceof Headers) return headers.get(name);
		const value = headers[name] ?? headers[name.toLowerCase()];
		return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
	};

	const verificationToken = getHeader("x-webhook-verification-token");
	const endpointId = getHeader("x-endpoint-id");
	if (!verificationToken || !endpointId) return false;

	try {
		const endpoint = await client.endpoints.retrieve(endpointId);
		const config = endpoint.config;
		return (
			typeof config === "object" &&
			config !== null &&
			"verificationToken" in config &&
			config.verificationToken === verificationToken
		);
	} catch {
		return false;
	}
}
