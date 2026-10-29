export type MailboxAccessMode = "read" | "read_write";

export type MailboxType = "mailbox" | "smtp";

export type MailboxSendingMode = "identity" | "scoped_domains";

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
	type: MailboxType;
	name: string;
	loginAddress: string;
	accessMode: MailboxAccessMode;
	sendingMode: MailboxSendingMode;
	sendingName: string | null;
	sendingAddress: string | null;
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
	type: MailboxType;
	name: string;
	loginAddress: string;
	accessMode: MailboxAccessMode;
	sendingMode: MailboxSendingMode;
	sendingName: string | null;
	sendingAddress: string | null;
	scopes: MailboxScopeInput[];
}

export interface UpdateMailboxInput {
	type?: MailboxType;
	name?: string;
	loginAddress?: string;
	accessMode?: MailboxAccessMode;
	sendingMode?: MailboxSendingMode;
	sendingName?: string | null;
	sendingAddress?: string | null;
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

export type MailboxActivityEvent =
	| "login_succeeded"
	| "login_failed"
	| "login_refused"
	| "session_ended"
	| "command_error"
	| "quota_exceeded"
	| "send_failed"
	| "send_rate_limited"
	| "events_dropped";

export interface MailboxActivity {
	id: string;
	mailboxId: string;
	occurredAt: string;
	lastOccurredAt: string;
	protocol: "imap" | "smtp" | "api";
	event: MailboxActivityEvent;
	reason: string | null;
	clientIp: string | null;
	client: string | null;
	count: number;
	detail: Record<string, string | number | boolean> | null;
}

export interface MailboxActivityResponse {
	data: MailboxActivity[];
	pagination: {
		limit: number;
		offset: number;
		total: number;
		hasMore: boolean;
	};
}
