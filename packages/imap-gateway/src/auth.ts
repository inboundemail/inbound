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

	async authenticate(
		address: string,
		password: string,
	): Promise<AuthenticatedMailbox | null> {
		const response = await fetch(
			`${this.config.apiBaseUrl}/mailboxes/authenticate`,
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ loginAddress: address, password }),
			},
		);
		if (response.status === 401 || response.status === 403) return null;
		if (!response.ok) {
			throw new Error(`Authentication backend returned ${response.status}`);
		}
		return (await response.json()) as AuthenticatedMailbox;
	}
}
