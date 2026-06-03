import { describe, expect, it } from "bun:test";
import {
	attachmentsToStorageFormat,
	processAttachments,
} from "@/app/api/e2/helper/attachment-processor";
import { buildRawEmailMessage } from "@/app/api/e2/helper/email-builder";

describe("outbound inline attachments", () => {
	it("builds a related MIME part with CID headers", async () => {
		const [attachment] = await processAttachments([
			{
				filename: "logo.png",
				content: "iVBORw0KGgo=",
				content_type: "image/png",
				content_id: "logo",
			},
		]);

		const message = buildRawEmailMessage({
			from: "sender@example.com",
			to: ["recipient@example.com"],
			subject: "Inline image",
			htmlBody: '<img src="cid:logo">',
			attachments: [attachment],
		});

		expect(message).toContain("Content-Type: multipart/related;");
		expect(message).toContain("Content-ID: <logo>");
		expect(message).toContain(
			'Content-Disposition: inline; filename="logo.png"',
		);
	});

	it("preserves CID data when storing processed attachments", async () => {
		const attachments = await processAttachments([
			{
				filename: "logo.png",
				content: "iVBORw0KGgo=",
				content_id: "logo",
			},
		]);

		expect(attachmentsToStorageFormat(attachments)[0].content_id).toBe("logo");
	});
});

describe("header injection hardening", () => {
	const headerBlock = (msg: string) => msg.split("\r\n\r\n")[0];

	it("neutralizes CRLF injected via the subject", () => {
		const msg = buildRawEmailMessage({
			from: "a@example.com",
			to: ["v@example.com"],
			subject: "Hi\r\nBcc: attacker@evil.com\r\nX-Injected: 1",
			textBody: "body",
		});
		const lines = headerBlock(msg).split("\r\n");
		// No injected header line: the payload stays inside the Subject value
		expect(lines.some((l) => l.startsWith("Bcc:"))).toBe(false);
		expect(lines.some((l) => l.startsWith("X-Injected:"))).toBe(false);
		expect(
			lines.some((l) => l === "Subject: Hi Bcc: attacker@evil.com X-Injected: 1"),
		).toBe(true);
	});

	it("neutralizes CRLF injected via custom header values and recipients", () => {
		const msg = buildRawEmailMessage({
			from: "a@example.com",
			to: ["Foo <user@example.com>\r\nBcc: attacker@evil.com"],
			replyTo: ["r@example.com\r\nX-Inj: 1"],
			subject: "hi",
			textBody: "body",
			customHeaders: { "X-Foo": "bar\r\nEvil: injected" },
		});
		const lines = headerBlock(msg).split("\r\n");
		expect(lines.some((l) => l.startsWith("Bcc:"))).toBe(false);
		expect(lines.some((l) => l === "Evil: injected")).toBe(false);
		expect(lines.some((l) => l.startsWith("X-Inj:"))).toBe(false);
	});

	it("preserves legitimate values containing hyphens and brackets", () => {
		const msg = buildRawEmailMessage({
			from: "foo-bar@my-domain.com",
			to: ["a@b.com"],
			subject: "Re: order-12345 [shipped]",
			textBody: "x",
		});
		expect(msg).toContain("From: foo-bar@my-domain.com");
		expect(msg).toContain("Subject: Re: order-12345 [shipped]");
	});

	it("strips CRLF/quotes from attachment filename and content_id headers", async () => {
		const [attachment] = await processAttachments([
			{ filename: "logo.png", content: "iVBORw0KGgo=", content_id: "logo" },
		]);
		const malicious = {
			...attachment,
			filename: 'logo.png"\r\nX-Evil: injected',
			content_id: "logo>\r\nX-Evil2: yes",
		};
		const msg = buildRawEmailMessage({
			from: "a@b.com",
			to: ["v@x.com"],
			subject: "hi",
			htmlBody: "<p>x</p>",
			attachments: [malicious],
		});
		// No standalone injected MIME header line; payload stays inside the
		// (now single-line) Content-ID / Content-Disposition values.
		const lines = msg.split("\r\n");
		expect(lines.some((l) => l.startsWith("X-Evil:"))).toBe(false);
		expect(lines.some((l) => l.startsWith("X-Evil2:"))).toBe(false);
		expect(lines.some((l) => l.startsWith("Content-ID:"))).toBe(true);
	});

	it("rejects content_id containing control characters at validation time", async () => {
		await expect(
			processAttachments([
				{
					filename: "logo.png",
					content: "iVBORw0KGgo=",
					content_id: "logo\r\nX-Evil: 1",
				},
			]),
		).rejects.toThrow(/invalid characters/i);
	});

	it("rejects whitespace-only content_id values", async () => {
		await expect(
			processAttachments([
				{
					filename: "logo.png",
					content: "iVBORw0KGgo=",
					content_id: "   ",
				},
			]),
		).rejects.toThrow(/invalid characters/i);
	});

	it("rejects non-whitespace C0 controls in content_id", async () => {
		await expect(
			processAttachments([
				{
					filename: "logo.png",
					content: "iVBORw0KGgo=",
					content_id: "logo\u0000suffix",
				},
			]),
		).rejects.toThrow(/invalid characters/i);
	});
});

describe("quoted-printable encoding", () => {
	it("soft-wraps long lines at 76 characters and encodes 8-bit content", () => {
		const msg = buildRawEmailMessage({
			from: "a@b.com",
			to: ["v@x.com"],
			subject: "s",
			textBody: `${"A".repeat(200)} café =test`,
		});
		const bodyLines = msg.split("\r\n\r\n").slice(1).join("\r\n\r\n").split("\r\n");
		expect(Math.max(...bodyLines.map((l) => l.length))).toBeLessThanOrEqual(76);
		expect(msg).toContain("caf=C3=A9"); // é encoded
		expect(msg).toContain("=3Dtest"); // '=' encoded
	});
});
