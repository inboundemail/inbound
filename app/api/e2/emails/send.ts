import { Client as QStashClient } from "@upstash/qstash";
import { eq } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { nanoid } from "nanoid";
import {
	attachmentsToStorageFormat,
	type ProcessedAttachment,
	processAttachments,
} from "@/app/api/e2/helper/attachment-processor";
import { buildRawEmailMessage } from "@/app/api/e2/helper/email-builder";
import { findUnsafeHeaderInput } from "@/app/api/e2/helper/header-safety";
import {
	authorizeOutboundSend,
	checkEmailSendAllowance,
	deliverSentEmail,
	resolveSendIdempotency,
} from "@/app/api/e2/helper/send-pipeline";
import { authenticateEmailSend } from "@/app/api/e2/lib/send-auth";
import { db } from "@/lib/db";
import { SCHEDULED_EMAIL_STATUS, scheduledEmails } from "@/lib/db/schema";
import { extractEmailAddress } from "@/lib/email-management/agent-email-helper";
import {
	formatScheduledDate,
	type ParsedScheduleDate,
	parseScheduledAt,
	validateScheduledDate,
} from "@/lib/utils/date-parser";

// Request schema
const AttachmentSchema = t.Object({
	filename: t.String({ description: "Filename shown to the recipient" }),
	content: t.Optional(t.String({ description: "Base64-encoded file content" })),
	content_type: t.Optional(t.String()),
	content_id: t.Optional(t.String({ maxLength: 128 })),
	path: t.Optional(
		t.String({ description: "Public or signed URL for Inbound to fetch" }),
	),
});

const TagSchema = t.Object({
	name: t.String(),
	value: t.String(),
});

const SendEmailBodySchema = t.Object({
	from: t.String({ description: "Sender email address" }),
	to: t.Union([t.String(), t.Array(t.String())], {
		description: "Recipient email address(es)",
	}),
	subject: t.String({ description: "Email subject" }),
	html: t.Optional(t.String({ description: "HTML content of the email" })),
	text: t.Optional(
		t.String({ description: "Plain text content of the email" }),
	),
	cc: t.Optional(t.Union([t.String(), t.Array(t.String())])),
	bcc: t.Optional(t.Union([t.String(), t.Array(t.String())])),
	reply_to: t.Optional(t.Union([t.String(), t.Array(t.String())])),
	headers: t.Optional(
		t.Record(t.String(), t.String(), { description: "Custom email headers" }),
	),
	attachments: t.Optional(t.Array(AttachmentSchema)),
	tags: t.Optional(t.Array(TagSchema)),
	scheduled_at: t.Optional(
		t.String({
			description: "ISO 8601 date or natural language for scheduling",
		}),
	),
	timezone: t.Optional(
		t.String({ description: "Timezone for natural language parsing" }),
	),
});

// Response schemas - unified to avoid SDK union type issues
const EmailSendSuccessResponse = t.Object({
	id: t.String(),
	message_id: t.Optional(t.String()),
	scheduled_at: t.Optional(t.String()),
	status: t.Optional(t.Union([t.Literal("sent"), t.Literal("scheduled")])),
	timezone: t.Optional(t.String()),
});

const ErrorResponse = t.Object({
	error: t.String(),
});

// Helper functions
function toArray(value: string | string[] | undefined): string[] {
	if (!value) return [];
	return Array.isArray(value) ? value : [value];
}

