import { describe, it, expect } from "bun:test";
import type { BatchEmailItem } from "@/app/api/e2/emails/batch-schemas";
import {
	computeCanonicalHash,
	computeChildIdempotencyHash,
	validateEmailItem,
	validateAggregateBatchAttachments,
	isPostgresUniqueViolation,
	type ProcessedAttachmentSize,
} from "@/app/api/e2/emails/batch-utils";

const minimalValidEmail: BatchEmailItem = {
	from: "sender@example.com",
	to: "recipient@example.com",
	subject: "Test subject",
	html: "<p>Hello</p>",
};

describe("computeCanonicalHash", () => {
	it("produces stable hash across recipient ordering", () => {
		const emailA: BatchEmailItem = {
			from: "sender@example.com",
			to: ["z@example.com", "a@example.com"],
			subject: "Test",
			text: "body",
		};
		const emailB: BatchEmailItem = {
			from: "sender@example.com",
			to: ["a@example.com", "z@example.com"],
			subject: "Test",
			text: "body",
		};
		expect(computeCanonicalHash([emailA])).toBe(computeCanonicalHash([emailB]));
	});

	it("produces stable hash across header object key ordering", () => {
		const emailA: BatchEmailItem = {
			from: "sender@example.com",
			to: "recipient@example.com",
			subject: "Test",
			text: "body",
			headers: { "X-Custom-A": "val1", "X-Custom-B": "val2" },
		};
		const emailB: BatchEmailItem = {
			from: "sender@example.com",
			to: "recipient@example.com",
			subject: "Test",
			text: "body",
			headers: { "X-Custom-B": "val2", "X-Custom-A": "val1" },
		};
		expect(computeCanonicalHash([emailA])).toBe(computeCanonicalHash([emailB]));
	});

	it("does not mutate original arrays", () => {
		const toArray = ["z@example.com", "a@example.com"];
		const email: BatchEmailItem = {
			from: "sender@example.com",
			to: [...toArray],
			subject: "Test",
			text: "body",
		};
		computeCanonicalHash([email]);
		expect(email.to).toEqual(toArray);
	});

	it("does not mutate original headers object", () => {
		const headers = { "X-Custom-B": "val2", "X-Custom-A": "val1" };
		const originalKeys = Object.keys(headers);
		const email: BatchEmailItem = {
			from: "sender@example.com",
			to: "recipient@example.com",
			subject: "Test",
			text: "body",
			headers: { ...headers },
		};
		computeCanonicalHash([email]);
		expect(Object.keys(email.headers!)).toEqual(originalKeys);
	});

	it("changes hash when subject changes", () => {
		const emailA: BatchEmailItem = {
			from: "sender@example.com",
			to: "recipient@example.com",
			subject: "Subject A",
			text: "body",
		};
		const emailB: BatchEmailItem = {
			from: "sender@example.com",
			to: "recipient@example.com",
			subject: "Subject B",
			text: "body",
		};
		expect(computeCanonicalHash([emailA])).not.toBe(
			computeCanonicalHash([emailB]),
		);
	});

	it("changes hash when html content changes", () => {
		const emailA: BatchEmailItem = {
			from: "sender@example.com",
			to: "recipient@example.com",
			subject: "Test",
			html: "<p>Content A</p>",
		};
		const emailB: BatchEmailItem = {
			from: "sender@example.com",
			to: "recipient@example.com",
			subject: "Test",
			html: "<p>Content B</p>",
		};
		expect(computeCanonicalHash([emailA])).not.toBe(
			computeCanonicalHash([emailB]),
		);
	});

	it("changes hash when text content changes", () => {
		const emailA: BatchEmailItem = {
			from: "sender@example.com",
			to: "recipient@example.com",
			subject: "Test",
			text: "Content A",
		};
		const emailB: BatchEmailItem = {
			from: "sender@example.com",
			to: "recipient@example.com",
			subject: "Test",
			text: "Content B",
		};
		expect(computeCanonicalHash([emailA])).not.toBe(
			computeCanonicalHash([emailB]),
		);
	});
});

