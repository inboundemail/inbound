export type MailFolder =
	| "inbox"
	| "starred"
	| "snoozed"
	| "sent"
	| "drafts"
	| "archive"
	| "spam"
	| "trash";

export type MailCategory = "important" | "updates" | "receipts" | "team";

export interface MailContact {
	name: string;
	email: string;
	avatar?: string;
}

export interface MailAttachment {
	id: string;
	name: string;
	size: string;
	type: "pdf" | "image" | "document" | "archive";
}

export interface MailMessage {
	id: string;
	threadId: string;
	direction: "inbound" | "outbound";
	from: MailContact;
	to: MailContact[];
	cc?: MailContact[];
	sentAt: string;
	bodyText: string;
	bodyHtml?: string;
	attachments?: MailAttachment[];
}

export interface MailThread {
	id: string;
	subject: string;
	snippet: string;
	participants: MailContact[];
	lastMessageAt: string;
	messageCount: number;
	unread: boolean;
	starred: boolean;
	important: boolean;
	folder: Exclude<MailFolder, "starred">;
	category: MailCategory;
	labels: string[];
	snoozedUntil?: string;
	messages: MailMessage[];
}

export interface ComposerDraft {
	id: string;
	from: string;
	to: string;
	cc: string;
	bcc: string;
	subject: string;
	content: string;
	replyToThreadId?: string;
	updatedAt: string;
}

export interface MailCacheSnapshot {
	version: 2;
	threads: MailThread[];
	draft: ComposerDraft | null;
	lastSyncedAt: string | null;
	mailboxConfiguration?: MailboxConfigurationState;
}

export interface InboundSession {
	authenticated: boolean;
	mode: "mock" | "auth-mock" | "live";
	user?: {
		id: string;
		name: string;
		email: string;
		image?: string | null;
	};
	domainScope?: {
		mode: "all" | "selected";
		domains: Array<{ id: string; domain: string }>;
	};
}

export type MailboxSelectionMode = "all" | "selected";

export interface MailboxConfiguration {
	domainId: string;
	domain: string;
	enabled: boolean;
	selectionMode: MailboxSelectionMode;
	addresses: string[];
	defaultFromAddress: string | null;
}

export interface MailboxConfigurationState {
	onboarded: boolean;
	mailboxes: MailboxConfiguration[];
}

export interface MailboxConfigurationInput {
	mailboxes: MailboxConfiguration[];
}

export interface SendMessageInput {
	from: string;
	to: string[];
	cc: string[];
	bcc: string[];
	subject: string;
	html: string;
	text: string;
	replyToThreadId?: string;
}
