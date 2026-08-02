import { Elysia, t } from "elysia";
import { unblockEmail } from "@/lib/email-management/email-blocking";
import { validateAndRateLimit } from "../lib/auth";

const UnblockEmailBody = t.Object({
	emailAddress: t.String({ format: "email" }),
});

const UnblockEmailResponse = t.Object({
	message: t.String(),
	emailAddress: t.String(),
	domain: t.String(),
});

const ErrorResponse = t.Object({
	error: t.String(),
});

export const unblockBlocklistedEmail = new Elysia().post(
	"/blocklist/unblock",
	async ({ request, body, set }) => {
		const userId = await validateAndRateLimit(request, set);
		const result = await unblockEmail(body.emailAddress, userId);

		if (!result.success || !result.emailAddress || !result.domain) {
			set.status = result.notFound ? 404 : 500;
			return { error: result.error || "Blocked email address not found" };
		}

		return {
			message: result.message || "Email address unblocked successfully",
			emailAddress: result.emailAddress,
			domain: result.domain,
		};
	},
	{
		body: UnblockEmailBody,
		response: {
			200: UnblockEmailResponse,
			400: ErrorResponse,
			401: ErrorResponse,
			404: ErrorResponse,
			429: ErrorResponse,
			500: ErrorResponse,
		},
		detail: {
			tags: ["Blocklist"],
			summary: "Unblock an email address",
			description:
				"Remove an email address from the authenticated user's blocklist. The block must belong to one of the user's domains.",
		},
	},
);
