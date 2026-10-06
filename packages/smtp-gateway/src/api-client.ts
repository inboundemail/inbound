import type { GatewayConfig } from "./config.ts";

export interface SmtpIdentity {
	credentialId: string;
	userId: string;
	loginAddress: string;
	type: "mailbox" | "smtp";
	accessMode: "read" | "read_write";
	sendingMode: "identity" | "scoped_domains";
	sendingName: string | null;
	sendingAddress: string | null;
	allowedDomains: string[];
}

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

export interface SendRawEmailPayload {
	raw: string;
	recipients: string[];
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
	// API messages end up in an SMTP reply line: strip line breaks and bound their length.
	const safeMessage = apiMessage
		?.replace(/[\x00-\x1f\x7f]+/g, " ")
		.trim()
		.slice(0, 200);
	const detail = safeMessage ? `: ${safeMessage}` : "";
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
	if (status === 409 || status === 429) {
		return {
			responseCode: 451,
			message: "4.7.0 Rate limited or already in progress, try again later",
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

	constructor(config: GatewayConfig) {
		this.config = config;
	}

	async authenticateSmtp(
		loginAddress: string,
		password: string,
		clientIp: string,
	): Promise<SmtpIdentity | null> {
		const failure = "4.7.0 Authentication backend unavailable, try again later";
		const headers: Record<string, string> = {
			"Content-Type": "application/json",
		};
		if (this.config.gatewayAuthSecret) {
			headers["x-inbound-gateway-secret"] = this.config.gatewayAuthSecret;
			headers["x-inbound-client-ip"] = clientIp;
		}
		const response = await this.request(
			`${this.config.apiBaseUrl}/mailboxes/authenticate-smtp`,
			{
				method: "POST",
				headers,
				body: JSON.stringify({ loginAddress, password }),
			},
			this.config.authRequestTimeoutMs,
			{ responseCode: 454, message: failure },
		);
		if (response.ok) return (await response.json()) as SmtpIdentity;
		// 400 means malformed (e.g. over-long) credentials; 403 is a gateway-secret misconfiguration,
		// which must not look like, or be throttled as, a wrong password.
		if (response.status === 400 || response.status === 401) return null;
		throw new SmtpRelayError({ responseCode: 454, message: failure });
	}

	async sendEmail(
		apiKey: string,
		payload: SendEmailPayload,
		idempotencyKey: string,
	): Promise<SendEmailResult> {
		const response = await this.request(
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
			this.config.sendRequestTimeoutMs,
			{
				responseCode: 451,
				message: "4.3.0 Temporary upstream failure, try again later",
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

	/**
	 * Relays the message bytes unchanged (S/MIME signatures stay valid). Returns null when the
	 * API does not offer raw relay yet, so the caller can fall back to the rebuilt JSON send.
	 */
	async sendRawEmail(
		apiKey: string,
		payload: SendRawEmailPayload,
		idempotencyKey: string,
	): Promise<SendEmailResult | null> {
		const headers: Record<string, string> = {
			Authorization: `Bearer ${apiKey}`,
			"Content-Type": "application/json",
			"Idempotency-Key": idempotencyKey,
		};
		if (this.config.gatewayAuthSecret) {
			headers["x-inbound-gateway-secret"] = this.config.gatewayAuthSecret;
		}
		const response = await this.request(
			`${this.config.apiBaseUrl}${this.config.rawSendPath}`,
			{ method: "POST", headers, body: JSON.stringify(payload) },
			this.config.sendRequestTimeoutMs,
			{
				responseCode: 451,
				message: "4.3.0 Temporary upstream failure, try again later",
			},
		);
		if (response.status === 404 || response.status === 405) return null;
		if (!response.ok) {
			const apiMessage = await readErrorMessage(response);
			throw new SmtpRelayError(
				smtpFailureForApiStatus(response.status, apiMessage),
			);
		}
		return (await response.json()) as SendEmailResult;
	}

	private async request(
		url: string,
		options: RequestInit,
		timeoutMs: number,
		failure: SmtpFailure,
	): Promise<Response> {
		try {
			return await fetch(url, {
				...options,
				signal: AbortSignal.timeout(timeoutMs),
			});
		} catch {
			throw new SmtpRelayError(failure);
		}
	}
}
