import { type AddressObject, type ParsedMail, simpleParser } from "mailparser";

const CRLF = "\r\n";
const HEADER_BODY_SEPARATOR = Buffer.from("\r\n\r\n", "latin1");
const MAX_HEADER_LINE_BYTES = 998;
const HEADER_FIELD = /^([!-9;-~]+):/;
const INVALID_HEADER_CHARACTERS = /[\u0000-\u0008\u000a-\u001f\u007f]/;
const DOT_ATOM_ADDRESS =
	/^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/;
const SINGLETON_HEADERS = new Set([
	"from",
	"to",
	"cc",
	"reply-to",
	"subject",
	"date",
	"message-id",
	"in-reply-to",
	"references",
	"mime-version",
	"content-type",
	"content-transfer-encoding",
]);
const STRUCTURAL_HEADERS = new Set([
	"from",
	"to",
	"cc",
	"reply-to",
	"subject",
	"date",
	"mime-version",
]);
const RELAYED_HEADERS = new Set([
	"to",
	"cc",
	"reply-to",
	"subject",
	"date",
	"message-id",
	"in-reply-to",
	"references",
	"mime-version",
]);
const SMIME_SIGNATURE_PROTOCOLS = new Set([
	"application/pkcs7-signature",
	"application/x-pkcs7-signature",
]);

export class RawMessageError extends Error {}

interface HeaderField {
	name: string;
	lower: string;
	lines: string[];
}

export interface RawAttachment {
	filename: string;
	content: string;
	content_type?: string;
	content_id?: string;
}

export interface PreparedRawMessage {
	raw: Buffer;
	from: string;
	fromAddress: string;
	to: string[];
	cc: string[];
	bcc: string[];
	replyTo: string[];
	subject: string;
	text?: string;
	html?: string;
	headers: Record<string, string>;
	attachments: RawAttachment[];
}

/**
 * Relays S/MIME detached-signed (multipart/signed) mail without touching the
 * signed entity: only top-level headers are rewritten. Only structural,
 * threading, Content-* and X-* (except X-SES-*) headers are kept, From is
 * replaced by a canonical single mailbox, and Date is added when missing. Delivery uses the
 * given envelope recipients, never the To/Cc/Bcc headers.
 */
