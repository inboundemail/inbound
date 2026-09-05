import { and, eq } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { validateAndRateLimit } from "@/app/api/e2/lib/auth";
import { db } from "@/lib/db";
import { sentEmails, structuredEmails } from "@/lib/db/schema";
import {
	EmailRetryError,
	retryEmailDelivery,
} from "@/lib/email-management/email-router";

const RetryEmailBodySchema = t.Object({
	endpoint_id: t.Optional(
		t.String({
			description:
				"Endpoint ID to retry delivery to. If not provided, retries to all configured endpoints.",
		}),
	),
	delivery_id: t.Optional(
		t.String({
			description:
				"Specific delivery ID to retry. If provided, retries that specific delivery.",
		}),
	),
});

const RetryEmailSuccessResponse = t.Object({
	success: t.Boolean(),
	message: t.String(),
	delivery_id: t.Optional(t.String()),
});

const RetryEmailErrorResponse = t.Object({
	error: t.String(),
});

export const retryEmail = new Elysia().post(
	"/emails/:id/retry",
	async ({ request, params, body, set }) => {
		const userId = await validateAndRateLimit(request, set);
		const [email] = await db
			.select({ emailId: structuredEmails.emailId })
			.from(structuredEmails)
			.where(
				and(
					eq(structuredEmails.id, params.id),
					eq(structuredEmails.userId, userId),
				),
			)
			.limit(1);

		if (email) {
			try {
				return await retryEmailDelivery(email.emailId, userId, {
					deliveryId: body.delivery_id,
					endpointId: body.endpoint_id,
				});
			} catch (error) {
				if (error instanceof EmailRetryError) {
					set.status = error.status;
					return { error: error.message };
				}
				set.status = 500;
				return {
					error:
						"Unable to retry delivery. Check delivery status before trying again.",
				};
			}
		}

		const [sentEmail] = await db
			.select({ id: sentEmails.id })
			.from(sentEmails)
			.where(and(eq(sentEmails.id, params.id), eq(sentEmails.userId, userId)))
			.limit(1);

		if (sentEmail) {
			set.status = 400;
			return {
				error:
					"Cannot retry sent emails. Use POST /emails to send a new email instead.",
			};
		}

		set.status = 404;
		return { error: "Email not found" };
	},
	{
		params: t.Object({ id: t.String() }),
		body: RetryEmailBodySchema,
		response: {
			200: RetryEmailSuccessResponse,
			400: RetryEmailErrorResponse,
			401: RetryEmailErrorResponse,
			404: RetryEmailErrorResponse,
			500: RetryEmailErrorResponse,
		},
		detail: {
			tags: ["Emails"],
			summary: "Retry email delivery",
			description:
				"Retry delivery of a received email. Can retry to a specific endpoint, retry a specific failed delivery, or retry to all configured endpoints.",
		},
	},
);
