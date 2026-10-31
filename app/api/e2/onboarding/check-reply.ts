import { and, desc, eq } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { auth } from "@/lib/auth/auth";
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
	hasReply: t.Boolean(),
	reply: t.Optional(ReplyDataSchema),
});

const CheckReplyErrorResponse = t.Object({
	error: t.String(),
});

export const checkOnboardingReply = new Elysia().get(
	"/onboarding/check-reply",
	async ({ request, set }) => {
		console.log("🔍 GET /api/e2/onboarding/check-reply - Starting request");

		// Get session - onboarding requires session auth (not API key)
		const session = await auth.api.getSession({ headers: request.headers });
		if (!session?.user?.id) {
			console.log("❌ No session found");
			set.status = 401;
			return { error: "Authentication required" };
		}

		const userId = session.user.id;
		console.log("✅ Session authenticated for userId:", userId);

		try {
			// Get the most recent demo email for this user
			const [demoEmail] = await db
				.select()
				.from(onboardingDemoEmails)
				.where(eq(onboardingDemoEmails.userId, userId))
				.orderBy(desc(onboardingDemoEmails.sentAt))
				.limit(1);

			if (!demoEmail) {
				console.log("❌ No demo email found for user");
				return {
					hasReply: false,
				};
			}

			console.log(
				"📧 Found demo email:",
				demoEmail.id,
				"sent to:",
				demoEmail.recipientEmail,
			);

			// If we already recorded a reply, return it
			if (demoEmail.replyReceived && demoEmail.replyFrom) {
				console.log("✅ Reply already recorded");
				return {
					hasReply: true,
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

			// Check for new replies in structuredEmails
			// Look for emails FROM the recipient that might be a reply
			const recentEmails = await db
				.select({
					id: structuredEmails.id,
					fromData: structuredEmails.fromData,
					subject: structuredEmails.subject,
					textBody: structuredEmails.textBody,
					date: structuredEmails.date,
				})
				.from(structuredEmails)
				.where(eq(structuredEmails.userId, userId))
				.orderBy(desc(structuredEmails.date))
				.limit(10);

			// Find a reply from the demo recipient
			const reply = recentEmails.find((email) => {
				// Parse fromData JSON to get the email address
				let fromEmail = "";
				if (email.fromData) {
					try {
						const fromParsed = JSON.parse(email.fromData);
						fromEmail =
							fromParsed.addresses?.[0]?.address?.toLowerCase() ||
							fromParsed.text?.toLowerCase() ||
							"";
					} catch {
						fromEmail = "";
					}
				}
				const demoRecipient = demoEmail.recipientEmail.toLowerCase();
				return (
					fromEmail.includes(demoRecipient) ||
					demoRecipient.includes(fromEmail.split("@")[0])
				);
			});

			if (reply) {
				console.log("✅ Found reply email:", reply.id);

				// Parse from address for storage
				let fromAddress = "";
				if (reply.fromData) {
					try {
						const fromParsed = JSON.parse(reply.fromData);
						fromAddress =
							fromParsed.addresses?.[0]?.address || fromParsed.text || "";
					} catch {
						fromAddress = "";
					}
				}

				// Update the demo email record
				await db
					.update(onboardingDemoEmails)
					.set({
						replyReceived: true,
						replyFrom: fromAddress,
						replySubject: reply.subject,
						replyBody: reply.textBody?.substring(0, 1000) || "", // Limit body length
						replyReceivedAt: reply.date,
						updatedAt: new Date(),
					})
					.where(eq(onboardingDemoEmails.id, demoEmail.id));

				return {
					hasReply: true,
					reply: {
						from: fromAddress,
						subject: reply.subject || "",
						body: reply.textBody?.substring(0, 500) || "",
						receivedAt: reply.date?.toISOString() || new Date().toISOString(),
					},
				};
			}

			console.log("📭 No reply found yet");
			return {
				hasReply: false,
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
			500: CheckReplyErrorResponse,
		},
		detail: {
			hide: true,
			tags: ["Onboarding"],
			summary: "Check for onboarding demo reply",
			description:
				"Check if the user has replied to their onboarding demo email. Used during onboarding to detect reply.",
		},
	},
);
