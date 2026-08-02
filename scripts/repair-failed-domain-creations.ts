import {
	DescribeActiveReceiptRuleSetCommand,
	DescribeReceiptRuleSetCommand,
	GetIdentityMailFromDomainAttributesCommand,
	GetIdentityVerificationAttributesCommand,
	SESClient,
	SetIdentityMailFromDomainCommand,
	VerifyDomainIdentityCommand,
} from "@aws-sdk/client-ses";
import { and, eq, gte, inArray, lt } from "drizzle-orm";
import { nanoid } from "nanoid";
import { AWSSESReceiptRuleManager } from "@/lib/aws-ses/aws-ses-rules";
import { getUserTenant, sesTenantManager } from "@/lib/aws-ses/aws-ses-tenants";
import { BatchRuleManager } from "@/lib/aws-ses/batch-rule-manager";
import { db } from "@/lib/db";
import {
	domainDnsRecords,
	emailDomains,
	sesReceiptRules,
} from "@/lib/db/schema";
import { getRootDomain, isSubdomain } from "@/lib/domains-and-dns/domain-utils";
import {
	buildRepairManifest,
	type DomainSnapshot,
	isCleanOrphan,
	manifestHash,
	parseRepairArguments,
	selectBatchRuleMembership,
} from "@/scripts/repair-failed-domain-creations.logic";

const ruleSetName = "inbound-catchall-domain-default";
const awsRegion = process.env.AWS_REGION || "us-east-2";
const lambdaFunctionName =
	process.env.LAMBDA_FUNCTION_NAME || "email-processor";

type DomainRow = typeof emailDomains.$inferSelect;

type Summary = {
	aborted: Array<{ domain: string; reason: string }>;
	applied: string[];
	manifestHash: string;
	reportedMissingReceiptRules: string[];
	stopped: { domain: string; reason: string } | null;
};

function help(): void {
	console.log(`Usage: bun run scripts/repair-failed-domain-creations.ts --until <UTC ISO timestamp> [--since <UTC ISO timestamp>]

Dry run is the default. It reads the database and prints a deterministic manifest and SHA-256 hash.
Apply requires: --apply --manifest-hash <dry-run hash> --confirm "APPLY <dry-run hash>"

The upper bound must be the IAM verified-live time. This script never tracks Autumn usage; reconcile that separately and notify affected users operationally.`);
}

function toSnapshot(row: DomainRow, dnsRecordCount: number): DomainSnapshot {
	return {
		catchAllReceiptRuleName: row.catchAllReceiptRuleName,
		createdAt: row.createdAt,
		domain: row.domain,
		dnsRecordCount,
		id: row.id,
		mailFromDomain: row.mailFromDomain,
		status: row.status,
		tenantId: row.tenantId,
		userId: row.userId,
		verificationToken: row.verificationToken,
	};
}

async function loadWindow(since: Date, until: Date): Promise<DomainSnapshot[]> {
	const domains = await db
		.select()
		.from(emailDomains)
		.where(
			and(
				gte(emailDomains.createdAt, since),
				lt(emailDomains.createdAt, until),
			),
		);
	const records = domains.length
		? await db
				.select({ domainId: domainDnsRecords.domainId })
				.from(domainDnsRecords)
				.where(
					inArray(
						domainDnsRecords.domainId,
						domains.map((domain) => domain.id),
					),
				)
		: [];
	const counts = new Map<string, number>();
	for (const record of records) {
		counts.set(record.domainId, (counts.get(record.domainId) || 0) + 1);
	}
	return domains.map((domain) =>
		toSnapshot(domain, counts.get(domain.id) || 0),
	);
}

async function verifiedParentCandidateIds(
	snapshots: DomainSnapshot[],
): Promise<Set<string>> {
	const result = new Set<string>();
	for (const snapshot of snapshots) {
		if (!isSubdomain(snapshot.domain)) continue;
		const root = getRootDomain(snapshot.domain);
		if (!root) continue;
		const [parent] = await db
			.select({ id: emailDomains.id })
			.from(emailDomains)
			.where(
				and(
					eq(emailDomains.domain, root),
					eq(emailDomains.userId, snapshot.userId),
					eq(emailDomains.status, "verified"),
				),
			)
			.limit(1);
		if (parent) result.add(snapshot.id);
	}
	return result;
}

