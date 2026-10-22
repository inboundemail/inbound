import { createHash } from "node:crypto";
import { Worker } from "node:worker_threads";
import {
	type AddressObject,
	type ParsedMail,
	type SimpleParserOptions,
	simpleParser,
} from "mailparser";
import type { SendEmailPayload } from "./api-client.ts";
import { SmtpRelayError } from "./api-client.ts";
import type { ParseWorkerInput, ParseWorkerMessage } from "./parse-worker.ts";

export interface RelayEnvelope {
	mailFrom: string | null;
	rcptTo: string[];
}

export interface MappedRawMessage {
	payload: SendEmailPayload;
	fromAddress: string;
	relayRaw: boolean;
}

const FORWARDED_HEADERS = ["in-reply-to", "references"];

export const DEFAULT_MAX_MIME_PARTS = 500;

// keepCidLinks: the default inlines every cid: reference as a data URI, so many references to one
// image multiply it (and enough of them overflow a string); inline images are sent as
// attachments with content_id instead. skipHtmlToText: html-to-text is slow and memory hungry on
// adversarial markup, so HTML-only messages are relayed without a text part. The text-to-HTML
// conversions are unused. maxChildNodes is passed through to mailsplit as a backstop above the
// pre-count cap (SMTP_MAX_MIME_PARTS is at most 900).
const PARSER_OPTIONS: SimpleParserOptions & { maxChildNodes: number } = {
	keepCidLinks: true,
	skipHtmlToText: true,
	skipTextToHtml: true,
	skipTextLinks: true,
	maxChildNodes: 2000,
};

// mailsplit refuses header blocks over 1 MiB and leaves ParsedMail.headers unset.
const MAX_HEADER_BYTES = 1024 * 1024 - 4096;

const ENCAPSULATED_MESSAGE = /^content-type:\s*message\//i;
const CONTENT_TYPE_PREFIX = "content-type:";

function permanentParseFailure(detail: string): SmtpRelayError {
	return new SmtpRelayError({
		responseCode: 554,
		message: `5.6.0 ${detail}`,
	});
}

function isLineSpace(byte: number | undefined): boolean {
	return byte === 0x20 || byte === 0x09 || byte === 0x0d;
}

function startsWithContentType(
	raw: Buffer,
	start: number,
	end: number,
): boolean {
	if (end - start < CONTENT_TYPE_PREFIX.length) return false;
	for (let index = 0; index < CONTENT_TYPE_PREFIX.length; index++) {
		const byte = raw[start + index] ?? 0;
		const lower = byte >= 0x41 && byte <= 0x5a ? byte | 0x20 : byte;
		if (lower !== CONTENT_TYPE_PREFIX.charCodeAt(index)) return false;
	}
	return true;
}

/**
 * Upper bound on the MIME nodes mailsplit can create: every line that starts with "--" and is
 * not only dashes (any of them may be a delimiter of some declared boundary), plus encapsulated
 * message headers. Past its child-node limit mailparser can stall without ever settling, so
 * oversized trees are refused before parsing. Linear in the message size.
 */
export function countMimeParts(raw: Buffer): number {
	let count = 0;
	let start = 0;
	while (start < raw.length) {
		let end = raw.indexOf(0x0a, start);
		if (end < 0) end = raw.length;
		// mailsplit also accepts a delimiter right after a lone CR.
		const lineStart = raw[start] === 0x0d ? start + 1 : start;
		if (raw[lineStart] === 0x2d && raw[lineStart + 1] === 0x2d) {
			let tokenEnd = end;
			while (tokenEnd > lineStart + 2 && isLineSpace(raw[tokenEnd - 1])) {
				tokenEnd--;
			}
			for (let index = lineStart + 2; index < tokenEnd; index++) {
				if (raw[index] !== 0x2d) {
					count++;
					break;
				}
			}
		} else if (
			startsWithContentType(raw, lineStart, end) &&
			ENCAPSULATED_MESSAGE.test(raw.toString("latin1", lineStart, end))
		) {
			count++;
		}
		start = end + 1;
	}
	return count;
}

function headerBlockLength(raw: Buffer): number {
	if (raw[0] === 0x0a || (raw[0] === 0x0d && raw[1] === 0x0a)) return 0;
	const crlf = raw.indexOf("\n\r\n");
	const lf = raw.indexOf("\n\n");
	const ends = [crlf, lf].filter((index) => index >= 0);
	return ends.length > 0 ? Math.min(...ends) + 1 : raw.length;
}

export function assertParseable(
	raw: Buffer,
	maxMimeParts = DEFAULT_MAX_MIME_PARTS,
): void {
	if (headerBlockLength(raw) > MAX_HEADER_BYTES) {
		throw permanentParseFailure("Message header block is too large");
	}
	if (countMimeParts(raw) > maxMimeParts) {
		throw permanentParseFailure("Message has too many MIME parts");
	}
}

// The JSON send API rebuilds the message, so a detached S/MIME signature (e.g. Apple Mail's
// smime.p7s) can never verify there and would only be rejected as an unsupported attachment.
// Signed messages go through raw relay instead; this fallback drops the signature.
const DETACHED_SIGNATURE_TYPES = new Set([
	"application/pkcs7-signature",
	"application/x-pkcs7-signature",
]);

