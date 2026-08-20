import { Client as QStashClient } from "@upstash/qstash";
import { and, eq } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { db } from "@/lib/db";
import { SCHEDULED_EMAIL_STATUS, scheduledEmails } from "@/lib/db/schema";
import { formatScheduledDate } from "@/lib/utils/date-parser";
import { validateAndRateLimit } from "../lib/auth";

const ResumeEmailSuccessResponse = t.Object({
	success: t.Boolean(),
	message: t.String(),
	id: t.String(),
	status: t.String(),
	scheduled_at: t.String(),
});

const ResumeEmailErrorResponse = t.Object({
	error: t.String(),
});

export const resumeEmail = new Elysia().post(
	"/emails/:id/resume",
	async ({ request, params, set }) => {
		console.log(
			"▶️ POST /api/e2/emails/:id/resume - Starting request for:",
			params.id,
		);

		const userId = await validateAndRateLimit(request, set);
		console.log("✅ Authentication successful for userId:", userId);

		const emailId = params.id;

		const [scheduledEmail] = await db
			.select()
			.from(scheduledEmails)
			.where(
				and(
					eq(scheduledEmails.id, emailId),
					eq(scheduledEmails.userId, userId),
				),
			)
			.limit(1);

		if (!scheduledEmail) {
			set.status = 404;
			return { error: "Scheduled email not found" };
		}

		if (scheduledEmail.status !== SCHEDULED_EMAIL_STATUS.PAUSED) {
			set.status = 400;
			return {
				error: `Cannot resume an email with status "${scheduledEmail.status}". Only paused emails can be resumed.`,
			};
		}

		const now = new Date();
		const sendAt =
			scheduledEmail.scheduledAt > now ? scheduledEmail.scheduledAt : now;

		try {
			const qstashClient = new QStashClient({
				token: process.env.QSTASH_TOKEN!,
			});

			const webhookUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/send-email`;
			const notBefore = Math.floor(sendAt.getTime() / 1000);

			console.log("▶️ Rescheduling with QStash:", {
				url: webhookUrl,
				notBefore: new Date(notBefore * 1000).toISOString(),
				scheduledEmailId: emailId,
			});

			const scheduleResponse = await qstashClient.publishJSON({
				url: webhookUrl,
				body: {
					type: "scheduled",
					scheduledEmailId: emailId,
				},
				notBefore: notBefore,
				retries: 3,
			});

			await db
				.update(scheduledEmails)
				.set({
					status: SCHEDULED_EMAIL_STATUS.SCHEDULED,
					qstashScheduleId: scheduleResponse.messageId,
					scheduledAt: sendAt,
					updatedAt: new Date(),
				})
				.where(eq(scheduledEmails.id, emailId));

			console.log(
				"✅ Scheduled email resumed successfully:",
				emailId,
				"messageId:",
				scheduleResponse.messageId,
			);

			return {
				success: true,
				message:
					scheduledEmail.scheduledAt > now
						? "Scheduled email resumed successfully"
						: "Scheduled email resumed; original send time has passed so it will be sent shortly",
				id: emailId,
				status: SCHEDULED_EMAIL_STATUS.SCHEDULED,
				scheduled_at: formatScheduledDate(sendAt),
			};
		} catch (qstashError) {
			console.error("❌ Failed to reschedule with QStash:", qstashError);
			set.status = 500;
			return { error: "Failed to resume scheduled email" };
		}
	},
	{
		params: t.Object({
			id: t.String(),
		}),
		response: {
			200: ResumeEmailSuccessResponse,
			400: ResumeEmailErrorResponse,
			401: ResumeEmailErrorResponse,
			404: ResumeEmailErrorResponse,
			500: ResumeEmailErrorResponse,
		},
		detail: {
			tags: ["Emails"],
			summary: "Resume paused scheduled email",
			description:
				"Resume a paused scheduled email by ID. The email is re-queued for its original send time, or sent shortly if that time has already passed.",
		},
	},
);
