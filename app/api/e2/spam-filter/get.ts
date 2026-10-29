import { Elysia } from "elysia";
import {
	SpamFilterErrorResponse,
	SpamFilterSettingsResponse,
	spamFilterSettingsFor,
} from "@/app/api/e2/spam-filter/shared";
import { validateAndRateLimit } from "@/app/api/e2/lib/auth";

export const getSpamFilter = new Elysia().get(
	"/spam-filter",
	async ({ request, set }) => {
		const userId = await validateAndRateLimit(request, set);
		return spamFilterSettingsFor(userId);
	},
	{
		response: {
			200: SpamFilterSettingsResponse,
			401: SpamFilterErrorResponse,
			500: SpamFilterErrorResponse,
		},
		detail: {
			tags: ["Spam Filter"],
			summary: "Get spam filter settings",
			description:
				"Get the account's junk filter level. Every received email is checked for spam, phishing, fraud, malware and impersonation; emails at or above the level's threshold are marked as junk. Junk mail is still delivered to endpoints, with `spam.isJunk` in the webhook, and appears in mailbox Junk folders.",
		},
	},
);
