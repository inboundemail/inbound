import { describe, expect, it } from "bun:test";

import { SENT_EMAIL_ID_TAG } from "@/app/api/e2/helper/ses-email-tags";
import { parseAcceptedEvent } from "@/app/api/inbound/health/tenant/accepted-event";

describe("parseAcceptedEvent", () => {
	it("parses a send event with sent_email_id tag", () => {
		const parsed = parseAcceptedEvent({
			eventType: "Send",
			mail: {
				messageId: "ses-message-id-123",
				timestamp: "2026-08-16T12:30:00.000Z",
				tags: { [SENT_EMAIL_ID_TAG]: ["email_abc123"] },
			},
		});

		expect(parsed).toEqual({
			sentEmailId: "email_abc123",
			sesMessageId: "ses-message-id-123",
			acceptedAt: new Date("2026-08-16T12:30:00.000Z"),
		});
	});

	it("parses a delivery event with sent_email_id tag", () => {
		const parsed = parseAcceptedEvent({
			eventType: "Delivery",
			mail: {
				messageId: "ses-message-id-456",
				timestamp: "2026-08-16T12:35:00.000Z",
				tags: { [SENT_EMAIL_ID_TAG]: ["email_xyz789"] },
			},
		});

		expect(parsed).toEqual({
			sentEmailId: "email_xyz789",
			sesMessageId: "ses-message-id-456",
			acceptedAt: new Date("2026-08-16T12:35:00.000Z"),
		});
	});

	it("handles lowercase eventType", () => {
		const parsed = parseAcceptedEvent({
			eventType: "send",
			mail: {
				messageId: "ses-message-id",
				timestamp: "2026-08-16T12:30:00.000Z",
				tags: { [SENT_EMAIL_ID_TAG]: ["email_123"] },
			},
		});

		expect(parsed).not.toBeNull();
		expect(parsed?.sentEmailId).toBe("email_123");
	});

	it("returns null for invalid timestamp", () => {
		const parsed = parseAcceptedEvent({
			eventType: "send",
			mail: {
				messageId: "ses-message-id",
				timestamp: "invalid-timestamp",
				tags: { [SENT_EMAIL_ID_TAG]: ["email_123"] },
			},
		});

		expect(parsed).toBeNull();
	});

	it("returns null for missing timestamp", () => {
		const parsed = parseAcceptedEvent({
			eventType: "send",
			mail: {
				messageId: "ses-message-id",
				timestamp: "",
				tags: { [SENT_EMAIL_ID_TAG]: ["email_123"] },
			},
		});

		expect(parsed).toBeNull();
	});

	it("returns null for missing sent_email_id tag", () => {
		const parsed = parseAcceptedEvent({
			eventType: "send",
			mail: {
				messageId: "ses-message-id",
				timestamp: "2026-08-16T12:30:00.000Z",
				tags: {},
			},
		});

		expect(parsed).toBeNull();
	});

	it("returns null when tags object is missing", () => {
		const parsed = parseAcceptedEvent({
			eventType: "send",
			mail: {
				messageId: "ses-message-id",
				timestamp: "2026-08-16T12:30:00.000Z",
			},
		});

		expect(parsed).toBeNull();
	});

	it("returns null for unrelated event types", () => {
		expect(
			parseAcceptedEvent({
				eventType: "bounce",
				mail: {
					messageId: "ses-message-id",
					timestamp: "2026-08-16T12:30:00.000Z",
					tags: { [SENT_EMAIL_ID_TAG]: ["email_123"] },
				},
			}),
		).toBeNull();

		expect(
			parseAcceptedEvent({
				eventType: "complaint",
				mail: {
					messageId: "ses-message-id",
					timestamp: "2026-08-16T12:30:00.000Z",
					tags: { [SENT_EMAIL_ID_TAG]: ["email_123"] },
				},
			}),
		).toBeNull();

		expect(
			parseAcceptedEvent({
				eventType: "open",
				mail: {
					messageId: "ses-message-id",
					timestamp: "2026-08-16T12:30:00.000Z",
					tags: { [SENT_EMAIL_ID_TAG]: ["email_123"] },
				},
			}),
		).toBeNull();
	});

	it("returns null when messageId is missing", () => {
		const parsed = parseAcceptedEvent({
			eventType: "send",
			mail: {
				messageId: "",
				timestamp: "2026-08-16T12:30:00.000Z",
				tags: { [SENT_EMAIL_ID_TAG]: ["email_123"] },
			},
		});

		expect(parsed).toBeNull();
	});
});
