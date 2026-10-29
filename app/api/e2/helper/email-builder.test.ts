import { describe, expect, it } from "bun:test";
import { simpleParser } from "mailparser";
import {
	buildRawEmailMessage,
	encodeQuotedPrintable,
} from "@/app/api/e2/helper/email-builder";
import {
	findUnsafeCustomHeader,
	normalizeMessageId,
} from "@/app/api/e2/helper/header-safety";
import { ensureMessageIdHeader } from "@/lib/email-management/mailbox-sent-copy";

function lines(message: string): string[] {
	return message.split("\r\n");
}

describe("buildRawEmailMessage recipient headers", () => {
	it("finds Message-ID only in the header block for CRLF and LF messages", () => {
		for (const newline of ["\r\n", "\n"]) {
			const raw = `Subject: body header${newline}${newline}Message-ID: <body@example.test>`;
			expect(ensureMessageIdHeader(raw, "generated@example.test")).toBe(
				`Message-ID: <generated@example.test>\r\n${raw}`,
			);
			const existing = `Message-ID: <original@example.test>${newline}${raw}`;
			expect(ensureMessageIdHeader(existing, "generated@example.test")).toBe(existing);
			expect(Buffer.from(ensureMessageIdHeader(Buffer.from(existing), "generated@example.test")).toString()).toBe(existing);
		}
	});

	it("preserves visible To and Cc recipients without exposing Bcc", () => {
		const message = buildRawEmailMessage({
			from: "sender@example.com",
			to: ["visible@example.com"],
			cc: ["copied@example.com"],
			bcc: ["blind@example.com"],
			subject: "Subject",
			textBody: "Body",
		});

		expect(message).toContain("To: visible@example.com\r\n");
		expect(message).toContain("Cc: copied@example.com\r\n");
		expect(message).not.toContain("blind@example.com");
		expect(message).not.toMatch(/^Bcc:/m);
	});

	it("normalizes valid message IDs and rejects injected or malformed ones", () => {
		expect(normalizeMessageId("abc.1@client.example.com")).toBe(
			"<abc.1@client.example.com>",
		);
		expect(normalizeMessageId("<abc@[127.0.0.1]>")).toBe("<abc@[127.0.0.1]>");
		for (const value of [
			"<abc@example.com>\r\nBcc: x@example.com",
			"<abc@example.com",
			"<a b@example.com>",
			"<x@y> <z@w>",
			"no-at-sign",
			`<${"a".repeat(500)}@example.com>`,
		]) {
			expect(normalizeMessageId(value)).toBeNull();
		}
		expect(findUnsafeCustomHeader("Message-ID", "<abc@example.com>")).toBe(
			"Header Message-ID cannot be set through headers",
		);
	});

	it("writes the given message ID as the Message-ID header", () => {
		const message = buildRawEmailMessage({
			from: "sender@example.com",
			to: ["visible@example.com"],
			subject: "Subject",
			textBody: "Body",
			messageId: "<abc.1@client.example.com>",
		});

		expect(message).toContain("Message-ID: <abc.1@client.example.com>\r\n");
	});

	it("uses undisclosed recipients for Bcc-only mail", () => {
		const message = buildRawEmailMessage({
			from: "sender@example.com",
			to: [],
			bcc: ["blind@example.com"],
			subject: "Subject",
			textBody: "Body",
		});

		expect(message).toContain("To: undisclosed-recipients:;\r\n");
		expect(message).not.toContain("blind@example.com");
		expect(message).not.toMatch(/^Bcc:/m);
	});

	it("uses undisclosed recipients for Cc-only mail while preserving Cc", () => {
		const message = buildRawEmailMessage({
			from: "sender@example.com",
			to: [],
			cc: ["copied@example.com"],
			subject: "Subject",
			textBody: "Body",
		});

		expect(message).toContain("To: undisclosed-recipients:;\r\n");
		expect(message).toContain("Cc: copied@example.com\r\n");
	});

	it("renders attachment content IDs inline without exposing Bcc", () => {
		const message = buildRawEmailMessage({
			from: "sender@example.com",
			to: [],
			bcc: ["blind@example.com"],
			subject: "Subject",
			htmlBody: '<img src="cid:logo">',
			attachments: [
				{
					filename: "logo.png",
					content: "aGVsbG8=",
					contentType: "image/png",
					size: 5,
					content_id: "logo",
				},
			],
		});

		expect(message).toContain("To: undisclosed-recipients:;\r\n");
		expect(message).toContain("Content-ID: <logo>\r\n");
		expect(message).toContain(
			'Content-Disposition: inline; filename="logo.png"',
		);
		expect(message).not.toContain("blind@example.com");
	});

	it("normalises bare CR and LF in bodies to CRLF", () => {
		const message = buildRawEmailMessage({
			from: "sender@example.com",
			to: ["visible@example.com"],
			subject: "Subject",
			textBody: "line one\rBcc: injected@example.com\nline three",
			htmlBody: "<p>one</p>\r<p>two</p>",
		});

		expect(message).not.toMatch(/\r(?!\n)|(?<!\r)\n/);
		expect(message).toContain(
			"line one\r\nBcc: injected@example.com\r\nline three",
		);
		expect(message).toContain("<p>one</p>\r\n<p>two</p>");
	});
});

