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
			formatted.push(
				entry.name ? `${entry.name} <${entry.address}>` : entry.address,
			);
		}
	}
	return formatted;
}

function customHeaders(parsed: ParsedMail): Record<string, string> | undefined {
	const headers: Record<string, string> = {};
	for (const [name, value] of parsed.headers) {
		const lower = name.toLowerCase();
		const shouldForward =
			FORWARDED_HEADERS.includes(lower) || lower.startsWith("x-");
		if (!shouldForward) continue;
		if (typeof value === "string") headers[name] = value;
		else if (Array.isArray(value) && value.every((v) => typeof v === "string"))
			headers[name] = value.join(" ");
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
	const from = fromEntry?.name
		? `${fromEntry.name} <${fromAddress}>`
		: fromAddress;

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

	const attachments = (parsed.attachments ?? []).map((attachment, index) => ({
		filename: attachment.filename ?? `attachment-${index + 1}`,
		content: attachment.content.toString("base64"),
		content_type: attachment.contentType,
		...(attachment.cid ? { content_id: attachment.cid } : {}),
	}));

	return {
		fromAddress: fromAddress.toLowerCase(),
		payload: {
			from,
			to,
			subject: parsed.subject ?? "",
			...(html !== undefined ? { html } : {}),
			...(text !== undefined ? { text } : {}),
			...(cc.length > 0 ? { cc } : {}),
			...(bcc.length > 0 ? { bcc } : {}),
			...(replyTo.length > 0 ? { reply_to: replyTo } : {}),
			...(customHeaders(parsed) ? { headers: customHeaders(parsed) } : {}),
			...(attachments.length > 0 ? { attachments } : {}),
		},
	};
}