async function rereadSnapshot(id: string): Promise<DomainSnapshot | null> {
	const [row] = await db
		.select()
		.from(emailDomains)
		.where(eq(emailDomains.id, id))
		.limit(1);
	if (!row) return null;
	const records = await db
		.select({ id: domainDnsRecords.id })
		.from(domainDnsRecords)
		.where(eq(domainDnsRecords.domainId, id));
	return toSnapshot(row, records.length);
}

async function insertDnsIfMissing(
	domainId: string,
	record: { description: string; name: string; type: string; value: string },
): Promise<void> {
	const [existing] = await db
		.select({ id: domainDnsRecords.id })
		.from(domainDnsRecords)
		.where(
			and(
				eq(domainDnsRecords.domainId, domainId),
				eq(domainDnsRecords.recordType, record.type),
				eq(domainDnsRecords.name, record.name),
				eq(domainDnsRecords.value, record.value),
			),
		)
		.limit(1);
	if (existing) return;
	await db.insert(domainDnsRecords).values({
		id: `dns_${nanoid()}`,
		domainId,
		description: record.description,
		isRequired: true,
		isVerified: false,
		name: record.name,
		recordType: record.type,
		value: record.value,
	});
}

async function hasDnsRecord(
	domainId: string,
	record: { name: string; type: string; value: string },
): Promise<boolean> {
	const [existing] = await db
		.select({ id: domainDnsRecords.id })
		.from(domainDnsRecords)
		.where(
			and(
				eq(domainDnsRecords.domainId, domainId),
				eq(domainDnsRecords.recordType, record.type),
				eq(domainDnsRecords.name, record.name),
				eq(domainDnsRecords.value, record.value),
			),
		)
		.limit(1);
	return Boolean(existing);
}

function stoppedAwsError(error: unknown): boolean {
	const name = error instanceof Error ? error.name : "";
	const message = error instanceof Error ? error.message : "";
	return (
		/AccessDenied|Unauthorized|UnrecognizedClient|InvalidClientToken|ExpiredToken|SignatureDoesNotMatch|AuthFailure|InvalidSignature|InvalidParameter|OptInRequired|RegionDisabled|Account|LimitExceeded/i.test(
			`${name} ${message}`,
		) ||
		/credential|AWS_ACCOUNT_ID|S3_BUCKET_NAME|region/i.test(
			`${name} ${message}`,
		)
	);
}

function awsError(error: unknown): string {
	if (error instanceof Error) return `${error.name}: ${error.message}`;
	return "Unknown AWS error";
}

function ambiguousStateError(error: unknown): boolean {
	return /more than one SES receipt rule|unmanaged rule|did not confirm|disappeared|association was not confirmed|state was not persisted|active SES receipt rule set|verified parent no longer exists|incompatible receipt rule|batch rule capacity|batch rule allocation changed|duplicate key|unique constraint/i.test(
		awsError(error),
	);
}

async function verifiedParent(
	domain: string,
	userId: string,
): Promise<DomainRow | null> {
	if (!isSubdomain(domain)) return null;
	const root = getRootDomain(domain);
	if (!root) return null;
	const [parent] = await db
		.select()
		.from(emailDomains)
		.where(
			and(
				eq(emailDomains.domain, root),
				eq(emailDomains.userId, userId),
				eq(emailDomains.status, "verified"),
			),
		)
		.limit(1);
	return parent || null;
}

function inboundMx(domain: string) {
	return {
		description: "Inbound email routing",
		name: domain,
		type: "MX",
		value: `10 inbound-smtp.${awsRegion}.amazonaws.com`,
	};
}