describe("encodeQuotedPrintable", () => {
	it("encodes non-ASCII UTF-8 bytes, = and trailing whitespace", () => {
		expect(encodeQuotedPrintable("café = 1 \nnext\t")).toBe(
			"caf=C3=A9 =3D 1=20\r\nnext=09",
		);
	});

	it("soft-wraps long lines at 76 characters", () => {
		const encoded = encodeQuotedPrintable("x".repeat(1500));
		const encodedLines = lines(encoded);
		expect(encodedLines.length).toBeGreaterThan(19);
		for (const line of encodedLines) expect(line.length).toBeLessThanOrEqual(76);
		expect(encoded.replace(/=\r\n/g, "")).toBe("x".repeat(1500));
	});

	it("does not split an escape sequence across a soft break", () => {
		const encoded = encodeQuotedPrintable("é".repeat(200));
		for (const line of lines(encoded)) {
			expect(line.length).toBeLessThanOrEqual(76);
			expect(line).toMatch(/^(?:=[0-9A-F]{2})*=?$/);
		}
	});
});

describe("buildRawEmailMessage encoding", () => {
	it("keeps every line within limits and round-trips long non-ASCII bodies", async () => {
		const text = `${"Grüße aus Köln ".repeat(100)}\n${"y".repeat(1500)}`;
		const html = `<p>${"日本語のテキスト".repeat(200)}</p>`;
		const message = buildRawEmailMessage({
			from: "sender@example.com",
			to: ["visible@example.com"],
			subject: "Subject",
			textBody: text,
			htmlBody: html,
		});

		for (const line of lines(message)) {
			if (line.startsWith("--") || line.startsWith("Content-Type:")) continue;
			expect(line.length).toBeLessThanOrEqual(76);
		}
		expect(message).not.toMatch(/[^\x00-\x7f]/);
		const parsed = await simpleParser(message);
		expect(parsed.text).toBe(text);
		expect(parsed.html).toBe(html);
	});

	it("RFC 2047 encodes non-ASCII subjects and display names", async () => {
		const subject = `Rückmeldung zur Bestellung 🚀 ${"ünïcödé ".repeat(20)}`.trim();
		const message = buildRawEmailMessage({
			from: "=?UTF-8?Q?J=C3=BCrgen_M=C3=BCller?= <sender@example.com>",
			to: ["Zoë Ünal <visible@example.com>"],
			cc: ["Łukasz <copied@example.com>"],
			replyTo: ["Søren <reply@example.com>"],
			subject,
			textBody: "Body",
		});

		const headerBlock = message.slice(0, message.indexOf("\r\n\r\n"));
		expect(headerBlock).not.toMatch(/[^\x00-\x7f]/);
		for (const line of lines(headerBlock)) {
			expect(line.length).toBeLessThanOrEqual(78);
		}
		const parsed = await simpleParser(message);
		expect(parsed.subject).toBe(subject);
		expect(parsed.from?.value[0]).toMatchObject({
			name: "Jürgen Müller",
			address: "sender@example.com",
		});
		const to = Array.isArray(parsed.to) ? parsed.to[0] : parsed.to;
		expect(to?.value[0]).toMatchObject({
			name: "Zoë Ünal",
			address: "visible@example.com",
		});
		const cc = Array.isArray(parsed.cc) ? parsed.cc[0] : parsed.cc;
		expect(cc?.value[0]?.name).toBe("Łukasz");
		const replyTo = Array.isArray(parsed.replyTo)
			? parsed.replyTo[0]
			: parsed.replyTo;
		expect(replyTo?.value[0]?.name).toBe("Søren");
	});

	it("leaves short ASCII subjects as written and folds long ones", async () => {
		const shortMessage = buildRawEmailMessage({
			from: "sender@example.com",
			to: ["visible@example.com"],
			subject: 'Say "hi" (today)',
			textBody: "Body",
		});
		expect(shortMessage).toContain('Subject: Say "hi" (today)\r\n');

		const subject = "word ".repeat(300).trim();
		const longMessage = buildRawEmailMessage({
			from: "sender@example.com",
			to: Array.from({ length: 40 }, (_, i) => `user${i}@example.com`),
			subject,
			textBody: "Body",
		});
		for (const line of lines(longMessage)) {
			expect(line.length).toBeLessThanOrEqual(998);
		}
		const parsed = await simpleParser(longMessage);
		expect(parsed.subject).toBe(subject);
		const to = Array.isArray(parsed.to) ? parsed.to[0] : parsed.to;
		expect(to?.value).toHaveLength(40);

		const unbroken = "z".repeat(1500);
		const unbrokenMessage = buildRawEmailMessage({
			from: "sender@example.com",
			to: ["visible@example.com"],
			subject: unbroken,
			textBody: "Body",
		});
		for (const line of lines(unbrokenMessage)) {
			expect(line.length).toBeLessThanOrEqual(998);
		}
		expect((await simpleParser(unbrokenMessage)).subject).toBe(unbroken);
	});

	it("sends an empty subject and an empty text body", async () => {
		const message = buildRawEmailMessage({
			from: "sender@example.com",
			to: ["visible@example.com"],
			subject: "",
			textBody: "",
			htmlBody: "",
		});

		expect(message).toContain("Subject: \r\n");
		expect(message).toContain("Content-Type: text/plain; charset=UTF-8\r\n");
		expect(message).not.toContain("[No content]");
		expect(message).not.toContain("text/html");
		const parsed = await simpleParser(message);
		expect(parsed.subject ?? "").toBe("");
		expect(parsed.text ?? "").toBe("");
	});

	it("sends an empty text body alongside attachments", () => {
		const message = buildRawEmailMessage({
			from: "sender@example.com",
			to: ["visible@example.com"],
			subject: "",
			attachments: [
				{
					filename: "a.txt",
					content: "aGVsbG8=",
					contentType: "text/plain",
					size: 5,
				},
			],
		});

		expect(message).toContain("Content-Type: multipart/mixed;");
		expect(message).toContain(
			"Content-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: quoted-printable",
		);
		expect(message).not.toContain("[No content]");
	});

	it("rejects structured headers that cannot fold under 998 characters", () => {
		const base = {
			from: "sender@example.com",
			to: ["visible@example.com"],
			subject: "Subject",
			textBody: "Body",
		};
		const longReference = `<${"r".repeat(1000)}@example.com>`;
		expect(() =>
			buildRawEmailMessage({ ...base, references: [longReference] }),
		).toThrow("Message reference must be at most");
		expect(() =>
			buildRawEmailMessage({ ...base, inReplyTo: longReference }),
		).toThrow("Message reference must be at most");

		expect(() =>
			buildRawEmailMessage({
				...base,
				from: `${"x".repeat(1000)} <sender@example.com>`,
			}),
		).toThrow("From header has a part longer than 998 characters");
	});
});
