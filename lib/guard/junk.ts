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
