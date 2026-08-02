import { describe, expect, it } from "bun:test";
import {
	contactFromMailbox,
	contactsForThread,
	prepareEmailHtml,
} from "@/lib/mail-format";

describe("mail presentation formatting", () => {
	it("shows a mailbox display name without its bracketed address", () => {
		expect(contactFromMailbox('"Amazon.com" <store-news@amazon.com>')).toEqual({
			name: "Amazon.com",
			email: "store-news@amazon.com",
		});
	});

	it("falls back to a readable local part for a bare address", () => {
		expect(contactFromMailbox("marketing@flippa.com")).toEqual({
			name: "marketing",
			email: "marketing@flippa.com",
		});
	});

	it("puts the latest sender first without duplicating the receiving mailbox", () => {
		expect(contactsForThread(
			["Flippa.com <marketing@flippa.com>", "flippa@ryan.ceo"],
			["marketing@flippa.com", "flippa@ryan.ceo"],
			"Flippa.com <marketing@flippa.com>",
		)).toEqual([
			{ name: "Flippa.com", email: "marketing@flippa.com" },
			{ name: "flippa", email: "flippa@ryan.ceo" },
		]);
	});

	it("wraps partial HTML with isolated email-viewer defaults", () => {
		const document = prepareEmailHtml("<p>Hello</p>");
		expect(document).toContain("Content-Security-Policy");
		expect(document).toContain('<base target="_blank">');
		expect(document).toContain("<body><p>Hello</p></body>");
	});
});