describe("computeChildIdempotencyHash", () => {
	it("returns a fixed 64-character hex string", () => {
		const result = computeChildIdempotencyHash("parent-key", "batch-id-123", 0);
		expect(result).toHaveLength(64);
		expect(result).toMatch(/^[a-f0-9]{64}$/);
	});

	it("is index-sensitive", () => {
		const hash0 = computeChildIdempotencyHash("parent-key", "batch-id-123", 0);
		const hash1 = computeChildIdempotencyHash("parent-key", "batch-id-123", 1);
		const hash2 = computeChildIdempotencyHash("parent-key", "batch-id-123", 2);
		expect(hash0).not.toBe(hash1);
		expect(hash1).not.toBe(hash2);
		expect(hash0).not.toBe(hash2);
	});

	it("is sensitive to parent idempotency key", () => {
		const hashA = computeChildIdempotencyHash("parent-A", "batch-id", 0);
		const hashB = computeChildIdempotencyHash("parent-B", "batch-id", 0);
		expect(hashA).not.toBe(hashB);
	});

	it("is sensitive to batch id", () => {
		const hashA = computeChildIdempotencyHash("parent", "batch-A", 0);
		const hashB = computeChildIdempotencyHash("parent", "batch-B", 0);
		expect(hashA).not.toBe(hashB);
	});
});

