import { createHash } from "node:crypto";
import { isSubdomain } from "@/lib/domains-and-dns/domain-utils";

export const DEFAULT_SINCE = "2026-07-02T00:00:00.000Z";

export type RepairArguments = {
	apply: boolean;
	confirm: string | null;
	help: boolean;
	manifestHash: string | null;
	since: Date;
	until: Date;
};

export type DomainSnapshot = {
	catchAllReceiptRuleName: string | null;
	createdAt: Date | null;
	domain: string;
	dnsRecordCount: number;
	id: string;
	mailFromDomain: string | null;
	status: string;
	tenantId: string | null;
	userId: string;
	verificationToken: string | null;
};

export type ManifestEntry = {
	classification:
		| "clean-root-orphan"
		| "clean-unverified-subdomain-orphan"
		| "missing-receipt-rule";
	createdAt: string | null;
	domain: string;
	id: string;
	plannedActions: string[];
	userId: string;
};

export type RepairManifest = {
	entries: ManifestEntry[];
	generatedFor: { since: string; until: string };
	version: 1;
};

export type ReceiptRuleMembership = {
	Name?: string | null;
	Recipients?: string[] | null;
};

export type BatchRuleMembership =
	| { ruleName: string; state: "adopt" }
	| { state: "absent" }
	| { ruleNames: string[]; state: "ambiguous" }
	| { ruleName: string; state: "incompatible" };

export function selectBatchRuleMembership(
	domain: string,
	rules: ReceiptRuleMembership[],
): BatchRuleMembership {
	const matches = rules.filter((rule) => rule.Recipients?.includes(domain));
	if (matches.length === 0) return { state: "absent" };

	const ruleNames = matches.map((rule) => rule.Name || "<unnamed>");
	if (matches.length > 1) return { ruleNames, state: "ambiguous" };

	const ruleName = ruleNames[0] as string;
	if (!ruleName.startsWith("batch-rule-")) {
		return { ruleName, state: "incompatible" };
	}
	return { ruleName, state: "adopt" };
}

function parseIsoArgument(value: string, flag: string): Date {
	if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) {
		throw new Error(`${flag} must be an ISO-8601 UTC timestamp ending in Z`);
	}
	const parsed = new Date(value);
	if (Number.isNaN(parsed.getTime())) {
		throw new Error(`${flag} must be a valid timestamp`);
	}
	return parsed;
}

function readValue(args: string[], index: number, flag: string): string {
	const value = args[index + 1];
	if (!value || value.startsWith("--")) {
		throw new Error(`${flag} requires a value`);
	}
	return value;
}

export function parseRepairArguments(args: string[]): RepairArguments {
	let apply = false;
	let confirm: string | null = null;
	let help = false;
	let manifestHash: string | null = null;
	let since = new Date(DEFAULT_SINCE);
	let until: Date | null = null;

	for (let index = 0; index < args.length; index += 1) {
		switch (args[index]) {
			case "--apply":
				apply = true;
				break;
			case "--confirm":
				confirm = readValue(args, index, "--confirm");
				index += 1;
				break;
			case "--manifest-hash":
				manifestHash = readValue(args, index, "--manifest-hash");
				index += 1;
				break;
			case "--since":
				since = parseIsoArgument(readValue(args, index, "--since"), "--since");
				index += 1;
				break;
			case "--until":
				until = parseIsoArgument(readValue(args, index, "--until"), "--until");
				index += 1;
				break;
			case "--help":
			case "-h":
				help = true;
				break;
			default:
				throw new Error(`Unknown argument: ${args[index]}`);
		}
	}

	if (help) {
		return { apply, confirm, help, manifestHash, since, until: until || since };
	}
	if (!until) {
		throw new Error(
			"--until is required to prevent repairing future valid pending domains",
		);
	}
	if (until.getTime() <= since.getTime()) {
		throw new Error("--until must be later than --since");
	}
	if (apply) {
		if (!manifestHash || !/^[a-f0-9]{64}$/.test(manifestHash)) {
			throw new Error(
				"--apply requires the 64-character --manifest-hash from a dry run",
			);
		}
		if (confirm !== `APPLY ${manifestHash}`) {
			throw new Error('--apply requires --confirm "APPLY <manifest-hash>"');
		}
	}

	return { apply, confirm, help, manifestHash, since, until };
}

export function isCleanOrphan(snapshot: DomainSnapshot): boolean {
	return (
		snapshot.status === "pending" &&
		snapshot.verificationToken === null &&
		snapshot.tenantId === null &&
		snapshot.mailFromDomain === null &&
		snapshot.catchAllReceiptRuleName === null &&
		snapshot.dnsRecordCount === 0
	);
}

function domainDepth(domain: string): number {
	return domain.split(".").length;
}

export function buildRepairManifest(
	snapshots: DomainSnapshot[],
	verifiedParentIds: Set<string>,
	since: Date,
	until: Date,
): RepairManifest {
	const entries: ManifestEntry[] = [];

	for (const snapshot of snapshots) {
		if (isCleanOrphan(snapshot)) {
			const inherited =
				isSubdomain(snapshot.domain) && verifiedParentIds.has(snapshot.id);
			entries.push({
				classification: inherited
					? "clean-unverified-subdomain-orphan"
					: "clean-root-orphan",
				createdAt: snapshot.createdAt?.toISOString() || null,
				domain: snapshot.domain,
				id: snapshot.id,
				plannedActions: inherited
					? ["mark-verified", "insert-inbound-mx", "ensure-receipt-rule"]
					: [
							"replay-ses-verification-and-tenant-association",
							"insert-required-dns-records",
							"ensure-receipt-rule",
						],
				userId: snapshot.userId,
			});
		}
		if (!snapshot.catchAllReceiptRuleName && !isCleanOrphan(snapshot)) {
			entries.push({
				classification: "missing-receipt-rule",
				createdAt: snapshot.createdAt?.toISOString() || null,
				domain: snapshot.domain,
				id: snapshot.id,
				plannedActions: ["report-only"],
				userId: snapshot.userId,
			});
		}
	}

	entries.sort(
		(left, right) =>
			domainDepth(left.domain) - domainDepth(right.domain) ||
			left.domain.localeCompare(right.domain) ||
			left.id.localeCompare(right.id),
	);

	return {
		entries,
		generatedFor: { since: since.toISOString(), until: until.toISOString() },
		version: 1,
	};
}

export function manifestHash(manifest: RepairManifest): string {
	return createHash("sha256").update(JSON.stringify(manifest)).digest("hex");
}
