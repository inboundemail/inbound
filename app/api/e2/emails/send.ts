import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import { Client as QStashClient } from "@upstash/qstash";
import { waitUntil } from "@vercel/functions";
import { Autumn as autumn } from "autumn-js";
import { and, eq } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { nanoid } from "nanoid";
import {
	getAgentIdentityArn,
	getTenantSendingInfoForDomainOrParent,
	type TenantSendingInfo,
} from "@/lib/aws-ses/identity-arn-helper";
import { db } from "@/lib/db";
import {
	SCHEDULED_EMAIL_STATUS,
	SENT_EMAIL_STATUS,
	scheduledEmails,
	sentEmails,
} from "@/lib/db/schema";
import { getRootDomain, isSubdomain } from "@/lib/domains-and-dns/domain-utils";
import {
	canUserSendFromEmail,
	extractDomain,
	extractEmailAddress,
} from "@/lib/email-management/agent-email-helper";
import { checkRecipientsAgainstBlocklist } from "@/lib/email-management/email-blocking";
import { evaluateSending } from "@/lib/email-management/email-evaluation";
import { enforceOutboundSendGuard } from "@/lib/email-management/outbound-send-guard";
import { checkSendingSpike } from "@/lib/email-management/sending-spike-detector";
import {
	formatScheduledDate,
	type ParsedScheduleDate,
	parseScheduledAt,
	validateScheduledDate,
} from "@/lib/utils/date-parser";
import {
	attachmentsToStorageFormat,
	type ProcessedAttachment,
	processAttachments,
} from "../helper/attachment-processor";
import { buildRawEmailMessage } from "../helper/email-builder";
import {
	authenticateEmailSend,
	senderPolicyAllowsAddress,
} from "../lib/send-auth";

// Initialize SES client
const awsRegion = process.env.AWS_REGION || "us-east-2";
const awsAccessKeyId = process.env.AWS_ACCESS_KEY_ID;
const awsSecretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

let sesClient: SESv2Client | null = null;

if (awsAccessKeyId && awsSecretAccessKey) {
	sesClient = new SESv2Client({
		region: awsRegion,
		credentials: {
			accessKeyId: awsAccessKeyId,
			secretAccessKey: awsSecretAccessKey,
		},
	});
}

