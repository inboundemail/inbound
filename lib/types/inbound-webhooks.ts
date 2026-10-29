export interface InboundEmailAddressEntry {
	name: string | null;
	address: string | null;
}

export interface InboundEmailAddress {
	text: string;
	addresses: InboundEmailAddressEntry[];
}

export interface InboundHeaderAddressValue {
	value: Array<{
		address: string;
		name: string;
	}>;
	html: string;
	text: string;
}

export interface InboundContentTypeHeader {
	value: string;
	params: {
		boundary: string;
	};
}

export interface InboundDkimSignatureHeader {
	value: string;
	params: Record<string, string>;
}

export type InboundEmailHeaderValue =
	| string
	| string[]
	| InboundHeaderAddressValue
	| InboundContentTypeHeader
	| InboundDkimSignatureHeader;

export type InboundEmailHeaders = Record<string, InboundEmailHeaderValue>;

export interface InboundParsedEmailData {
	messageId: string;
	date: Date;
	subject: string;
	from: InboundEmailAddress;
	to: InboundEmailAddress;
	cc: InboundEmailAddress | null;
	bcc: InboundEmailAddress | null;
	replyTo: InboundEmailAddress | null;
	inReplyTo?: string;
	references?: string | string[];
	textBody: string | null;
	htmlBody: string | null;
	raw: string;
	attachments: unknown[];
	headers: InboundEmailHeaders;
	priority?: string;
}

export interface InboundCleanedContent {
	html: string | null;
	text: string | null;
	hasHtml: boolean;
	hasText: boolean;
	attachments: unknown[];
	headers: InboundEmailHeaders;
}

export interface InboundSpamVerdict {
	isJunk: boolean;
	reason: "classifier" | "ses_spam" | "guard_rule" | "user" | null;
}

export interface InboundWebhookPayload {
	event: "email.received" | string;
	timestamp: string;
	email: {
		id: string;
		messageId: string;
		from: InboundEmailAddress;
		to: InboundEmailAddress;
		recipient: string;
		subject: string;
		receivedAt: string;
		threadId?: string | null;
		threadPosition?: number | null;
		spam?: InboundSpamVerdict;
		parsedData: InboundParsedEmailData;
		cleanedContent: InboundCleanedContent;
	};
	endpoint: {
		id: string;
		name: string;
		type: "webhook" | "email" | "email_group";
	};
}