function parseEmailWithName(emailString: string): {
	email: string;
	name?: string;
} {
	const match = emailString.match(/^(.+?)\s*<([^>]+)>$/);
	if (match) {
		return {
			name: match[1].replace(/^["']|["']$/g, "").trim(),
			email: match[2].trim(),
		};
	}
	return { email: emailString.trim() };
}

function formatEmailWithName(email: string, name?: string): string {
	if (name && name.trim()) {
		const escapedName =
			name.includes(",") ||
			name.includes(";") ||
			name.includes("<") ||
			name.includes(">")
				? `"${name.replace(/"/g, '\\"')}"`
				: name;
		return `${escapedName} <${email}>`;
	}
	return email;
}

// Check warmup limits for new accounts
export async function checkNewAccountWarmupLimits(_userId: string): Promise<{
	allowed: boolean;
	error?: string;
	emailsSentToday?: number;
	dailyLimit?: number;
	daysRemaining?: number;
}> {
	// This would be implemented based on your existing warmup logic
	// For now, returning allowed
	return { allowed: true };
}

export const sendEmail = new Elysia().post(
	"/emails",
	async ({ request, body, set }) => {
		console.log("📧 POST /api/e2/emails - Starting request");

		// Auth & rate limit validation
		const { userId, senderPolicy } = await authenticateEmailSend(request, set);
		console.log("✅ Authentication successful for userId:", userId);

		// Check new account warmup limits
		const warmupCheck = await checkNewAccountWarmupLimits(userId);
		if (!warmupCheck.allowed) {
			console.log(`🚫 Warmup limit exceeded for user ${userId}`);
			set.status = 429;
			return {
				error: warmupCheck.error || "Warmup limit exceeded",
			};
		}

		const idempotency = await resolveSendIdempotency(request.headers, userId);
		if ("response" in idempotency) {
			if (idempotency.response.status) set.status = idempotency.response.status;
			return idempotency.response.body;
		}
		const idempotencyKey = idempotency.key;

		// Validate required fields
		if (!body.from || !body.to || !body.subject) {
			console.log("⚠️ Missing required fields");
			set.status = 400;
			return {
				error: "Missing required fields: from, to, and subject are required",
			};
		}

		const unsafeHeaderInput = findUnsafeHeaderInput(body);
		if (unsafeHeaderInput) {
			set.status = 400;
			return { error: unsafeHeaderInput };
		}

		// Validate email content
		if (!body.html && !body.text) {
			console.log("⚠️ No email content provided");
			set.status = 400;
			return { error: "Either html or text content must be provided" };
		}

		// Handle scheduled_at if provided
		let parsedDate: ParsedScheduleDate | null = null;
		if (body.scheduled_at) {
			console.log("⏰ Scheduled email detected");

			parsedDate = parseScheduledAt(body.scheduled_at, body.timezone || "UTC");
			if (!parsedDate.isValid) {
				console.log("❌ Invalid scheduled_at:", parsedDate.error);
				set.status = 400;
				return { error: parsedDate.error || "Invalid scheduled date" };
			}

			const dateValidation = validateScheduledDate(parsedDate.date);
			if (!dateValidation.isValid) {
				console.log("❌ Invalid schedule time:", dateValidation.error);
				set.status = 400;
				return { error: dateValidation.error || "Invalid scheduled date" };
			}

			console.log(
				"✅ Parsed scheduled_at:",
				formatScheduledDate(parsedDate.date),
			);
		}

		const toAddresses = toArray(body.to);
		const ccAddresses = toArray(body.cc);
		const bccAddresses = toArray(body.bcc);
		const replyToAddresses = toArray(body.reply_to);

		const sender = await authorizeOutboundSend({
			userId,
			senderPolicy,
			from: body.from,
			to: toAddresses,
			cc: ccAddresses,
			bcc: bccAddresses,
		});
		if ("response" in sender) {
			if (sender.response.status) set.status = sender.response.status;
			return sender.response.body;
		}
		const { fromAddress, fromDomain } = sender;

		// Process attachments
		console.log("📎 Processing attachments");
		let processedAttachments: ProcessedAttachment[] = [];
		if (body.attachments && body.attachments.length > 0) {
			try {
				processedAttachments = await processAttachments(body.attachments);
				console.log(
					"✅ Attachments processed successfully:",
					processedAttachments.length,
				);
			} catch (attachmentError) {
				console.error("❌ Attachment processing error:", attachmentError);
				set.status = 400;
				return {
					error:
						attachmentError instanceof Error
							? attachmentError.message
							: "Failed to process attachments",
				};
			}
		}

		const allowance = await checkEmailSendAllowance(userId);
		if ("response" in allowance) {
			if (allowance.response.status) set.status = allowance.response.status;
			return allowance.response.body;
		}

		// If scheduled_at is provided, create scheduled email
		if (body.scheduled_at && parsedDate) {
			const scheduledEmailId = nanoid();
			console.log("💾 Creating scheduled email record:", scheduledEmailId);

			const scheduledEmailData = {
				id: scheduledEmailId,
				userId,
				scheduledAt: parsedDate.date,
				timezone: parsedDate.timezone,
				status: SCHEDULED_EMAIL_STATUS.SCHEDULED,
				fromAddress: body.from,
				fromDomain,
				toAddresses: JSON.stringify(toAddresses),
				ccAddresses:
					ccAddresses.length > 0 ? JSON.stringify(ccAddresses) : null,
				bccAddresses:
					bccAddresses.length > 0 ? JSON.stringify(bccAddresses) : null,
				replyToAddresses:
					replyToAddresses.length > 0 ? JSON.stringify(replyToAddresses) : null,
				subject: body.subject,
				textBody: body.text || null,
				htmlBody: body.html || null,
				headers: body.headers ? JSON.stringify(body.headers) : null,
				attachments:
					processedAttachments.length > 0
						? JSON.stringify(attachmentsToStorageFormat(processedAttachments))
						: null,
				tags: body.tags ? JSON.stringify(body.tags) : null,
				idempotencyKey,
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			const [createdScheduledEmail] = await db
				.insert(scheduledEmails)
				.values(scheduledEmailData)
				.returning();

			console.log("✅ Scheduled email created in database:", scheduledEmailId);

			// Schedule with QStash
			try {
				const qstashClient = new QStashClient({
					token: process.env.QSTASH_TOKEN!,
				});

				const webhookUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/send-email`;
				const notBefore = Math.floor(parsedDate.date.getTime() / 1000);

				console.log("📅 Scheduling with QStash:", {
					url: webhookUrl,
					notBefore: new Date(notBefore * 1000).toISOString(),
					scheduledEmailId,
				});

				const scheduleResponse = await qstashClient.publishJSON({
					url: webhookUrl,
					body: {
						type: "scheduled",
						scheduledEmailId: scheduledEmailId,
					},
					notBefore: notBefore,
					retries: 3,
				});

				await db
					.update(scheduledEmails)
					.set({
						qstashScheduleId: scheduleResponse.messageId,
						updatedAt: new Date(),
					})
					.where(eq(scheduledEmails.id, scheduledEmailId));

				console.log(
					"✅ Scheduled with QStash, messageId:",
					scheduleResponse.messageId,
				);

				set.status = 201;
				return {
					id: scheduledEmailId,
					scheduled_at: formatScheduledDate(createdScheduledEmail.scheduledAt),
					status: "scheduled" as const,
					timezone: createdScheduledEmail.timezone || "UTC",
				};
			} catch (qstashError) {
				console.error("❌ Failed to schedule with QStash:", qstashError);

				await db
					.update(scheduledEmails)
					.set({
						status: SCHEDULED_EMAIL_STATUS.FAILED,
						lastError:
							qstashError instanceof Error
								? qstashError.message
								: "Failed to schedule with QStash",
						updatedAt: new Date(),
					})
					.where(eq(scheduledEmails.id, scheduledEmailId));

				set.status = 500;
				return { error: "Failed to schedule email" };
			}
		}

		const fromParsed = parseEmailWithName(body.from);
		const sourceEmail = fromParsed.email;
		const formattedFromAddress = formatEmailWithName(
			sourceEmail,
			fromParsed.name,
		);

		const delivery = await deliverSentEmail({
			userId,
			idempotencyKey,
			unlimited: allowance.unlimited,
			sender,
			fromEmailAddress: formattedFromAddress,
			destination: {
				to: toAddresses.map(extractEmailAddress),
				cc: ccAddresses.map(extractEmailAddress),
				bcc: bccAddresses.map(extractEmailAddress),
			},
			record: {
				from: body.from,
				fromAddress,
				fromDomain,
				to: JSON.stringify(toAddresses),
				cc: ccAddresses.length > 0 ? JSON.stringify(ccAddresses) : null,
				bcc: bccAddresses.length > 0 ? JSON.stringify(bccAddresses) : null,
				replyTo:
					replyToAddresses.length > 0 ? JSON.stringify(replyToAddresses) : null,
				subject: body.subject,
				textBody: body.text,
				htmlBody: body.html,
				headers: body.headers ? JSON.stringify(body.headers) : null,
				attachments:
					processedAttachments.length > 0
						? JSON.stringify(attachmentsToStorageFormat(processedAttachments))
						: null,
				tags: body.tags ? JSON.stringify(body.tags) : null,
			},
			buildRawMessage: () => {
				console.log("📧 Building raw email message with full MIME support");
				return buildRawEmailMessage({
					from: formattedFromAddress,
					to: toAddresses,
					cc: ccAddresses.length > 0 ? ccAddresses : undefined,
					bcc: bccAddresses.length > 0 ? bccAddresses : undefined,
					replyTo: replyToAddresses.length > 0 ? replyToAddresses : undefined,
					subject: body.subject,
					textBody: body.text,
					htmlBody: body.html,
					customHeaders: body.headers,
					attachments: processedAttachments,
					date: new Date(),
				});
			},
			evaluation: {
				from: body.from,
				to: body.to,
				subject: body.subject,
				textBody: body.text,
				htmlBody: body.html,
			},
		});
		if (delivery.status) set.status = delivery.status;
		return delivery.body;
	},
	{
		body: SendEmailBodySchema,
		response: {
			200: EmailSendSuccessResponse,
			400: ErrorResponse,
			401: ErrorResponse,
			403: ErrorResponse,
			409: ErrorResponse,
			429: ErrorResponse,
			500: ErrorResponse,
		},
		detail: {
			tags: ["Emails"],
			summary: "Send an email",
			description:
				"Send an email immediately or schedule it for later using the scheduled_at parameter. Supports HTML/text content, attachments, and custom headers.",
		},
	},
);
