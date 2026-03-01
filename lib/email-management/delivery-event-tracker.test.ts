import { describe, expect, it } from "bun:test";
import { getBounceSubType } from "@/lib/email-management/delivery-event-tracker";

describe("getBounceSubType", () => {
	it("returns UNKNOWN when statusCode is undefined", () => {
		expect(getBounceSubType(undefined, undefined)).toBe("unknown");
	});

	it("maps 5.1.1 → user_unknown", () => {
		expect(getBounceSubType("5.1.1", undefined)).toBe("user_unknown");
	});

	it("maps 5.1.2 → bad_destination", () => {
		expect(getBounceSubType("5.1.2", undefined)).toBe("bad_destination");
	});

	it("maps 5.2.1 → mailbox_disabled", () => {
		expect(getBounceSubType("5.2.1", undefined)).toBe("mailbox_disabled");
	});

	it("maps 5.2.2 → mailbox_full", () => {
		expect(getBounceSubType("5.2.2", undefined)).toBe("mailbox_full");
	});

	it("maps 5.3.4 → message_too_large", () => {
		expect(getBounceSubType("5.3.4", undefined)).toBe("message_too_large");
	});

	it("maps 5.4.4 → invalid_domain", () => {
		expect(getBounceSubType("5.4.4", undefined)).toBe("invalid_domain");
	});

	it("maps 5.7.1 → policy_rejection", () => {
		expect(getBounceSubType("5.7.1", undefined)).toBe("policy_rejection");
	});

	it("maps 5.6.1 → content_rejected", () => {
		expect(getBounceSubType("5.6.1", undefined)).toBe("content_rejected");
	});

	it("maps 4.2.2 → mailbox_full", () => {
		expect(getBounceSubType("4.2.2", undefined)).toBe("mailbox_full");
	});

	it("maps 4.4.4 → dns_failure", () => {
		expect(getBounceSubType("4.4.4", undefined)).toBe("dns_failure");
	});

	it("maps 4.4.7 → delivery_timeout", () => {
		expect(getBounceSubType("4.4.7", undefined)).toBe("delivery_timeout");
	});

	it("maps 4.4.1 → connection_failed", () => {
		expect(getBounceSubType("4.4.1", undefined)).toBe("connection_failed");
	});

	it("overrides with suppression_list when diagnostic mentions it", () => {
		expect(
			getBounceSubType(
				"5.1.1",
				"550 Address is on the suppression list for this account",
			),
		).toBe("suppression_list");
	});

	it("returns general_failure for unrecognized status codes", () => {
		expect(getBounceSubType("5.9.9", undefined)).toBe("general_failure");
	});
});
