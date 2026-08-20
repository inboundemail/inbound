import { Client as QStashClient } from "@upstash/qstash";
import { and, eq } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { db } from "@/lib/db";
import { SCHEDULED_EMAIL_STATUS, scheduledEmails } from "@/lib/db/schema";
import { validateAndRateLimit } from "../lib/auth";

const PauseEmailSuccessResponse = t.Object({
	success: t.Boolean(),
	message: t.String(),
	id: t.String(),
	status: t.String(),
});

const PauseEmailErrorResponse = t.Object({
	error: t.String(),
});

export const pauseEmail = new Elysia().post(
	"/emails/:id/pause",
	async ({ request, params, set }) => {
		console.log(
			"⏸️ POST /api/e2/emails/:id/pause - Starting request for:",
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

		if (scheduledEmail.status === SCHEDULED_EMAIL_STATUS.PAUSED) {
			console.log("✅ Email already paused:", emailId);
			return {
				success: true,
				message: "Email already paused",
				id: emailId,
				status: SCHEDULED_EMAIL_STATUS.PAUSED,
			};
		}

		if (scheduledEmail.status !== SCHEDULED_EMAIL_STATUS.SCHEDULED) {
			set.status = 400;
			return {
				error: `Cannot pause an email with status "${scheduledEmail.status}". Only scheduled emails can be paused.`,
			};
		}

		if (scheduledEmail.qstashScheduleId) {
			try {
				const qstashClient = new QStashClient({
					token: process.env.QSTASH_TOKEN!,
				});

				console.log(
					"⏸️ Deleting from QStash, messageId:",
					scheduledEmail.qstashScheduleId,
				);

				await qstashClient.messages.delete(scheduledEmail.qstashScheduleId);

				console.log("✅ Deleted from QStash successfully");
			} catch (qstashError) {
				console.error(
					"⚠️ Failed to delete from QStash (continuing anyway):",
					qstashError,
				);
			}
		}

		await db
			.update(scheduledEmails)
			.set({
				status: SCHEDULED_EMAIL_STATUS.PAUSED,
				qstashScheduleId: null,
				updatedAt: new Date(),
			})
			.where(eq(scheduledEmails.id, emailId));

		console.log("✅ Scheduled email paused successfully:", emailId);

		return {
			success: true,
			message: "Scheduled email paused successfully",
			id: emailId,
			status: SCHEDULED_EMAIL_STATUS.PAUSED,
		};
	},
	{
		params: t.Object({
			id: t.String(),
		}),
		response: {
			200: PauseEmailSuccessResponse,
			400: PauseEmailErrorResponse,
			401: PauseEmailErrorResponse,
			404: PauseEmailErrorResponse,
			500: PauseEmailErrorResponse,
		},
		detail: {
			tags: ["Emails"],
			summary: "Pause scheduled email",
			description:
				'Pause a scheduled email by ID. The email is removed from the delivery queue but kept in the database and can be resumed later with POST /emails/:id/resume. Only works for emails with status "scheduled".',
		},
	},
);
