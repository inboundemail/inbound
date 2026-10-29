import { and, eq, isNull, ne, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { sesEvents, spamFilterSettings, structuredEmails } from "@/lib/db/schema";
import {
	DEFAULT_SPAM_FILTER_LEVEL,
	isSpamFilterLevel,
	type JunkVerdict,
	type SpamFilterLevel,
} from "@/lib/guard/junk-verdict";

export async function getSpamFilterLevel(
	userId: string,
): Promise<SpamFilterLevel> {
	const [row] = await db
		.select({ level: spamFilterSettings.level })
		.from(spamFilterSettings)
		.where(eq(spamFilterSettings.userId, userId))
		.limit(1);
	return isSpamFilterLevel(row?.level) ? row.level : DEFAULT_SPAM_FILTER_LEVEL;
}

export async function loadSesSpamVerdict(
	sesEventId: string,
): Promise<string | null> {
	const [row] = await db
		.select({ spamVerdict: sesEvents.spamVerdict })
		.from(sesEvents)
		.where(eq(sesEvents.id, sesEventId))
		.limit(1);
	return row?.spamVerdict ?? null;
}

/** Stores an automatic verdict, never replacing one the user set. */
export async function storeJunkVerdict(
	structuredEmailId: string,
	userId: string,
	verdict: JunkVerdict,
): Promise<void> {
	await db
		.update(structuredEmails)
		.set({
			isJunk: verdict.isJunk,
			junkReason: verdict.reason,
			junkUpdatedAt: new Date(),
		})
		.where(
			and(
				eq(structuredEmails.id, structuredEmailId),
				eq(structuredEmails.userId, userId),
				or(
					isNull(structuredEmails.junkReason),
					ne(structuredEmails.junkReason, "user"),
				),
			),
		);
}

/**
 * Stores "not junk" when no verdict was made yet, so mail that skipped or
 * failed classification shows up in IMAP INBOX right away. Never throws.
 */
export async function settleJunkVerdict(
	structuredEmailId: string,
	userId: string,
): Promise<void> {
	try {
		await db
			.update(structuredEmails)
			.set({ isJunk: false, junkReason: null, junkUpdatedAt: new Date() })
			.where(
				and(
					eq(structuredEmails.id, structuredEmailId),
					eq(structuredEmails.userId, userId),
					isNull(structuredEmails.isJunk),
				),
			);
	} catch (error) {
		console.error(
			"⚠️ Junk filter - Failed to settle verdict:",
			error instanceof Error ? error.name : "unknown",
		);
	}
}
