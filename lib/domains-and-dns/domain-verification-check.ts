import {
	GetIdentityDkimAttributesCommand,
	GetIdentityMailFromDomainAttributesCommand,
	GetIdentityVerificationAttributesCommand,
	SESClient,
} from "@aws-sdk/client-ses";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
	domainDnsRecords,
	type EmailDomain,
	emailDomains,
} from "@/lib/db/schema";
import { reevaluateCanReceiveEmails, verifyDnsRecords } from "./dns";
import { getRootDomain, isSubdomain } from "./domain-utils";

// AWS SES client (shared singleton)
const awsRegion = process.env.AWS_REGION || "us-east-2";
const awsAccessKeyId = process.env.AWS_ACCESS_KEY_ID;
const awsSecretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

let sesClient: SESClient | null = null;

if (awsAccessKeyId && awsSecretAccessKey) {
	sesClient = new SESClient({
		region: awsRegion,
		credentials: {
			accessKeyId: awsAccessKeyId,
			secretAccessKey: awsSecretAccessKey,
		},
	});
}

export interface DomainVerificationCheckResult {
	domainId: string;
	domain: string;
	statusChanged: boolean;
	prevStatus: string;
	newStatus: string;
	sesStatus: string;
	allDnsVerified: boolean;
	canReceiveEmails: boolean;
	inheritsFromParent: boolean;
	error?: string;
}

/**
 * Run a full verification check for a single domain and persist status.
 *
 * Does not throw — captures errors on the result. Safe for batch / cron use.
 *
 * Flow:
 *  1. If the domain is a subdomain of a user-verified parent, verify its MX
 *     record and mark it verified (inherited) if that passes.
 *  2. Verify all DNS records in `domainDnsRecords` via `verifyDnsRecords`,
 *     and persist each record's `isVerified` + `lastChecked`.
 *  3. Query SES for identity verification, DKIM, and MAIL FROM status.
 *  4. Update `emailDomains` row: `status`, `lastSesCheck`, `mailFromDomain*`,
 *     `canReceiveEmails` (when the domain is now fully verified).
 *
 * Does NOT:
 *  - Re-initiate SES verification on Failed status (that's a user-triggered
 *    action; keeps the cron idempotent).
 *  - Retry MAIL FROM setup (also user-triggered).
 */