// Request schema
const AttachmentSchema = t.Object({
	filename: t.String(),
	content: t.String(),
	content_type: t.Optional(t.String()),
	path: t.Optional(t.String()),
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
async function checkNewAccountWarmupLimits(_userId: string): Promise<{
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

		// Check for idempotency key
		const idempotencyKey = request.headers.get("Idempotency-Key");
		if (idempotencyKey) {
			console.log("🔑 Idempotency key provided:", idempotencyKey);

			const existingEmail = await db
				.select()
				.from(sentEmails)
				.where(
					and(
						eq(sentEmails.userId, userId),
						eq(sentEmails.idempotencyKey, idempotencyKey),
					),
				)
				.limit(1);

			if (existingEmail.length > 0) {
				console.log(
					"♻️ Idempotent request - returning existing email:",
					existingEmail[0].id,
				);
				return { id: existingEmail[0].id };
			}
		}

		// Validate required fields
		if (!body.from || !body.to || !body.subject) {
			console.log("⚠️ Missing required fields");
			set.status = 400;
			return {
				error: "Missing required fields: from, to, and subject are required",
			};
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
				return { error: parsedDate.error };
			}

			const dateValidation = validateScheduledDate(parsedDate.date);
			if (!dateValidation.isValid) {
				console.log("❌ Invalid schedule time:", dateValidation.error);
				set.status = 400;
				return { error: dateValidation.error };
			}

			console.log(
				"✅ Parsed scheduled_at:",
				formatScheduledDate(parsedDate.date),
			);
		}

		// Extract sender information
		const fromAddress = extractEmailAddress(body.from);
		const fromDomain = extractDomain(body.from);
		if (senderPolicy && !senderPolicyAllowsAddress(senderPolicy, fromAddress)) {
			set.status = 403;
			return { error: "This credential cannot send from that address" };
		}

		console.log("📧 Sender details:", {
			from: body.from,
			address: fromAddress,
			domain: fromDomain,
		});

		// Check if this is the special agent email
		const { isAgentEmail } = canUserSendFromEmail(body.from);

		if (isAgentEmail) {
			console.log("✅ Using agent@inbnd.dev - allowed for all users");
		} else {
			console.log("🔍 Running outbound security guard for:", fromDomain);
		}

		const outboundGuard = await enforceOutboundSendGuard({
			userId,
			fromAddress,
			fromDomain,
			isAgentEmail,
		});
		if (!outboundGuard.allowed) {
			console.log("🚫 Outbound send blocked:", {
				userId,
				fromAddress,
				fromDomain,
				reasonCode: outboundGuard.reasonCode,
			});
			set.status = outboundGuard.statusCode;
			return { error: outboundGuard.error || "Email send blocked" };
		}

		// Convert recipients to arrays
		const toAddresses = toArray(body.to);
		const ccAddresses = toArray(body.cc);
		const bccAddresses = toArray(body.bcc);
		const replyToAddresses = toArray(body.reply_to);

		// Validate email addresses
		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
		const allRecipients = [...toAddresses, ...ccAddresses, ...bccAddresses];

		for (const email of allRecipients) {
			const address = extractEmailAddress(email);
			if (!emailRegex.test(address)) {
				console.log("⚠️ Invalid email format:", email);
				set.status = 400;
				return { error: `Invalid email format: ${email}` };
			}
		}

		// Check if any recipients are on the blocklist (hard bounces)
		// This prevents sending to addresses that previously bounced
		console.log("🔍 Checking recipients against blocklist");
		const blocklistCheck = await checkRecipientsAgainstBlocklist(allRecipients);
		if (blocklistCheck.hasBlockedRecipients) {
			console.log(
				`🚫 Blocked recipients found: ${blocklistCheck.blockedAddresses.join(", ")}`,
			);
			set.status = 400;
			return {
				error: `Cannot send to blocked recipient(s): ${blocklistCheck.blockedAddresses.join(", ")}. These addresses previously bounced.`,
			};
		}

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

		// Check Autumn for email sending limits
		console.log("🔍 Checking email sending limits with Autumn");
		const { data: emailCheck, error: emailCheckError } = await autumn.check({
			customer_id: userId,
			feature_id: "emails_sent",
		});

		if (emailCheckError) {
			console.error("❌ Autumn email check error:", emailCheckError);
			set.status = 500;
			return { error: "Failed to check email sending limits" };
		}

		if (!emailCheck.allowed) {
			console.log("❌ Email sending limit reached for user:", userId);
			set.status = 429;
			return {
				error:
					"Email sending limit reached. Please upgrade your plan to send more emails.",
			};
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

		// Create sent email record (for immediate sending)
		const emailId = nanoid();
		console.log("💾 Creating sent email record:", emailId);

		await db.insert(sentEmails).values({
			id: emailId,
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
			status: SENT_EMAIL_STATUS.PENDING,
			userId,
			idempotencyKey,
			createdAt: new Date(),
			updatedAt: new Date(),
		});

		// Check if SES is configured
		if (!sesClient) {
			console.log("❌ AWS SES not configured");

			await db
				.update(sentEmails)
				.set({
					status: SENT_EMAIL_STATUS.FAILED,
					failureReason: "AWS SES not configured",
					updatedAt: new Date(),
				})
				.where(eq(sentEmails.id, emailId));

			set.status = 500;
			return { error: "Email service not configured. Please contact support." };
		}

		try {
			console.log("📤 Sending email via AWS SES");

			const fromParsed = parseEmailWithName(body.from);
			const sourceEmail = fromParsed.email;
			const formattedFromAddress = formatEmailWithName(
				sourceEmail,
				fromParsed.name,
			);

			// Get tenant sending info
			let tenantSendingInfo: TenantSendingInfo = {
				identityArn: null,
				configurationSetName: null,
				tenantName: null,
			};
			if (isAgentEmail) {
				tenantSendingInfo = {
					identityArn: getAgentIdentityArn(),
					configurationSetName: null,
					tenantName: null,
				};
			} else {
				const parentDomain = isSubdomain(fromDomain)
					? getRootDomain(fromDomain)
					: undefined;
				tenantSendingInfo = await getTenantSendingInfoForDomainOrParent(
					userId,
					fromDomain,
					parentDomain || undefined,
				);
			}

			if (tenantSendingInfo.identityArn) {
				console.log(
					`🏢 Using SourceArn for tenant tracking: ${tenantSendingInfo.identityArn}`,
				);
			}

			// Build raw email message
			console.log("📧 Building raw email message with full MIME support");

			const rawMessage = buildRawEmailMessage({
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

			const rawCommand = new SendEmailCommand({
				FromEmailAddress: formattedFromAddress,
				...(tenantSendingInfo.identityArn && {
					FromEmailAddressIdentityArn: tenantSendingInfo.identityArn,
				}),
				Destination: {
					ToAddresses: toAddresses.map(extractEmailAddress),
					CcAddresses:
						ccAddresses.length > 0
							? ccAddresses.map(extractEmailAddress)
							: undefined,
					BccAddresses:
						bccAddresses.length > 0
							? bccAddresses.map(extractEmailAddress)
							: undefined,
				},
				Content: {
					Raw: {
						Data: Buffer.from(rawMessage),
					},
				},
				...(tenantSendingInfo.configurationSetName && {
					ConfigurationSetName: tenantSendingInfo.configurationSetName,
				}),
				...(tenantSendingInfo.tenantName && {
					TenantName: tenantSendingInfo.tenantName,
				}),
			});

			const sesResponse = await sesClient.send(rawCommand);
			const messageId = sesResponse.MessageId;

			console.log("✅ Email sent successfully via SES:", messageId);

			// Update email record with success
			await db
				.update(sentEmails)
				.set({
					status: SENT_EMAIL_STATUS.SENT,
					messageId,
					providerResponse: JSON.stringify(sesResponse),
					sentAt: new Date(),
					updatedAt: new Date(),
				})
				.where(eq(sentEmails.id, emailId));

			// Track email usage with Autumn
			if (!emailCheck.unlimited) {
				console.log("📊 Tracking email usage with Autumn");
				const { error: trackError } = await autumn.track({
					customer_id: userId,
					feature_id: "emails_sent",
					value: 1,
				});

				if (trackError) {
					console.error("❌ Failed to track email usage:", trackError);
				}
			}

			// Evaluate email for security risks (non-blocking)
			waitUntil(
				evaluateSending(emailId, userId, {
					from: body.from,
					to: body.to,
					subject: body.subject,
					textBody: body.text,
					htmlBody: body.html,
				}),
			);

			// Check for sending spikes (non-blocking)
			waitUntil(checkSendingSpike(userId));

			console.log("✅ Email processing complete");
			return {
				id: emailId,
				message_id: messageId || undefined,
			};
		} catch (sesError) {
			console.error("❌ SES send error:", sesError);

			await db
				.update(sentEmails)
				.set({
					status: SENT_EMAIL_STATUS.FAILED,
					failureReason:
						sesError instanceof Error ? sesError.message : "Unknown SES error",
					providerResponse: JSON.stringify(sesError),
					updatedAt: new Date(),
				})
				.where(eq(sentEmails.id, emailId));

			set.status = 500;
			return { error: "Failed to send email. Please try again later." };
		}
	},
	{
		body: SendEmailBodySchema,
		response: {
			200: EmailSendSuccessResponse,
			400: ErrorResponse,
			401: ErrorResponse,
			403: ErrorResponse,
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