export async function prepareRawRelayMessage(
	raw: Buffer,
	envelopeRecipients: string[],
): Promise<PreparedRawMessage> {
	const separatorIndex = raw.indexOf(HEADER_BODY_SEPARATOR);
	if (separatorIndex <= 0) {
		throw new RawMessageError("Message must contain headers and a body");
	}
	const fields = parseHeaderBlock(
		raw.subarray(0, separatorIndex).toString("latin1"),
	);

	const counts = new Map<string, number>();
	for (const field of fields) {
		counts.set(field.lower, (counts.get(field.lower) ?? 0) + 1);
	}
	for (const [lower, count] of counts) {
		if (count > 1 && SINGLETON_HEADERS.has(lower)) {
			throw new RawMessageError(`Duplicate ${lower} header`);
		}
	}
	if (counts.get("from") !== 1) {
		throw new RawMessageError("Message must contain exactly one From header");
	}

	const parsed = await simpleParser(raw);
	const contentType = parsed.headers.get("content-type");
	const isSignedSmime =
		typeof contentType === "object" &&
		contentType !== null &&
		"params" in contentType &&
		contentType.value.toLowerCase() === "multipart/signed" &&
		SMIME_SIGNATURE_PROTOCOLS.has(
			(contentType.params.protocol ?? "").toLowerCase(),
		);
	if (!isSignedSmime) {
		throw new RawMessageError(
			"Raw relay only supports S/MIME multipart/signed messages",
		);
	}

	const sender = singleMailbox(parsed.from);
	const fromAddress = sender.address.toLowerCase();

	const recipients = new Map<string, string>();
	for (const recipient of envelopeRecipients) {
		const address = recipient.trim();
		if (!DOT_ATOM_ADDRESS.test(address)) {
			throw new RawMessageError(`Invalid recipient address: ${recipient}`);
		}
		const normalized = address.toLowerCase();
		if (!recipients.has(normalized)) recipients.set(normalized, address);
	}
	if (recipients.size === 0) {
		throw new RawMessageError("At least one envelope recipient is required");
	}
	const headerTo = addressSet(parsed.to);
	const headerCc = addressSet(parsed.cc);
	const to: string[] = [];
	const cc: string[] = [];
	const bcc: string[] = [];
	for (const [normalized, address] of recipients) {
		if (headerTo.has(normalized)) to.push(address);
		else if (headerCc.has(normalized)) cc.push(address);
		else bcc.push(address);
	}

	const outgoing: string[] = [];
	const headers: Record<string, string> = {};
	for (const field of fields) {
		const { lower } = field;
		const relayed =
			RELAYED_HEADERS.has(lower) ||
			lower.startsWith("content-") ||
			(lower.startsWith("x-") && !lower.startsWith("x-ses-"));
		if (lower !== "from" && !relayed) {
			continue;
		}
		if (lower === "from") {
			outgoing.push(`From: ${encodeMailbox(sender.name, sender.address)}`);
			continue;
		}
		outgoing.push(...field.lines);
		if (!STRUCTURAL_HEADERS.has(lower) && !lower.startsWith("content-")) {
			headers[field.name] = unfold(field).slice(field.name.length + 1).trim();
		}
	}
	if (!counts.has("date")) {
		outgoing.push(`Date: ${new Date().toUTCString().replace("GMT", "+0000")}`);
	}

	const displayName = sender.name
		.replace(/[\u0000-\u001f\u007f"<>\\]+/g, " ")
		.trim();
	const html =
		typeof parsed.html === "string" && parsed.html.length > 0
			? parsed.html
			: undefined;

	return {
		raw: Buffer.concat([
			Buffer.from(outgoing.join(CRLF), "latin1"),
			raw.subarray(separatorIndex),
		]),
		from: displayName ? `${displayName} <${sender.address}>` : sender.address,
		fromAddress,
		to,
		cc,
		bcc,
		replyTo: [...addressSet(parsed.replyTo)],
		subject: parsed.subject ?? "",
		text: parsed.text,
		html,
		headers,
		attachments: relayAttachments(parsed),
	};
}

function parseHeaderBlock(block: string): HeaderField[] {
	if (/\r(?!\n)|(?<!\r)\n/.test(block)) {
		throw new RawMessageError("Message headers must use CRLF line endings");
	}
	const fields: HeaderField[] = [];
	for (const line of block.split(CRLF)) {
		if (Buffer.byteLength(line, "latin1") > MAX_HEADER_LINE_BYTES) {
			throw new RawMessageError("Message header line is too long");
		}
		if (INVALID_HEADER_CHARACTERS.test(line)) {
			throw new RawMessageError("Message headers contain control characters");
		}
		const current = fields.at(-1);
		if (line.startsWith(" ") || line.startsWith("\t")) {
			if (!current || line.trim() === "") {
				throw new RawMessageError("Malformed message header folding");
			}
			current.lines.push(line);
			continue;
		}
		const match = HEADER_FIELD.exec(line);
		if (!match) {
			throw new RawMessageError("Malformed message header line");
		}
		fields.push({
			name: match[1],
			lower: match[1].toLowerCase(),
			lines: [line],
		});
	}
	return fields;
}

function unfold(field: HeaderField): string {
	return field.lines.join(" ").replace(/[ \t]+/g, " ");
}

function singleMailbox(value: AddressObject | AddressObject[] | undefined): {
	name: string;
	address: string;
} {
	const objects = value ? (Array.isArray(value) ? value : [value]) : [];
	const entries = objects.flatMap((object) => object.value);
	const [entry] = entries;
	if (
		entries.length !== 1 ||
		!entry ||
		entry.group ||
		!entry.address ||
		!DOT_ATOM_ADDRESS.test(entry.address)
	) {
		throw new RawMessageError("From header must contain exactly one address");
	}
	return { name: entry.name ?? "", address: entry.address };
}

function addressSet(
	value: AddressObject | AddressObject[] | undefined,
): Set<string> {
	const objects = value ? (Array.isArray(value) ? value : [value]) : [];
	const addresses = new Set<string>();
	const visit = (entries: AddressObject["value"]) => {
		for (const entry of entries) {
			if (entry.address) addresses.add(entry.address.toLowerCase());
			if (entry.group) visit(entry.group);
		}
	};
	for (const object of objects) visit(object.value);
	return addresses;
}

function encodeMailbox(name: string, address: string): string {
	const display = name.replace(/[\u0000-\u001f\u007f]+/g, " ").trim();
	if (!display) return address;
	if (/^[\x20-\x7e]{1,200}$/.test(display)) {
		return `"${display.replace(/[\\"]/g, "\\$&")}" <${address}>`;
	}
	const words: string[] = [];
	let chunk = "";
	for (const character of display) {
		if (Buffer.byteLength(chunk + character, "utf8") > 45) {
			words.push(chunk);
			chunk = "";
		}
		chunk += character;
	}
	if (chunk) words.push(chunk);
	const encoded = words
		.map((word) => `=?UTF-8?B?${Buffer.from(word, "utf8").toString("base64")}?=`)
		.join(`${CRLF} `);
	return `${encoded}${CRLF} <${address}>`;
}

function relayAttachments(parsed: ParsedMail): RawAttachment[] {
	return (parsed.attachments ?? [])
		.filter(
			(attachment) =>
				!SMIME_SIGNATURE_PROTOCOLS.has(
					(attachment.contentType ?? "").toLowerCase(),
				),
		)
		.map((attachment, index) => ({
			filename: attachment.filename || `attachment-${index + 1}`,
			content: attachment.content.toString("base64"),
			...(attachment.contentType
				? { content_type: attachment.contentType }
				: {}),
			...(attachment.cid ? { content_id: attachment.cid } : {}),
		}));
}
