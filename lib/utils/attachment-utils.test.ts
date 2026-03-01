import { describe, expect, it } from "bun:test";
import {
	inferContentType,
	normalizeAttachmentContentType,
	normalizeAttachments,
} from "@/lib/utils/attachment-utils";

describe("inferContentType", () => {
	it.each([
		["file.pdf", "application/pdf"],
		["file.jpg", "image/jpeg"],
		["file.jpeg", "image/jpeg"],
		["file.png", "image/png"],
		["file.gif", "image/gif"],
		["file.txt", "text/plain"],
		["file.html", "text/html"],
		["file.json", "application/json"],
		["file.zip", "application/zip"],
		["file.doc", "application/msword"],
		[
			"file.docx",
			"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
		],
		["file.xls", "application/vnd.ms-excel"],
		[
			"file.xlsx",
			"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
		],
	])("infers %s → %s", (filename: string, expected: string) => {
		expect(inferContentType(filename)).toBe(expected);
	});

	it("returns application/octet-stream for unknown extension", () => {
		expect(inferContentType("file.xyz")).toBe("application/octet-stream");
	});

	it("returns application/octet-stream for no filename", () => {
		expect(inferContentType(undefined)).toBe("application/octet-stream");
	});

	it("returns application/octet-stream for filename without extension", () => {
		expect(inferContentType("README")).toBe("application/octet-stream");
	});
});

describe("normalizeAttachmentContentType", () => {
	it("infers contentType when missing", () => {
		const result = normalizeAttachmentContentType({ filename: "doc.pdf" });
		expect(result.contentType).toBe("application/pdf");
	});

	it("preserves existing contentType", () => {
		const result = normalizeAttachmentContentType({
			filename: "doc.pdf",
			contentType: "custom/type",
		});
		expect(result.contentType).toBe("custom/type");
	});

	it("maps snake_case content_type to camelCase", () => {
		const result = normalizeAttachmentContentType({
			filename: "img.png",
			content_type: "image/png",
		});
		expect(result.contentType).toBe("image/png");
	});

	it("prefers contentType over content_type", () => {
		const result = normalizeAttachmentContentType({
			filename: "x.txt",
			contentType: "text/plain",
			content_type: "wrong/type",
		});
		expect(result.contentType).toBe("text/plain");
	});
});

describe("normalizeAttachments", () => {
	it("normalizes an array of attachments", () => {
		const result = normalizeAttachments([
			{ filename: "a.pdf" },
			{ filename: "b.png", contentType: "image/png" },
			{ filename: "c.doc", content_type: "application/msword" },
		]);
		expect(result).toHaveLength(3);
		expect(result[0].contentType).toBe("application/pdf");
		expect(result[1].contentType).toBe("image/png");
		expect(result[2].contentType).toBe("application/msword");
	});

	it("handles empty array", () => {
		expect(normalizeAttachments([])).toEqual([]);
	});
});
