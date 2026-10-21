import type { structuredEmails } from "@/lib/db/schema";

/**
 * Builds the state Jev reads for Guard rules and inbound classification.
 *
 * Headers come from the raw MIME header block (never the body, so attachment
 * bytes are never read); bodies come from the parsed text and HTML parts.
 * Facts that need exact comparison (auth verdicts, domains) are computed here,
 * because Jev cannot verify signatures and is weak at comparing strings.
 */

type StructuredEmail = typeof structuredEmails.$inferSelect;

export interface SesVerdicts {
	spamVerdict: string | null;
	virusVerdict: string | null;
	spfVerdict: string | null;
	dkimVerdict: string | null;
	dmarcVerdict: string | null;
}

export interface JevEmailFacts {
	spf: string | null;
	dkim: string | null;
	dmarc: string | null;
	ses_spam: string | null;
	ses_virus: string | null;
	reply_to_differs_from_sender: boolean;
	link_domains_differ_from_sender: boolean;
	link_text_shows_other_domain: boolean;
	display_name_contains_other_address: boolean;
}

export interface JevEmailLink {
	text: string;
	url: string;
	domain: string;
}

export interface JevEmailAttachment {
	filename: string | null;
	content_type: string | null;
	size: number | null;
}

export interface JevEmailState {
	email: {
		from: string;
		to: string;
		subject: string;
		headers: string;
		text: string;
		html_as_text?: string;
		links: JevEmailLink[];
		attachments: JevEmailAttachment[];
	};
	facts: JevEmailFacts;
}

const HEADERS_LIMIT = 12_000;
const HEADER_VALUE_LIMIT = 2_000;
const TEXT_LIMIT = 16_000;
const HTML_TEXT_LIMIT = 16_000;
const LINK_LIMIT = 50;
const LINK_URL_LIMIT = 300;
const LINK_TEXT_LIMIT = 120;
const ATTACHMENT_LIMIT = 20;
const RAW_HEADER_SCAN_LIMIT = 256_000;
/** Whole state, in characters; about 10-13k tokens, well under Jev's 32k-token context. */
export const STATE_CHAR_LIMIT = 40_000;

const SIGNATURE_HEADERS =
	/^(dkim-signature|x-google-dkim-signature|arc-seal|arc-message-signature|x-ses-dkim-signature)$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseJson(value: string | null): unknown {
	if (!value) return null;
	try {
		return JSON.parse(value);
	} catch {
		return null;
	}
}

function cap(value: string, limit: number): string {
	return value.length > limit ? `${value.slice(0, limit)}…` : value;
}

/** Line breaks kept; runs of spaces and blank lines collapsed. */
export function normalizeText(value: string): string {
	return value
		.replace(/\r\n?/g, "\n")
		.replace(/[\u0000-\u0008\u000b-\u001f\u007f\u200b-\u200d\ufeff]/g, "")
		.replace(/[^\S\n]+/g, " ")
		.replace(/ *\n */g, "\n")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}

const ENTITIES: Record<string, string> = {
	amp: "&",
	lt: "<",
	gt: ">",
	quot: '"',
	apos: "'",
	nbsp: " ",
};

export function decodeEntities(value: string): string {
	return value.replace(
		/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi,
		(match, entity: string) => {
			if (entity[0] === "#") {
				const code =
					entity[1] === "x" || entity[1] === "X"
						? Number.parseInt(entity.slice(2), 16)
						: Number.parseInt(entity.slice(1), 10);
				return Number.isFinite(code) && code > 0 && code <= 0x10ffff
					? String.fromCodePoint(code)
					: match;
			}
			return ENTITIES[entity.toLowerCase()] ?? match;
		},
	);
}

