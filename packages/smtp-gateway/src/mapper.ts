import { createHash } from "node:crypto";
import { type AddressObject, type ParsedMail, simpleParser } from "mailparser";
import type { SendEmailPayload } from "./api-client.ts";
import { SmtpRelayError } from "./api-client.ts";

export interface RelayEnvelope {
	mailFrom: string | null;
	rcptTo: string[];
}

const FORWARDED_HEADERS = ["in-reply-to", "references"];

function addressList(value: AddressObject | AddressObject[] | undefined): {
	formatted: string[];
	bare: string[];
} {
	const objects = value ? (Array.isArray(value) ? value : [value]) : [];
	const formatted: string[] = [];
	const bare: string[] = [];
	for (const object of objects) {
		for (const entry of object.value) {
			if (!entry.address) continue;
			bare.push(entry.address.toLowerCase());
			formatted.push(
				entry.name ? `${entry.name} <${entry.address}>` : entry.address,
			);
		}
	}
	return { formatted, bare };
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

export function idempotencyKeyFor(raw: Buffer, apiKey: string): string {
	return `smtp-${createHash("sha256")
		.update(apiKey.slice(0, 12))
		.update(raw)
		.digest("hex")
		.slice(0, 48)}`;
}

export async function mapRawMessage(
	raw: Buffer,
	envelope: RelayEnvelope,
): Promise<SendEmailPayload> {
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

	const to = addressList(parsed.to);
	const cc = addressList(parsed.cc);
	const visible = new Set([...to.bare, ...cc.bare]);
	const bcc = envelope.rcptTo.filter(
		(recipient) => !visible.has(recipient.toLowerCase()),
	);

	if (to.formatted.length === 0 && bcc.length === 0) {
		throw new SmtpRelayError({
			responseCode: 550,
			message: "5.1.3 No valid recipients",
		});
	}

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
		from,
		to: to.formatted.length > 0 ? to.formatted : bcc,
		subject: parsed.subject ?? "",
		...(html !== undefined ? { html } : {}),
		...(text !== undefined ? { text } : {}),
		...(cc.formatted.length > 0 ? { cc: cc.formatted } : {}),
		...(to.formatted.length > 0 && bcc.length > 0 ? { bcc } : {}),
		...(replyTo.formatted.length > 0 ? { reply_to: replyTo.formatted } : {}),
		...(customHeaders(parsed) ? { headers: customHeaders(parsed) } : {}),
		...(attachments.length > 0 ? { attachments } : {}),
	};
}
