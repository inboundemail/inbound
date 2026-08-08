import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import { waitUntil } from "@vercel/functions";
import { Autumn as autumn } from "autumn-js";
import { and, eq } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { nanoid } from "nanoid";
import {
	getTenantSendingInfoForDomainOrParent,
	type TenantSendingInfo,
} from "@/lib/aws-ses/identity-arn-helper";
import { db } from "@/lib/db";
import {
	SENT_EMAIL_STATUS,
	sentEmails,
	structuredEmails,
} from "@/lib/db/schema";
import { getRootDomain, isSubdomain } from "@/lib/domains-and-dns/domain-utils";
import {
	canUserSendFromEmail,
	extractDomain,
	extractEmailAddress,
	extractEmailName,
} from "@/lib/email-management/agent-email-helper";
import { checkRecipientsAgainstBlocklist } from "@/lib/email-management/email-blocking";
import { evaluateSending } from "@/lib/email-management/email-evaluation";
import { EmailThreader } from "@/lib/email-management/email-threader";
import { enforceOutboundSendGuard } from "@/lib/email-management/outbound-send-guard";
import { checkSendingSpike } from "@/lib/email-management/sending-spike-detector";
import {
	attachmentsToStorageFormat,
	processAttachments,
} from "../helper/attachment-processor";
import { validateAndRateLimit } from "../lib/auth";

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

const ReplyEmailBodySchema = t.Object({
	from: t.String({ description: "Sender email address" }),
	to: t.Optional(
		t.Union([t.String(), t.Array(t.String())], {
			description: "Recipient email address(es) - defaults to original sender",
		}),
	),
	subject: t.Optional(
		t.String({
			description: "Email subject - defaults to Re: original subject",
		}),
	),
	html: t.Optional(t.String({ description: "HTML content of the email" })),
	text: t.Optional(
		t.String({ description: "Plain text content of the email" }),
	),
	headers: t.Optional(
		t.Record(t.String(), t.String(), { description: "Custom email headers" }),
	),
	attachments: t.Optional(t.Array(AttachmentSchema)),
	reply_all: t.Optional(
		t.Boolean({ description: "Include original CC recipients" }),
	),
	tags: t.Optional(t.Array(TagSchema)),
});

// Response schemas
const ReplyEmailSuccessResponse = t.Object({
	id: t.String(),
	message_id: t.String(),
	aws_message_id: t.String(),
	replied_to_email_id: t.String(),
	replied_to_thread_id: t.Optional(t.String()),
	is_thread_reply: t.Boolean(),
});

const ReplyEmailErrorResponse = t.Object({
	error: t.String(),
});

// Helper functions
function toArray(value: string | string[] | undefined): string[] {
	if (!value) return [];
	return Array.isArray(value) ? value : [value];
}