/** HTML rendered to plain text: script/style dropped, block elements become line breaks. */
export function htmlToText(html: string): string {
	return normalizeText(
		decodeEntities(
			html
				.replace(/<!--[\s\S]*?-->/g, " ")
				.replace(
					/<(script|style|head|title|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,
					" ",
				)
				.replace(/<br\s*\/?>/gi, "\n")
				.replace(/<li\b[^>]*>/gi, "\n- ")
				.replace(
					/<\/?(p|div|tr|table|thead|tbody|tfoot|ul|ol|h[1-6]|section|article|header|footer|blockquote|hr|pre|center|form|fieldset)\b[^>]*>/gi,
					"\n",
				)
				.replace(/<\/?(td|th)\b[^>]*>/gi, " ")
				.replace(/<[^>]*>/g, ""),
		),
	);
}

function decodeEncodedWords(value: string): string {
	return value
		.replace(/(=\?[^?]+\?[bq]\?[^?]*\?=)\s+(?==\?)/gi, "$1")
		.replace(
			/=\?([^?]+)\?([bq])\?([^?]*)\?=/gi,
			(match, charset: string, encoding: string, text: string) => {
				try {
					let bytes: Uint8Array;
					if (encoding.toLowerCase() === "b") {
						bytes = Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
					} else {
						const decoded = text
							.replace(/_/g, " ")
							.replace(/=([0-9a-f]{2})/gi, (_, hex: string) =>
								String.fromCharCode(Number.parseInt(hex, 16)),
							);
						bytes = Uint8Array.from(decoded, (c) => c.charCodeAt(0));
					}
					return new TextDecoder(charset.split("*")[0]).decode(bytes);
				} catch {
					return match;
				}
			},
		);
}

function trimSignature(name: string, value: string): string {
	if (!SIGNATURE_HEADERS.test(name)) return value;
	return value.replace(/\b(b|bh)=[^;]*/g, "$1=…");
}

function headerLines(lines: Array<[string, string]>, limit: number): string {
	let out = "";
	for (const [name, rawValue] of lines) {
		const value = cap(
			trimSignature(
				name,
				decodeEncodedWords(rawValue.replace(/\s+/g, " ").trim()),
			),
			HEADER_VALUE_LIMIT,
		);
		const line = `${name}: ${value}\n`;
		if (out.length + line.length > limit) {
			out += "[more headers truncated]\n";
			break;
		}
		out += line;
	}
	return out.trimEnd();
}

/** Top-level headers from raw MIME, in original order and unfolded. */
function rawHeaders(raw: string): Array<[string, string]> | null {
	const scan = raw.slice(0, RAW_HEADER_SCAN_LIMIT);
	const end = scan.search(/\r?\n\r?\n/);
	if (end <= 0) return null;
	const lines: Array<[string, string]> = [];
	for (const line of scan
		.slice(0, end)
		.replace(/\r?\n[ \t]+/g, " ")
		.split(/\r?\n/)) {
		const colon = line.indexOf(":");
		if (colon <= 0) continue;
		lines.push([line.slice(0, colon).trim(), line.slice(colon + 1)]);
	}
	return lines.length > 0 ? lines : null;
}

function renderParsedHeaderValue(value: unknown): string[] {
	if (typeof value === "string") return [value];
	if (typeof value === "number" || typeof value === "boolean")
		return [String(value)];
	if (Array.isArray(value)) return value.flatMap(renderParsedHeaderValue);
	if (isRecord(value)) {
		if (typeof value.text === "string") return [value.text];
		if (typeof value.value === "string") {
			const params = isRecord(value.params)
				? Object.entries(value.params)
						.map(([key, param]) => `; ${key}=${String(param)}`)
						.join("")
				: "";
			return [`${value.value}${params}`];
		}
		return [JSON.stringify(value)];
	}
	return [];
}

function addressText(data: string | null): string {
	const parsed = parseJson(data);
	if (isRecord(parsed) && typeof parsed.text === "string") return parsed.text;
	return addressesOf(data)
		.map((a) => (a.name ? `${a.name} <${a.address}>` : a.address))
		.join(", ");
}

/** Headers from the parsed headers JSON, or the parsed address fields as a last resort. */
function fallbackHeaders(email: StructuredEmail): Array<[string, string]> {
	const parsed = parseJson(email.headers);
	if (isRecord(parsed) && Object.keys(parsed).length > 0) {
		return Object.entries(parsed).flatMap(([name, value]) =>
			renderParsedHeaderValue(value).map((line): [string, string] => [
				name,
				line,
			]),
		);
	}
	const lines: Array<[string, string]> = [];
	const add = (name: string, value: string | null | undefined) => {
		if (value) lines.push([name, value]);
	};
	add("From", addressText(email.fromData));
	add("Reply-To", addressText(email.replyToData));
	add("To", addressText(email.toData));
	add("Cc", addressText(email.ccData));
	add("Subject", email.subject);
	add("Date", email.date ? new Date(email.date).toUTCString() : null);
	add("Message-ID", email.messageId);
	return lines;
}

interface Address {
	name: string | null;
	address: string;
}

function addressesOf(data: string | null): Address[] {
	const parsed = parseJson(data);
	if (!isRecord(parsed) || !Array.isArray(parsed.addresses)) return [];
	return parsed.addresses.flatMap((addr) => {
		if (
			!isRecord(addr) ||
			typeof addr.address !== "string" ||
			!addr.address.trim()
		) {
			return [];
		}
		const name =
			typeof addr.name === "string" && addr.name.trim()
				? addr.name.trim()
				: null;
		return [{ name, address: addr.address.trim() }];
	});
}

function domainOfAddress(address: string): string | null {
	const at = address.lastIndexOf("@");
	return at >= 0
		? address
				.slice(at + 1)
				.toLowerCase()
				.replace(/[>\s]/g, "") || null
		: null;
}

const SECOND_LEVEL_LABELS = new Set([
	"co",
	"com",
	"net",
	"org",
	"gov",
	"ac",
	"edu",
	"ne",
	"or",
	"go",
	"gob",
	"nic",
]);

/**
 * Approximate registrable domain: the last two labels, or three when the
 * second-to-last label is a common second-level suffix under a country code
 * (example.co.uk, example.com.au).
 */
export function registrableDomain(host: string): string {
	const labels = host
		.toLowerCase()
		.replace(/\.$/, "")
		.split(".")
		.filter(Boolean);
	if (labels.length <= 2 || /^\d+$/.test(labels[labels.length - 1])) {
		return labels.join(".");
	}
	const tld = labels[labels.length - 1];
	const sld = labels[labels.length - 2];
	const take = tld.length === 2 && SECOND_LEVEL_LABELS.has(sld) ? 3 : 2;
	return labels.slice(-take).join(".");
}

function linkDomain(url: string): string | null {
	try {
		const parsed = new URL(url);
		if (parsed.protocol !== "http:" && parsed.protocol !== "https:")
			return null;
		return parsed.hostname.toLowerCase() || null;
	} catch {
		return null;
	}
}

export function extractLinks(
	html: string,
	text: string,
	limit = LINK_LIMIT,
): JevEmailLink[] {
	const links: JevEmailLink[] = [];
	const seen = new Set<string>();
	const add = (rawUrl: string, rawText: string) => {
		if (links.length >= limit) return;
		const url = decodeEntities(rawUrl).trim();
		const domain = linkDomain(url);
		if (!domain || seen.has(url)) return;
		seen.add(url);
		links.push({
			text: cap(normalizeText(rawText).replace(/\s+/g, " "), LINK_TEXT_LIMIT),
			url: cap(url, LINK_URL_LIMIT),
			domain,
		});
	};
	for (const match of html.matchAll(
		/<a\b[^>]*?\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>([\s\S]*?)<\/a\s*>/gi,
	)) {
		add(match[1] ?? match[2] ?? match[3] ?? "", htmlToText(match[4] ?? ""));
	}
	for (const match of text.matchAll(/https?:\/\/[^\s<>"'()[\]]+/gi)) {
		add(match[0].replace(/[.,;:!?]+$/, ""), "");
	}
	return links;
}

function attachmentsOf(data: string | null): JevEmailAttachment[] {
	const parsed = parseJson(data);
	if (!Array.isArray(parsed)) return [];
	return parsed.slice(0, ATTACHMENT_LIMIT).flatMap((item) => {
		if (!isRecord(item)) return [];
		return [
			{
				filename:
					typeof item.filename === "string" ? cap(item.filename, 200) : null,
				content_type:
					typeof item.contentType === "string"
						? cap(item.contentType, 100)
						: null,
				size:
					typeof item.size === "number" && Number.isFinite(item.size)
						? item.size
						: null,
			},
		];
	});
}

function words(value: string): Set<string> {
	return new Set(value.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? []);
}

/** True when the rendered HTML says something the text part doesn't (over 20% new words). */
function htmlAddsContent(text: string, htmlText: string): boolean {
	if (!htmlText) return false;
	if (!text) return true;
	const textWords = words(text);
	const htmlWords = [...words(htmlText)];
	if (htmlWords.length === 0) return false;
	const novel = htmlWords.filter((word) => !textWords.has(word)).length;
	return novel / htmlWords.length > 0.2;
}

function verdict(value: string | null | undefined): string | null {
	return value ? value.toUpperCase() : null;
}

const DOMAIN_IN_TEXT =
	/^(?:https?:\/\/)?(?:www\.)?((?:[a-z0-9-]+\.)+[a-z]{2,})(?:[/:?#]\S*)?$/i;

export function computeFacts(
	email: StructuredEmail,
	links: JevEmailLink[],
	verdicts: SesVerdicts | null,
): JevEmailFacts {
	const from = addressesOf(email.fromData)[0];
	const senderDomain = from ? domainOfAddress(from.address) : null;
	const sender = senderDomain ? registrableDomain(senderDomain) : null;

	const replyTo = addressesOf(email.replyToData);
	const replyToDiffers =
		!!sender &&
		replyTo.some((addr) => {
			const domain = domainOfAddress(addr.address);
			return !!domain && registrableDomain(domain) !== sender;
		});

	const linkDomainsDiffer =
		!!sender && links.some((link) => registrableDomain(link.domain) !== sender);

	const linkTextShowsOtherDomain = links.some((link) => {
		const shown = DOMAIN_IN_TEXT.exec(link.text.trim());
		return (
			!!shown && registrableDomain(shown[1]) !== registrableDomain(link.domain)
		);
	});

	const nameAddresses =
		from?.name?.match(/[^\s<>"'()@]+@[^\s<>"'()@]+\.[a-z]{2,}/gi) ?? [];
	const displayNameOther =
		!!sender &&
		nameAddresses.some((address) => {
			const domain = domainOfAddress(address);
			return !!domain && registrableDomain(domain) !== sender;
		});

	return {
		spf: verdict(verdicts?.spfVerdict),
		dkim: verdict(verdicts?.dkimVerdict),
		dmarc: verdict(verdicts?.dmarcVerdict),
		ses_spam: verdict(verdicts?.spamVerdict),
		ses_virus: verdict(verdicts?.virusVerdict),
		reply_to_differs_from_sender: replyToDiffers,
		link_domains_differ_from_sender: linkDomainsDiffer,
		link_text_shows_other_domain: linkTextShowsOtherDomain,
		display_name_contains_other_address: displayNameOther,
	};
}

/**
 * Build Jev's state for one email. `scale` shrinks every text cap (0.5 halves
 * them), used to retry after Jev rejects a request as too large.
 */
export function buildJevEmailState(
	email: StructuredEmail,
	verdicts: SesVerdicts | null,
	scale = 1,
): JevEmailState {
	const limit = (value: number) => Math.max(1, Math.floor(value * scale));

	const headerSource =
		(email.rawContent && rawHeaders(email.rawContent)) ||
		fallbackHeaders(email);
	const headers = headerLines(headerSource, limit(HEADERS_LIMIT));

	const html = email.htmlBody || "";
	const fullText = normalizeText(email.textBody || "");
	const fullHtmlText = html ? htmlToText(html) : "";
	const links = extractLinks(html, email.textBody || "", limit(LINK_LIMIT));
	const facts = computeFacts(email, links, verdicts);

	const from = addressesOf(email.fromData)
		.map((a) => (a.name ? `${a.name} <${a.address}>` : a.address))
		.join(", ");

	const state: JevEmailState = {
		email: {
			from,
			to: addressText(email.toData) || email.recipient || "",
			subject: email.subject || "",
			headers,
			text: cap(fullText, limit(TEXT_LIMIT)),
			...(htmlAddsContent(fullText, fullHtmlText)
				? { html_as_text: cap(fullHtmlText, limit(HTML_TEXT_LIMIT)) }
				: {}),
			links,
			attachments: attachmentsOf(email.attachments),
		},
		facts,
	};

	const ceiling = limit(STATE_CHAR_LIMIT);
	let over = JSON.stringify(state).length - ceiling;
	const shrink = (value: string) => {
		const keep = Math.max(0, value.length - over - 1);
		over -= value.length - keep;
		return `${value.slice(0, keep)}…`;
	};
	if (over > 0 && state.email.html_as_text) {
		state.email.html_as_text = shrink(state.email.html_as_text);
	}
	if (over > 0 && state.email.text) {
		state.email.text = shrink(state.email.text);
	}
	while (over > 0 && state.email.links.length > 0) {
		over -= JSON.stringify(state.email.links.pop()).length + 1;
	}

	return state;
}
