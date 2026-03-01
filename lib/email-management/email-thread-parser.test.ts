import { describe, expect, it } from "bun:test";
import {
	parseTextEmailContent,
	parseHtmlEmailContent,
	parseEmailContent,
	splitIntoMessages,
} from "@/lib/email-management/email-thread-parser";

describe("parseTextEmailContent", () => {
	it("returns empty content for empty input", () => {
		const result = parseTextEmailContent("");
		expect(result.newContent).toBe("");
		expect(result.quotedContent).toBe("");
		expect(result.hasQuotedContent).toBe(false);
		expect(result.quoteLevels).toBe(0);
	});

	it("returns all content as new when no quotes present", () => {
		const result = parseTextEmailContent("Hello, this is a plain email.");
		expect(result.newContent).toBe("Hello, this is a plain email.");
		expect(result.hasQuotedContent).toBe(false);
	});

	it("separates new content from Gmail-style attribution", () => {
		const content = [
			"Thanks for the update!",
			"",
			"On Mon, 27 Jan 2025, John Doe wrote:",
			"> Original message here",
		].join("\n");

		const result = parseTextEmailContent(content);
		expect(result.newContent).toBe("Thanks for the update!");
		expect(result.hasQuotedContent).toBe(true);
		expect(result.quoteLevels).toBeGreaterThanOrEqual(1);
	});

	it("separates content from Outlook-style attribution", () => {
		const content = [
			"Got it, thanks.",
			"",
			"----- Original Message -----",
			"From: sender@example.com",
			"Subject: Test",
		].join("\n");

		const result = parseTextEmailContent(content);
		expect(result.newContent).toBe("Got it, thanks.");
		expect(result.hasQuotedContent).toBe(true);
	});

	it("detects > quote prefixes", () => {
		const content = [
			"My reply",
			"",
			"> Previous message",
			">> Even older message",
		].join("\n");

		const result = parseTextEmailContent(content);
		expect(result.newContent).toBe("My reply");
		expect(result.hasQuotedContent).toBe(true);
		expect(result.quoteLevels).toBeGreaterThanOrEqual(2);
	});

	it("detects mobile footers", () => {
		const content = ["Short reply.", "", "Sent from my iPhone"].join("\n");

		const result = parseTextEmailContent(content);
		expect(result.newContent).toBe("Short reply.");
		expect(result.hasQuotedContent).toBe(true);
	});

	it("handles Apple Mail forward format", () => {
		const content = [
			"FYI see below.",
			"",
			"Begin forwarded message:",
			"",
			"From: someone@example.com",
		].join("\n");

		const result = parseTextEmailContent(content);
		expect(result.newContent).toBe("FYI see below.");
		expect(result.hasQuotedContent).toBe(true);
	});
});

describe("parseHtmlEmailContent", () => {
	it("returns empty content for empty input", () => {
		const result = parseHtmlEmailContent("");
		expect(result.newContent).toBe("");
		expect(result.hasQuotedContent).toBe(false);
	});

	it("detects gmail_quote div", () => {
		const html =
			'<div>My reply</div><div class="gmail_quote"><blockquote>Quoted</blockquote></div>';
		const result = parseHtmlEmailContent(html);
		expect(result.newContent).toBe("<div>My reply</div>");
		expect(result.hasQuotedContent).toBe(true);
	});

	it("detects blockquote elements", () => {
		const html =
			"<p>New content</p><blockquote>Old quoted content</blockquote>";
		const result = parseHtmlEmailContent(html);
		expect(result.newContent).toBe("<p>New content</p>");
		expect(result.hasQuotedContent).toBe(true);
	});

	it("detects border-left styled divs", () => {
		const html =
			'<div>Reply</div><div style="border-left: 1px solid #ccc;">Quoted</div>';
		const result = parseHtmlEmailContent(html);
		expect(result.newContent).toBe("<div>Reply</div>");
		expect(result.hasQuotedContent).toBe(true);
	});

	it("counts nested blockquote levels", () => {
		const html =
			'<div>Reply</div><div class="gmail_quote"><blockquote>Level 1<blockquote>Level 2</blockquote></blockquote></div>';
		const result = parseHtmlEmailContent(html);
		expect(result.hasQuotedContent).toBe(true);
		expect(result.quoteLevels).toBeGreaterThanOrEqual(2);
	});

	it("returns all content as new when no quotes", () => {
		const html = "<div><p>Just a simple email.</p></div>";
		const result = parseHtmlEmailContent(html);
		expect(result.newContent).toBe("<div><p>Just a simple email.</p></div>");
		expect(result.hasQuotedContent).toBe(false);
	});
});

describe("parseEmailContent", () => {
	it("detects HTML and delegates to HTML parser", () => {
		const html = "<div>Hello</div><blockquote>Quoted</blockquote>";
		const result = parseEmailContent(html);
		expect(result.hasQuotedContent).toBe(true);
	});

	it("detects plain text and delegates to text parser", () => {
		const text = "Reply\n\nOn Mon, Jan 27, 2025, user wrote:\n> old";
		const result = parseEmailContent(text);
		expect(result.hasQuotedContent).toBe(true);
	});

	it("handles empty string", () => {
		const result = parseEmailContent("");
		expect(result.newContent).toBe("");
		expect(result.hasQuotedContent).toBe(false);
	});

	it("detects HTML entities as HTML", () => {
		const content = "Hello &amp; World";
		const result = parseEmailContent(content);
		// Should be treated as HTML-like due to entity
		expect(result.newContent).toBeTruthy();
	});
});

describe("splitIntoMessages", () => {
	it("returns empty array for empty input", () => {
		expect(splitIntoMessages("")).toEqual([]);
	});

	it("returns single message for plain text", () => {
		const result = splitIntoMessages("Just a plain message.");
		expect(result).toHaveLength(1);
		expect(result[0].content).toBe("Just a plain message.");
		expect(result[0].isForwarded).toBe(false);
	});

	it("splits on attribution lines", () => {
		const content = [
			"My reply",
			"",
			"On Mon, 27 Jan 2025, John wrote:",
			"Original message here",
		].join("\n");

		const result = splitIntoMessages(content);
		expect(result.length).toBeGreaterThanOrEqual(2);
		expect(result[0].content).toBe("My reply");
	});

	it("detects forwarded messages", () => {
		const content = [
			"FYI",
			"",
			"---------- Forwarded message ----------",
			"See below for details",
		].join("\n");

		const result = splitIntoMessages(content);
		expect(result.some((msg) => msg.isForwarded)).toBe(true);
	});
});
