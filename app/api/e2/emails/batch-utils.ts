import { createHash } from "node:crypto";
import type { BatchEmailItem } from "@/app/api/e2/emails/batch-schemas";

const MAX_RECIPIENTS_PER_ITEM = 50;
const MAX_HEADERS_PER_ITEM = 50;
const MAX_TAGS_PER_ITEM = 20;
const MAX_TOTAL_ATTACHMENTS = 100;
const MAX_AGGREGATE_ATTACHMENT_BYTES = 100 * 1024 * 1024;

const PROTECTED_HEADERS = new Set([
	"from",
	"to",
	"cc",
	"bcc",
	"subject",
	"date",
	"message-id",
	"mime-version",
	"content-type",
	"content-transfer-encoding",
	"return-path",
	"received",
	"dkim-signature",
	"x-ses-message-id",
	"x-ses-outbound-source-arn",
]);

const CONTROL_CHAR_REGEX = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/;
const HEADER_INJECTION_REGEX = /[\r\n]/;

export function toArray(value: string | string[] | undefined): string[] {
	if (!value) return [];
	return Array.isArray(value) ? value : [value];
}

export function extractEmailAddress(email: string): string {
	const match = email.match(/<([^>]+)>/);
	return match ? match[1] : email;
}

export function extractDomain(email: string): string {
	const address = extractEmailAddress(email);
	const parts = address.split("@");
	return parts.length === 2 ? parts[1].toLowerCase() : "";
}

export function validateEmailFormat(email: string): boolean {
	const address = extractEmailAddress(email);
	const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
	return regex.test(address);
}

function hasControlChars(str: string): boolean {
	return CONTROL_CHAR_REGEX.test(str);
}

function hasHeaderInjection(str: string): boolean {
	return HEADER_INJECTION_REGEX.test(str);
}

export function validateHeaderSafety(
	name: string,
	value: string,
): string | null {
	const lowerName = name.toLowerCase();
	if (PROTECTED_HEADERS.has(lowerName)) {
		return `Protected header cannot be overridden: ${name}`;
	}
	if (hasControlChars(name) || hasHeaderInjection(name)) {
		return `Invalid characters in header name: ${name}`;
	}
	if (hasControlChars(value) || hasHeaderInjection(value)) {
		return `Invalid characters in header value for: ${name}`;
	}
	return null;
}

export function validateAddressSafety(
	address: string,
	field: string,
): string | null {
	if (hasControlChars(address) || hasHeaderInjection(address)) {
		return `Invalid characters in ${field} address: ${address}`;
	}
	return null;
}

export function validateSubjectSafety(subject: string): string | null {
	if (hasControlChars(subject)) {
		return "Invalid control characters in subject";
	}
	if (subject.includes("\r") || subject.includes("\n")) {
		return "Subject cannot contain line breaks";
	}
	return null;
}

export interface ValidationResult {
	valid: boolean;
	error?: string;
}

export function validateEmailItem(
	item: BatchEmailItem,
	index: number,
): ValidationResult {
	if (!item.html && !item.text) {
		return {
			valid: false,
			error: `Email at index ${index}: Either html or text content must be provided`,
		};
	}

	const subjectCheck = validateSubjectSafety(item.subject);
	if (subjectCheck) {
		return { valid: false, error: `Email at index ${index}: ${subjectCheck}` };
	}

	const fromCheck = validateAddressSafety(item.from, "from");
	if (fromCheck) {
		return { valid: false, error: `Email at index ${index}: ${fromCheck}` };
	}

	const toAddresses = toArray(item.to);
	const ccAddresses = toArray(item.cc);
	const bccAddresses = toArray(item.bcc);
	const replyToAddresses = toArray(item.reply_to);

	const totalRecipients =
		toAddresses.length + ccAddresses.length + bccAddresses.length;
	if (totalRecipients > MAX_RECIPIENTS_PER_ITEM) {
		return {
			valid: false,
			error: `Email at index ${index}: Too many recipients (${totalRecipients} > ${MAX_RECIPIENTS_PER_ITEM})`,
		};
	}

	if (toAddresses.length === 0) {
		return {
			valid: false,
			error: `Email at index ${index}: At least one recipient is required`,
		};
	}

	for (const addr of [
		...toAddresses,
		...ccAddresses,
		...bccAddresses,
		...replyToAddresses,
	]) {
		const addrCheck = validateAddressSafety(addr, "recipient");
		if (addrCheck) {
			return { valid: false, error: `Email at index ${index}: ${addrCheck}` };
		}
		if (!validateEmailFormat(addr)) {
			return {
				valid: false,
				error: `Email at index ${index}: Invalid email format: ${addr}`,
			};
		}
	}

	if (item.headers) {
		const headerKeys = Object.keys(item.headers);
		if (headerKeys.length > MAX_HEADERS_PER_ITEM) {
			return {
				valid: false,
				error: `Email at index ${index}: Too many headers (${headerKeys.length} > ${MAX_HEADERS_PER_ITEM})`,
			};
		}
		for (const [name, value] of Object.entries(item.headers)) {
			const headerCheck = validateHeaderSafety(name, value);
			if (headerCheck) {
				return {
					valid: false,
					error: `Email at index ${index}: ${headerCheck}`,
				};
			}
		}
	}

	if (item.tags && item.tags.length > MAX_TAGS_PER_ITEM) {
		return {
			valid: false,
			error: `Email at index ${index}: Too many tags (${item.tags.length} > ${MAX_TAGS_PER_ITEM})`,
		};
	}

	if (item.attachments) {
		for (const att of item.attachments) {
			if ("path" in att && att.path) {
				return {
					valid: false,
					error: `Email at index ${index}: Remote path attachments not allowed in batch; use base64 content`,
				};
			}
			if (!att.content) {
				return {
					valid: false,
					error: `Email at index ${index}: Attachment "${att.filename}" missing required content`,
				};
			}
		}
	}

	return { valid: true };
}

