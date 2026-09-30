import type { SeoPage } from "@/lib/marketing/seo-pages/types";

export const page: SeoPage = {
	slug: "email-parsing-api",
	title: "Email Parsing API: Email to Structured JSON",
	description:
		"Parse incoming email into structured JSON with headers, text, HTML, and attachments. See a real payload and practical parsing limits.",
	h1: "Parse incoming email into structured JSON",
	intro:
		"inbound parses every message it receives on your domains and delivers the result as JSON: addresses, headers, text and HTML bodies, the raw MIME source, thread information and attachment metadata with download links. This page is the field reference. It covers email that inbound receives; it does not parse MIME files you upload.",
	sections: [
		{
			heading: "From MIME message to JSON",
			paragraphs: [
				"This is a trimmed email.received payload for a message with one PDF attached. The top level holds event, timestamp, email and endpoint. Parsed MIME fields live in email.parsedData; a sanitized copy of the bodies lives in email.cleanedContent.",
				"Fields marked with ... were shortened for this page. A real payload also includes to, bcc, the full headers object, and attachments and headers inside cleanedContent.",
			],
			code: {
				label: "email.received payload (trimmed)",
				snippet: `{
  "event": "email.received",
  "timestamp": "2026-09-30T14:02:11.482Z",
  "email": {
    "id": "inbnd_3f9a1c2b7d4e8a60",
    "messageId": "<CAHx8c2k@mail.example.com>",
    "from": { "text": "Ada Lovelace <ada@example.com>",
      "addresses": [{ "name": "Ada Lovelace", "address": "ada@example.com" }] },
    "recipient": "invoices@yourdomain.com",
    "envelopeRecipients": ["invoices@yourdomain.com"],
    "subject": "Invoice 1042",
    "receivedAt": "2026-09-30T14:02:09.000Z",
    "threadId": "V1StGXR8_Z5jdHi6B-myT", "threadPosition": 1,
    "parsedData": {
      "cc": null, "replyTo": null,
      "textBody": "Hi, invoice 1042 is attached.",
      "htmlBody": "<p>Hi, invoice 1042 is attached.</p>",
      "headers": { "received-spf": "pass ...", "...": "..." },
      "raw": "Received: from mail.example.com ...",
      "attachments": [{ "filename": "invoice-1042.pdf",
        "contentType": "application/pdf", "size": 48213,
        "contentDisposition": "attachment",
        "downloadUrl": "https://inbound.new/api/e2/attachments/inbnd_3f9a1c2b7d4e8a60/invoice-1042.pdf" }]
    },
    "cleanedContent": { "html": "<p>...</p>", "text": "...", "hasHtml": true, "hasText": true }
  },
  "endpoint": { "id": "endp_xyz789", "name": "Invoices", "type": "webhook" }
}`,
			},
		},
		{
			heading: "Field reference",
			paragraphs: [
				"Address fields share one shape: text holds the header as written, and addresses holds each parsed name and address. Bodies are decoded from their transfer encoding and character set, so textBody and htmlBody are plain strings.",
			],
			bullets: [
				"from, to, and parsedData.cc, bcc and replyTo: { text, addresses: [{ name, address }] }, or null when the header is absent.",
				"recipient: the address on your domain this delivery was routed for. envelopeRecipients: every envelope recipient on your domains, including BCC recipients that never appear in the headers.",
				"messageId, parsedData.inReplyTo and parsedData.references: the message's own ID and the IDs it replies to. threadId and threadPosition show where inbound placed it in a conversation.",
				"parsedData.textBody and htmlBody: the decoded bodies. cleanedContent.html is the HTML with scripts, inline event handlers and javascript: URLs removed; cleanedContent.text is the same text body.",
				"parsedData.headers: parsed headers keyed by lowercase name, such as authentication-results and received-spf when present. parsedData.raw: the full MIME source.",
			],
		},
		{
			heading: "Attachments, inline images and size limits",
			paragraphs: [
				"The payload carries attachment metadata, not file contents. Each entry has filename, contentType, size in bytes, contentId, contentDisposition and a downloadUrl. Inline images appear in the same list, usually with contentDisposition inline and a contentId that matches a cid: reference in htmlBody.",
				"Download a file with GET on its downloadUrl, which has the form /api/e2/attachments/:emailId/:filename, and your API key in the Authorization header. The response is the file itself.",
			],
			bullets: [
				"Check contentType and size before downloading, and do not trust the filename extension alone.",
				"Copy files you need to keep into your own storage. Treat downloadUrl as a way to fetch the file, not as long-term hosting.",
				"When a payload would exceed 1 MB, attachment bodies inside raw are replaced with a placeholder. If it is still too large, parsedData.headers is emptied. Downloads are not affected.",
				"Handle missing values defensively: fields such as cc and threadId are null when empty, and inReplyTo, references or textBody can be absent from the JSON.",
			],
		},
		{
			heading: "Replies, thread headers and extraction workers",
			paragraphs: [
				"inbound parses the message structure. It does not strip quoted history from replies, and it does not run OCR or pull business fields such as invoice totals out of documents. textBody contains whatever the sender's client wrote, including quoted earlier messages.",
				"Use inReplyTo, references and threadId to connect a reply to its conversation, and keep extraction in a separate worker. The webhook handler stores the event; the worker downloads the file and passes it to your own OCR or AI step.",
			],
			code: {
				label:
					"Worker: download a PDF attachment, then hand it to your extractor",
				snippet: `import type { InboundWebhookPayload } from "inboundemail";

type Email = InboundWebhookPayload["email"];

export async function processInvoices(email: Email) {
  for (const file of email.parsedData.attachments) {
    if (file.contentType !== "application/pdf") continue;
    if ((file.size ?? 0) > 10 * 1024 * 1024) continue;

    const res = await fetch(file.downloadUrl, {
      headers: { Authorization: \`Bearer \${process.env.INBOUND_API_KEY}\` },
    });
    if (!res.ok) throw new Error(\`Download failed: \${res.status}\`);

    const bytes = new Uint8Array(await res.arrayBuffer());
    // Your own OCR or AI extraction step
    await extractInvoiceFields(bytes, { emailId: email.id });
  }
}`,
			},
		},
	],
	faqs: [
		{
			question: "How do I separate attachments from a raw MIME message?",
			answer:
				"With inbound you usually do not need to. Attachments are already listed in parsedData.attachments with metadata and a downloadUrl. The raw MIME source is included if you want to run your own parser, but for large messages the attachment bodies inside raw may be replaced with a placeholder.",
		},
		{
			question: "How do I retrieve attachments from a parsed email?",
			answer:
				"Send a GET request to the attachment's downloadUrl with the header Authorization: Bearer followed by your API key. The URL points to GET /api/e2/attachments/:emailId/:filename and returns the file bytes.",
		},
		{
			question: "How do I clean a parsed email reply?",
			answer:
				"cleanedContent.html removes script tags, inline event handlers and javascript: URLs, but inbound does not remove quoted text or signatures. To get only the new part of a reply, strip quoted lines and the previous message yourself, and use inReplyTo or threadId to find the conversation it belongs to.",
		},
		{
			question: "Can inbound extract data from invoices or receipts?",
			answer:
				"Not directly. inbound delivers the message and its files in a structured form. Reading totals, dates or line items out of a PDF or image is a separate step you run with your own OCR or AI tooling.",
		},
	],
	related: [
		"email-webhook-api",
		"email-api-for-ai-agents",
		"sendgrid-inbound-alternative",
		"postmark-inbound-alternative",
	],
	updated: "2026-09-30",
};
