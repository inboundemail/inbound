import { describe, expect, it } from "bun:test";
import {
	buildDeliveryEventId,
	buildDeliveryEventIdentityKey,
	countUniqueDeliveryEvents,
	getDeliveryEventDedupeKey,
} from "@/lib/email-management/delivery-event-dedupe";

describe("delivery event deduplication", () => {
	it("uses the same identity for SNS and formatted DSN values", () => {
		const snsEvent = {
			eventType: "bounce",
			originalMessageId: "ses-message-id",
			failedRecipient: "person@example.com",
		};
		const dsnEvent = {
			eventType: "bounce",
			originalMessageId: "<SES-MESSAGE-ID>",
			failedRecipient: "Person <PERSON@example.com>",
		};

		expect(buildDeliveryEventIdentityKey(snsEvent)).toBe(
			buildDeliveryEventIdentityKey(dsnEvent),
		);
		expect(buildDeliveryEventId(snsEvent)).toBe(buildDeliveryEventId(dsnEvent));
	});

	it("keeps different event types distinct", () => {
		const event = {
			originalMessageId: "ses-message-id",
			failedRecipient: "person@example.com",
		};

		expect(buildDeliveryEventId({ ...event, eventType: "bounce" })).not.toBe(
			buildDeliveryEventId({ ...event, eventType: "complaint" }),
		);
	});

	it("counts duplicate SNS and DSN rows once", () => {
		const counts = countUniqueDeliveryEvents([
			{
				id: "evt_sns",
				eventType: "bounce",
				originalMessageId: "ses-message-id",
				failedRecipient: "person@example.com",
			},
			{
				id: "evt_dsn",
				eventType: "bounce",
				originalMessageId: "<SES-MESSAGE-ID>",
				failedRecipient: "Person <PERSON@example.com>",
			},
			{
				id: "evt_complaint",
				eventType: "complaint",
				originalMessageId: "another-message-id",
				failedRecipient: "person@example.com",
			},
		]);

		expect(counts).toEqual({ bounces: 1, complaints: 1 });
	});

	it("deduplicates DSN retries without an original message id", () => {
		const first = {
			id: "evt_first",
			eventType: "bounce",
			originalMessageId: null,
			dsnEmailId: "inbound_dsn_123",
			failedRecipient: "person@example.com",
		};
		const retry = { ...first, id: "evt_retry" };

		expect(buildDeliveryEventId(first)).toBe(buildDeliveryEventId(retry));
		expect(countUniqueDeliveryEvents([first, retry])).toEqual({
			bounces: 1,
			complaints: 0,
		});
	});

	it("falls back to the row id without a message id", () => {
		expect(
			getDeliveryEventDedupeKey({
				id: "evt_existing",
				eventType: "bounce",
				originalMessageId: null,
				failedRecipient: "person@example.com",
			}),
		).toBe("id:evt_existing");
	});
});
