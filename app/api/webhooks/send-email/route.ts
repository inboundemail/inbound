import { Receiver } from "@upstash/qstash";
import { waitUntil } from "@vercel/functions";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { type NextRequest, NextResponse } from "next/server";
import type { PostEmailsRequest } from "@/lib/api-types";
import { getSesClient } from "@/lib/aws-ses/ses-client";
import { db } from "@/lib/db";
import {
	SCHEDULED_EMAIL_STATUS,
	SENT_EMAIL_STATUS,
	scheduledEmails,
	sentEmails,
} from "@/lib/db/schema";
import {
	canUserSendFromEmail,
	extractEmailAddress,
} from "@/lib/email-management/agent-email-helper";
import { evaluateSending } from "@/lib/email-management/email-evaluation";
import { enforceOutboundSendGuard } from "@/lib/email-management/outbound-send-guard";
import { checkSendingSpike } from "@/lib/email-management/sending-spike-detector";
import { normalizeAttachments } from "@/lib/utils/attachment-utils";
import { buildRawEmailMessage } from "../../e2/helper/email-builder";
import { buildSesCommand } from "./build-ses-command";
import { resolveTenantInfo } from "./resolve-tenant-info";

/**
 * POST /api/webhooks/send-email
 * QStash webhook for processing scheduled emails
 *
 * This endpoint is called by QStash when a scheduled email is due to be sent.
 *
 * Security: Protected by QStash signature verification
 * Has tests? ❌ (TODO)
 * Has logging? ✅
 * Has types? ✅
 */

const sesClient = getSesClient();

// Initialize QStash receiver for signature verification
const qstashReceiver = new Receiver({
	currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY!,
	nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY!,
});

interface QStashPayload {
	type: "scheduled" | "batch";
	scheduledEmailId?: string; // for scheduled
	emailId?: string; // for batch
	userId?: string; // for batch
	emailData?: PostEmailsRequest; // for batch
	batchId?: string; // for batch
	batchIndex?: number; // for batch
}

export async function POST(request: NextRequest) {
	console.log("📨 QStash Webhook - Received scheduled email request");

	try {
		// Verify QStash signature
		const signature = request.headers.get("upstash-signature");
		if (!signature) {
			console.error("❌ QStash Webhook - Missing signature");
			return NextResponse.json({ error: "Missing signature" }, { status: 401 });
		}

		// Get raw body for signature verification
		const body = await request.text();

		try {
			await qstashReceiver.verify({
				signature,
				body,
			});
			console.log("✅ QStash signature verified");
		} catch (verifyError) {
			console.error("❌ QStash signature verification failed:", verifyError);
			return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
		}

		// Parse the payload
		const payload: QStashPayload = JSON.parse(body);

		// Route to appropriate handler based on type
		if (payload.type === "batch") {
			return handleBatchEmail(request, payload, body);
		} else if (payload.type === "scheduled") {
			return handleScheduledEmail(payload);
		} else {
			console.error("❌ QStash Webhook - Invalid payload type:", payload.type);
			return NextResponse.json(
				{ error: "Invalid payload type" },
				{ status: 400 },
			);
		}
	} catch (error) {
		console.error(
			"💥 Unexpected error in POST /api/webhooks/send-email:",
			error,
		);
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 },
		);
	}
}

