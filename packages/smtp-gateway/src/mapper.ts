import { createHash } from "node:crypto";
import { type AddressObject, type ParsedMail, simpleParser } from "mailparser";
import type { SendEmailPayload } from "./api-client.ts";
import { SmtpRelayError } from "./api-client.ts";

export interface RelayEnvelope {
	mailFrom: string | null;
	rcptTo: string[];
}

export interface MappedRawMessage {
	payload: SendEmailPayload;
	fromAddress: string;
}

const FORWARDED_HEADERS = ["in-reply-to", "references"];

// The message is rebuilt by the send API, so a detached S/MIME signature (e.g. Apple Mail's
// smime.p7s) can never verify and would only be rejected as an unsupported attachment.
const DETACHED_SIGNATURE_TYPES = new Set([
	"application/pkcs7-signature",
	"application/x-pkcs7-signature",
]);

// The API writes these values into message headers verbatim, so decoded line breaks (e.g. from
// RFC 2047 encoded-words) would inject headers.
function headerText(value: string): string {
	return value.replace(/[\x00-\x1f\x7f]+/g, " ").trim();
}

// Also used inside quotes or next to <address>: the API takes the first <...> as the address.
function phrase(value: string | undefined): string {
	return headerText((value ?? "").replace(/["\\<>]/g, " "));
}

function mailbox(name: string | undefined, address: string): string {
	const display = phrase(name);
	if (!display) return address;
	// RFC 5322 phrase: quote unless it consists of atoms only.
	const atoms = /^[\w!#$%&'*+\-/=?^`{|}~ ]+$/.test(display);
	return `${atoms ? display : `"${display}"`} <${address}>`;
}

function addressList(
	value: AddressObject | AddressObject[] | undefined,
	allowed?: Set<string>,
	seen?: Set<string>,
): string[] {
	const objects = value ? (Array.isArray(value) ? value : [value]) : [];
	const formatted: string[] = [];
	for (const object of objects) {
		for (const entry of object.value) {
			if (!entry.address) continue;
			const normalized = entry.address.toLowerCase();
			if (allowed && !allowed.has(normalized)) continue;
			if (seen?.has(normalized)) continue;
			seen?.add(normalized);
			formatted.push(mailbox(entry.name, entry.address));
		}
	}
	return formatted;
}

function customHeaders(parsed: ParsedMail): Record<string, string> | undefined {
	const headers: Record<string, string> = {};
	for (const [name, value] of parsed.headers) {
		const lower = name.toLowerCase();
		// SES acts on X-SES-* headers (e.g. configuration set), so never forward them.
		const shouldForward =
			FORWARDED_HEADERS.includes(lower) ||
			(lower.startsWith("x-") && !lower.startsWith("x-ses-"));
		if (!shouldForward) continue;
		if (typeof value === "string") headers[name] = headerText(value);
		else if (Array.isArray(value) && value.every((v) => typeof v === "string"))
			headers[name] = headerText(value.join(" "));
	}
	return Object.keys(headers).length > 0 ? headers : undefined;
}

export function idempotencyKeyFor(
	raw: Buffer,
	credentialId: string,
	envelope: RelayEnvelope,
): string {
	const recipients = [
		...new Set(
			envelope.rcptTo.map((recipient) => recipient.trim().toLowerCase()),
		),
	].sort();
	return `smtp-${createHash("sha256")
		.update(
			JSON.stringify({
				credentialId,
				mailFrom: envelope.mailFrom?.trim().toLowerCase() ?? null,
				recipients,
			}),
		)
		.update("\0")
		.update(raw)
		.digest("hex")
		.slice(0, 48)}`;
}

export async function mapRawMessage(
	raw: Buffer,
	envelope: RelayEnvelope,
): Promise<MappedRawMessage> {
	const parsed = await simpleParser(raw);

	const fromEntry = parsed.from?.value?.[0];
	const fromAddress = fromEntry?.address ?? envelope.mailFrom;
	if (!fromAddress) {
		throw new SmtpRelayError({
			responseCode: 550,
			message: "5.1.7 Missing sender address",
		});
	}
	const from = mailbox(fromEntry?.name, fromAddress);

	const envelopeRecipients = new Map<string, string>();
	for (const recipient of envelope.rcptTo) {
		const address = recipient.trim();
		const normalized = address.toLowerCase();
		if (address && !envelopeRecipients.has(normalized)) {
			envelopeRecipients.set(normalized, address);
		}
	}
	if (envelopeRecipients.size === 0) {
		throw new SmtpRelayError({
			responseCode: 550,
			message: "5.1.3 No valid recipients",
		});
	}

	const allowed = new Set(envelopeRecipients.keys());
	const visible = new Set<string>();
	const to = addressList(parsed.to, allowed, visible);
	const cc = addressList(parsed.cc, allowed, visible);
	const bcc = [...envelopeRecipients]
		.filter(([normalized]) => !visible.has(normalized))
		.map(([, address]) => address);

	const replyTo = addressList(parsed.replyTo);
	const html =
		typeof parsed.html === "string" && parsed.html.length > 0
			? parsed.html
			: undefined;
	const text = parsed.text ?? (html ? undefined : "");

	const attachments = (parsed.attachments ?? [])
		.filter(
			(attachment) =>
				!DETACHED_SIGNATURE_TYPES.has(
					(attachment.contentType ?? "").toLowerCase(),
				),
		)
		.map((attachment, index) => ({
			filename: phrase(attachment.filename) || `attachment-${index + 1}`,
			content: attachment.content.toString("base64"),
			content_type: phrase(attachment.contentType) || undefined,
			...(attachment.cid ? { content_id: phrase(attachment.cid) } : {}),
		}));
	const headers = customHeaders(parsed);

	return {
		fromAddress: fromAddress.toLowerCase(),
		payload: {
			from,
			to,
			subject: headerText(parsed.subject ?? ""),
			...(html !== undefined ? { html } : {}),
			...(text !== undefined ? { text } : {}),
			...(cc.length > 0 ? { cc } : {}),
			...(bcc.length > 0 ? { bcc } : {}),
			...(replyTo.length > 0 ? { reply_to: replyTo } : {}),
			...(headers ? { headers } : {}),
			...(attachments.length > 0 ? { attachments } : {}),
		},
	};
}
