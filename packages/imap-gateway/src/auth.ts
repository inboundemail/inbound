import type { ImapConfig } from "./config.ts";

export interface MailboxScope {
	id: string;
	type: "domain" | "address";
	domainId: string;
	domain: string;
	address: string | null;
}

export interface AuthenticatedMailbox {
	userId: string;
	credentialId: string;
	loginAddress: string;
	accessMode: "read" | "read_write";
	scopes: MailboxScope[];
}

export class ApiAuth {
	private config: ImapConfig;

	constructor(config: ImapConfig) {
		this.config = config;
	}

	/**
	 * `client` (the IMAP ID name/version) is shown in the mailbox activity log;
	 * `revalidate` marks a re-check of an open session, which is not logged as a sign-in.
	 */
	async authenticate(
		address: string,
		password: string,
		clientIp: string,
		options: { client?: string | null; revalidate?: boolean } = {},
	): Promise<AuthenticatedMailbox | null> {
		const headers: Record<string, string> = {
			"Content-Type": "application/json",
		};
		if (this.config.gatewayAuthSecret) {
			headers["x-inbound-gateway-secret"] = this.config.gatewayAuthSecret;
			headers["x-inbound-client-ip"] = clientIp;
			if (options.client) headers["x-inbound-client-name"] = options.client;
			if (options.revalidate) headers["x-inbound-auth-purpose"] = "revalidate";
		}
		const response = await fetch(
			`${this.config.apiBaseUrl}/mailboxes/authenticate`,
			{
				method: "POST",
				headers,
				body: JSON.stringify({ loginAddress: address, password }),
				redirect: "error",
				signal: AbortSignal.timeout(this.config.apiTimeoutMs),
			},
		);
		if (response.status === 401 || response.status === 403) return null;
		if (!response.ok) {
			throw new Error(`Authentication backend returned ${response.status}`);
		}
		return (await response.json()) as AuthenticatedMailbox;
	}
}
