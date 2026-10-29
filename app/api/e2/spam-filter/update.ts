import { Elysia, t } from "elysia";
import {
	SpamFilterErrorResponse,
	SpamFilterLevelSchema,
	SpamFilterSettingsResponse,
	spamFilterSettingsFor,
} from "@/app/api/e2/spam-filter/shared";
import { validateAndRateLimit } from "@/app/api/e2/lib/auth";
import { db } from "@/lib/db";
import { spamFilterSettings } from "@/lib/db/schema";

export const updateSpamFilter = new Elysia().put(
	"/spam-filter",
	async ({ request, body, set }) => {
		const userId = await validateAndRateLimit(request, set);
		const now = new Date();
		await db
			.insert(spamFilterSettings)
			.values({ userId, level: body.level, createdAt: now, updatedAt: now })
			.onConflictDoUpdate({
				target: spamFilterSettings.userId,
				set: { level: body.level, updatedAt: now },
			});
		return spamFilterSettingsFor(userId);
	},
	{
		body: t.Object({ level: SpamFilterLevelSchema }),
		response: {
			200: SpamFilterSettingsResponse,
			400: SpamFilterErrorResponse,
			401: SpamFilterErrorResponse,
			500: SpamFilterErrorResponse,
		},
		detail: {
			tags: ["Spam Filter"],
			summary: "Update spam filter settings",
			description:
				"Set the account's junk filter level. Applies to emails received from now on; earlier verdicts are not recalculated.",
		},
	},
);
