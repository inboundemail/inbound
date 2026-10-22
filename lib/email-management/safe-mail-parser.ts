import libmime from "libmime";
import {
	type ParsedMail,
	type SimpleParserOptions,
	simpleParser,
} from "mailparser";

export const MAX_MIME_PARTS = 500;
export const MAX_PARSER_CHILD_NODES = 2000;
export const MAIL_PARSE_TIMEOUT_MS = 15_000;
export const MAX_TEXT_CONVERSION_LENGTH = 128 * 1024;
export const MIN_INLINED_HTML_LIMIT = 4 * 1024 * 1024;

export class MailParseLimitError extends Error {}

const CID_REFERENCE = /\bcid:([^'"\s]{1,256})/g;
const INLINE_IMAGE_TYPE = /^image\/[\w]+$/i;

const CONTENT_TYPE_HEADER = /^content-type\s*:/i;

function splitLines(text: string): string[] {
	return text
		.split("\n")
		.map((line) => (line.endsWith("\r") ? line.slice(0, -1) : line));
}

/**
 * Collects the boundary of every Content-Type header in the message, parsed
 * the way mailsplit parses it (unfolded, then libmime.parseHeaderValue, so
 * RFC 2231 continuations and extended values resolve), and returned as the
 * latin1 view of the bytes mailsplit compares delimiter lines against.
 */
function collectBoundaries(lines: string[]): Set<string> {
	const boundaries = new Set<string>();
	for (let i = 0; i < lines.length; i++) {
		if (!CONTENT_TYPE_HEADER.test(lines[i])) continue;
		let header = lines[i];
		while (i + 1 < lines.length && /^[ \t]/.test(lines[i + 1])) {
			header += `\r\n${lines[++i]}`;
		}
		const value = libmime.decodeHeader(header).value;
		let boundary: unknown;
		try {
			boundary = libmime.parseHeaderValue(value).params.boundary;
		} catch {
			continue;
		}
		if (typeof boundary === "string" && boundary) {
			boundaries.add(Buffer.from(boundary, "utf8").toString("latin1"));
		}
	}
	return boundaries;
}

/**
 * Counts MIME boundary delimiter lines (`--boundary` and `--boundary--`) for
 * every boundary declared anywhere in the message. mailparser stops splitting
 * at its child node limit and can then never settle, so callers reject
 * messages with too many parts before parsing.
 */
export function countMimeBoundaryDelimiters(raw: string | Buffer): number {
	const text = typeof raw === "string" ? raw : raw.toString("latin1");
	const lines = splitLines(text);
	const boundaries = collectBoundaries(lines);
	if (boundaries.size === 0) return 0;

	let count = 0;
	for (const line of lines) {
		if (line.charCodeAt(0) !== 45 || line.charCodeAt(1) !== 45) continue;
		let candidate = line.slice(2).trimEnd();
		if (!boundaries.has(candidate) && candidate.endsWith("--")) {
			candidate = candidate.slice(0, -2);
		}
		if (boundaries.has(candidate)) count++;
	}
	return count;
}

function countDashLines(raw: string | Buffer): number {
	const indexOf =
		typeof raw === "string"
			? (from: number) => raw.indexOf("\n--", from)
			: (from: number) => raw.indexOf("\n--", from, "latin1");
	const startsWithDashes =
		typeof raw === "string"
			? raw.startsWith("--")
			: raw[0] === 45 && raw[1] === 45;
	let count = startsWithDashes ? 1 : 0;
	for (let index = indexOf(0); index !== -1; index = indexOf(index + 3)) {
		count++;
	}
	return count;
}

export function exceedsMimePartLimit(
	raw: string | Buffer,
	maxParts: number = MAX_MIME_PARTS,
): boolean {
	if (countDashLines(raw) <= maxParts) return false;
	return countMimeBoundaryDelimiters(raw) > maxParts;
}

const BLOCK_TAGS = new Set([
	"address",
	"article",
	"blockquote",
	"br",
	"div",
	"footer",
	"h1",
	"h2",
	"h3",
	"h4",
	"h5",
	"h6",
	"header",
	"hr",
	"li",
	"ol",
	"p",
	"pre",
	"section",
	"table",
	"td",
	"th",
	"tr",
	"ul",
]);

const TAG_NAME = /^<\/?([a-z][a-z0-9]*)/i;
const RAW_TEXT_END = new Map([
	["script", /<\/script/gi],
	["style", /<\/style/gi],
]);

const NAMED_ENTITIES = new Map([
	["amp", "&"],
	["apos", "'"],
	["gt", ">"],
	["lt", "<"],
	["nbsp", " "],
	["quot", '"'],
]);

function decodeEntities(text: string): string {
	return text.replace(
		/&(#[0-9]{1,7}|#x[0-9a-f]{1,6}|[a-z]{2,8});/gi,
		(match, entity: string) => {
			if (entity[0] !== "#") {
				return NAMED_ENTITIES.get(entity.toLowerCase()) ?? match;
			}
			const code =
				entity[1] === "x" || entity[1] === "X"
					? Number.parseInt(entity.slice(2), 16)
					: Number.parseInt(entity.slice(1), 10);
			return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
		},
	);
}

/**
 * Plain text from HTML in one linear pass, for HTML too large to hand to
 * html-to-text, whose parser is quadratic on crafted markup.
 */
export function htmlToTextLinear(html: string): string {
	const parts: string[] = [];
	let pos = 0;
	while (pos < html.length) {
		const open = html.indexOf("<", pos);
		if (open === -1) {
			parts.push(decodeEntities(html.slice(pos)));
			break;
		}
		parts.push(decodeEntities(html.slice(pos, open)));
		if (html.startsWith("<!--", open)) {
			const end = html.indexOf("-->", open + 4);
			pos = end === -1 ? html.length : end + 3;
			continue;
		}
		const close = html.indexOf(">", open + 1);
		if (close === -1) break;
		const tag =
			TAG_NAME.exec(html.slice(open, open + 12))?.[1]?.toLowerCase() ?? "";
		pos = close + 1;
		const rawTextEnd = RAW_TEXT_END.get(tag);
		if (rawTextEnd && html[open + 1] !== "/") {
			rawTextEnd.lastIndex = pos;
			const end = rawTextEnd.exec(html);
			pos = end ? end.index : html.length;
			continue;
		}
		if (BLOCK_TAGS.has(tag)) parts.push("\n");
	}

	const lines: string[] = [];
	for (const line of parts.join("").split("\n")) {
		const trimmed = line.replace(/[ \t\r\f\v\u00a0]+/g, " ").trim();
		if (trimmed || (lines.length > 0 && lines[lines.length - 1] !== "")) {
			lines.push(trimmed);
		}
	}
	while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
	return lines.join("\n");
}

/**
 * Replaces cid: links to inline images with data URIs, as mailparser does
 * when keepCidLinks is off, but only when the result stays within limit.
 * Otherwise the cid: links are kept and the images stay attachments.
 */
export function inlineCidImages(
	html: string,
	attachments: ParsedMail["attachments"],
	limit: number,
): string {
	const images = new Map<string, ParsedMail["attachments"][number]>();
	for (const attachment of attachments) {
		if (
			attachment.cid &&
			!images.has(attachment.cid) &&
			INLINE_IMAGE_TYPE.test(attachment.contentType)
		) {
			images.set(attachment.cid, attachment);
		}
	}
	if (images.size === 0) return html;

	const urls = new Map<string, string>();
	let length = html.length;
	for (const match of html.matchAll(CID_REFERENCE)) {
		const cid = match[1];
		let url = urls.get(cid);
		if (url === undefined) {
			const attachment = images.get(cid);
			if (!attachment) continue;
			url = `data:${attachment.contentType};base64,${attachment.content.toString("base64")}`;
			urls.set(cid, url);
		}
		length += url.length - match[0].length;
		if (length > limit) return html;
	}
	if (urls.size === 0) return html;
	return html.replace(
		CID_REFERENCE,
		(match, cid: string) => urls.get(cid) ?? match,
	);
}

/**
 * simpleParser with a MIME part cap and a hard timeout, for mail from any
 * sender, and without mailparser's unbounded synchronous steps: cid: images
 * are inlined only within a size limit (keepCidLinks defaults to true), and
 * html-to-text and text linkifying, both superlinear, only run on messages up
 * to MAX_TEXT_CONVERSION_LENGTH; text for larger HTML-only messages comes
 * from htmlToTextLinear. Throws MailParseLimitError when a limit is hit or
 * the message can't be parsed.
 */
export async function parseMailSafely(
	raw: string | Buffer,
	options: SimpleParserOptions & {
		timeoutMs?: number;
		maxParts?: number;
	} = {},
): Promise<ParsedMail> {
	const {
		timeoutMs = MAIL_PARSE_TIMEOUT_MS,
		maxParts = MAX_MIME_PARTS,
		keepCidLinks = true,
		skipHtmlToText,
		skipTextLinks,
		...parserOptions
	} = options;

	if (exceedsMimePartLimit(raw, maxParts)) {
		throw new MailParseLimitError(
			`Message has more than ${maxParts} MIME parts`,
		);
	}

	const oversized = raw.length > MAX_TEXT_CONVERSION_LENGTH;
	const deriveText = skipHtmlToText === undefined && oversized;

	let timer: ReturnType<typeof setTimeout> | undefined;
	const timeout = new Promise<never>((_, reject) => {
		timer = setTimeout(
			() =>
				reject(
					new MailParseLimitError(
						`Message parsing timed out after ${Math.round(timeoutMs / 1000)}s`,
					),
				),
			timeoutMs,
		);
	});
	try {
		const splitterOptions: SimpleParserOptions & { maxChildNodes?: number } = {
			maxChildNodes: MAX_PARSER_CHILD_NODES,
			...parserOptions,
			keepCidLinks: true,
			skipHtmlToText: skipHtmlToText ?? oversized,
			skipTextLinks: skipTextLinks ?? oversized,
		};
		const parsed = await Promise.race([
			simpleParser(raw, splitterOptions),
			timeout,
		]);
		if (deriveText && typeof parsed.html === "string" && !parsed.text?.trim()) {
			parsed.text = htmlToTextLinear(parsed.html);
		}
		if (!keepCidLinks) {
			parsed.html =
				typeof parsed.html === "string"
					? inlineCidImages(
							parsed.html,
							parsed.attachments,
							Math.max(raw.length * 2, MIN_INLINED_HTML_LIMIT),
						)
					: false;
		}
		return parsed;
	} catch (error) {
		if (error instanceof MailParseLimitError) throw error;
		throw new MailParseLimitError(
			`Message could not be parsed: ${error instanceof Error ? error.message : String(error)}`,
		);
	} finally {
		clearTimeout(timer);
	}
}