async function ensureReceiptRuleMembership(
	domain: string,
	ses: SESClient,
): Promise<string> {
	const bucket = process.env.S3_BUCKET_NAME;
	const accountId = process.env.AWS_ACCOUNT_ID;
	if (!bucket || !accountId) {
		throw new Error(
			"S3_BUCKET_NAME and AWS_ACCOUNT_ID are required for receipt-rule repair",
		);
	}
	const active = await ses.send(new DescribeActiveReceiptRuleSetCommand({}));
	if (active.Metadata?.Name !== ruleSetName) {
		throw new Error(
			`Active SES receipt rule set is ${active.Metadata?.Name || "unset"}, not ${ruleSetName}`,
		);
	}
	const described = await ses.send(
		new DescribeReceiptRuleSetCommand({ RuleSetName: ruleSetName }),
	);
	await reconcileBatchRuleCounts(described.Rules || []);
	const membership = selectBatchRuleMembership(domain, described.Rules || []);
	if (membership.state === "ambiguous") {
		throw new Error(
			`Domain belongs to more than one SES receipt rule: ${membership.ruleNames.join(", ")}`,
		);
	}
	if (membership.state === "incompatible") {
		throw new Error(
			`Domain belongs to incompatible receipt rule ${membership.ruleName}`,
		);
	}
	if (membership.state === "adopt") {
		return membership.ruleName;
	}

	const batchManager = new BatchRuleManager(ruleSetName);
	const allocation = await batchManager.findOrCreateRuleWithCapacity(1);
	if (!allocation.ruleName.startsWith("batch-rule-")) {
		throw new Error(`Batch rule allocation changed to ${allocation.ruleName}`);
	}

	const beforeWrite = await ses.send(
		new DescribeReceiptRuleSetCommand({ RuleSetName: ruleSetName }),
	);
	await reconcileBatchRuleCounts(beforeWrite.Rules || []);
	const beforeWriteMembership = selectBatchRuleMembership(
		domain,
		beforeWrite.Rules || [],
	);
	if (beforeWriteMembership.state !== "absent") {
		throw new Error("Batch rule allocation changed before receipt-rule write");
	}
	const allocatedRule = beforeWrite.Rules?.find(
		(rule) => rule.Name === allocation.ruleName,
	);
	if (
		(allocation.currentCapacity || 0) !==
		(allocatedRule?.Recipients?.length || 0)
	) {
		throw new Error(`Batch rule allocation changed: ${allocation.ruleName}`);
	}
	if ((allocatedRule?.Recipients?.length || 0) >= 500) {
		throw new Error(`Batch rule capacity is full: ${allocation.ruleName}`);
	}
	const expectedRecipients = new Set([
		...(allocatedRule?.Recipients || []),
		domain,
	]);

	const sesManager = new AWSSESReceiptRuleManager(awsRegion);
	await sesManager.configureBatchCatchAllRule({
		domains: [domain],
		lambdaFunctionArn: AWSSESReceiptRuleManager.getLambdaFunctionArn(
			lambdaFunctionName,
			accountId,
			awsRegion,
		),
		ruleName: allocation.ruleName,
		ruleSetName,
		s3BucketName: bucket,
	});

	const after = await ses.send(
		new DescribeReceiptRuleSetCommand({ RuleSetName: ruleSetName }),
	);
	const confirmedMembership = selectBatchRuleMembership(
		domain,
		after.Rules || [],
	);
	if (
		confirmedMembership.state !== "adopt" ||
		confirmedMembership.ruleName !== allocation.ruleName
	) {
		throw new Error(
			`SES did not confirm ${domain} in receipt rule ${allocation.ruleName}`,
		);
	}
	const confirmedRule = after.Rules?.find(
		(rule) => rule.Name === allocation.ruleName,
	);
	const confirmedRecipients = confirmedRule?.Recipients;
	if ((confirmedRecipients?.length || 0) > 500) {
		throw new Error(`Batch rule capacity exceeded: ${allocation.ruleName}`);
	}
	if (
		confirmedRecipients?.length !== expectedRecipients.size ||
		confirmedRecipients.some((recipient) => !expectedRecipients.has(recipient))
	) {
		throw new Error(`Batch rule allocation changed during receipt-rule write`);
	}
	await reconcileBatchRuleCounts(after.Rules || []);
	return allocation.ruleName;
}

async function reconcileBatchRuleCounts(
	rules: Array<{ Name?: string; Recipients?: string[] }>,
): Promise<void> {
	const batchRules = rules.filter((rule) =>
		rule.Name?.startsWith("batch-rule-"),
	);
	if (batchRules.some((rule) => (rule.Recipients?.length || 0) > 500)) {
		throw new Error("Batch rule capacity exceeded in SES receipt rule set");
	}
	const tracked = await db
		.select()
		.from(sesReceiptRules)
		.where(eq(sesReceiptRules.ruleSetName, ruleSetName));
	const actualCounts = new Map(
		batchRules.map((rule) => [
			rule.Name as string,
			rule.Recipients?.length || 0,
		]),
	);

	for (const rule of tracked) {
		if (!rule.ruleName.startsWith("batch-rule-")) continue;
		await db
			.update(sesReceiptRules)
			.set({
				domainCount: actualCounts.get(rule.ruleName) || 0,
				updatedAt: new Date(),
			})
			.where(eq(sesReceiptRules.id, rule.id));
		actualCounts.delete(rule.ruleName);
	}
	for (const [ruleName, domainCount] of actualCounts) {
		await db.insert(sesReceiptRules).values({
			id: nanoid(),
			isActive: true,
			maxCapacity: 500,
			ruleName,
			ruleSetName,
			domainCount,
		});
	}
}

