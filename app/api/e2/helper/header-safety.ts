const CONTROL_CHARACTERS = /[\u0000-\u0008\u000a-\u001f\u007f]/;
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
	"mime-version",
	"content-type",
	"content-transfer-encoding",
	"content-disposition",
	"return-path",
]);

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
		const lower = name.toLowerCase();
		if (!HEADER_NAME.test(name)) return `Invalid header name: ${name}`;
		if (RESERVED_HEADERS.has(lower) || lower.startsWith("x-ses-")) {
			return `Header ${name} cannot be set through headers`;
		}
		if (CONTROL_CHARACTERS.test(value)) {
			return `Header ${name} must not contain line breaks or control characters`;
		}
	}
	return null;
}
