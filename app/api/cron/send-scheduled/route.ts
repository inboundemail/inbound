import { NextResponse } from "next/server";
import { purgeMailboxActivity } from "@/app/api/e2/mailboxes/activity-log";
import {
	claimDueScheduledEmails,
	expireMissedScheduledEmails,
	recoverStaleScheduledEmails,
	type ScheduledSendResult,
	sendClaimedScheduledEmail,
} from "@/lib/email-management/scheduled-send";
import { assertCronAuthorized } from "@/lib/security/cron-auth";

export const maxDuration = 60;

// Rows claimed per statement; each chunk is sent concurrently.
const CLAIM_BATCH_SIZE = 10;
// Hard cap per invocation so one run never monopolises SES throughput.
const MAX_EMAILS_PER_RUN = 150;
// Stop claiming new rows after this long so in-flight sends and their
// waitUntil work finish well before maxDuration. Anything left over is
// picked up on the next tick.
const CLAIM_DEADLINE_MS = 35_000;

async function purgeExpiredMailboxActivity(): Promise<number | null> {
	try {
		return await purgeMailboxActivity();
	} catch (error) {
		console.error("❌ [send-scheduled] Mailbox activity purge failed:", error);
		return null;
	}
}

/**
 * Sends scheduled emails that are due, then deletes mailbox activity past its
 * 30-day retention in bounded batches. Runs every minute (see vercel.json).
 * Rows are claimed atomically, so overlapping invocations never send the same
 * email twice; rows a crashed run left in processing are recovered after
 * 15 minutes.
 */
export async function GET(request: Request) {
	const unauthorizedResponse = assertCronAuthorized(request, "send-scheduled");
	if (unauthorizedResponse) {
		return unauthorizedResponse;
	}

	const startedAt = Date.now();
	const counts: Record<ScheduledSendResult["outcome"], number> = {
		sent: 0,
		blocked: 0,
		failed: 0,
		retry: 0,
		skipped: 0,
	};

	try {
		const recovered = await recoverStaleScheduledEmails();
		const expired = await expireMissedScheduledEmails();
		if (recovered.failed || recovered.rescheduled || expired) {
			console.log("🧹 [send-scheduled] Recovered stale rows:", {
				...recovered,
				expired,
			});
		}

		const claimedIds: string[] = [];
		let claimed = 0;
		while (
			claimed < MAX_EMAILS_PER_RUN &&
			Date.now() - startedAt < CLAIM_DEADLINE_MS
		) {
			const batch = await claimDueScheduledEmails(
				Math.min(CLAIM_BATCH_SIZE, MAX_EMAILS_PER_RUN - claimed),
				new Date(),
				claimedIds,
			);
			if (batch.length === 0) break;
			claimed += batch.length;
			for (const row of batch) claimedIds.push(row.id);

			const results = await Promise.all(
				batch.map((row) => sendClaimedScheduledEmail(row)),
			);
			for (const result of results) counts[result.outcome]++;

			if (batch.length < CLAIM_BATCH_SIZE) break;
		}

		const activityPurged = await purgeExpiredMailboxActivity();
		const durationMs = Date.now() - startedAt;
		if (claimed > 0) {
			console.log("📬 [send-scheduled] Run complete:", {
				claimed,
				...counts,
				durationMs,
			});
		}

		return NextResponse.json({
			success: true,
			claimed,
			...counts,
			recovered,
			expired,
			activityPurged,
			durationMs,
		});
	} catch (error) {
		console.error("❌ [send-scheduled] Run failed:", error);
		return NextResponse.json(
			{
				success: false,
				error: error instanceof Error ? error.message : "Unknown error",
				...counts,
			},
			{ status: 500 },
		);
	}
}
