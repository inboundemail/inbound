import { eq } from "drizzle-orm";
import { t } from "elysia";
import { db } from "@/lib/db";
import { spamFilterSettings } from "@/lib/db/schema";
import {
	DEFAULT_SPAM_FILTER_LEVEL,
	isSpamFilterLevel,
	type SpamFilterLevel,
} from "@/lib/guard/junk-verdict";

export const SpamFilterLevelSchema = t.Union(
	[
		t.Literal("off"),
		t.Literal("lenient"),
		t.Literal("standard"),
		t.Literal("strict"),
	],
	{
		description:
			"off: never mark mail as junk automatically (Guard junk rules still apply). lenient: only clear spam or threats. standard (default): likely spam or threats. strict: also possible spam or threats.",
	},
);

export const SpamFilterSettingsResponse = t.Object({
	level: SpamFilterLevelSchema,
	isDefault: t.Boolean({
		description: "True when the level was never set and the default applies",
	}),
	updatedAt: t.Nullable(t.String()),
});

export const SpamFilterErrorResponse = t.Object({ error: t.String() });

export async function spamFilterSettingsFor(userId: string): Promise<{
	level: SpamFilterLevel;
	isDefault: boolean;
	updatedAt: string | null;
}> {
	const [row] = await db
		.select()
		.from(spamFilterSettings)
		.where(eq(spamFilterSettings.userId, userId))
		.limit(1);
	if (!row || !isSpamFilterLevel(row.level)) {
		return { level: DEFAULT_SPAM_FILTER_LEVEL, isDefault: true, updatedAt: null };
	}
	return {
		level: row.level,
		isDefault: false,
		updatedAt: row.updatedAt.toISOString(),
	};
}