describe("validateEmailItem", () => {
	it("accepts a valid minimal email with html", () => {
		const result = validateEmailItem(minimalValidEmail, 0);
		expect(result.valid).toBe(true);
		expect(result.error).toBeUndefined();
	});

	it("accepts a valid minimal email with text only", () => {
		const email: BatchEmailItem = {
			from: "sender@example.com",
			to: "recipient@example.com",
			subject: "Test",
			text: "Plain text body",
		};
		const result = validateEmailItem(email, 0);
		expect(result.valid).toBe(true);
	});

	it("rejects email missing both html and text", () => {
		const email: BatchEmailItem = {
			from: "sender@example.com",
			to: "recipient@example.com",
			subject: "Test",
		};
		const result = validateEmailItem(email, 0);
		expect(result.valid).toBe(false);
		expect(result.error).toContain("html or text");
	});

	it("rejects invalid recipient email format", () => {
		const email: BatchEmailItem = {
			from: "sender@example.com",
			to: "not-an-email",
			subject: "Test",
			html: "<p>body</p>",
		};
		const result = validateEmailItem(email, 0);
		expect(result.valid).toBe(false);
		expect(result.error).toContain("Invalid email format");
	});

	it("rejects CRLF in subject", () => {
		const email: BatchEmailItem = {
			from: "sender@example.com",
			to: "recipient@example.com",
			subject: "Test\r\nInjection",
			html: "<p>body</p>",
		};
		const result = validateEmailItem(email, 0);
		expect(result.valid).toBe(false);
		expect(result.error).toContain("line breaks");
	});

	it("rejects newline in subject", () => {
		const email: BatchEmailItem = {
			from: "sender@example.com",
			to: "recipient@example.com",
			subject: "Test\nInjection",
			html: "<p>body</p>",
		};
		const result = validateEmailItem(email, 0);
		expect(result.valid).toBe(false);
		expect(result.error).toContain("line breaks");
	});

	it("rejects CRLF in from address", () => {
		const email: BatchEmailItem = {
			from: "sender@example.com\r\nBcc: attacker@evil.com",
			to: "recipient@example.com",
			subject: "Test",
			html: "<p>body</p>",
		};
		const result = validateEmailItem(email, 0);
		expect(result.valid).toBe(false);
		expect(result.error).toContain("Invalid characters");
	});

	it("rejects CRLF in recipient address", () => {
		const email: BatchEmailItem = {
			from: "sender@example.com",
			to: "recipient@example.com\r\nBcc: attacker@evil.com",
			subject: "Test",
			html: "<p>body</p>",
		};
		const result = validateEmailItem(email, 0);
		expect(result.valid).toBe(false);
		expect(result.error).toContain("Invalid characters");
	});

	it("rejects CRLF in header name", () => {
		const email: BatchEmailItem = {
			from: "sender@example.com",
			to: "recipient@example.com",
			subject: "Test",
			html: "<p>body</p>",
			headers: { "X-Bad\r\nHeader": "value" },
		};
		const result = validateEmailItem(email, 0);
		expect(result.valid).toBe(false);
		expect(result.error).toContain("Invalid characters in header name");
	});

	it("rejects CRLF in header value", () => {
		const email: BatchEmailItem = {
			from: "sender@example.com",
			to: "recipient@example.com",
			subject: "Test",
			html: "<p>body</p>",
			headers: { "X-Custom": "value\r\ninjected" },
		};
		const result = validateEmailItem(email, 0);
		expect(result.valid).toBe(false);
		expect(result.error).toContain("Invalid characters in header value");
	});

	it("rejects protected header override (from)", () => {
		const email: BatchEmailItem = {
			from: "sender@example.com",
			to: "recipient@example.com",
			subject: "Test",
			html: "<p>body</p>",
			headers: { From: "attacker@evil.com" },
		};
		const result = validateEmailItem(email, 0);
		expect(result.valid).toBe(false);
		expect(result.error).toContain("Protected header cannot be overridden");
	});

	it("rejects protected header override (subject)", () => {
		const email: BatchEmailItem = {
			from: "sender@example.com",
			to: "recipient@example.com",
			subject: "Test",
			html: "<p>body</p>",
			headers: { Subject: "Evil Subject" },
		};
		const result = validateEmailItem(email, 0);
		expect(result.valid).toBe(false);
		expect(result.error).toContain("Protected header cannot be overridden");
	});

	it("rejects protected header override (DKIM-Signature)", () => {
		const email: BatchEmailItem = {
			from: "sender@example.com",
			to: "recipient@example.com",
			subject: "Test",
			html: "<p>body</p>",
			headers: { "DKIM-Signature": "forged-signature" },
		};
		const result = validateEmailItem(email, 0);
		expect(result.valid).toBe(false);
		expect(result.error).toContain("Protected header cannot be overridden");
	});

	it("rejects more than 50 total recipients", () => {
		const recipients = Array.from(
			{ length: 51 },
			(_, i) => `user${i}@example.com`,
		);
		const email: BatchEmailItem = {
			from: "sender@example.com",
			to: recipients,
			subject: "Test",
			html: "<p>body</p>",
		};
		const result = validateEmailItem(email, 0);
		expect(result.valid).toBe(false);
		expect(result.error).toContain("Too many recipients");
	});

	it("accepts exactly 50 total recipients", () => {
		const recipients = Array.from(
			{ length: 50 },
			(_, i) => `user${i}@example.com`,
		);
		const email: BatchEmailItem = {
			from: "sender@example.com",
			to: recipients,
			subject: "Test",
			html: "<p>body</p>",
		};
		const result = validateEmailItem(email, 0);
		expect(result.valid).toBe(true);
	});

	it("rejects more than 50 headers", () => {
		const headers: Record<string, string> = {};
		for (let i = 0; i < 51; i++) {
			headers[`X-Custom-${i}`] = `value${i}`;
		}
		const email: BatchEmailItem = {
			from: "sender@example.com",
			to: "recipient@example.com",
			subject: "Test",
			html: "<p>body</p>",
			headers,
		};
		const result = validateEmailItem(email, 0);
		expect(result.valid).toBe(false);
		expect(result.error).toContain("Too many headers");
	});

	it("rejects more than 20 tags", () => {
		const tags = Array.from({ length: 21 }, (_, i) => ({
			name: `tag${i}`,
			value: `val${i}`,
		}));
		const email: BatchEmailItem = {
			from: "sender@example.com",
			to: "recipient@example.com",
			subject: "Test",
			html: "<p>body</p>",
			tags,
		};
		const result = validateEmailItem(email, 0);
		expect(result.valid).toBe(false);
		expect(result.error).toContain("Too many tags");
	});

	it("rejects attachment missing content", () => {
		const email: BatchEmailItem = {
			from: "sender@example.com",
			to: "recipient@example.com",
			subject: "Test",
			html: "<p>body</p>",
			attachments: [{ filename: "file.txt", content: "" }],
		};
		const result = validateEmailItem(email, 0);
		expect(result.valid).toBe(false);
		expect(result.error).toContain("missing required content");
	});

	it("rejects remote path attachment via safe unknown cast", () => {
		const email: BatchEmailItem = {
			from: "sender@example.com",
			to: "recipient@example.com",
			subject: "Test",
			html: "<p>body</p>",
			attachments: [
				{
					filename: "file.txt",
					content: "base64data",
				} as BatchEmailItem["attachments"] extends (infer U)[]
					? U & { path?: string }
					: never,
			],
		};
		(
			email.attachments as unknown as Array<{ filename: string; path: string }>
		)[0].path = "s3://bucket/key";
		const result = validateEmailItem(email, 0);
		expect(result.valid).toBe(false);
		expect(result.error).toContain("Remote path attachments not allowed");
	});
});