async function repairRoot(
	snapshot: DomainSnapshot,
	ses: SESClient,
): Promise<void> {
	if (!process.env.AWS_ACCOUNT_ID) {
		throw new Error("AWS_ACCOUNT_ID is required to inspect tenant association");
	}
	if (!sesTenantManager) {
		throw new Error("SES tenant manager has no configured credentials");
	}
	const tenant = await getUserTenant(snapshot.userId);
	if (!tenant.success || !tenant.tenant) {
		throw new Error(`Could not get tenant: ${tenant.error || "unknown error"}`);
	}
	const verified = await ses.send(
		new VerifyDomainIdentityCommand({ Domain: snapshot.domain }),
	);
	const token = verified.VerificationToken;
	if (!token) throw new Error("SES did not return a verification token");
	const identityArn = `arn:aws:ses:${awsRegion}:${process.env.AWS_ACCOUNT_ID}:identity/${snapshot.domain}`;
	const resources = await sesTenantManager.listTenantResources(
		tenant.tenant.id,
	);
	if (!resources.success) {
		throw new Error(
			`Could not inspect tenant association: ${resources.error || "unknown error"}`,
		);
	}
	if (
		!resources.resources.some(
			(resource) => resource.ResourceArn === identityArn,
		)
	) {
		const association = await sesTenantManager.associateIdentityWithTenant({
			identity: snapshot.domain,
			resourceType: "IDENTITY",
			tenantId: tenant.tenant.id,
		});
		if (!association.success) {
			throw new Error(
				`Could not associate identity: ${association.error || "unknown error"}`,
			);
		}
	}
	const associated = await sesTenantManager.listTenantResources(
		tenant.tenant.id,
	);
	if (
		!associated.success ||
		!associated.resources.some(
			(resource) => resource.ResourceArn === identityArn,
		)
	) {
		throw new Error("Tenant association was not confirmed by SES");
	}

	const mailFromDomain = `mail.${snapshot.domain}`;
	await ses.send(
		new SetIdentityMailFromDomainCommand({
			BehaviorOnMXFailure: "UseDefaultValue",
			Identity: snapshot.domain,
			MailFromDomain: mailFromDomain,
		}),
	);
	const [verification, mailFrom] = await Promise.all([
		ses.send(
			new GetIdentityVerificationAttributesCommand({
				Identities: [snapshot.domain],
			}),
		),
		ses.send(
			new GetIdentityMailFromDomainAttributesCommand({
				Identities: [snapshot.domain],
			}),
		),
	]);
	const sesStatus =
		verification.VerificationAttributes?.[snapshot.domain]
			?.VerificationStatus || "Pending";
	const mailFromStatus =
		mailFrom.MailFromDomainAttributes?.[snapshot.domain]
			?.MailFromDomainStatus || "pending";
	const records = [
		{
			description: "SES domain verification",
			name: `_amazonses.${snapshot.domain}`,
			type: "TXT",
			value: token,
		},
		inboundMx(snapshot.domain),
		{
			description: "MAIL FROM domain MX record",
			name: mailFromDomain,
			type: "MX",
			value: `10 feedback-smtp.${awsRegion}.amazonses.com`,
		},
		{
			description: "SPF record for MAIL FROM domain",
			name: mailFromDomain,
			type: "TXT",
			value: "v=spf1 include:amazonses.com ~all",
		},
	];
	const receiptRuleName = await ensureReceiptRuleMembership(
		snapshot.domain,
		ses,
	);
	for (const record of records) await insertDnsIfMissing(snapshot.id, record);
	await db
		.update(emailDomains)
		.set({
			catchAllReceiptRuleName: receiptRuleName,
			lastSesCheck: new Date(),
			mailFromDomain,
			mailFromDomainStatus: mailFromStatus,
			status: sesStatus === "Success" ? "verified" : "pending",
			tenantId: tenant.tenant.id,
			updatedAt: new Date(),
			verificationToken: token,
		})
		.where(eq(emailDomains.id, snapshot.id));
	const refreshed = await rereadSnapshot(snapshot.id);
	if (
		!refreshed ||
		refreshed.tenantId !== tenant.tenant.id ||
		!refreshed.verificationToken ||
		refreshed.catchAllReceiptRuleName !== receiptRuleName ||
		!(
			await Promise.all(
				records.map((record) => hasDnsRecord(snapshot.id, record)),
			)
		).every(Boolean)
	) {
		throw new Error("Domain verification state was not persisted");
	}
}