export interface ProcessedAttachmentSize {
	size: number;
}

export function validateAggregateBatchAttachments(
	allProcessedAttachments: ProcessedAttachmentSize[][],
): ValidationResult {
	let totalAttachments = 0;
	let totalBytes = 0;

	for (const attachments of allProcessedAttachments) {
		totalAttachments += attachments.length;
		if (totalAttachments > MAX_TOTAL_ATTACHMENTS) {
			return {
				valid: false,
				error: `Total attachments exceed limit (${totalAttachments} > ${MAX_TOTAL_ATTACHMENTS})`,
			};
		}

		for (const att of attachments) {
			totalBytes += att.size;
			if (totalBytes > MAX_AGGREGATE_ATTACHMENT_BYTES) {
				return {
					valid: false,
					error: "Total attachment size exceeds 100MB limit",
				};
			}
		}
	}

	return { valid: true };
}

function canonicalizeValue(value: unknown): unknown {
	if (value === null || value === undefined) {
		return null;
	}
	if (Array.isArray(value)) {
		return value.map(canonicalizeValue);
	}
	if (typeof value === "object") {
		const sorted: Record<string, unknown> = {};
		const keys = Object.keys(value as Record<string, unknown>).sort();
		for (const key of keys) {
			sorted[key] = canonicalizeValue((value as Record<string, unknown>)[key]);
		}
		return sorted;
	}
	return value;
}

export function computeCanonicalHash(
	emails: readonly BatchEmailItem[],
): string {
	const canonical = emails.map((e) => {
		const toArr = toArray(e.to);
		const ccArr = e.cc ? toArray(e.cc) : null;
		const bccArr = e.bcc ? toArray(e.bcc) : null;
		const replyToArr = e.reply_to ? toArray(e.reply_to) : null;

		return {
			from: e.from,
			to: [...toArr].sort(),
			subject: e.subject,
			html: e.html ?? null,
			text: e.text ?? null,
			cc: ccArr ? [...ccArr].sort() : null,
			bcc: bccArr ? [...bccArr].sort() : null,
			reply_to: replyToArr ? [...replyToArr].sort() : null,
			headers: e.headers ? canonicalizeValue(e.headers) : null,
			attachments: e.attachments
				? e.attachments.map((a) => ({
						filename: a.filename,
						content: a.content ?? null,
						content_type: a.content_type ?? null,
						content_id: a.content_id ?? null,
					}))
				: null,
			tags: e.tags
				? [...e.tags]
						.map((t) => ({ name: t.name, value: t.value }))
						.sort((a, b) => a.name.localeCompare(b.name))
				: null,
		};
	});

	const jsonStr = JSON.stringify(canonical);
	return createHash("sha256").update(jsonStr).digest("hex");
}

export function computeChildIdempotencyHash(
	parentIdempotencyKey: string,
	batchId: string,
	index: number,
): string {
	const input = `${parentIdempotencyKey}:${batchId}:${index}`;
	return createHash("sha256").update(input).digest("hex");
}

export function getAllRecipients(item: BatchEmailItem): string[] {
	const to = toArray(item.to);
	const cc = toArray(item.cc);
	const bcc = toArray(item.bcc);
	return [...to, ...cc, ...bcc];
}

export function getDistinctSenders(
	emails: readonly BatchEmailItem[],
): Array<{ address: string; domain: string }> {
	const seen = new Map<string, { address: string; domain: string }>();
	for (const email of emails) {
		const address = extractEmailAddress(email.from).toLowerCase();
		if (!seen.has(address)) {
			seen.set(address, { address, domain: extractDomain(email.from) });
		}
	}
	return Array.from(seen.values());
}

export function isPostgresUniqueViolation(err: unknown): boolean {
	if (err == null || typeof err !== "object") {
		return false;
	}
	const record = err as Record<string, unknown>;
	return record.code === "23505";
}
