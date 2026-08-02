import { describe, expect, test } from "bun:test";
import {
	buildRepairManifest,
	DEFAULT_SINCE,
	type DomainSnapshot,
	isCleanOrphan,
	manifestHash,
	parseRepairArguments,
	selectBatchRuleMembership,
} from "@/scripts/repair-failed-domain-creations.logic";

const since = new Date(DEFAULT_SINCE);
const until = new Date("2026-07-03T00:00:00.000Z");

function snapshot(overrides: Partial<DomainSnapshot> = {}): DomainSnapshot {
	return {
		catchAllReceiptRuleName: null,
		createdAt: new Date("2026-07-02T01:00:00.000Z"),
		domain: "example.com",
		dnsRecordCount: 0,
		id: "domain_1",
		mailFromDomain: null,
		status: "pending",
		tenantId: null,
		userId: "user_1",
		verificationToken: null,
		...overrides,
	};
}

describe("repair failed domain creation logic", () => {
	test("requires an explicit upper bound and hash-bound confirmation for apply", () => {
		expect(() => parseRepairArguments([])).toThrow("--until is required");
		expect(() =>
			parseRepairArguments(["--until", "2026-07-03T00:00:00Z", "--apply"]),
		).toThrow("--manifest-hash");

		const hash = "a".repeat(64);
		expect(
			parseRepairArguments([
				"--until",
				"2026-07-03T00:00:00Z",
				"--apply",
				"--manifest-hash",
				hash,
				"--confirm",
				`APPLY ${hash}`,
			]),
		).toMatchObject({ apply: true, manifestHash: hash });
	});

	test("uses only the clean orphan signature", () => {
		expect(isCleanOrphan(snapshot())).toBe(true);
		expect(isCleanOrphan(snapshot({ dnsRecordCount: 1 }))).toBe(false);
		expect(
			isCleanOrphan(snapshot({ mailFromDomain: "mail.example.com" })),
		).toBe(false);
	});

	test("reports non-clean domains without receipt-rule linkage without scheduling mutation", () => {
		const manifest = buildRepairManifest(
			[snapshot({ dnsRecordCount: 1, id: "in-progress" })],
			new Set(),
			since,
			until,
		);
		expect(manifest.entries).toEqual([
			expect.objectContaining({
				classification: "missing-receipt-rule",
				plannedActions: ["report-only"],
			}),
		]);
	});

	test("produces a deterministic parent-first manifest and hash", () => {
		const manifest = buildRepairManifest(
			[
				snapshot({ domain: "mail.example.com", id: "child" }),
				snapshot({ domain: "example.com", id: "parent" }),
			],
			new Set(["child"]),
			since,
			until,
		);
		expect(manifest.entries.map((entry) => entry.domain)).toEqual([
			"example.com",
			"mail.example.com",
		]);
		expect(manifest.entries[1]?.classification).toBe(
			"clean-unverified-subdomain-orphan",
		);
		expect(manifestHash(manifest)).toBe(manifestHash(manifest));
	});

	test("adopts an existing platform batch rule only when membership is unambiguous", () => {
		expect(
			selectBatchRuleMembership("example.com", [
				{ Name: "batch-rule-004", Recipients: ["example.com"] },
			]),
		).toEqual({ ruleName: "batch-rule-004", state: "adopt" });
		expect(
			selectBatchRuleMembership("example.com", [
				{ Name: "repair-20260702-abc", Recipients: ["example.com"] },
			]),
		).toEqual({ ruleName: "repair-20260702-abc", state: "incompatible" });
		expect(
			selectBatchRuleMembership("example.com", [
				{ Name: "batch-rule-004", Recipients: ["example.com"] },
				{ Name: "batch-rule-005", Recipients: ["example.com"] },
			]),
		).toEqual({
			ruleNames: ["batch-rule-004", "batch-rule-005"],
			state: "ambiguous",
		});
	});
});