// Handler for scheduled emails
async function handleScheduledEmail(payload: QStashPayload) {
	if (!payload.scheduledEmailId) {
		console.error("❌ QStash Webhook - Missing scheduledEmailId");
		return NextResponse.json(
			{ error: "Missing scheduledEmailId" },
			{ status: 400 },
		);
	}

	const { scheduledEmailId } = payload;
	console.log("📧 Processing scheduled email:", scheduledEmailId);

	try {
		// Check if SES is configured
		if (!sesClient) {
			console.error("❌ AWS SES not configured");
			return NextResponse.json(
				{
					error: "AWS SES not configured",
				},
				{ status: 500 },
			);
		}

		// Fetch the scheduled email from database
		const [scheduledEmail] = await db
			.select()
			.from(scheduledEmails)
			.where(eq(scheduledEmails.id, scheduledEmailId))
			.limit(1);

		if (!scheduledEmail) {
			console.error("❌ Scheduled email not found:", scheduledEmailId);
			// Return 400 so QStash doesn't retry (email was deleted/doesn't exist)
			return NextResponse.json(
				{ error: "Scheduled email not found" },
				{ status: 400 },
			);
		}

		// Check if already processed
		if (scheduledEmail.status === SCHEDULED_EMAIL_STATUS.SENT) {
			console.log("✅ Email already sent, skipping:", scheduledEmailId);
			return NextResponse.json(
				{ message: "Email already sent" },
				{ status: 200 },
			);
		}

		if (scheduledEmail.status === SCHEDULED_EMAIL_STATUS.CANCELLED) {
			console.log("⏭️ Email was cancelled, skipping:", scheduledEmailId);
			return NextResponse.json(
				{ message: "Email was cancelled" },
				{ status: 200 },
			);
		}

		const scheduledFromAddress = extractEmailAddress(
			scheduledEmail.fromAddress,
		);
		const { isAgentEmail } = canUserSendFromEmail(scheduledEmail.fromAddress);
		const scheduledGuard = await enforceOutboundSendGuard({
			userId: scheduledEmail.userId,
			fromAddress: scheduledFromAddress,
			fromDomain: scheduledEmail.fromDomain,
			isAgentEmail,
		});
		if (!scheduledGuard.allowed) {
			console.log(
				`🚫 Blocking scheduled email for user ${scheduledEmail.userId}: ${scheduledGuard.reasonCode}`,
			);

			// Update scheduled email status to failed
			await db
				.update(scheduledEmails)
				.set({
					status: SCHEDULED_EMAIL_STATUS.FAILED,
					lastError: `Email blocked: ${scheduledGuard.error || "Outbound security guard"}`,
					updatedAt: new Date(),
				})
				.where(eq(scheduledEmails.id, scheduledEmailId));

			// Return 200 so QStash doesn't retry - this is intentional blocking
			return NextResponse.json(
				{
					error: scheduledGuard.error || "Email blocked",
					reason: scheduledGuard.reasonCode,
				},
				{ status: 200 },
			);
		}

		// Mark as processing to prevent duplicate processing
		await db
			.update(scheduledEmails)
			.set({
				status: SCHEDULED_EMAIL_STATUS.PROCESSING,
				attempts: (scheduledEmail.attempts || 0) + 1,
				updatedAt: new Date(),
			})
			.where(eq(scheduledEmails.id, scheduledEmailId));

		// Parse email data
		const toAddresses = JSON.parse(scheduledEmail.toAddresses);
		const ccAddresses = scheduledEmail.ccAddresses
			? JSON.parse(scheduledEmail.ccAddresses)
			: [];
		const bccAddresses = scheduledEmail.bccAddresses
			? JSON.parse(scheduledEmail.bccAddresses)
			: [];
		const replyToAddresses = scheduledEmail.replyToAddresses
			? JSON.parse(scheduledEmail.replyToAddresses)
			: [];
		const headers = scheduledEmail.headers
			? JSON.parse(scheduledEmail.headers)
			: undefined;
		const rawAttachments = scheduledEmail.attachments
			? JSON.parse(scheduledEmail.attachments)
			: [];

		// Validate and fix attachment data - ensure contentType is set
		const attachments = normalizeAttachments(rawAttachments);

		// Create sent email record first (for tracking)
		const sentEmailId = nanoid();
		const sentEmailData = {
			id: sentEmailId,
			from: scheduledEmail.fromAddress,
			fromAddress: scheduledFromAddress,
			fromDomain: scheduledEmail.fromDomain,
			to: JSON.stringify(toAddresses),
			cc: ccAddresses.length > 0 ? JSON.stringify(ccAddresses) : null,
			bcc: bccAddresses.length > 0 ? JSON.stringify(bccAddresses) : null,
			replyTo:
				replyToAddresses.length > 0 ? JSON.stringify(replyToAddresses) : null,
			subject: scheduledEmail.subject,
			textBody: scheduledEmail.textBody,
			htmlBody: scheduledEmail.htmlBody,
			headers: scheduledEmail.headers,
			attachments: scheduledEmail.attachments,
			tags: scheduledEmail.tags,
			status: SENT_EMAIL_STATUS.PENDING,
			provider: "ses",
			userId: scheduledEmail.userId,
			createdAt: new Date(),
			updatedAt: new Date(),
		};

		const [createdSentEmail] = await db
			.insert(sentEmails)
			.values(sentEmailData)
			.returning();

		// Build raw email message
		console.log("📧 Building raw email message for scheduled email");
		const rawMessage = buildRawEmailMessage({
			from: scheduledEmail.fromAddress,
			to: toAddresses,
			cc: ccAddresses.length > 0 ? ccAddresses : undefined,
			bcc: bccAddresses.length > 0 ? bccAddresses : undefined,
			replyTo: replyToAddresses.length > 0 ? replyToAddresses : undefined,
			subject: scheduledEmail.subject,
			textBody: scheduledEmail.textBody || undefined,
			htmlBody: scheduledEmail.htmlBody || undefined,
			customHeaders: headers,
			attachments,
			date: new Date(),
		});

		// Resolve tenant sending info and build SES command
		const tenantSendingInfo = await resolveTenantInfo(
			scheduledEmail.userId,
			scheduledEmail.fromDomain,
			isAgentEmail,
			"scheduled email",
		);

		const rawCommand = buildSesCommand({
			fromAddress: scheduledEmail.fromAddress,
			toAddresses,
			ccAddresses,
			bccAddresses,
			rawMessage,
			tenantSendingInfo,
		});

		const sesResponse = await sesClient.send(rawCommand);
		const messageId = sesResponse.MessageId;

		console.log("✅ Scheduled email sent successfully via SES:", messageId);

		// Update both records with success
		await Promise.all([
			// Update scheduled email
			db
				.update(scheduledEmails)
				.set({
					status: SCHEDULED_EMAIL_STATUS.SENT,
					sentAt: new Date(),
					sentEmailId: createdSentEmail.id,
					updatedAt: new Date(),
				})
				.where(eq(scheduledEmails.id, scheduledEmailId)),

			// Update sent email
			db
				.update(sentEmails)
				.set({
					status: SENT_EMAIL_STATUS.SENT,
					messageId: messageId,
					providerResponse: JSON.stringify(sesResponse),
					sentAt: new Date(),
					updatedAt: new Date(),
				})
				.where(eq(sentEmails.id, createdSentEmail.id)),
		]);

		// Evaluate email for security risks (non-blocking)
		waitUntil(
			evaluateSending(createdSentEmail.id, scheduledEmail.userId, {
				from: scheduledEmail.fromAddress,
				to: toAddresses,
				subject: scheduledEmail.subject,
				textBody: scheduledEmail.textBody || undefined,
				htmlBody: scheduledEmail.htmlBody || undefined,
			}),
		);

		// Check for sending spikes (non-blocking)
		waitUntil(checkSendingSpike(scheduledEmail.userId));

		console.log("✅ Scheduled email processed successfully:", scheduledEmailId);

		return NextResponse.json(
			{
				success: true,
				emailId: scheduledEmailId,
				messageId: messageId,
			},
			{ status: 200 },
		);
	} catch (error) {
		console.error(
			"❌ QStash Webhook - Error processing scheduled email:",
			error,
		);

		const errorMessage =
			error instanceof Error ? error.message : "Unknown error";

		// Try to update the scheduled email with error info
		try {
			if (payload.scheduledEmailId) {
				await db
					.update(scheduledEmails)
					.set({
						lastError: errorMessage,
						updatedAt: new Date(),
					})
					.where(eq(scheduledEmails.id, payload.scheduledEmailId));
			}
		} catch (updateError) {
			console.error("❌ Failed to update error in database:", updateError);
		}

		// Return 500 so QStash will retry
		return NextResponse.json(
			{
				error: "Failed to process scheduled email",
				details: errorMessage,
			},
			{ status: 500 },
		);
	}
}