function formatSenderAddress(email: string, name?: string): string {
	if (!name) return email;

	const escapedName = name.replace(/"/g, '\\"');
	const needsQuotes = /[,<>()[\]:;@\\"]/.test(name);

	if (needsQuotes) {
		return `"${escapedName}" <${email}>`;
	} else {
		return `${escapedName} <${email}>`;
	}
}

function formatEmailDate(date: Date): string {
	const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
	const months = [
		"Jan",
		"Feb",
		"Mar",
		"Apr",
		"May",
		"Jun",
		"Jul",
		"Aug",
		"Sep",
		"Oct",
		"Nov",
		"Dec",
	];

	const day = days[date.getUTCDay()];
	const dayNum = date.getUTCDate();
	const month = months[date.getUTCMonth()];
	const year = date.getUTCFullYear();
	const hours = date.getUTCHours().toString().padStart(2, "0");
	const minutes = date.getUTCMinutes().toString().padStart(2, "0");
	const seconds = date.getUTCSeconds().toString().padStart(2, "0");

	return `${day}, ${dayNum} ${month} ${year} ${hours}:${minutes}:${seconds} +0000`;
}

function extractEmailsFromParsedData(parsedData: string | null): string[] {
	if (!parsedData) return [];

	try {
		const parsed = JSON.parse(parsedData);
		if (parsed?.addresses && Array.isArray(parsed.addresses)) {
			return parsed.addresses
				.map((addr: any) => addr.address)
				.filter((email: string) => email && typeof email === "string");
		}
	} catch (e) {
		console.error("Failed to parse email data:", e);
	}

	return [];
}

// Check warmup limits for new accounts
async function checkNewAccountWarmupLimits(userId: string): Promise<{
	allowed: boolean;
	error?: string;
}> {
	return { allowed: true };
}

export const replyToEmail = new Elysia().post(
	"/emails/:id/reply",
	async ({ request, params, body, set }) => {
		const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
		console.log(
			`📧 [${requestId}] POST /api/e2/emails/:id/reply - Starting request`,
		);

		// Auth & rate limit validation
		const userId = await validateAndRateLimit(request, set);
		console.log("✅ Authentication successful for userId:", userId);

		// Check new account warmup limits
		const warmupCheck = await checkNewAccountWarmupLimits(userId);
		if (!warmupCheck.allowed) {
			console.log(`🚫 Warmup limit exceeded for user ${userId}`);
			set.status = 429;
			return { error: warmupCheck.error || "Warmup limit exceeded" };
		}

		const id = params.id;
		console.log("📨 Replying to ID:", id);

		// Validate ID
		if (!id || typeof id !== "string") {
			console.log("⚠️ Invalid ID provided:", id);
			set.status = 400;
			return { error: "Valid email ID or thread ID is required" };
		}

		// Resolve whether this is an email ID or thread ID
		console.log("🔍 Resolving ID type...");
		const resolvedId = await EmailThreader.resolveEmailId(id, userId);

		if (!resolvedId) {
			console.log("📭 ID not found in emails or threads");
			set.status = 404;
			return { error: "Email or thread not found" };
		}

		const emailId = resolvedId.emailId;
		const isThreadReply = resolvedId.isThreadId;

		console.log(
			`📧 Resolved to email ID: ${emailId} ${isThreadReply ? "(from thread ID)" : "(direct email ID)"}`,
		);

		// Idempotency Key Check
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
				return {
					id: existingEmail[0].id,
					message_id: existingEmail[0].messageId || "",
					aws_message_id: existingEmail[0].sesMessageId || "",
					replied_to_email_id: emailId,
					replied_to_thread_id: resolvedId.threadId,
					is_thread_reply: isThreadReply,
				};
			}
		}

		// Retrieve the original email from the database
		// Note: emailId from resolveEmailId is the structuredEmails.id field
		console.log("🔍 Fetching original email");
		const originalEmail = await db
			.select()
			.from(structuredEmails)
			.where(
				and(
					eq(structuredEmails.id, emailId),
					eq(structuredEmails.userId, userId),
				),
			)
			.limit(1);

		if (originalEmail.length === 0) {
			console.log("📭 Original email not found");
			set.status = 404;
			return { error: "Email not found" };
		}

		const original = originalEmail[0];

		// Validate content
		if (!body.html && !body.text) {
			console.log("⚠️ No email content provided");
			set.status = 400;
			return { error: "Either html or text content must be provided" };
		}

		// Validate 'from' field
		if (
			!body.from ||
			typeof body.from !== "string" ||
			body.from.trim().length === 0
		) {
			console.log("⚠️ Invalid from field");
			set.status = 400;
			return {
				error: 'The "from" field is required and must be a valid email address',
			};
		}

		// Extract and validate email components
		let fromAddress: string;
		let fromDomain: string;
		let senderName: string | undefined;

		try {
			fromAddress = extractEmailAddress(body.from);

			if (!fromAddress) {
				set.status = 400;
				return { error: "Could not extract email address from 'from' field" };
			}

			const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
			if (!emailRegex.test(fromAddress)) {
				set.status = 400;
				return { error: "Invalid email address format" };
			}

			fromDomain = extractDomain(body.from);
			if (!fromDomain) {
				set.status = 400;
				return { error: "Could not extract domain from email address" };
			}

			senderName = extractEmailName(body.from) || undefined;
		} catch (extractionError) {
			console.error("Email extraction error:", extractionError);
			set.status = 400;
			return { error: "Failed to process email address" };
		}

		const formattedFromAddress = formatSenderAddress(fromAddress, senderName);
		console.log(`📧 [${requestId}] From address components:`, {
			rawFrom: body.from,
			extractedAddress: fromAddress,
			extractedName: senderName,
			formattedFrom: formattedFromAddress,
		});

		// Parse original email data
		let originalFromData = null;
		if (original.fromData) {
			try {
				originalFromData = JSON.parse(original.fromData);
			} catch (e) {
				console.error("❌ Failed to parse original fromData:", e);
			}
		}

		// Determine reply recipients
		const originalSenderAddress = originalFromData?.addresses?.[0]?.address;
		if (!originalSenderAddress && !body.to) {
			console.log("⚠️ Cannot determine recipient for reply");
			set.status = 400;
			return { error: "Cannot determine recipient email address" };
		}

		// Build recipient list based on reply_all flag
		let toAddresses: string[] = [];

		if (body.to) {
			toAddresses = toArray(body.to);
		} else if (body.reply_all) {
			console.log("📧 Reply All requested - including original CC recipients");

			const originalSender = originalFromData?.text || originalSenderAddress;
			if (originalSender) {
				toAddresses.push(originalSender);
			}

			const originalCcEmails = extractEmailsFromParsedData(original.ccData);

			for (const ccEmail of originalCcEmails) {
				if (ccEmail.toLowerCase() !== fromAddress.toLowerCase()) {
					toAddresses.push(ccEmail);
				}
			}

			toAddresses = [...new Set(toAddresses)];
		} else {
			toAddresses = [originalFromData?.text || originalSenderAddress];
		}

		const subject = body.subject || `Re: ${original.subject || "No Subject"}`;

		// Check if this is the agent email (not allowed for replies)
		const { isAgentEmail } = canUserSendFromEmail(body.from);

		if (isAgentEmail) {
			console.log("❌ Agent email cannot be used for replies");
			set.status = 400;
			return {
				error:
					"agent@inbnd.dev cannot be used for replies. Please use a verified domain email address.",
			};
		}

		console.log("🔍 Running outbound security guard for reply:", fromDomain);
		const outboundGuard = await enforceOutboundSendGuard({
			userId,
			fromAddress,
			fromDomain,
			isAgentEmail,
		});
		if (!outboundGuard.allowed) {
			console.log("🚫 Reply blocked by outbound guard:", {
				userId,
				fromAddress,
				fromDomain,
				reasonCode: outboundGuard.reasonCode,
			});
			set.status = outboundGuard.statusCode;
			return { error: outboundGuard.error || "Email send blocked" };
		}

		// Validate email addresses
		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
		for (const email of toAddresses) {
			const address = extractEmailAddress(email);
			if (!emailRegex.test(address)) {
				console.log("⚠️ Invalid email format:", email);
				set.status = 400;
				return { error: `Invalid email format: ${email}` };
			}
		}

		// Check if any recipients are on the blocklist (hard bounces)
		// This prevents replying to addresses that previously bounced
		console.log("🔍 Checking reply recipients against blocklist");
		const blocklistCheck = await checkRecipientsAgainstBlocklist(toAddresses);
		if (blocklistCheck.hasBlockedRecipients) {
			console.log(
				`🚫 Blocked recipients found: ${blocklistCheck.blockedAddresses.join(", ")}`,
			);
			set.status = 400;
			return {
				error: `Cannot reply to blocked recipient(s): ${blocklistCheck.blockedAddresses.join(", ")}. These addresses previously bounced.`,
			};
		}

		// Process attachments
		console.log("📎 Processing reply attachments");
		let processedAttachments: any[] = [];
		if (body.attachments && body.attachments.length > 0) {
			try {
				processedAttachments = await processAttachments(body.attachments);
			} catch (attachmentError) {
				console.error("❌ Reply attachment processing error:", attachmentError);
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

		// Create email record
		const replyEmailId = nanoid();
		const messageId = `${replyEmailId}@${fromDomain}`;

		// Build threading headers
		const formatMessageId = (id: string) => {
			if (!id) return "";
			id = id.trim();
			if (!id.startsWith("<")) id = `<${id}`;
			if (!id.endsWith(">")) id = `${id}>`;
			return id;
		};

		const inReplyTo = original.messageId
			? formatMessageId(original.messageId)
			: null;

		let references: string[] = [];

		if (original.references) {
			try {
				const parsedRefs = JSON.parse(original.references);
				if (Array.isArray(parsedRefs)) {
					references = parsedRefs
						.map((ref) => formatMessageId(ref))
						.filter((ref) => ref.length > 0);
				}
			} catch (e) {
				console.error("Failed to parse references:", e);
			}
		}

		if (original.messageId) {
			const formattedId = formatMessageId(original.messageId);
			if (!references.includes(formattedId)) {
				references.push(formattedId);
			}
		}

		const referencesString = references.join(" ");

		console.log("💾 Creating email record:", replyEmailId);

		await db.insert(sentEmails).values({
			id: replyEmailId,
			from: formattedFromAddress,
			fromAddress,
			fromDomain,
			to: JSON.stringify(toAddresses),
			cc: null,
			bcc: null,
			replyTo: null,
			subject,
			textBody: body.text || "",
			htmlBody: body.html || null,
			headers: JSON.stringify({
				"In-Reply-To": inReplyTo,
				References: referencesString,
				...(body.headers || {}),
			}),
			attachments:
				processedAttachments.length > 0
					? JSON.stringify(attachmentsToStorageFormat(processedAttachments))
					: null,
			tags: body.tags ? JSON.stringify(body.tags) : null,
			status: SENT_EMAIL_STATUS.PENDING,
			messageId,
			userId,
			idempotencyKey,
			createdAt: new Date(),
			updatedAt: new Date(),
		});

		// Process threading for sent email
		try {
			const threadingResult = await EmailThreader.processSentEmailForThreading(
				replyEmailId,
				emailId,
				userId,
			);
			console.log(
				`🧵 Reply ${replyEmailId} added to thread ${threadingResult.threadId} at position ${threadingResult.threadPosition}`,
			);
		} catch (threadingError) {
			console.error(
				`⚠️ Threading failed for reply ${replyEmailId}:`,
				threadingError,
			);
		}

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
				.where(eq(sentEmails.id, replyEmailId));

			set.status = 500;
			return { error: "Email service not configured. Please contact support." };
		}

		try {
			console.log("📤 Sending reply email via AWS SES");

			// Build raw email message
			const boundary = `----=_Part_${Date.now()}_${Math.random().toString(36).substring(2)}`;
			let rawMessage = "";

			const formattedMessageId = formatMessageId(messageId);

			rawMessage += `From: ${formattedFromAddress}\r\n`;
			rawMessage += `To: ${toAddresses.join(", ")}\r\n`;
			rawMessage += `Subject: ${subject}\r\n`;
			rawMessage += `Message-ID: ${formattedMessageId}\r\n`;

			if (inReplyTo) {
				rawMessage += `In-Reply-To: ${inReplyTo}\r\n`;
			}
			if (referencesString) {
				rawMessage += `References: ${referencesString}\r\n`;
			}

			if (body.headers) {
				for (const [key, value] of Object.entries(body.headers)) {
					if (
						![
							"from",
							"to",
							"subject",
							"message-id",
							"in-reply-to",
							"references",
						].includes(key.toLowerCase())
					) {
						rawMessage += `${key}: ${value}\r\n`;
					}
				}
			}

			rawMessage += `Date: ${formatEmailDate(new Date())}\r\n`;
			rawMessage += `MIME-Version: 1.0\r\n`;

			// Handle content and attachments
			if (processedAttachments.length > 0) {
				rawMessage += `Content-Type: multipart/mixed; boundary="${boundary}"\r\n\r\n`;
				rawMessage += `--${boundary}\r\n`;

				if (body.html && body.text) {
					const altBoundary = `----=_Alt_${Date.now()}_${Math.random().toString(36).substring(2)}`;
					rawMessage += `Content-Type: multipart/alternative; boundary="${altBoundary}"\r\n\r\n`;

					rawMessage += `--${altBoundary}\r\n`;
					rawMessage += `Content-Type: text/plain; charset=UTF-8\r\n`;
					rawMessage += `Content-Transfer-Encoding: quoted-printable\r\n\r\n`;
					rawMessage += `${body.text}\r\n`;

					rawMessage += `--${altBoundary}\r\n`;
					rawMessage += `Content-Type: text/html; charset=UTF-8\r\n`;
					rawMessage += `Content-Transfer-Encoding: quoted-printable\r\n\r\n`;
					rawMessage += `${body.html}\r\n`;

					rawMessage += `--${altBoundary}--\r\n`;
				} else if (body.html) {
					rawMessage += `Content-Type: text/html; charset=UTF-8\r\n`;
					rawMessage += `Content-Transfer-Encoding: quoted-printable\r\n\r\n`;
					rawMessage += `${body.html}\r\n`;
				} else {
					rawMessage += `Content-Type: text/plain; charset=UTF-8\r\n`;
					rawMessage += `Content-Transfer-Encoding: quoted-printable\r\n\r\n`;
					rawMessage += `${body.text}\r\n`;
				}

				for (const attachment of processedAttachments) {
					rawMessage += `--${boundary}\r\n`;
					rawMessage += `Content-Type: ${attachment.contentType}\r\n`;
					rawMessage += `Content-Transfer-Encoding: base64\r\n`;
					rawMessage += `Content-Disposition: attachment; filename="${attachment.filename}"\r\n\r\n`;
					rawMessage += `${attachment.content}\r\n`;
				}

				rawMessage += `--${boundary}--\r\n`;
			} else {
				if (body.html && body.text) {
					rawMessage += `Content-Type: multipart/alternative; boundary="${boundary}"\r\n\r\n`;

					rawMessage += `--${boundary}\r\n`;
					rawMessage += `Content-Type: text/plain; charset=UTF-8\r\n`;
					rawMessage += `Content-Transfer-Encoding: quoted-printable\r\n\r\n`;
					rawMessage += `${body.text}\r\n`;

					rawMessage += `--${boundary}\r\n`;
					rawMessage += `Content-Type: text/html; charset=UTF-8\r\n`;
					rawMessage += `Content-Transfer-Encoding: quoted-printable\r\n\r\n`;
					rawMessage += `${body.html}\r\n`;

					rawMessage += `--${boundary}--\r\n`;
				} else if (body.html) {
					rawMessage += `Content-Type: text/html; charset=UTF-8\r\n`;
					rawMessage += `Content-Transfer-Encoding: quoted-printable\r\n\r\n`;
					rawMessage += `${body.html}\r\n`;
				} else {
					rawMessage += `Content-Type: text/plain; charset=UTF-8\r\n`;
					rawMessage += `Content-Transfer-Encoding: quoted-printable\r\n\r\n`;
					rawMessage += `${body.text}\r\n`;
				}
			}

			// Get tenant sending info
			const parentDomain = isSubdomain(fromDomain)
				? getRootDomain(fromDomain)
				: undefined;
			const tenantSendingInfo: TenantSendingInfo =
				await getTenantSendingInfoForDomainOrParent(
					userId,
					fromDomain,
					parentDomain || undefined,
				);

			if (!tenantSendingInfo.identityArn) {
				console.error(
					`❌ Failed to get identity ARN for ${fromAddress}. Cannot send reply email.`,
				);
				await db
					.update(sentEmails)
					.set({
						status: SENT_EMAIL_STATUS.FAILED,
						failureReason: `Failed to get identity ARN for ${fromAddress}`,
						updatedAt: new Date(),
					})
					.where(eq(sentEmails.id, replyEmailId));

				set.status = 500;
				return {
					error: `Failed to get identity ARN for ${fromAddress}. Please ensure the email is verified and associated with a tenant.`,
				};
			}

			const sesCommand = new SendEmailCommand({
				FromEmailAddress: formattedFromAddress,
				...(tenantSendingInfo.identityArn && {
					FromEmailAddressIdentityArn: tenantSendingInfo.identityArn,
				}),
				Destination: {
					ToAddresses: toAddresses.map(extractEmailAddress),
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

			const sesResponse = await sesClient.send(sesCommand);
			const sesMessageId = sesResponse.MessageId;

			console.log("✅ Reply sent successfully via SES:", sesMessageId);

			// Update email record with success
			await db
				.update(sentEmails)
				.set({
					status: SENT_EMAIL_STATUS.SENT,
					sesMessageId: sesMessageId,
					providerResponse: JSON.stringify(sesResponse),
					sentAt: new Date(),
					updatedAt: new Date(),
				})
				.where(eq(sentEmails.id, replyEmailId));

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
				evaluateSending(replyEmailId, userId, {
					from: formattedFromAddress,
					to: toAddresses,
					subject: subject,
					textBody: body.text,
					htmlBody: body.html,
				}),
			);

			// Check for sending spikes (non-blocking)
			waitUntil(checkSendingSpike(userId));

			console.log("✅ Reply processing complete");
			return {
				id: replyEmailId,
				message_id: messageId,
				aws_message_id: sesMessageId || "",
				replied_to_email_id: emailId,
				replied_to_thread_id: resolvedId.threadId,
				is_thread_reply: isThreadReply,
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
				.where(eq(sentEmails.id, replyEmailId));

			set.status = 500;
			return { error: "Failed to send reply. Please try again later." };
		}
	},
	{
		params: t.Object({
			id: t.String({ description: "Email ID or Thread ID to reply to" }),
		}),
		body: ReplyEmailBodySchema,
		response: {
			200: ReplyEmailSuccessResponse,
			400: ReplyEmailErrorResponse,
			401: ReplyEmailErrorResponse,
			403: ReplyEmailErrorResponse,
			404: ReplyEmailErrorResponse,
			429: ReplyEmailErrorResponse,
			500: ReplyEmailErrorResponse,
		},
		detail: {
			tags: ["Emails"],
			summary: "Reply to an email",
			description:
				"Reply to an email or thread. Accepts either an email ID or thread ID (replies to latest message in thread). Supports reply all functionality.",
		},
	},
);
