/**
 * Attachment normalization utilities
 *
 * Ensures attachments have a valid contentType by inferring from filename extension.
 * Handles snake_case `content_type` → camelCase `contentType` mapping.
 */

interface RawAttachment {
	filename?: string;
	contentType?: string;
	content_type?: string;
	[key: string]: unknown;
}

const EXTENSION_CONTENT_TYPES: Record<string, string> = {
	pdf: "application/pdf",
	jpg: "image/jpeg",
	jpeg: "image/jpeg",
	png: "image/png",
	gif: "image/gif",
	txt: "text/plain",
	html: "text/html",
	json: "application/json",
	zip: "application/zip",
	doc: "application/msword",
	docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
	xls: "application/vnd.ms-excel",
	xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

/**
 * Infer content type from a filename extension.
 * Returns `application/octet-stream` when the extension is unknown or missing.
 */
export function inferContentType(filename: string | undefined): string {
	if (!filename) return "application/octet-stream";
	const ext = filename.toLowerCase().split(".").pop();
	return (ext && EXTENSION_CONTENT_TYPES[ext]) || "application/octet-stream";
}

/**
 * Normalize a single attachment: ensure `contentType` is set.
 */
export function normalizeAttachmentContentType<T extends RawAttachment>(
	att: T,
	index?: number,
): T & { contentType: string } {
	if (!att.contentType && !att.content_type) {
		if (index !== undefined) {
			console.log(
				`⚠️ Attachment ${index + 1} missing contentType, using fallback`,
			);
		}
		return {
			...att,
			contentType: inferContentType(att.filename),
		};
	}

	return {
		...att,
		contentType: (att.contentType || att.content_type) as string,
	};
}

/**
 * Normalize an array of attachments.
 * Overloaded: when called with untyped data (e.g. JSON.parse output),
 * returns the same permissive type so callers aren't broken.
 */
// biome-ignore lint/suspicious/noExplicitAny: JSON.parse callers pass any[]
export function normalizeAttachments(rawAttachments: any[]): any[];
export function normalizeAttachments<T extends RawAttachment>(
	rawAttachments: T[],
): Array<T & { contentType: string }>;
export function normalizeAttachments(
	rawAttachments: RawAttachment[],
): Array<RawAttachment & { contentType: string }> {
	return rawAttachments.map((att, index) =>
		normalizeAttachmentContentType(att, index),
	);
}
