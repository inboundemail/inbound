import { describe, expect, it } from "bun:test";
import { BOUNCE_SUB_TYPES, BOUNCE_TYPES } from "@/lib/db/schema";
import { shouldAutoBlockRecipient } from "./delivery-event-tracker";

describe("shouldAutoBlockRecipient", () => {
	it("blocks permanent recipient failures", () => {
		expect(
			shouldAutoBlockRecipient(
				BOUNCE_TYPES.HARD,
				BOUNCE_SUB_TYPES.USER_UNKNOWN,
			),
		).toBe(true);
		expect(
			shouldAutoBlockRecipient(
				BOUNCE_TYPES.HARD,
				BOUNCE_SUB_TYPES.INVALID_DOMAIN,
			),
		).toBe(true);
	});

	it("does not block sender policy failures", () => {
		expect(
			shouldAutoBlockRecipient(
				BOUNCE_TYPES.HARD,
				BOUNCE_SUB_TYPES.POLICY_REJECTION,
			),
		).toBe(false);
		expect(
			shouldAutoBlockRecipient(
				BOUNCE_TYPES.HARD,
				BOUNCE_SUB_TYPES.GENERAL_FAILURE,
			),
		).toBe(false);
	});

	it("does not block temporary failures", () => {
		expect(
			shouldAutoBlockRecipient(
				BOUNCE_TYPES.TRANSIENT,
				BOUNCE_SUB_TYPES.USER_UNKNOWN,
			),
		).toBe(false);
	});
});
