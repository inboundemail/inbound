const CONTROL_CHARACTERS = /[\u0000-\u0008\u000a-\u001f\u007f]/;
const HEADER_BREAKS = /[\r\n\u0000]+/g;
const HEADER_NAME = /^[!-9;-~]+$/;
const RESERVED_HEADERS = new Set([
	"from",
	"sender",
	"to",
	"cc",
	"bcc",
	"reply-to",
	"subject",
	"date",
	"message-id",
	"mime-version",
	"return-path",
	"dkim-signature",
	"received",
]);
const RESERVED_HEADER_PREFIXES = ["content-", "x-ses-"];

type OutgoingEmailInput = {
	from?: string;
	to?: string | string[];
	cc?: string | string[];
	bcc?: string | string[];
	reply_to?: string | string[];
	subject?: string;
	headers?: Record<string, string>;
	attachments?: Array<{
		filename?: string;
		content_type?: string;
		content_id?: string;
	}>;
};

function list(value: string | string[] | undefined): string[] {
	if (!value) return [];
	return Array.isArray(value) ? value : [value];
}

/**
 * Replaces CR, LF and NUL with spaces, for header text that comes from
 * received mail (forwarded or replied-to subjects) and can't be rejected.
 */
export function stripHeaderBreaks(value: string): string {
	return value.replace(HEADER_BREAKS, " ").trim();
}

export function isReservedHeaderName(name: string): boolean {
	const lower = name.toLowerCase();
	return (
		RESERVED_HEADERS.has(lower) ||
		RESERVED_HEADER_PREFIXES.some((prefix) => lower.startsWith(prefix))
	);
}

/**
 * Returns an error message when a custom header could inject or override MIME
 * headers (invalid field name, line breaks, reserved or SES control headers).
 */
export function findUnsafeCustomHeader(name: string, value: string): string | null {
	if (!HEADER_NAME.test(name)) return `Invalid header name: ${name}`;
	if (isReservedHeaderName(name)) {
		return `Header ${name} cannot be set through headers`;
	}
	if (typeof value !== "string" || CONTROL_CHARACTERS.test(value)) {
		return `Header ${name} must not contain line breaks or control characters`;
	}
	return null;
}

/**
 * Returns an error message when user input could inject or override MIME
 * headers (line breaks, reserved or SES control headers), otherwise null.
 */
export function findUnsafeHeaderInput(input: OutgoingEmailInput): string | null {
	const fields: Array<[string, string | undefined]> = [
		["from", input.from],
		["subject", input.subject],
		...list(input.to).map((value): [string, string] => ["to", value]),
		...list(input.cc).map((value): [string, string] => ["cc", value]),
		...list(input.bcc).map((value): [string, string] => ["bcc", value]),
		...list(input.reply_to).map((value): [string, string] => ["reply_to", value]),
	];
	for (const attachment of input.attachments ?? []) {
		fields.push(["attachment filename", attachment.filename]);
		fields.push(["attachment content_type", attachment.content_type]);
		fields.push(["attachment content_id", attachment.content_id]);
	}
	for (const [name, value] of fields) {
		if (value && CONTROL_CHARACTERS.test(value)) {
			return `${name} must not contain line breaks or control characters`;
		}
	}

	for (const [name, value] of Object.entries(input.headers ?? {})) {
		const unsafe = findUnsafeCustomHeader(name, value);
		if (unsafe) return unsafe;
	}
	return null;
}
