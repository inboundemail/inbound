import { describe, expect, it } from "bun:test";
import {
	extractDomainFromEmail,
	extractEmailAddress,
	extractEmailName,
	isValidEmail,
} from "@/lib/utils/email-utils";

describe("isValidEmail", () => {
	it("accepts a plain email", () => {
		expect(isValidEmail("user@example.com")).toBe(true);
	});

	it("accepts subdomains", () => {
		expect(isValidEmail("user@mail.example.com")).toBe(true);
	});

	it("rejects empty string", () => {
		expect(isValidEmail("")).toBe(false);
	});

	it("rejects missing @", () => {
		expect(isValidEmail("userexample.com")).toBe(false);
	});

	it("rejects spaces", () => {
		expect(isValidEmail("user @example.com")).toBe(false);
	});

	it("rejects missing domain", () => {
		expect(isValidEmail("user@")).toBe(false);
	});

	it("rejects missing local part", () => {
		expect(isValidEmail("@example.com")).toBe(false);
	});
});

describe("extractDomainFromEmail", () => {
	it("extracts domain from a plain email", () => {
		expect(extractDomainFromEmail("user@Example.COM")).toBe("example.com");
	});

	it("extracts domain from Name <email> format", () => {
		expect(extractDomainFromEmail("John Doe <john@DOMAIN.org>")).toBe(
			"domain.org",
		);
	});

	it("returns empty string when no @ present", () => {
		expect(extractDomainFromEmail("nodomain")).toBe("");
	});

	it("returns empty string for empty input", () => {
		expect(extractDomainFromEmail("")).toBe("");
	});
});

describe("extractEmailAddress", () => {
	it("extracts email from Name <email> format", () => {
		expect(extractEmailAddress("John <john@example.com>")).toBe(
			"john@example.com",
		);
	});

	it("returns plain email unchanged", () => {
		expect(extractEmailAddress("user@example.com")).toBe("user@example.com");
	});

	it("handles quoted name with angle brackets", () => {
		expect(extractEmailAddress('"John Doe" <jd@x.com>')).toBe("jd@x.com");
	});
});

describe("extractEmailName", () => {
	it("extracts unquoted name", () => {
		expect(extractEmailName("John Doe <john@example.com>")).toBe("John Doe");
	});

	it("strips surrounding quotes from name", () => {
		expect(extractEmailName('"John Doe" <john@example.com>')).toBe("John Doe");
	});

	it("strips surrounding single quotes", () => {
		expect(extractEmailName("'Jane' <jane@example.com>")).toBe("Jane");
	});

	it("returns null for a plain email", () => {
		expect(extractEmailName("user@example.com")).toBeNull();
	});

	it("returns null for empty string", () => {
		expect(extractEmailName("")).toBeNull();
	});
});
