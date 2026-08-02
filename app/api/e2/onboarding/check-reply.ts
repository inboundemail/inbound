import { and, desc, eq, gte } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { validateAndRateLimit } from "@/app/api/e2/lib/auth";
import {
	getOnboardingSender,
	isOnboardingReply,
} from "@/app/api/e2/onboarding/reply-matching";
import { db } from "@/lib/db";
import { onboardingDemoEmails, structuredEmails } from "@/lib/db/schema";

// Response schemas
const ReplyDataSchema = t.Object({
	from: t.String(),
	subject: t.String(),
	body: t.String(),
	receivedAt: t.String(),
});

const CheckReplySuccessResponse = t.Object({
	hasDemoEmail: t.Boolean(),
	hasReply: t.Boolean(),
	demo: t.Optional(
		t.Object({
			emailId: t.String(),
			recipientEmail: t.String(),
			sentAt: t.String(),
		}),
	),
	reply: t.Optional(ReplyDataSchema),
});

const CheckReplyErrorResponse = t.Object({
	error: t.String(),
	message: t.Optional(t.String()),
	statusCode: t.Optional(t.Number()),
});

export const checkOnboardingReply = new Elysia().get(
	"/onboarding/check-reply",
	async ({ request, set }) => {
		const userId = await validateAndRateLimit(request, set);

		try {
			// Get the most recent demo email for this user
			const [demoEmail] = await db
				.select()
				.from(onboardingDemoEmails)
				.where(eq(onboardingDemoEmails.userId, userId))
				.orderBy(desc(onboardingDemoEmails.sentAt))
				.limit(1);

			if (!demoEmail) {
				return {
					hasDemoEmail: false,
					hasReply: false,
				};
			}

			const demo = {
				emailId: demoEmail.emailId,
				recipientEmail: demoEmail.recipientEmail,
				sentAt: (demoEmail.sentAt ?? new Date()).toISOString(),
			};

			// If we already recorded a reply, return it
			if (demoEmail.replyReceived && demoEmail.replyFrom) {
				return {
					hasDemoEmail: true,
					hasReply: true,
					demo,
					reply: {
						from: demoEmail.replyFrom,
						subject: demoEmail.replySubject || "Re: Welcome to Inbound!",
						body: demoEmail.replyBody || "",
						receivedAt:
							demoEmail.replyReceivedAt?.toISOString() ||
							new Date().toISOString(),
					},
				};
			}

			const recentEmails = await db
				.select({
					id: structuredEmails.id,
					fromData: structuredEmails.fromData,
					subject: structuredEmails.subject,
					textBody: structuredEmails.textBody,
					receivedAt: structuredEmails.createdAt,
					inReplyTo: structuredEmails.inReplyTo,
					references: structuredEmails.references,
				})
				.from(structuredEmails)
				.where(
					and(
						eq(structuredEmails.userId, userId),
						gte(structuredEmails.createdAt, demoEmail.sentAt ?? new Date(0)),
					),
				)
				.orderBy(desc(structuredEmails.createdAt))
				.limit(10);

			const reply = recentEmails.find((email) =>
				isOnboardingReply(email, demoEmail),
			);

			if (reply) {
				const fromAddress = getOnboardingSender(reply.fromData) ?? "";

				await db
					.update(onboardingDemoEmails)
					.set({
						replyReceived: true,
						replyFrom: fromAddress,
						replySubject: reply.subject,
						replyBody: reply.textBody?.substring(0, 1000) || "", // Limit body length
						replyReceivedAt: reply.receivedAt,
						updatedAt: new Date(),
					})
					.where(eq(onboardingDemoEmails.id, demoEmail.id));

				return {
					hasDemoEmail: true,
					hasReply: true,
					demo,
					reply: {
						from: fromAddress,
						subject: reply.subject || "",
						body: reply.textBody?.substring(0, 500) || "",
						receivedAt:
							reply.receivedAt?.toISOString() || new Date().toISOString(),
					},
				};
			}

			return {
				hasDemoEmail: true,
				hasReply: false,
				demo,
			};
		} catch (error) {
			console.error("❌ Error checking for reply:", error);
			set.status = 500;
			return {
				error:
					error instanceof Error ? error.message : "Failed to check for reply",
			};
		}
	},
	{
		response: {
			200: CheckReplySuccessResponse,
			401: CheckReplyErrorResponse,
			403: CheckReplyErrorResponse,
			429: CheckReplyErrorResponse,
			500: CheckReplyErrorResponse,
		},
		detail: {
			tags: ["Onboarding"],
			summary: "Check for onboarding demo reply",
			description:
				"Check if the user has replied to their onboarding demo email. Used during onboarding to detect reply.",
		},
	},
);