describe("validateAggregateBatchAttachments", () => {
	it("accepts attachments under 100MB total", () => {
		const attachments: ProcessedAttachmentSize[][] = [
			[{ size: 10 * 1024 * 1024 }, { size: 20 * 1024 * 1024 }],
			[{ size: 30 * 1024 * 1024 }],
		];
		const result = validateAggregateBatchAttachments(attachments);
		expect(result.valid).toBe(true);
	});

	it("rejects attachments over 100MB total", () => {
		const attachments: ProcessedAttachmentSize[][] = [
			[{ size: 50 * 1024 * 1024 }],
			[{ size: 51 * 1024 * 1024 }],
		];
		const result = validateAggregateBatchAttachments(attachments);
		expect(result.valid).toBe(false);
		expect(result.error).toContain("100MB");
	});

	it("rejects when total attachment count exceeds 100", () => {
		const attachments: ProcessedAttachmentSize[][] = [
			Array.from({ length: 101 }, () => ({ size: 1 })),
		];
		const result = validateAggregateBatchAttachments(attachments);
		expect(result.valid).toBe(false);
		expect(result.error).toContain("exceed limit");
	});

	it("accepts exactly 100 attachments", () => {
		const attachments: ProcessedAttachmentSize[][] = [
			Array.from({ length: 100 }, () => ({ size: 100 })),
		];
		const result = validateAggregateBatchAttachments(attachments);
		expect(result.valid).toBe(true);
	});

	it("accepts exactly 100MB total", () => {
		const attachments: ProcessedAttachmentSize[][] = [
			[{ size: 100 * 1024 * 1024 }],
		];
		const result = validateAggregateBatchAttachments(attachments);
		expect(result.valid).toBe(true);
	});
});

describe("isPostgresUniqueViolation", () => {
	it("recognizes error with code 23505", () => {
		const err = { code: "23505", message: "unique violation" };
		expect(isPostgresUniqueViolation(err)).toBe(true);
	});

	it("rejects error with different code", () => {
		const err = { code: "23502", message: "not null violation" };
		expect(isPostgresUniqueViolation(err)).toBe(false);
	});

	it("rejects null", () => {
		expect(isPostgresUniqueViolation(null)).toBe(false);
	});

	it("rejects undefined", () => {
		expect(isPostgresUniqueViolation(undefined)).toBe(false);
	});

	it("rejects non-object", () => {
		expect(isPostgresUniqueViolation("23505")).toBe(false);
	});

	it("rejects object without code property", () => {
		const err = { message: "some error" };
		expect(isPostgresUniqueViolation(err)).toBe(false);
	});

	it("rejects object with numeric code", () => {
		const err = { code: 23505 };
		expect(isPostgresUniqueViolation(err)).toBe(false);
	});
});
