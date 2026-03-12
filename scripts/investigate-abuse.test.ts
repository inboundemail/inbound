import { describe, expect, it } from "bun:test";
import {
	buildRiskProfile,
	getRangeStart,
	parseCliInput,
} from "./investigate-abuse";

describe("investigate-abuse CLI parser", () => {
	it("parses overview command with defaults", () => {
		const parsed = parseCliInput(["overview"]);
		expect(parsed.command).toBe("overview");

		if (parsed.command !== "overview") {
			throw new Error("Expected overview command");
		}

		expect(parsed.timeRange).toBe("7d");
		expect(parsed.limit).toBe(25);
		expect(parsed.withAws).toBe(false);
		expect(parsed.flaggedOnly).toBe(false);
	});

	it("parses account command with email selector", () => {
		const parsed = parseCliInput(["account", "--email", "Abuse@Example.com"]);
		expect(parsed.command).toBe("account");

		if (parsed.command !== "account") {
			throw new Error("Expected account command");
		}

		expect(parsed.email).toBe("abuse@example.com");
		expect(parsed.userId).toBeUndefined();
	});

	it("throws when tenant command is missing tenant id", () => {
		expect(() => parseCliInput(["tenant"])).toThrow(
			"Missing required --tenant-id",
		);
	});
});

describe("investigate-abuse risk profile", () => {
	it("flags a clearly abusive sender profile", () => {
		const risk = buildRiskProfile({
			bounceRate: 8,
			complaintRate: 0.25,
			bounces: 80,
			complaints: 20,
			deliveryFailures: 60,
			failedSends: 80,
			uniqueFailedRecipients: 200,
			topRejectedDomainCount: 120,
			userBanned: true,
			tenantStatus: "suspended",
		});

		expect(risk.suspicious).toBe(true);
		expect(risk.score).toBe(100);
		expect(risk.flags.includes("high_bounce_rate")).toBe(true);
		expect(risk.flags.includes("high_complaint_rate")).toBe(true);
	});

	it("keeps low-volume clean profile below suspicious threshold", () => {
		const risk = buildRiskProfile({
			bounceRate: 0.2,
			complaintRate: 0.01,
			bounces: 1,
			complaints: 0,
			deliveryFailures: 1,
			failedSends: 1,
			uniqueFailedRecipients: 1,
			topRejectedDomainCount: 1,
			userBanned: false,
			tenantStatus: "active",
		});

		expect(risk.suspicious).toBe(false);
		expect(risk.score).toBe(0);
		expect(risk.flags.length).toBe(0);
	});
});

describe("investigate-abuse range helper", () => {
	it("returns roughly 24h for 24h range", () => {
		const now = Date.now();
		const start = getRangeStart("24h").getTime();
		const diffHours = (now - start) / (60 * 60 * 1000);

		expect(diffHours).toBeGreaterThan(23.9);
		expect(diffHours).toBeLessThan(24.1);
	});
});
