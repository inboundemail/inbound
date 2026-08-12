import { describe, expect, it } from "bun:test";
import {
	checkRateThresholds,
	RATE_THRESHOLDS,
	type TenantRates,
} from "@/lib/ses-monitoring/rate-tracker";

function buildRates(overrides: Partial<TenantRates>): TenantRates {
	const now = new Date();
	return {
		tenantId: "tenant_test",
		configurationSetName: "cfg-test",
		reputationPolicy: "strict",
		bounceRate: 0,
		complaintRate: 0,
		totalSends: 0,
		totalBounces: 0,
		totalComplaints: 0,
		windowStart: new Date(now.getTime() - 60_000),
		windowEnd: now,
		...overrides,
	};
}

describe("checkRateThresholds", () => {
	it("does not warn for a single bounce from a single send", () => {
		const alerts = checkRateThresholds(
			buildRates({
				totalSends: 1,
				totalBounces: 1,
				bounceRate: 1,
			}),
		);

		expect(alerts).toEqual([]);
	});

	it("warns for severe low-volume bounce patterns", () => {
		const alerts = checkRateThresholds(
			buildRates({
				totalSends: 10,
				totalBounces: 3,
				bounceRate: 3 / 10,
			}),
		);

		expect(alerts).toEqual([
			{
				alertType: "bounce",
				severity: "warning",
				currentRate: 3 / 10,
				threshold: RATE_THRESHOLDS.bounce.warning,
				configurationSetName: "cfg-test",
				tenantId: "tenant_test",
			},
		]);
	});

	it("warns at the bounce send-volume gate", () => {
		const alerts = checkRateThresholds(
			buildRates({
				totalSends: 100,
				totalBounces: 2,
				bounceRate: RATE_THRESHOLDS.bounce.warning,
			}),
		);

		expect(alerts[0]?.alertType).toBe("bounce");
		expect(alerts[0]?.severity).toBe("warning");
	});

	it("does not warn for a single complaint at low volume", () => {
		const alerts = checkRateThresholds(
			buildRates({
				totalSends: 1,
				totalComplaints: 1,
				complaintRate: 1,
			}),
		);

		expect(alerts).toEqual([]);
	});

	it("warns at the complaint send-volume gate", () => {
		const alerts = checkRateThresholds(
			buildRates({
				totalSends: 500,
				totalComplaints: 1,
				complaintRate: 1 / 500,
			}),
		);

		expect(alerts[0]?.alertType).toBe("complaint");
		expect(alerts[0]?.severity).toBe("warning");
	});

	it("warns for repeated low-volume complaints", () => {
		const alerts = checkRateThresholds(
			buildRates({
				totalSends: 10,
				totalComplaints: 2,
				complaintRate: 2 / 10,
			}),
		);

		expect(alerts).toEqual([
			{
				alertType: "complaint",
				severity: "warning",
				currentRate: 2 / 10,
				threshold: RATE_THRESHOLDS.complaint.warning,
				configurationSetName: "cfg-test",
				tenantId: "tenant_test",
			},
		]);
	});

	it("emits critical bounce alert at or above 2.5% with enough volume", () => {
		const rates = buildRates({
			totalSends: 200,
			totalBounces: 5,
			bounceRate: RATE_THRESHOLDS.bounce.critical,
		});

		const alerts = checkRateThresholds(rates);
		expect(alerts).toEqual([
			{
				alertType: "bounce",
				severity: "critical",
				currentRate: RATE_THRESHOLDS.bounce.critical,
				threshold: RATE_THRESHOLDS.bounce.critical,
				configurationSetName: "cfg-test",
				tenantId: "tenant_test",
			},
		]);
	});

	it("does not emit critical complaint alert without enough send volume", () => {
		const rates = buildRates({
			totalSends: 250,
			totalComplaints: 1,
			complaintRate: 1 / 250,
		});

		const alerts = checkRateThresholds(rates);
		expect(
			alerts.some(
				(alert) =>
					alert.alertType === "complaint" && alert.severity === "critical",
			),
		).toBe(false);
	});

	it("emits critical complaint alert at or above 0.1% with enough volume", () => {
		const rates = buildRates({
			totalSends: 1000,
			totalComplaints: 1,
			complaintRate: RATE_THRESHOLDS.complaint.critical,
		});

		const alerts = checkRateThresholds(rates);
		expect(alerts).toEqual([
			{
				alertType: "complaint",
				severity: "critical",
				currentRate: RATE_THRESHOLDS.complaint.critical,
				threshold: RATE_THRESHOLDS.complaint.critical,
				configurationSetName: "cfg-test",
				tenantId: "tenant_test",
			},
		]);
	});

	it("uses higher critical thresholds for standard reputation policy", () => {
		const alerts = checkRateThresholds(
			buildRates({
				reputationPolicy: "standard",
				totalSends: 1000,
				totalBounces: 60,
				bounceRate: 0.06,
				totalComplaints: 2,
				complaintRate: 0.002,
			}),
		);

		expect(alerts.every((alert) => alert.severity === "warning")).toBe(true);
	});

	it("emits critical alerts at the standard reputation thresholds", () => {
		const alerts = checkRateThresholds(
			buildRates({
				reputationPolicy: "standard",
				totalSends: 1000,
				totalBounces: 70,
				bounceRate: 0.07,
				totalComplaints: 3,
				complaintRate: 0.003,
			}),
		);

		expect(alerts.map((alert) => alert.severity)).toEqual([
			"critical",
			"critical",
		]);
	});
});
