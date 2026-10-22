import libmime from "libmime";
import {
	type ParsedMail,
	type SimpleParserOptions,
	simpleParser,
} from "mailparser";

export const MAX_MIME_PARTS = 500;
export const MAX_PARSER_CHILD_NODES = 2000;
export const MAIL_PARSE_TIMEOUT_MS = 15_000;

export class MailParseLimitError extends Error {}

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

/**
 * simpleParser with a MIME part cap and a hard timeout, for mail from any
 * sender. Throws MailParseLimitError when either limit is hit.
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
		...parserOptions
	} = options;

	if (exceedsMimePartLimit(raw, maxParts)) {
		throw new MailParseLimitError(
			`Message has more than ${maxParts} MIME parts`,
		);
	}

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
		};
		return await Promise.race([simpleParser(raw, splitterOptions), timeout]);
	} finally {
		clearTimeout(timer);
	}
}