export async function runDomainVerificationCheck(
	domain: EmailDomain,
): Promise<DomainVerificationCheckResult> {
	const result: DomainVerificationCheckResult = {
		domainId: domain.id,
		domain: domain.domain,
		statusChanged: false,
		prevStatus: domain.status || "pending",
		newStatus: domain.status || "pending",
		sesStatus: "Unknown",
		allDnsVerified: false,
		canReceiveEmails: domain.canReceiveEmails || false,
		inheritsFromParent: false,
	};

	try {
		// ---- Step 1: subdomain-inherits-from-parent short-circuit ----
		let inheritsFromParent = false;
		if (isSubdomain(domain.domain)) {
			const rootDomain = getRootDomain(domain.domain);
			if (rootDomain) {
				const parentDomainResult = await db
					.select()
					.from(emailDomains)
					.where(
						and(
							eq(emailDomains.domain, rootDomain),
							eq(emailDomains.userId, domain.userId),
							eq(emailDomains.status, "verified"),
						),
					)
					.limit(1);
				if (parentDomainResult[0]) {
					inheritsFromParent = true;
					result.inheritsFromParent = true;
				}
			}
		}

		// ---- Step 2: verify DNS records ----
		const dnsRecordsResult = await db
			.select()
			.from(domainDnsRecords)
			.where(eq(domainDnsRecords.domainId, domain.id));

		let allDnsVerified = false;
		if (dnsRecordsResult.length > 0) {
			const verifyResults = await verifyDnsRecords(
				dnsRecordsResult.map((record) => ({
					type: record.recordType,
					name: record.name,
					value: record.value,
				})),
			);

			// persist per-record status
			await Promise.all(
				dnsRecordsResult.map((record, index) =>
					db
						.update(domainDnsRecords)
						.set({
							isVerified: verifyResults[index]?.isVerified || false,
							lastChecked: new Date(),
						})
						.where(eq(domainDnsRecords.id, record.id)),
				),
			);

			// Optional records (e.g. DKIM CNAMEs) don't gate verification.
			allDnsVerified = dnsRecordsResult.every(
				(record, index) =>
					record.isRequired === false || verifyResults[index]?.isVerified,
			);
		}
		result.allDnsVerified = allDnsVerified;

		// ---- Step 3: subdomain inheritance status update ----
		if (inheritsFromParent && allDnsVerified) {
			if (domain.status !== "verified" || !domain.canReceiveEmails) {
				const now = new Date();
				await db
					.update(emailDomains)
					.set({
						status: "verified",
						canReceiveEmails: true,
						hasMxRecords: true,
						lastDnsCheck: now,
						updatedAt: now,
					})
					.where(eq(emailDomains.id, domain.id));
				result.statusChanged = domain.status !== "verified";
				result.newStatus = "verified";
				result.canReceiveEmails = true;
			}
			result.sesStatus = "InheritedFromParent";
			return result;
		}

		// ---- Step 4: SES identity / DKIM / MAIL FROM status ----
		if (!sesClient) {
			result.error = "AWS SES not configured";
			return result;
		}

		let sesStatus = "Unknown";
		let mailFromDomain: string | undefined;
		let mailFromStatus: string | undefined;

		try {
			const identityResp = await sesClient.send(
				new GetIdentityVerificationAttributesCommand({
					Identities: [domain.domain],
				}),
			);
			sesStatus =
				identityResp.VerificationAttributes?.[domain.domain]
					?.VerificationStatus || "NotFound";

			// DKIM query — we don't do anything with it right now, but call it so
			// SES keeps the record warm (and future use is easy).
			await sesClient.send(
				new GetIdentityDkimAttributesCommand({ Identities: [domain.domain] }),
			);

			const mailFromResp = await sesClient.send(
				new GetIdentityMailFromDomainAttributesCommand({
					Identities: [domain.domain],
				}),
			);
			const mailFromAttrs =
				mailFromResp.MailFromDomainAttributes?.[domain.domain];
			mailFromDomain = mailFromAttrs?.MailFromDomain;
			mailFromStatus = mailFromAttrs?.MailFromDomainStatus || "NotSet";
		} catch (sesError) {
			result.sesStatus = "Error";
			result.error =
				sesError instanceof Error ? sesError.message : "SES query failed";
			return result;
		}
		result.sesStatus = sesStatus;

		// ---- Step 5: persist status change to emailDomains ----
		const now = new Date();
		// biome-ignore lint/suspicious/noExplicitAny: dynamic update shape
		const updateData: any = {
			lastSesCheck: now,
			updatedAt: now,
		};

		if (mailFromDomain) updateData.mailFromDomain = mailFromDomain;
		if (mailFromStatus) {
			updateData.mailFromDomainStatus = mailFromStatus;
			if (mailFromStatus === "Success") {
				updateData.mailFromDomainVerifiedAt = now;
			}
		}

		// Determine the intended status transition, if any. The flags on `result`
		// are NOT mutated until the DB write succeeds — otherwise a thrown
		// update() (network / DB blip) would leave callers thinking the domain
		// flipped when it didn't, and the cron would report a false-positive
		// "flippedToVerified".
		let pendingNewStatus: string | null = null;
		if (sesStatus === "Success" && domain.status !== "verified") {
			updateData.status = "verified";
			pendingNewStatus = "verified";
		} else if (sesStatus === "Failed" && domain.status !== "failed") {
			// Unlike the user-triggered path, the cron does NOT auto-re-verify on
			// failure. That stays a manual action so users see the error.
			updateData.status = "failed";
			pendingNewStatus = "failed";
		}

		await db
			.update(emailDomains)
			.set(updateData)
			.where(eq(emailDomains.id, domain.id));

		// Write succeeded — now it's safe to reflect the change on the result.
		if (pendingNewStatus) {
			result.statusChanged = true;
			result.newStatus = pendingNewStatus;
		}

		// ---- Step 6: re-evaluate canReceiveEmails on newly verified ----
		if (sesStatus === "Success" && allDnsVerified && !domain.canReceiveEmails) {
			const canReceive = await reevaluateCanReceiveEmails(domain.domain);
			if (canReceive) {
				const reevalTime = new Date();
				await db
					.update(emailDomains)
					.set({
						canReceiveEmails: true,
						lastDnsCheck: reevalTime,
						updatedAt: reevalTime,
					})
					.where(eq(emailDomains.id, domain.id));
				result.canReceiveEmails = true;
			}
		}

		return result;
	} catch (err) {
		result.error = err instanceof Error ? err.message : "Unknown error";
		// Defensive: if an exception bubbles up after we optimistically flipped
		// any flags (shouldn't happen with the current code, but guards against
		// future regressions), roll them back so callers never see a "changed"
		// result on an errored run.
		result.statusChanged = false;
		result.newStatus = result.prevStatus;
		return result;
	}
}

/**
 * Run verification checks for many domains with bounded concurrency.
 * Returns per-domain results; never throws.
 */
export async function runDomainVerificationChecksInBatches(
	domains: EmailDomain[],
	concurrency = 5,
): Promise<DomainVerificationCheckResult[]> {
	const results: DomainVerificationCheckResult[] = [];
	for (let i = 0; i < domains.length; i += concurrency) {
		const batch = domains.slice(i, i + concurrency);
		const batchResults = await Promise.all(
			batch.map((d) => runDomainVerificationCheck(d)),
		);
		results.push(...batchResults);
	}
	return results;
}
