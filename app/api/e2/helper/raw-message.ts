import type { AddressObject, ParsedMail } from "mailparser";
import {
	MailParseLimitError,
	parseMailSafely,
} from "@/lib/email-management/safe-mail-parser";

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
const SIGNED_DATA_OID = Buffer.from("06092a864886f70d010702", "hex");
const BASE64_BODY = /^[A-Za-z0-9+/]*={0,2}$/;

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
	if (hasBareLineBreak(raw)) {
		throw new RawMessageError("Message must use CRLF line endings throughout");
	}
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

	let parsed: ParsedMail;
	try {
		parsed = await parseMailSafely(raw);
	} catch (error) {
		if (error instanceof MailParseLimitError) {
			throw new RawMessageError(error.message);
		}
		throw error;
	}
	const contentType = parsed.headers.get("content-type");
	const contentTypeParams =
		typeof contentType === "object" &&
		contentType !== null &&
		"params" in contentType &&
		contentType.value.toLowerCase() === "multipart/signed"
			? contentType.params
			: null;
	if (
		!contentTypeParams ||
		!SMIME_SIGNATURE_PROTOCOLS.has(
			(contentTypeParams.protocol ?? "").toLowerCase(),
		)
	) {
		throw new RawMessageError(
			"Raw relay only supports S/MIME multipart/signed messages",
		);
	}

	assertSmimeSignedStructure(
		raw.subarray(separatorIndex + HEADER_BODY_SEPARATOR.length),
		contentTypeParams.boundary ?? "",
	);
	assertAttachmentNamesAgree(parsed);

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

function hasBareLineBreak(raw: Buffer): boolean {
	for (
		let index = raw.indexOf(0x0d);
		index !== -1;
		index = raw.indexOf(0x0d, index + 1)
	) {
		if (raw[index + 1] !== 0x0a) return true;
	}
	for (
		let index = raw.indexOf(0x0a);
		index !== -1;
		index = raw.indexOf(0x0a, index + 1)
	) {
		if (index === 0 || raw[index - 1] !== 0x0d) return true;
	}
	return false;
}

/**
 * A detached S/MIME signature is exactly two top-level parts: the signed
 * content and an application/(x-)pkcs7-signature part holding a CMS
 * SignedData structure.
 */
function assertSmimeSignedStructure(body: Buffer, boundary: string): void {
	if (!boundary || boundary.length > 70) {
		throw new RawMessageError("multipart/signed message has no valid boundary");
	}
	const lines = body.toString("latin1").split(CRLF);
	const parts: string[][] = [];
	let current: string[] | null = null;
	let closed = false;
	for (const line of lines) {
		const trimmed = line.trimEnd();
		if (trimmed === `--${boundary}--`) {
			if (current) parts.push(current);
			closed = true;
			break;
		}
		if (trimmed === `--${boundary}`) {
			if (current) parts.push(current);
			current = [];
			continue;
		}
		current?.push(line);
	}
	if (!closed) {
		throw new RawMessageError("multipart/signed message is not terminated");
	}
	if (parts.length !== 2) {
		throw new RawMessageError(
			"multipart/signed message must have exactly two parts",
		);
	}

	const signaturePart = parts[1];
	const blank = signaturePart.indexOf("");
	if (blank === -1) {
		throw new RawMessageError("S/MIME signature part is malformed");
	}
	const partHeaders = new Map<string, string>();
	let lastName = "";
	for (const line of signaturePart.slice(0, blank)) {
		if ((line.startsWith(" ") || line.startsWith("\t")) && lastName) {
			partHeaders.set(lastName, `${partHeaders.get(lastName)} ${line.trim()}`);
			continue;
		}
		const colon = line.indexOf(":");
		if (colon <= 0) {
			throw new RawMessageError("S/MIME signature part is malformed");
		}
		lastName = line.slice(0, colon).trim().toLowerCase();
		partHeaders.set(lastName, line.slice(colon + 1).trim());
	}
	const partType = (partHeaders.get("content-type") ?? "")
		.split(";")[0]
		.trim()
		.toLowerCase();
	if (!SMIME_SIGNATURE_PROTOCOLS.has(partType)) {
		throw new RawMessageError(
			"Second multipart/signed part must be an S/MIME signature",
		);
	}
	if (
		(partHeaders.get("content-transfer-encoding") ?? "").toLowerCase() !==
		"base64"
	) {
		throw new RawMessageError("S/MIME signature must be base64 encoded");
	}
	const encoded = signaturePart
		.slice(blank + 1)
		.join("")
		.replace(/[ \t]/g, "");
	if (!encoded || !BASE64_BODY.test(encoded) || encoded.length % 4 !== 0) {
		throw new RawMessageError("S/MIME signature is not valid base64");
	}
	if (!isCmsSignedData(Buffer.from(encoded, "base64"))) {
		throw new RawMessageError(
			"S/MIME signature is not a CMS SignedData structure",
		);
	}
}

function readDerLength(
	der: Buffer,
	offset: number,
): { length: number | null; headerEnd: number } | null {
	const first = der[offset];
	if (first === undefined) return null;
	if (first < 0x80) return { length: first, headerEnd: offset + 1 };
	if (first === 0x80) return { length: null, headerEnd: offset + 1 };
	const octets = first & 0x7f;
	if (octets > 4 || offset + 1 + octets > der.length) return null;
	let length = 0;
	for (let index = 0; index < octets; index++) {
		length = length * 256 + der[offset + 1 + index];
	}
	return { length, headerEnd: offset + 1 + octets };
}

function isCmsSignedData(der: Buffer): boolean {
	if (der.length < 2 + SIGNED_DATA_OID.length || der[0] !== 0x30) return false;
	const outer = readDerLength(der, 1);
	if (!outer) return false;
	if (outer.length === null) {
		if (der[der.length - 1] !== 0 || der[der.length - 2] !== 0) return false;
	} else if (outer.headerEnd + outer.length !== der.length) {
		return false;
	}
	return der
		.subarray(outer.headerEnd, outer.headerEnd + SIGNED_DATA_OID.length)
		.equals(SIGNED_DATA_OID);
}

function headerParam(
	parsed: ParsedMail["attachments"][number],
	header: string,
	param: string,
): string | undefined {
	const value = parsed.headers.get(header);
	if (typeof value !== "object" || value === null || !("params" in value)) {
		return undefined;
	}
	const params = value.params as Record<string, string | undefined>;
	return params[param]?.trim() || undefined;
}

function assertAttachmentNamesAgree(parsed: ParsedMail): void {
	for (const attachment of parsed.attachments ?? []) {
		const name = headerParam(attachment, "content-type", "name");
		const filename = headerParam(attachment, "content-disposition", "filename");
		if (
			name !== undefined &&
			filename !== undefined &&
			name.toLowerCase() !== filename.toLowerCase()
		) {
			throw new RawMessageError(
				"Attachment Content-Type name and Content-Disposition filename disagree",
			);
		}
	}
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
