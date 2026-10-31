import type { Inbound } from "./generated/index.js";

export interface InboundEmailAddress { address: string; name: string | null }
export interface InboundAddressGroup { text: string; addresses: InboundEmailAddress[] }
export interface InboundEmailAttachment {
	filename: string;
	contentType: string;
	size: number;
	contentId: string | null;
	contentDisposition: "attachment" | "inline";
	downloadUrl: string;
}
export interface InboundParsedEmailData {
	messageId: string;
	date: Date;
	subject: string;
	from: InboundAddressGroup;
	to: InboundAddressGroup;
	cc: InboundAddressGroup | null;
	bcc: InboundAddressGroup | null;
	replyTo: InboundAddressGroup | null;
	inReplyTo: string | undefined;
	references: string | string[] | undefined;
	textBody: string | null;
	htmlBody: string | null;
	raw: string;
	attachments: InboundEmailAttachment[];
	headers: Record<string, string>;
	priority: string | undefined;
}
export interface InboundCleanedContent {
	html: string | null;
	text: string | null;
	hasHtml: boolean;
	hasText: boolean;
	attachments: InboundEmailAttachment[];
	headers: Record<string, string>;
}
export interface InboundWebhookEmail {
	id: string;
	messageId: string;
	from: InboundAddressGroup;
	to: InboundAddressGroup;
	recipient: string;
	subject: string;
	receivedAt: string;
	parsedData: InboundParsedEmailData;
	cleanedContent: InboundCleanedContent;
}
export interface InboundWebhookEndpoint { id: string; name: string; type: "webhook" | "email" | "email_group" }
export type InboundWebhookEvent = "email.received";
export interface InboundWebhookPayload {
	event: InboundWebhookEvent;
	timestamp: string;
	email: InboundWebhookEmail;
	endpoint: InboundWebhookEndpoint;
}
export interface InboundWebhookHeaders {
	"x-webhook-verification-token": string;
	"x-endpoint-id": string;
	"x-webhook-event": string;
	"x-webhook-timestamp": string;
}
export async function verifyWebhookFromHeaders(headers: Headers | Record<string, string | string[] | undefined>, client: Inbound): Promise<boolean> {
	const get = (name: string) => {
		const value = headers instanceof Headers ? headers.get(name) : headers[name];
		return Array.isArray(value) ? value[0] : value;
	};
	const id = get("x-endpoint-id");
	const token = get("x-webhook-verification-token");
	if (!id || !token) return false;
	try {
		const { config } = await client.endpoints.retrieve(id);
		return !!config && typeof config === "object" && "verificationToken" in config && config.verificationToken === token;
	} catch { return false; }
}
