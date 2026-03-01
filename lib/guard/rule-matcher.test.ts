import { describe, expect, it } from "bun:test";
import {
	checkStringCriteria,
	checkEmailCriteria,
} from "@/lib/guard/rule-matcher";

describe("checkStringCriteria", () => {
	describe("OR operator", () => {
		it("matches when any value is found", () => {
			expect(
				checkStringCriteria("hello world", ["hello", "goodbye"], "OR"),
			).toBe(true);
		});

		it("does not match when no values found", () => {
			expect(checkStringCriteria("hello world", ["foo", "bar"], "OR")).toBe(
				false,
			);
		});
	});

	describe("AND operator", () => {
		it("matches when all values are found", () => {
			expect(
				checkStringCriteria("hello world foo", ["hello", "world"], "AND"),
			).toBe(true);
		});

		it("does not match when some values are missing", () => {
			expect(
				checkStringCriteria("hello world", ["hello", "missing"], "AND"),
			).toBe(false);
		});
	});

	it("lowercases pattern values for matching", () => {
		// The function lowercases values but expects content to already be lowercased
		expect(checkStringCriteria("hello world", ["HELLO"], "OR")).toBe(true);
	});
});

describe("checkEmailCriteria", () => {
	describe("exact match", () => {
		it("matches exact email (OR)", () => {
			expect(
				checkEmailCriteria(
					["user@example.com"],
					["user@example.com"],
					"OR",
				),
			).toBe(true);
		});

		it("does not match different email", () => {
			expect(
				checkEmailCriteria(
					["user@example.com"],
					["other@example.com"],
					"OR",
				),
			).toBe(false);
		});
	});

	describe("wildcard patterns", () => {
		it("matches *@domain.com pattern", () => {
			expect(
				checkEmailCriteria(
					["anyone@example.com"],
					["*@example.com"],
					"OR",
				),
			).toBe(true);
		});

		it("does not match wrong domain with wildcard", () => {
			expect(
				checkEmailCriteria(
					["anyone@other.com"],
					["*@example.com"],
					"OR",
				),
			).toBe(false);
		});
	});

	describe("OR operator", () => {
		it("matches if any pattern matches", () => {
			expect(
				checkEmailCriteria(
					["user@example.com"],
					["nope@nope.com", "*@example.com"],
					"OR",
				),
			).toBe(true);
		});
	});

	describe("AND operator", () => {
		it("matches when all patterns match", () => {
			expect(
				checkEmailCriteria(
					["user@example.com", "admin@example.com"],
					["user@example.com", "*@example.com"],
					"AND",
				),
			).toBe(true);
		});

		it("does not match when a pattern has no match", () => {
			expect(
				checkEmailCriteria(
					["user@example.com"],
					["user@example.com", "admin@other.com"],
					"AND",
				),
			).toBe(false);
		});
	});

	it("lowercases pattern for matching", () => {
		// The function lowercases patterns but expects email addresses to already be lowercased
		expect(
			checkEmailCriteria(
				["user@example.com"],
				["USER@EXAMPLE.COM"],
				"OR",
			),
		).toBe(true);
	});
});