async function repairInheritedSubdomain(
	snapshot: DomainSnapshot,
	ses: SESClient,
): Promise<void> {
	const parent = await verifiedParent(snapshot.domain, snapshot.userId);
	if (!parent) throw new Error("Verified parent no longer exists");
	const receiptRuleName = await ensureReceiptRuleMembership(
		snapshot.domain,
		ses,
	);
	await insertDnsIfMissing(snapshot.id, inboundMx(snapshot.domain));
	await db
		.update(emailDomains)
		.set({
			catchAllReceiptRuleName: receiptRuleName,
			status: "verified",
			updatedAt: new Date(),
			verificationToken: null,
		})
		.where(eq(emailDomains.id, snapshot.id));
	const refreshed = await rereadSnapshot(snapshot.id);
	if (
		!refreshed ||
		refreshed.status !== "verified" ||
		refreshed.verificationToken !== null ||
		refreshed.catchAllReceiptRuleName !== receiptRuleName ||
		!(await hasDnsRecord(snapshot.id, inboundMx(snapshot.domain)))
	) {
		throw new Error("Inherited subdomain state was not persisted");
	}
}

async function main(): Promise<void> {
	const args = parseRepairArguments(process.argv.slice(2));
	if (args.help) return help();
	const snapshots = await loadWindow(args.since, args.until);
	const parents = await verifiedParentCandidateIds(snapshots);
	const manifest = buildRepairManifest(
		snapshots,
		parents,
		args.since,
		args.until,
	);
	const hash = manifestHash(manifest);
	const summary: Summary = {
		aborted: [],
		applied: [],
		manifestHash: hash,
		reportedMissingReceiptRules: manifest.entries
			.filter((entry) => entry.classification === "missing-receipt-rule")
			.map((entry) => entry.domain),
		stopped: null,
	};

	console.log(
		JSON.stringify(
			{
				manifest,
				manifestHash: hash,
				timestampSemantics:
					"created_at is a PostgreSQL timestamp without time zone mapped by Drizzle as UTC; the window is [since, until)",
				requiredIamActions: [
					"ses:VerifyDomainIdentity",
					"ses:SetIdentityMailFromDomain",
					"ses:GetIdentityVerificationAttributes",
					"ses:GetIdentityMailFromDomainAttributes",
					"ses:CreateTenantResourceAssociation",
					"ses:ListTenantResources",
					"ses:UpdateReputationEntityPolicy",
					"ses:CreateReceiptRule",
					"ses:UpdateReceiptRule",
					"ses:DescribeReceiptRuleSet",
					"sns:TagResource",
				],
			},
			null,
			2,
		),
	);
	if (!args.apply) {
		console.log(JSON.stringify({ mode: "dry-run", summary }, null, 2));
		return;
	}
	if (args.manifestHash !== hash) {
		throw new Error(
			"Manifest hash changed since dry run; re-run dry run and use its new hash",
		);
	}

	const ses = new SESClient({ region: awsRegion });
	for (const entry of manifest.entries) {
		if (entry.classification === "missing-receipt-rule") continue;
		const current = await rereadSnapshot(entry.id);
		if (
			!current ||
			current.domain !== entry.domain ||
			current.userId !== entry.userId ||
			current.createdAt?.toISOString() !== entry.createdAt ||
			!isCleanOrphan(current)
		) {
			summary.aborted.push({
				domain: entry.domain,
				reason: "database state drifted from clean orphan signature",
			});
			continue;
		}
		try {
			if (await verifiedParent(current.domain, current.userId)) {
				await repairInheritedSubdomain(current, ses);
			} else {
				await repairRoot(current, ses);
			}
			summary.applied.push(entry.domain);
		} catch (error) {
			const reason = awsError(error);
			if (stoppedAwsError(error) || ambiguousStateError(error)) {
				summary.stopped = { domain: entry.domain, reason };
				break;
			}
			summary.aborted.push({ domain: entry.domain, reason });
		}
	}
	console.log(
		JSON.stringify(
			{
				mode: "apply",
				summary,
				autumn: "not tracked; reconcile separately",
				userNotification: "operational follow-up required",
			},
			null,
			2,
		),
	);
	if (summary.stopped) process.exitCode = 1;
}

main().catch((error) => {
	console.error(JSON.stringify({ error: awsError(error) }));
	process.exitCode = 1;
});
