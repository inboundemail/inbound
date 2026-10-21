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

		const [resumed] = await db
			.update(scheduledEmails)
			.set({
				status: SCHEDULED_EMAIL_STATUS.SCHEDULED,
				scheduledAt: sendAt,
				updatedAt: now,
			})
			.where(
				and(
					eq(scheduledEmails.id, emailId),
					eq(scheduledEmails.userId, userId),
					eq(scheduledEmails.status, SCHEDULED_EMAIL_STATUS.PAUSED),
				),
			)
			.returning({ id: scheduledEmails.id });

		if (!resumed) {
			set.status = 400;
			return {
				error: "Cannot resume this email because its status changed. Only paused emails can be resumed.",
			};
		}

		console.log("✅ Scheduled email resumed successfully:", emailId);

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