// multipart/signed S/MIME must reach SES byte-for-byte for the signature to verify.
function isSignedSmime(parsed: ParsedMail): boolean {
	const contentType = parsed.headers.get("content-type");
	if (
		typeof contentType !== "object" ||
		!contentType ||
		!("params" in contentType)
	)
		return false;
	return (
		contentType.value.toLowerCase() === "multipart/signed" &&
		DETACHED_SIGNATURE_TYPES.has(
			(contentType.params.protocol ?? "").toLowerCase(),
		)
	);
}

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
	options: { maxMimeParts?: number } = {},
): Promise<MappedRawMessage> {
	assertParseable(raw, options.maxMimeParts);
	let parsed: ParsedMail;
	try {
		parsed = await simpleParser(raw, PARSER_OPTIONS);
	} catch {
		throw permanentParseFailure("Message could not be parsed");
	}
	if (!(parsed.headers instanceof Map)) {
		throw permanentParseFailure("Message header block is too large");
	}

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
	// With skipHtmlToText an HTML-only message has an empty text part, which must not be sent.
	const text = parsed.text || (html ? undefined : "");

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
		relayRaw: isSignedSmime(parsed),
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

export interface ParseWorkerLimits {
	timeoutMs: number;
	heapMb: number;
	signal?: AbortSignal;
}

const PARSE_WORKER_URL = new URL("./parse-worker.ts", import.meta.url);

/**
 * Parses and maps a message in a fresh worker thread. The heap is capped by resourceLimits and
 * the worker is terminated at the deadline, so a hostile message can neither block the event
 * loop past timeoutMs nor grow the heap past heapMb (Node enforces resourceLimits; Bun ignores
 * them). One worker per message: spawning costs a few tens of milliseconds.
 */
export function mapRawMessageInWorker(
	raw: Buffer,
	envelope: RelayEnvelope,
	options: { maxMimeParts?: number } & ParseWorkerLimits,
): Promise<MappedRawMessage> {
	const maxMimeParts = options.maxMimeParts ?? DEFAULT_MAX_MIME_PARTS;
	try {
		assertParseable(raw, maxMimeParts);
	} catch (error: unknown) {
		return Promise.reject(error);
	}
	if (options.signal?.aborted) return Promise.reject(parseCanceled());

	const copy = new Uint8Array(raw);
	const input: ParseWorkerInput = { raw: copy, envelope, maxMimeParts };
	return new Promise((resolve, reject) => {
		let worker: Worker;
		try {
			worker = new Worker(PARSE_WORKER_URL, {
				workerData: input,
				transferList: [copy.buffer],
				env: {},
				resourceLimits: {
					maxOldGenerationSizeMb: options.heapMb,
					maxYoungGenerationSizeMb: Math.max(8, Math.ceil(options.heapMb / 4)),
					stackSizeMb: 4,
				},
			});
		} catch (error: unknown) {
			reject(parserUnavailable(error));
			return;
		}
		let ready = false;
		let settled = false;
		const settle = (outcome: () => void) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			options.signal?.removeEventListener("abort", onAbort);
			void worker.terminate();
			outcome();
		};
		// Before the worker reports ready the failure is the gateway's (e.g. no threads left);
		// afterwards it was caused by the message.
		const crashed = (error?: unknown) =>
			settle(() =>
				reject(
					ready
						? permanentParseFailure("Message could not be parsed")
						: parserUnavailable(error),
				),
			);
		const onAbort = () => settle(() => reject(parseCanceled()));
		const timer = setTimeout(
			() =>
				settle(() =>
					reject(permanentParseFailure("Message could not be parsed in time")),
				),
			options.timeoutMs,
		);
		timer.unref();
		options.signal?.addEventListener("abort", onAbort, { once: true });

		worker.on("message", (message: ParseWorkerMessage) => {
			switch (message.type) {
				case "ready":
					ready = true;
					return;
				case "mapped":
					settle(() => resolve(message.mapped));
					return;
				case "failure":
					settle(() =>
						reject(
							new SmtpRelayError({
								responseCode: message.responseCode,
								message: message.message,
							}),
						),
					);
					return;
				case "error":
					console.error(
						`[smtp-gateway] message mapping failed: ${message.name}: ${message.message}`,
					);
					crashed();
					return;
			}
		});
		worker.on("error", (error: Error & { code?: string }) => {
			if (ready) {
				console.error(
					`[smtp-gateway] parse worker failed: ${error.code ?? error.name}`,
				);
			}
			crashed(error);
		});
		worker.on("exit", () => crashed());
	});
}

function parseCanceled(): SmtpRelayError {
	return new SmtpRelayError({
		responseCode: 451,
		message: "4.3.0 SMTP connection closed during message processing",
	});
}

function parserUnavailable(error: unknown): SmtpRelayError {
	console.error("[smtp-gateway] parse worker could not start", error);
	return new SmtpRelayError({
		responseCode: 451,
		message: "4.3.0 Internal gateway error, try again later",
	});
}
