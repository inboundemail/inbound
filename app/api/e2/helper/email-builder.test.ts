import { describe, expect, it } from "bun:test";
import { buildRawEmailMessage } from "@/app/api/e2/helper/email-builder";

describe("buildRawEmailMessage recipient headers", () => {
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
});