// Handler for batch emails
async function handleBatchEmail(
	_request: NextRequest,
	payload: QStashPayload,
	_body: string,
) {
	if (!payload.emailId || !payload.userId || !payload.emailData) {
		console.error("❌ QStash Webhook - Missing required batch fields");
		return NextResponse.json(
			{ error: "Missing required batch fields" },
			{ status: 400 },
		);
	}

	const { emailId, userId, batchId, batchIndex } = payload;
	console.log("📧 Processing batch email:", { emailId, batchId, batchIndex });

	// Check if SES is configured
	if (!sesClient) {
		console.error("❌ AWS SES not configured");
		return NextResponse.json(
			{
				error: "AWS SES not configured",
			},
			{ status: 500 },
		);
	}

	// Fetch the pending sent email record
	const [sentEmail] = await db
		.select()
		.from(sentEmails)
		.where(eq(sentEmails.id, emailId))
		.limit(1);

	if (!sentEmail) {
		console.error("❌ Sent email not found:", emailId);
		return NextResponse.json(
			{ error: "Sent email not found" },
			{ status: 400 },
		);
	}

	const effectiveUserId = sentEmail.userId;
	if (effectiveUserId !== userId) {
		console.error("❌ QStash Webhook - Payload userId mismatch", {
			emailId,
			payloadUserId: userId,
			recordUserId: effectiveUserId,
		});
		return NextResponse.json(
			{ error: "Invalid batch payload user association" },
			{ status: 400 },
		);
	}

	// Check if already processed
	if (sentEmail.status === SENT_EMAIL_STATUS.SENT) {
		console.log("✅ Email already sent, skipping:", emailId);
		return NextResponse.json(
			{ message: "Email already sent" },
			{ status: 200 },
		);
	}

	if (sentEmail.status === SENT_EMAIL_STATUS.FAILED) {
		console.log("⚠️ Email previously failed, retrying:", emailId);
	}

	const batchFromAddress = extractEmailAddress(sentEmail.from);
	const { isAgentEmail: batchIsAgentEmail } = canUserSendFromEmail(
		sentEmail.from,
	);
	const batchGuard = await enforceOutboundSendGuard({
		userId: effectiveUserId,
		fromAddress: batchFromAddress,
		fromDomain: sentEmail.fromDomain,
		isAgentEmail: batchIsAgentEmail,
	});
	if (!batchGuard.allowed) {
		console.log(
			`🚫 Blocking batch email for user ${effectiveUserId}: ${batchGuard.reasonCode}`,
		);

		// Update sent email status to failed
		await db
			.update(sentEmails)
			.set({
				status: SENT_EMAIL_STATUS.FAILED,
				failureReason: `Email blocked: ${batchGuard.error || "Outbound security guard"}`,
				updatedAt: new Date(),
			})
			.where(eq(sentEmails.id, emailId));

		// Return 200 so QStash doesn't retry - this is intentional blocking
		return NextResponse.json(
			{
				error: batchGuard.error || "Email blocked",
				reason: batchGuard.reasonCode,
			},
			{ status: 200 },
		);
	}

	try {
		// Parse email data
		const toAddresses = JSON.parse(sentEmail.to);
		const ccAddresses = sentEmail.cc ? JSON.parse(sentEmail.cc) : [];
		const bccAddresses = sentEmail.bcc ? JSON.parse(sentEmail.bcc) : [];
		const replyToAddresses = sentEmail.replyTo
			? JSON.parse(sentEmail.replyTo)
			: [];
		const headers = sentEmail.headers
			? JSON.parse(sentEmail.headers)
			: undefined;
		const rawAttachments = sentEmail.attachments
			? JSON.parse(sentEmail.attachments)
			: [];

		// Validate and fix attachment data - ensure contentType is set
		const attachments = normalizeAttachments(rawAttachments);

		// Build raw email message
		console.log("📧 Building raw email message for batch email");
		const rawMessage = buildRawEmailMessage({
			from: sentEmail.from,
			to: toAddresses,
			cc: ccAddresses.length > 0 ? ccAddresses : undefined,
			bcc: bccAddresses.length > 0 ? bccAddresses : undefined,
			replyTo: replyToAddresses.length > 0 ? replyToAddresses : undefined,
			subject: sentEmail.subject,
			textBody: sentEmail.textBody || undefined,
			htmlBody: sentEmail.htmlBody || undefined,
			customHeaders: headers,
			attachments,
			date: new Date(),
		});

		// Resolve tenant sending info and build SES command
		const batchTenantInfo = await resolveTenantInfo(
			effectiveUserId,
			sentEmail.fromDomain,
			batchIsAgentEmail,
			"batch email",
		);

		const rawCommand = buildSesCommand({
			fromAddress: sentEmail.from,
			toAddresses,
			ccAddresses,
			bccAddresses,
			rawMessage,
			tenantSendingInfo: batchTenantInfo,
		});

		const sesResponse = await sesClient.send(rawCommand);
		const messageId = sesResponse.MessageId;

		console.log("✅ Batch email sent successfully via SES:", messageId);

		// Update sent email record with success
		await db
			.update(sentEmails)
			.set({
				status: SENT_EMAIL_STATUS.SENT,
				messageId: messageId,
				providerResponse: JSON.stringify(sesResponse),
				sentAt: new Date(),
				updatedAt: new Date(),
			})
			.where(eq(sentEmails.id, emailId));

		// Track email usage with Autumn (blocking - every email must count towards quota)
		try {
			const { Autumn: autumn } = await import("autumn-js");
			const { data: emailCheck } = await autumn.check({
				customer_id: effectiveUserId,
				feature_id: "emails_sent",
			});

			if (emailCheck && !emailCheck.unlimited) {
				console.log("📊 Tracking email usage with Autumn");
				const { error: trackError } = await autumn.track({
					customer_id: effectiveUserId,
					feature_id: "emails_sent",
					value: 1,
				});

				if (trackError) {
					console.error("❌ Failed to track email usage:", trackError);
					// Don't fail the request if tracking fails, but log it
				}
			}
		} catch (trackError) {
			console.error("❌ Failed to track email usage:", trackError);
			// Don't fail the request if tracking fails
		}

		// Evaluate email for security risks (non-blocking)
		waitUntil(
			evaluateSending(emailId, effectiveUserId, {
				from: sentEmail.from,
				to: toAddresses,
				subject: sentEmail.subject,
				textBody: sentEmail.textBody || undefined,
				htmlBody: sentEmail.htmlBody || undefined,
			}),
		);

		// Check for sending spikes (non-blocking)
		waitUntil(checkSendingSpike(effectiveUserId));

		console.log("✅ Batch email processed successfully:", emailId);

		return NextResponse.json(
			{
				success: true,
				emailId: emailId,
				messageId: messageId,
			},
			{ status: 200 },
		);
	} catch (error) {
		console.error("❌ QStash Webhook - Error processing batch email:", error);

		const errorMessage =
			error instanceof Error ? error.message : "Unknown error";

		// Update sent email record with error
		try {
			await db
				.update(sentEmails)
				.set({
					status: SENT_EMAIL_STATUS.FAILED,
					failureReason: errorMessage,
					providerResponse: JSON.stringify(error),
					updatedAt: new Date(),
				})
				.where(eq(sentEmails.id, emailId));
		} catch (updateError) {
			console.error("❌ Failed to update error in database:", updateError);
		}

		// Return 500 so QStash will retry
		return NextResponse.json(
			{
				error: "Failed to process batch email",
				details: errorMessage,
			},
			{ status: 500 },
		);
	}
}
