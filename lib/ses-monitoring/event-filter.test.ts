import { describe, expect, it } from "bun:test";
import { shouldTrackSesReputationEvent } from "@/lib/ses-monitoring/event-filter";

describe("shouldTrackSesReputationEvent", () => {
	it("ignores complaints caused by the account suppression list", () => {
		expect(
			shouldTrackSesReputationEvent({
				eventType: "complaint",
				complaint: { complaintSubType: "OnAccountSuppressionList" },
			}),
		).toBe(false);
	});

	it("tracks genuine abuse complaints", () => {
		expect(
			shouldTrackSesReputationEvent({
				eventType: "complaint",
				complaint: { complaintSubType: null },
			}),
		).toBe(true);
	});

	it("tracks bounce events", () => {
		expect(shouldTrackSesReputationEvent({ eventType: "bounce" })).toBe(true);
	});
});
