import { and, eq, isNull, lt, or, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { emailDomains } from "@/lib/db/schema";
import { runDomainVerificationChecksInBatches } from "@/lib/domains-and-dns/domain-verification-check";
import { assertCronAuthorized } from "@/lib/security/cron-auth";

export const maxDuration = 300;

// Process at most this many domains per run to stay within AWS SES rate
// limits and cron execution windows. Adjust if the queue grows.
const MAX_DOMAINS_PER_RUN = 100;

// Minimum age of `lastSesCheck` before a domain is eligible for re-checking.
// Acts as a lower-bound safety net against thundering herd — if the cron is
// triggered manually or runs out of band (e.g. two overlapping invocations),
// we won't re-verify the same domain twice in quick succession. The scheduled
// cadence (see vercel.json) is the primary rate control; this throttle just
// protects against unscheduled triggers colliding with scheduled runs.
const MIN_SECONDS_SINCE_LAST_CHECK = 120;

/**
 * Periodic verification sweep for domains waiting on SES verification.
 *
 * Targets:
 *  - `status = 'pending'` domains — AWS Health SNS events (the previous auto-
 *    verification mechanism) require a Business/Enterprise support plan and
 *    are not firing; without this sweep pending domains never flip to
 *    verified until a user manually clicks "Verify".
 *  - `status = 'verified'` but `canReceiveEmails = false` — catches rows that
 *    were verified through a code path that didn't also re-evaluate MX
 *    routing (e.g. the old `markDomainAsVerified` health webhook).
 *
 * Does NOT re-check `status = 'failed'` domains — those require a manual
 * re-verification trigger so the user sees the error explicitly.
 */
export async function GET(request: Request) {
	const unauthorizedResponse = assertCronAuthorized(
		request,
		"verify-pending-domains",
	);
	if (unauthorizedResponse) {
		return unauthorizedResponse;
	}

	const startedAt = Date.now();
	const cutoff = new Date(Date.now() - MIN_SECONDS_SINCE_LAST_CHECK * 1000);

	// Shared throttle — applied to every candidate branch so a domain stuck in
	// any state (pending forever, verified-but-canReceiveEmails-false, etc.)
	// never gets re-checked more often than MIN_SECONDS_SINCE_LAST_CHECK.
	const recentlyCheckedOrNever = or(
		lt(emailDomains.lastSesCheck, cutoff),
		isNull(emailDomains.lastSesCheck),
	);

	try {
		// Grab pending domains that haven't been checked recently, plus any
		// `verified` domains still missing canReceiveEmails (also throttled).
		// Order by lastSesCheck ascending (nulls first) so we drain the oldest
		// queue first — a backlog never starves the freshest pending domains.
		const candidates = await db
			.select()
			.from(emailDomains)
			.where(
				and(
					recentlyCheckedOrNever,
					or(
						eq(emailDomains.status, "pending"),
						and(
							eq(emailDomains.status, "verified"),
							// `canReceiveEmails` is nullable in the schema (no .notNull()),
							// so include legacy rows where the column is NULL in addition
							// to explicit-false rows. Otherwise pre-default rows would be
							// silently skipped.
							or(
								eq(emailDomains.canReceiveEmails, false),
								isNull(emailDomains.canReceiveEmails),
							),
						),
					),
				),
			)
			.orderBy(sql`${emailDomains.lastSesCheck} asc nulls first`)
			.limit(MAX_DOMAINS_PER_RUN);

		if (candidates.length === 0) {
			return NextResponse.json({
				ok: true,
				checked: 0,
				message: "No pending domains to verify",
				durationMs: Date.now() - startedAt,
			});
		}

		console.log(
			`[verify-pending-domains] checking ${candidates.length} domains`,
		);

		const results = await runDomainVerificationChecksInBatches(candidates, 5);

		const flippedToVerified = results.filter(
			(r) => r.statusChanged && r.newStatus === "verified",
		);
		const flippedToFailed = results.filter(
			(r) => r.statusChanged && r.newStatus === "failed",
		);
		const errored = results.filter((r) => r.error);

		if (flippedToVerified.length > 0) {
			console.log(
				`[verify-pending-domains] newly verified: ${flippedToVerified
					.map((r) => r.domain)
					.join(", ")}`,
			);
		}
		if (flippedToFailed.length > 0) {
			console.log(
				`[verify-pending-domains] newly failed: ${flippedToFailed
					.map((r) => r.domain)
					.join(", ")}`,
			);
		}
		if (errored.length > 0) {
			console.warn(
				`[verify-pending-domains] errors on ${errored.length} domains`,
				errored.map((r) => ({ domain: r.domain, error: r.error })),
			);
		}

		return NextResponse.json({
			ok: true,
			checked: results.length,
			flippedToVerified: flippedToVerified.length,
			flippedToFailed: flippedToFailed.length,
			errored: errored.length,
			durationMs: Date.now() - startedAt,
			details: results.map((r) => ({
				domain: r.domain,
				prevStatus: r.prevStatus,
				newStatus: r.newStatus,
				sesStatus: r.sesStatus,
				allDnsVerified: r.allDnsVerified,
				canReceiveEmails: r.canReceiveEmails,
				inheritsFromParent: r.inheritsFromParent,
				error: r.error,
			})),
		});
	} catch (error) {
		console.error("[verify-pending-domains] cron failed:", error);
		return NextResponse.json(
			{
				ok: false,
				error: error instanceof Error ? error.message : "Unknown error",
			},
			{ status: 500 },
		);
	}
}
