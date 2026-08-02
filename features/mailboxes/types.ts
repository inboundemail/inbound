export type MailboxAccessMode = "read" | "read_write";

export type MailboxScopeType = "domain" | "address";

export interface MailboxScopeInput {
	type: MailboxScopeType;
	domainId: string;
	address?: string;
}

export interface MailboxScope extends MailboxScopeInput {
	id: string;
	domain: string;
}

export interface Mailbox {
	id: string;
	name: string;
	loginAddress: string;
	accessMode: MailboxAccessMode;
	enabled: boolean;
	scopes: MailboxScope[];
	createdAt: string;
	updatedAt: string;
	lastUsedAt: string | null;
}

export interface MailboxesResponse {
	data: Mailbox[];
	pagination: {
		limit: number;
		offset: number;
		total: number;
		hasMore: boolean;
	};
}

export interface CreateMailboxInput {
	name: string;
	loginAddress: string;
	accessMode: MailboxAccessMode;
	scopes: MailboxScopeInput[];
}

export interface UpdateMailboxInput {
	name?: string;
	loginAddress?: string;
	accessMode?: MailboxAccessMode;
	enabled?: boolean;
	scopes?: MailboxScopeInput[];
}

export interface MailboxPasswordResponse {
	password: string;
}

export interface CreateMailboxResponse extends MailboxPasswordResponse {
	data: Mailbox;
}

export interface UpdateMailboxResponse {
	data: Mailbox;
}
