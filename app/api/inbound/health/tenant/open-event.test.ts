import { describe, expect, it } from "bun:test";
import { SENT_EMAIL_ID_TAG } from "@/app/api/e2/helper/ses-email-tags";
import { parseOpenEvent } from "@/app/api/inbound/health/tenant/open-event";

describe("parseOpenEvent", () => {
	it("extracts an open event with its sent email id", () => {
		const parsed = parseOpenEvent({
			eventType: "Open",
			mail: {
				messageId: "ses-message-id",
				tags: { [SENT_EMAIL_ID_TAG]: ["email_123"] },
			},
			open: { timestamp: "2026-08-08T19:20:00.000Z" },
		});

		expect(parsed).toEqual({
			sentEmailId: "email_123",
			sesMessageId: "ses-message-id",
			openedAt: new Date("2026-08-08T19:20:00.000Z"),
		});
	});

	it("keeps untagged events available for message id fallback", () => {
		const parsed = parseOpenEvent({
			eventType: "open",
			mail: { messageId: "ses-message-id" },
			open: { timestamp: "2026-08-08T19:20:00.000Z" },
		});

		expect(parsed?.sentEmailId).toBeNull();
		expect(parsed?.sesMessageId).toBe("ses-message-id");
	});

	it("rejects invalid timestamps and non-open events", () => {
		expect(
			parseOpenEvent({
				eventType: "open",
				mail: { messageId: "ses-message-id" },
				open: { timestamp: "invalid" },
			}),
		).toBeNull();
		expect(
			parseOpenEvent({
				eventType: "delivery",
				mail: { messageId: "ses-message-id" },
			}),
		).toBeNull();
	});
});
