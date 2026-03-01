import { describe, expect, it } from "bun:test";
import {
	sanitizeHtml,
	extractEmailDomain,
	formatEmailAddress,
	extractEmailAddress,
	extractEmailAddresses,
} from "@/lib/email-management/email-parser";

describe("sanitizeHtml", () => {
	it("removes script tags", () => {
		const html = '<div>Safe</div><script>alert("xss")</script>';
		const result = sanitizeHtml(html);
		expect(result).not.toContain("<script");
		expect(result).toContain("Safe");
	});

	it("removes double-quoted event handlers", () => {
		const html = '<div onclick="alert(1)">Click</div>';
		const result = sanitizeHtml(html);
		expect(result).not.toContain("onclick");
	});

	it("removes single-quoted event handlers", () => {
		const html = "<div onmouseover='doEvil()'>Hover</div>";
		const result = sanitizeHtml(html);
		expect(result).not.toContain("onmouseover");
	});

	it("removes javascript: URLs", () => {
		const html = '<a href="javascript:alert(1)">Click</a>';
		const result = sanitizeHtml(html);
		expect(result).not.toContain("javascript:");
	});

	it("preserves data:image URLs", () => {
		const html =
			'<img src="data:image/png;base64,abc123" alt="inline image">';
		const result = sanitizeHtml(html);
		expect(result).toContain("data:image/png");
	});

	it("returns empty string for empty input", () => {
		expect(sanitizeHtml("")).toBe("");
	});
});

describe("extractEmailDomain", () => {
	it("extracts domain from plain email", () => {
		expect(extractEmailDomain("user@example.com")).toBe("example.com");
	});

	it("extracts domain from angle-bracket email", () => {
		expect(extractEmailDomain("<user@example.com>")).toBe("example.com");
	});

	it("returns empty string for no @ sign", () => {
		expect(extractEmailDomain("nodomain")).toBe("");
	});
});

describe("formatEmailAddress", () => {
	it("parses Name <email> format", () => {
		const result = formatEmailAddress("John Doe <john@example.com>");
		expect(result.name).toBe("John Doe");
		expect(result.address).toBe("john@example.com");
	});

	it("parses quoted name format", () => {
		const result = formatEmailAddress('"Jane Smith" <jane@example.com>');
		expect(result.name).toBe("Jane Smith");
		expect(result.address).toBe("jane@example.com");
	});

	it("handles plain email", () => {
		const result = formatEmailAddress("user@example.com");
		expect(result.name).toBe("");
		expect(result.address).toBe("user@example.com");
	});
});

describe("extractEmailAddress (mailparser version)", () => {
	it("returns unknown for null", () => {
		expect(extractEmailAddress(null)).toBe("unknown");
	});

	it("returns string input as-is", () => {
		expect(extractEmailAddress("user@example.com")).toBe("user@example.com");
	});

	it("extracts text from address object", () => {
		expect(extractEmailAddress({ text: "John <john@example.com>" })).toBe(
			"John <john@example.com>",
		);
	});

	it("extracts from array of address objects", () => {
		expect(
			extractEmailAddress([{ text: "first@example.com" }]),
		).toBe("first@example.com");
	});

	it("falls back to address field", () => {
		expect(extractEmailAddress({ address: "addr@example.com" })).toBe(
			"addr@example.com",
		);
	});

	it("falls back to name field", () => {
		expect(extractEmailAddress({ name: "John" })).toBe("John");
	});

	it("returns unknown for empty object", () => {
		expect(extractEmailAddress({})).toBe("unknown");
	});
});

describe("extractEmailAddresses", () => {
	it("returns empty array for null", () => {
		expect(extractEmailAddresses(null)).toEqual([]);
	});

	it("wraps string in array", () => {
		expect(extractEmailAddresses("user@example.com")).toEqual([
			"user@example.com",
		]);
	});

	it("extracts from array of address objects", () => {
		const result = extractEmailAddresses([
			{ text: "a@example.com" },
			{ address: "b@example.com" },
		]);
		expect(result).toEqual(["a@example.com", "b@example.com"]);
	});

	it("extracts from object with text field", () => {
		expect(extractEmailAddresses({ text: "user@example.com" })).toEqual([
			"user@example.com",
		]);
	});
});
