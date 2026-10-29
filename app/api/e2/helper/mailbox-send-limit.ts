import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { mailboxSendUsage } from "@/lib/db/schema";

export const MAILBOX_DAILY_LIMIT_ERROR =
	"This mailbox has reached its daily sending limit. Try again after 00:00 UTC.";

export interface MailboxSendLimitCredential {
	credentialId: string;
	dailySendLimit?: number | null;
}

export interface MailboxSendReservation {
	credentialId: string;
	day: string;
}

function utcDay(date: Date): string {
	return date.toISOString().slice(0, 10);
}

/**
 * Reserves one send against a mailbox password's daily limit (UTC day).
 * Counting is atomic per mailbox: one conditional upsert increments the day's
 * row only while it is below the limit, so concurrent sends cannot overshoot.
 *
 * Semantics: a send counts once it is accepted for delivery (after the
 * idempotency claim, so replays of an already accepted Idempotency-Key never
 * count) and is released again when the provider rejects it, so the count is
 * accepted-and-not-failed sends. Returns null when the credential has no
 * limit, a reservation to release on failure, or "exceeded".
 */
export async function reserveMailboxSend(
	credential: MailboxSendLimitCredential | null | undefined,
): Promise<MailboxSendReservation | null | "exceeded"> {
	const limit = credential?.dailySendLimit;
	if (!credential || limit === null || limit === undefined) return null;
	if (limit <= 0) return "exceeded";

	const day = utcDay(new Date());
	const [row] = await db
		.insert(mailboxSendUsage)
		.values({ credentialId: credential.credentialId, day, count: 1 })
		.onConflictDoUpdate({
			target: [mailboxSendUsage.credentialId, mailboxSendUsage.day],
			set: { count: sql`${mailboxSendUsage.count} + 1` },
			setWhere: sql`${mailboxSendUsage.count} < ${limit}`,
		})
		.returning({ count: mailboxSendUsage.count });
	if (!row) return "exceeded";
	return { credentialId: credential.credentialId, day };
}

export async function releaseMailboxSend(
	reservation: MailboxSendReservation | null,
): Promise<void> {
	if (!reservation) return;
	try {
		await db
			.update(mailboxSendUsage)
			.set({ count: sql`greatest(${mailboxSendUsage.count} - 1, 0)` })
			.where(
				and(
					eq(mailboxSendUsage.credentialId, reservation.credentialId),
					eq(mailboxSendUsage.day, reservation.day),
				),
			);
	} catch (error) {
		console.error("Failed to release mailbox send reservation:", error);
	}
}
