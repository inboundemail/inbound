import { describe, expect, it } from "bun:test";
import {
	getUserAgeInDays,
	getSeverity,
	SPIKE_DETECTION_CONFIG,
	type AwsReputationSnapshot,
} from "@/lib/email-management/sending-spike-detector";

describe("getUserAgeInDays", () => {
	it("computes age from a Date object", () => {
		const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
		const age = getUserAgeInDays(twoDaysAgo);
		// Should be approximately 2
		expect(age).toBeGreaterThanOrEqual(1.9);
		expect(age).toBeLessThanOrEqual(2.1);
	});

	it("computes age from an ISO string", () => {
		const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
		const age = getUserAgeInDays(fiveDaysAgo.toISOString());
		expect(age).toBeGreaterThanOrEqual(4.9);
		expect(age).toBeLessThanOrEqual(5.1);
	});

	it("returns 0 for future date", () => {
		const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
		expect(getUserAgeInDays(tomorrow)).toBe(0);
	});

	it("returns 0 for current time", () => {
		const now = new Date();
		const age = getUserAgeInDays(now);
		expect(age).toBeGreaterThanOrEqual(0);
		expect(age).toBeLessThan(0.01);
	});
});

describe("getSeverity", () => {
	const noReputation = null;

	it("returns critical when 24h volume exceeds critical threshold", () => {
		expect(
			getSeverity(
				0,
				0,
				SPIKE_DETECTION_CONFIG.ABSOLUTE_24H_CRITICAL,
				noReputation,
			),
		).toBe("critical");
	});

	it("returns critical when 1h volume exceeds critical threshold", () => {
		expect(
			getSeverity(
				0,
				SPIKE_DETECTION_CONFIG.ABSOLUTE_1H_CRITICAL,
				0,
				noReputation,
			),
		).toBe("critical");
	});

	it("returns critical when reputation is at risk", () => {
		const atRiskReputation = { isAtRisk: true } as AwsReputationSnapshot;
		expect(getSeverity(0, 0, 0, atRiskReputation)).toBe("critical");
	});

	it("returns high when 24h volume exceeds high threshold", () => {
		expect(
			getSeverity(
				0,
				0,
				SPIKE_DETECTION_CONFIG.ABSOLUTE_24H_HIGH,
				noReputation,
			),
		).toBe("high");
	});

	it("returns high when 1h volume exceeds high threshold", () => {
		expect(
			getSeverity(
				0,
				SPIKE_DETECTION_CONFIG.ABSOLUTE_1H_HIGH,
				0,
				noReputation,
			),
		).toBe("high");
	});

	it("returns medium for moderate volumes", () => {
		expect(getSeverity(50, 100, 200, noReputation)).toBe("medium");
	});

	it("returns medium when reputation is warning but not at risk", () => {
		const warningReputation = {
			isAtRisk: false,
			isWarning: true,
		} as AwsReputationSnapshot;
		expect(getSeverity(50, 100, 200, warningReputation)).toBe("medium");
	});
});
