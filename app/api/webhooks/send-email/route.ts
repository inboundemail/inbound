import {
	SESv2Client,
	SendEmailCommand,
	type SendEmailCommandOutput,
} from "@aws-sdk/client-sesv2";
import { Receiver } from "@upstash/qstash";
import { waitUntil } from "@vercel/functions";
import { Autumn as autumn } from "autumn-js";
import { and, eq, inArray, isNull, notExists, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { type NextRequest, NextResponse } from "next/server";
import {
	bulkHourlyRetryDeduplicationId,
	computeHourlyLimitRetryAtSeconds,
	isRetryableSesThrottlingError,
} from "@/app/api/e2/emails/bulk-helpers";
import {
	getBulkQueueConfig,
	mergeBatchQstashMessageIds,
	publishBulkQueueMessages,
} from "@/app/api/e2/emails/bulk-queue";
import type { ProcessedAttachment } from "@/app/api/e2/helper/attachment-processor";
import { buildSentEmailTags } from "@/app/api/e2/helper/ses-email-tags";
import {
	getAgentIdentityArn,
	getTenantSendingInfoForDomainOrParent,
	type TenantSendingInfo,
} from "@/lib/aws-ses/identity-arn-helper";
import { db } from "@/lib/db";
import {
	BULK_EMAIL_ITEM_STATUS,
	EMAIL_BATCH_STATUS,
	emailBatches,
	SCHEDULED_EMAIL_STATUS,
	SENT_EMAIL_STATUS,
	scheduledEmails,
	sentEmails,
} from "@/lib/db/schema";
import { getRootDomain, isSubdomain } from "@/lib/domains-and-dns/domain-utils";
import {
	canUserSendFromEmail,
	extractEmailAddress,
} from "@/lib/email-management/agent-email-helper";
import { checkRecipientsAgainstBlocklist } from "@/lib/email-management/email-blocking";
import { evaluateSending } from "@/lib/email-management/email-evaluation";
import { enforceOutboundSendGuard } from "@/lib/email-management/outbound-send-guard";
import { checkSendingSpike } from "@/lib/email-management/sending-spike-detector";
import { buildRawEmailMessage } from "../../e2/helper/email-builder";

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
} else {
	console.warn(
		"⚠️ AWS credentials not configured. Scheduled email processing will not work.",
	);
}

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
	batchId?: string; // for batch
	batchIndex?: number; // for batch
}

interface StoredAttachment {
	filename?: string;
	contentType?: string;
	content_type?: string;
	[key: string]: unknown;
}

function fallbackContentTypeForFilename(filename: string): string {
	const ext = filename.toLowerCase().split(".").pop();
	switch (ext) {
		case "pdf":
			return "application/pdf";
		case "jpg":
		case "jpeg":
			return "image/jpeg";
		case "png":
			return "image/png";
		case "gif":
			return "image/gif";
		case "txt":
			return "text/plain";
		case "html":
			return "text/html";
		case "json":
			return "application/json";
		case "zip":
			return "application/zip";
		case "doc":
			return "application/msword";
		case "docx":
			return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
		case "xls":
			return "application/vnd.ms-excel";
		case "xlsx":
			return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
		default:
			return "application/octet-stream";
	}
}

/**
 * Converts stored attachment rows (attachmentsToStorageFormat shape) back
 * into the ProcessedAttachment shape buildRawEmailMessage expects, filling
 * a content-type fallback for legacy rows that lack one.
 */
function normalizeStoredAttachments(
	rawAttachments: StoredAttachment[],
): ProcessedAttachment[] {
	return rawAttachments.map((att, index) => {
		let contentType = att.contentType || att.content_type;
		if (!contentType) {
			console.log(
				`⚠️ Attachment ${index + 1} missing contentType, using fallback`,
			);
			contentType = fallbackContentTypeForFilename(att.filename || "unknown");
		}

		return {
			content: typeof att.content === "string" ? att.content : "",
			filename: att.filename || "unknown",
			contentType,
			size: typeof att.size === "number" ? att.size : 0,
			...(typeof att.content_id === "string" && {
				content_id: att.content_id,
			}),
		};
	});
}

async function incrementBatchCounter(
	batchId: string,
	column: "sentCount" | "failedCount" | "cancelledCount",
): Promise<void> {
	try {
		await db
			.update(emailBatches)
			.set(
				column === "sentCount"
					? {
							sentCount: sql`${emailBatches.sentCount} + 1`,
							updatedAt: new Date(),
						}
					: column === "failedCount"
						? {
								failedCount: sql`${emailBatches.failedCount} + 1`,
								updatedAt: new Date(),
							}
						: {
								cancelledCount: sql`${emailBatches.cancelledCount} + 1`,
								updatedAt: new Date(),
							},
			)
			.where(eq(emailBatches.id, batchId));

		// Last finisher flips the batch to completed. Counters are advisory;
		// the flip condition re-reads them atomically inside one statement.
		await db
			.update(emailBatches)
			.set({
				status: EMAIL_BATCH_STATUS.COMPLETED,
				completedAt: new Date(),
				updatedAt: new Date(),
			})
			.where(
				and(
					eq(emailBatches.id, batchId),
					inArray(emailBatches.status, [
						EMAIL_BATCH_STATUS.QUEUED,
						EMAIL_BATCH_STATUS.PARTIALLY_QUEUED,
					]),
					sql`${emailBatches.sentCount} + ${emailBatches.failedCount} + ${emailBatches.cancelledCount} >= ${emailBatches.total}`,
				),
			);

		// A batch cancelled while items were still processing keeps its
		// CANCELLED status, but the last terminal item must still stamp
		// completedAt so the batch reads as finished.
		await db
			.update(emailBatches)
			.set({
				completedAt: new Date(),
				updatedAt: new Date(),
			})
			.where(
				and(
					eq(emailBatches.id, batchId),
					eq(emailBatches.status, EMAIL_BATCH_STATUS.CANCELLED),
					isNull(emailBatches.completedAt),
					sql`${emailBatches.sentCount} + ${emailBatches.failedCount} + ${emailBatches.cancelledCount} >= ${emailBatches.total}`,
				),
			);
	} catch (error) {
		console.error("❌ Failed to update batch counters:", error);
	}
}

async function failBulkItem(params: {
	emailId: string;
	batchId: string | null;
	reason: string;
	providerResponse?: string;
}): Promise<void> {
	const failedRows = await db
		.update(sentEmails)
		.set({
			status: BULK_EMAIL_ITEM_STATUS.FAILED,
			failureReason: params.reason,
			...(params.providerResponse && {
				providerResponse: params.providerResponse,
			}),
			updatedAt: new Date(),
		})
		.where(
			and(
				eq(sentEmails.id, params.emailId),
				eq(sentEmails.status, BULK_EMAIL_ITEM_STATUS.PROCESSING),
			),
		)
		.returning({ id: sentEmails.id });

	if (params.batchId && failedRows.length > 0) {
		await incrementBatchCounter(params.batchId, "failedCount");
	}
}

type BulkRequeueOutcome = "requeued" | "cancelled" | "not_processing";

/**
 * Releases a worker claim without ever resurrecting work the user
 * cancelled. A cancel that runs while an item is claimed ('processing')
 * cannot flip that item, so a plain processing -> queued release would
 * re-arm delivery for a CANCELLED parent. This single atomic statement
 * decides the release target from the parent's current status: not
 * cancelled -> back to 'queued'; cancelled -> straight to 'cancelled',
 * with the parent's cancelled accounting corrected here (exactly once —
 * the cancel endpoint never counted this item because it only counts the
 * queued rows it flips itself, and the processing -> cancelled CAS can
 * only ever succeed for one caller).
 */
async function requeueBulkItem(emailId: string): Promise<BulkRequeueOutcome> {
	const releasedRows = await db
		.update(sentEmails)
		.set({
			status: sql`CASE WHEN EXISTS (
				SELECT 1 FROM ${emailBatches}
				WHERE ${emailBatches.id} = ${sentEmails.batchId}
				AND ${emailBatches.status} = ${EMAIL_BATCH_STATUS.CANCELLED}
			) THEN ${BULK_EMAIL_ITEM_STATUS.CANCELLED} ELSE ${BULK_EMAIL_ITEM_STATUS.QUEUED} END`,
			updatedAt: new Date(),
		})
		.where(
			and(
				eq(sentEmails.id, emailId),
				eq(sentEmails.status, BULK_EMAIL_ITEM_STATUS.PROCESSING),
			),
		)
		.returning({ status: sentEmails.status, batchId: sentEmails.batchId });

	const released = releasedRows[0];
	if (!released) {
		return "not_processing";
	}

	if (released.status === BULK_EMAIL_ITEM_STATUS.CANCELLED) {
		console.log(
			"🛑 Parent batch was cancelled while item was claimed - item released as cancelled:",
			emailId,
		);
		if (released.batchId) {
			// Also stamps the parent's completedAt once every item is terminal.
			await incrementBatchCounter(released.batchId, "cancelledCount");
		}
		return "cancelled";
	}

	return "requeued";
}

/**
 * Best-effort claim release before answering 500. If even the release
 * fails (DB fully down), the item is left 'processing'; log loudly because
 * that state only heals via the same DB coming back before QStash retries
 * run out.
 */
async function tryRequeueBulkItem(
	emailId: string,
): Promise<BulkRequeueOutcome | "error"> {
	try {
		return await requeueBulkItem(emailId);
	} catch (requeueError) {
		console.error(
			"🚨 Failed to release bulk item claim - item may be stuck in 'processing':",
			{ emailId, error: requeueError },
		);
		return "error";
	}
}

/**
 * Shared 200 response for transient paths that released a claim and found
 * the parent batch cancelled: the item is now terminally 'cancelled', so
 * QStash must not redeliver.
 */
function bulkItemCancelledResponse(emailId: string): NextResponse {
	return NextResponse.json(
		{ message: "Batch was cancelled; item will not be sent", emailId },
		{ status: 200 },
	);
}

/**
 * Hourly send limit is transient capacity, not a failure: release the
 * claim, then publish a delayed replacement that redelivers this item
 * after the rolling hourly window has aged out. 200 is only returned once
 * the replacement is confirmed; otherwise the item stays 'queued' and this
 * delivery answers 500 so QStash retries the original message.
 */
async function rescheduleBulkItemForHourlyLimit(params: {
	emailId: string;
	userId: string;
	batchId: string;
	batchIndex: number;
}): Promise<NextResponse> {
	console.log(
		"⏳ Hourly send limit reached for bulk item, rescheduling:",
		params.emailId,
	);

	// Release the claim first: a crash after this point leaves the item
	// 'queued', which the retried original delivery can claim again.
	const released = await requeueBulkItem(params.emailId);

	// Cancellation won while the item was claimed: it is now terminally
	// 'cancelled', so no replacement may be published for it.
	if (released === "cancelled") {
		return bulkItemCancelledResponse(params.emailId);
	}

	if (released === "not_processing") {
		// The claim vanished under us (external mutation). Do not publish a
		// replacement for a row in an unknown state; abandoned-publication
		// reconciliation recovers it if it is genuinely still queued.
		console.error(
			"🚨 Bulk item was not 'processing' while its claim was held, skipping reschedule:",
			params.emailId,
		);
		return NextResponse.json(
			{ message: "Item is no longer claimed; reschedule skipped" },
			{ status: 200 },
		);
	}

	const config = getBulkQueueConfig();
	if (!config) {
		console.error(
			"❌ Cannot reschedule bulk item - queue is not configured:",
			params.emailId,
		);
		return NextResponse.json(
			{ error: "Hourly send limit reached and rescheduling is unavailable" },
			{ status: 500 },
		);
	}

	const retryAtSeconds = computeHourlyLimitRetryAtSeconds(Date.now());
	const outcome = await publishBulkQueueMessages({
		config,
		userId: params.userId,
		batchId: params.batchId,
		entries: [
			{
				id: params.emailId,
				batchIndex: params.batchIndex,
				// Timestamped dedup id: never collides with the original
				// message, reconcile republishes, or a later reschedule.
				deduplicationId: bulkHourlyRetryDeduplicationId(
					params.emailId,
					retryAtSeconds,
				),
			},
		],
		notBefore: retryAtSeconds,
	});

	if (outcome.publishedCount === 0) {
		console.error(
			"❌ Failed to publish hourly-limit replacement, item stays queued for retry:",
			{ emailId: params.emailId, error: outcome.errorMessage },
		);
		return NextResponse.json(
			{
				error: "Hourly send limit reached and rescheduling failed, will retry",
			},
			{ status: 500 },
		);
	}

	try {
		await mergeBatchQstashMessageIds(params.batchId, outcome.messageIdMap);
	} catch (mergeError) {
		// Non-fatal: the replacement exists; the id map only aids cancel and
		// abandonment classification.
		console.error(
			"⚠️ Failed to record replacement message id (continuing):",
			mergeError,
		);
	}

	console.log("✅ Bulk item rescheduled past hourly window:", {
		emailId: params.emailId,
		notBefore: retryAtSeconds,
	});
	return NextResponse.json(
		{
			rescheduled: true,
			emailId: params.emailId,
			notBefore: retryAtSeconds,
		},
		{ status: 200 },
	);
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
			return handleBulkEmailItem(payload);
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
		const attachments = normalizeStoredAttachments(rawAttachments);

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
			attachments: attachments,
			date: new Date(),
		});

		// Get the tenant sending info (identity ARN, configuration set, and tenant name) for tenant-level tracking
		const fromDomain = scheduledEmail.fromDomain;

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
				scheduledEmail.userId,
				fromDomain,
				parentDomain || undefined,
			);
		}

		if (tenantSendingInfo.identityArn) {
			console.log(
				`🏢 Using SourceArn for scheduled email tenant tracking: ${tenantSendingInfo.identityArn}`,
			);
		} else {
			console.warn(
				"⚠️ No SourceArn available - scheduled email will not be tracked at tenant level",
			);
		}

		if (tenantSendingInfo.configurationSetName) {
			console.log(
				`📋 Using ConfigurationSet for scheduled email tenant tracking: ${tenantSendingInfo.configurationSetName}`,
			);
		} else {
			console.warn(
				"⚠️ No ConfigurationSet available - scheduled email metrics may not be tracked correctly",
			);
		}

		if (tenantSendingInfo.tenantName) {
			console.log(
				`🏠 Using TenantName for scheduled email AWS SES tracking: ${tenantSendingInfo.tenantName}`,
			);
		} else {
			console.warn(
				"⚠️ No TenantName available - scheduled email will NOT appear in tenant dashboard!",
			);
		}

		// Send via AWS SES using SESv2 SendEmailCommand with TenantName
		// Per AWS docs: https://docs.aws.amazon.com/ses/latest/dg/tenants.html
		// Use full fromAddress (with display name) for proper sender name display
		const rawCommand = new SendEmailCommand({
			FromEmailAddress: scheduledEmail.fromAddress,
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
			EmailTags: buildSentEmailTags(createdSentEmail.id),
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

// Handler for bulk batch email items (payload carries durable IDs only)
async function handleBulkEmailItem(payload: QStashPayload) {
	if (!payload.emailId || !payload.userId || !payload.batchId) {
		console.error("❌ QStash Webhook - Missing required batch fields");
		return NextResponse.json(
			{ error: "Missing required batch fields" },
			{ status: 400 },
		);
	}

	const { emailId, userId, batchId, batchIndex } = payload;
	console.log("📧 Processing bulk email item:", {
		emailId,
		batchId,
		batchIndex,
	});

	if (!sesClient) {
		console.error("❌ AWS SES not configured");
		return NextResponse.json(
			{
				error: "AWS SES not configured",
			},
			{ status: 500 },
		);
	}

	// Atomic compare-and-swap claim: exactly one QStash delivery moves the
	// item from queued -> processing. Retries and concurrent deliveries lose
	// the claim, so an item can never be sent twice. userId and batchId in
	// the WHERE clause mean a mismatched or forged payload can never claim
	// another user's row or a row outside its batch. The claim additionally
	// requires the parent batch to not be CANCELLED, so an item that
	// returned to 'queued' after the cancel's item pass ran (transient
	// requeue, undeleted QStash message, hourly replacement) can never be
	// claimed for delivery once the user's cancel has won.
	const claimedRows = await db
		.update(sentEmails)
		.set({
			status: BULK_EMAIL_ITEM_STATUS.PROCESSING,
			updatedAt: new Date(),
		})
		.where(
			and(
				eq(sentEmails.id, emailId),
				eq(sentEmails.userId, userId),
				eq(sentEmails.batchId, batchId),
				eq(sentEmails.status, BULK_EMAIL_ITEM_STATUS.QUEUED),
				notExists(
					db
						.select({ one: sql`1` })
						.from(emailBatches)
						.where(
							and(
								eq(emailBatches.id, batchId),
								eq(emailBatches.status, EMAIL_BATCH_STATUS.CANCELLED),
							),
						),
				),
			),
		)
		.returning();

	if (claimedRows.length === 0) {
		const [existing] = await db
			.select({
				id: sentEmails.id,
				status: sentEmails.status,
				userId: sentEmails.userId,
				batchId: sentEmails.batchId,
			})
			.from(sentEmails)
			.where(eq(sentEmails.id, emailId))
			.limit(1);

		if (
			!existing ||
			existing.userId !== userId ||
			existing.batchId !== batchId
		) {
			console.error("❌ Bulk item not found or user/batch mismatch:", emailId);
			return NextResponse.json(
				{ error: "Bulk item not found" },
				{ status: 400 },
			);
		}

		if (existing.status === BULK_EMAIL_ITEM_STATUS.QUEUED) {
			const [parent] = await db
				.select({ status: emailBatches.status })
				.from(emailBatches)
				.where(eq(emailBatches.id, batchId))
				.limit(1);

			if (parent?.status === EMAIL_BATCH_STATUS.CANCELLED) {
				// Late cancel sweep: the claim was refused because the parent
				// is CANCELLED. A queued item under a cancelled parent can
				// never be claimed again, so finish the cancellation the
				// cancel endpoint could not see (the item was 'processing'
				// during its pass and was requeued afterwards). The CAS below
				// makes the accounting increment exactly-once.
				const sweptRows = await db
					.update(sentEmails)
					.set({
						status: BULK_EMAIL_ITEM_STATUS.CANCELLED,
						updatedAt: new Date(),
					})
					.where(
						and(
							eq(sentEmails.id, emailId),
							eq(sentEmails.userId, userId),
							eq(sentEmails.batchId, batchId),
							eq(sentEmails.status, BULK_EMAIL_ITEM_STATUS.QUEUED),
						),
					)
					.returning({ id: sentEmails.id });

				if (sweptRows.length > 0) {
					console.log(
						"🛑 Cancelled orphaned queued item of cancelled batch:",
						emailId,
					);
					await incrementBatchCounter(batchId, "cancelledCount");
				}

				return NextResponse.json(
					{ message: "Batch is cancelled; item will not be sent" },
					{ status: 200 },
				);
			}

			// Phantom race: the CAS saw a non-claimable row but it reads
			// 'queued' now (e.g. a concurrent transient requeue landed between
			// the two statements). Let QStash redeliver and claim it properly
			// instead of waiting for abandonment recovery.
			console.warn(
				"⚠️ Bulk item claim raced a concurrent release, retrying via QStash:",
				emailId,
			);
			return NextResponse.json(
				{ error: "Item claim raced a concurrent release, will retry" },
				{ status: 500 },
			);
		}

		// Terminal or in-flight states are final for this delivery: claimed
		// items that crash mid-send stay 'processing' (visible via batch
		// status) rather than risking a duplicate send on retry.
		console.log(
			`⏭️ Bulk item not claimable (status: ${existing.status}), skipping:`,
			emailId,
		);
		return NextResponse.json(
			{ message: `Item not claimable (status: ${existing.status})` },
			{ status: 200 },
		);
	}

	const item = claimedRows[0];
	const itemBatchId = item.batchId;

	// ---- Post-claim, pre-SES phase -------------------------------------
	// Everything here happens provably before any SES call, so an
	// unexpected exception releases the claim (item back to 'queued') and
	// answers 500 for a QStash redelivery. Deliberate outcomes (permanent
	// blocks, malformed content, hourly reschedule) return from inside.
	let emailCheckUnlimited = false;
	let toAddresses: string[] = [];
	let rawCommand: SendEmailCommand;

	try {
		const bulkFromAddress = extractEmailAddress(item.from);
		const { isAgentEmail: bulkIsAgentEmail } = canUserSendFromEmail(item.from);

		// Re-check the outbound guard at execution time (hourly volume, bans,
		// domain verification, tenant state may have changed since
		// acceptance). deny_only: queued bulk work hitting the hourly cap is
		// expected backpressure and must never pause the tenant — a pause
		// would permanently fail every other queued item as tenant_inactive.
		const bulkGuard = await enforceOutboundSendGuard({
			userId,
			fromAddress: bulkFromAddress,
			fromDomain: item.fromDomain,
			isAgentEmail: bulkIsAgentEmail,
			hourlyLimitAction: "deny_only",
		});

		if (!bulkGuard.allowed) {
			if (bulkGuard.reasonCode === "guard_check_failed") {
				// Transient infrastructure failure before any send: release the
				// claim and let QStash retry.
				if ((await tryRequeueBulkItem(emailId)) === "cancelled") {
					return bulkItemCancelledResponse(emailId);
				}
				return NextResponse.json(
					{ error: bulkGuard.error || "Guard check failed" },
					{ status: 500 },
				);
			}

			if (bulkGuard.reasonCode === "hourly_send_limit_exceeded") {
				// Transient capacity, not a failure: requeue and schedule a
				// replacement delivery after the hourly window ages out.
				return await rescheduleBulkItemForHourlyLimit({
					emailId,
					userId,
					batchId,
					batchIndex: item.batchIndex ?? batchIndex ?? 0,
				});
			}

			console.log(
				`🚫 Blocking bulk email for user ${userId}: ${bulkGuard.reasonCode}`,
			);
			await failBulkItem({
				emailId,
				batchId: itemBatchId,
				reason: `Email blocked: ${bulkGuard.error || "Outbound security guard"}`,
			});

			// Return 200 so QStash doesn't retry - this is intentional blocking
			return NextResponse.json(
				{
					error: bulkGuard.error || "Email blocked",
					reason: bulkGuard.reasonCode,
				},
				{ status: 200 },
			);
		}

		let ccAddresses: string[] = [];
		let bccAddresses: string[] = [];
		let replyToAddresses: string[] = [];
		let headers: Record<string, string> | undefined;
		let attachments: ProcessedAttachment[] = [];

		try {
			toAddresses = JSON.parse(item.to);
			ccAddresses = item.cc ? JSON.parse(item.cc) : [];
			bccAddresses = item.bcc ? JSON.parse(item.bcc) : [];
			replyToAddresses = item.replyTo ? JSON.parse(item.replyTo) : [];
			headers = item.headers ? JSON.parse(item.headers) : undefined;
			attachments = normalizeStoredAttachments(
				item.attachments ? JSON.parse(item.attachments) : [],
			);
		} catch (parseError) {
			// Deterministic corruption: a retry cannot fix stored content, so
			// fail permanently instead of looping through requeues.
			console.error("❌ Failed to parse stored bulk item:", parseError);
			await failBulkItem({
				emailId,
				batchId: itemBatchId,
				reason: "Stored email content is malformed",
			});
			return NextResponse.json(
				{ error: "Stored email content is malformed" },
				{ status: 200 },
			);
		}

		// Re-check recipients against the blocklist at execution time.
		const blocklistCheck = await checkRecipientsAgainstBlocklist([
			...toAddresses,
			...ccAddresses,
			...bccAddresses,
		]);
		if (blocklistCheck.hasBlockedRecipients) {
			console.log(
				`🚫 Blocked recipients in bulk item: ${blocklistCheck.blockedAddresses.join(", ")}`,
			);
			await failBulkItem({
				emailId,
				batchId: itemBatchId,
				reason: `Blocked recipient(s): ${blocklistCheck.blockedAddresses.join(", ")}`,
			});
			return NextResponse.json(
				{ error: "Recipients are blocked" },
				{ status: 200 },
			);
		}

		const { data: emailCheck, error: emailCheckError } = await autumn.check({
			customer_id: userId,
			feature_id: "emails_sent",
			required_balance: 1,
		});

		if (emailCheckError) {
			// Transient billing-service failure before any send: retry later.
			console.error("❌ Autumn check error for bulk item:", emailCheckError);
			if ((await tryRequeueBulkItem(emailId)) === "cancelled") {
				return bulkItemCancelledResponse(emailId);
			}
			return NextResponse.json(
				{ error: "Failed to check email sending limits" },
				{ status: 500 },
			);
		}

		if (!emailCheck.allowed) {
			await failBulkItem({
				emailId,
				batchId: itemBatchId,
				reason: "Email sending limit reached",
			});
			return NextResponse.json(
				{ error: "Email sending limit reached" },
				{ status: 200 },
			);
		}

		emailCheckUnlimited = Boolean(emailCheck.unlimited);

		let bulkTenantInfo: TenantSendingInfo = {
			identityArn: null,
			configurationSetName: null,
			tenantName: null,
		};
		if (bulkIsAgentEmail) {
			bulkTenantInfo = {
				identityArn: getAgentIdentityArn(),
				configurationSetName: null,
				tenantName: null,
			};
		} else {
			const bulkParentDomain = isSubdomain(item.fromDomain)
				? getRootDomain(item.fromDomain)
				: undefined;
			bulkTenantInfo = await getTenantSendingInfoForDomainOrParent(
				userId,
				item.fromDomain,
				bulkParentDomain || undefined,
			);
		}

		console.log("📧 Building raw email message for bulk item");
		const rawMessage = buildRawEmailMessage({
			from: item.from,
			to: toAddresses,
			cc: ccAddresses.length > 0 ? ccAddresses : undefined,
			bcc: bccAddresses.length > 0 ? bccAddresses : undefined,
			replyTo: replyToAddresses.length > 0 ? replyToAddresses : undefined,
			subject: item.subject,
			textBody: item.textBody || undefined,
			htmlBody: item.htmlBody || undefined,
			customHeaders: headers,
			attachments: attachments,
			date: new Date(),
		});

		rawCommand = new SendEmailCommand({
			FromEmailAddress: item.from,
			...(bulkTenantInfo.identityArn && {
				FromEmailAddressIdentityArn: bulkTenantInfo.identityArn,
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
			...(bulkTenantInfo.configurationSetName && {
				ConfigurationSetName: bulkTenantInfo.configurationSetName,
			}),
			...(bulkTenantInfo.tenantName && {
				TenantName: bulkTenantInfo.tenantName,
			}),
			EmailTags: buildSentEmailTags(emailId),
		});
	} catch (preSendError) {
		// Nothing has been handed to SES yet, so releasing the claim for a
		// retry is safe.
		console.error("❌ Bulk item pre-send step failed:", preSendError);
		if ((await tryRequeueBulkItem(emailId)) === "cancelled") {
			return bulkItemCancelledResponse(emailId);
		}
		return NextResponse.json(
			{
				error: "Failed to prepare bulk email",
				details:
					preSendError instanceof Error
						? preSendError.message
						: "Unknown error",
			},
			{ status: 500 },
		);
	}

	// ---- SES call: the only operation with an ambiguous failure mode ----
	let sesResponse: SendEmailCommandOutput;
	try {
		sesResponse = await sesClient.send(rawCommand);
	} catch (sesError) {
		console.error("❌ QStash Webhook - Error sending bulk item:", sesError);

		const errorMessage =
			sesError instanceof Error ? sesError.message : "Unknown SES error";

		// SES throttling (TooManyRequestsException / ThrottlingException /
		// HTTP 429 / explicit throttling retry metadata) rejects the request
		// before accepting the message, so releasing the claim for a QStash
		// retry cannot double-send.
		if (isRetryableSesThrottlingError(sesError)) {
			console.log("🔁 SES throttled bulk item, requeueing for retry:", emailId);
			if ((await tryRequeueBulkItem(emailId)) === "cancelled") {
				return bulkItemCancelledResponse(emailId);
			}
			return NextResponse.json(
				{
					error: "SES throttled the send, will retry",
					details: errorMessage,
				},
				{ status: 500 },
			);
		}

		// Any other failure of the send call is ambiguous (the message may
		// have been accepted despite the error), so the item fails
		// permanently instead of being retried - same bias as single send.
		await failBulkItem({
			emailId,
			batchId: itemBatchId,
			reason: errorMessage,
			providerResponse: JSON.stringify(sesError),
		});

		return NextResponse.json(
			{
				error: "Failed to send bulk email",
				details: errorMessage,
			},
			{ status: 200 },
		);
	}

	// ---- Post-SES phase: the mail is delivered (or being delivered). ----
	// Nothing below may mark the item FAILED or requeue it: answering 500
	// here would make QStash redeliver and risk a duplicate send. Failures
	// are logged with enough context for manual reconciliation and the item
	// stays 'processing' (status endpoint shows it honestly as in-flight).
	const messageId = sesResponse.MessageId;
	console.log("✅ Bulk email sent successfully via SES:", messageId);

	let persistenceFailed = false;
	try {
		const sentRows = await db
			.update(sentEmails)
			.set({
				status: SENT_EMAIL_STATUS.SENT,
				messageId: messageId,
				providerResponse: JSON.stringify(sesResponse),
				sentAt: new Date(),
				updatedAt: new Date(),
			})
			.where(
				and(
					eq(sentEmails.id, emailId),
					eq(sentEmails.status, BULK_EMAIL_ITEM_STATUS.PROCESSING),
				),
			)
			.returning({ id: sentEmails.id });

		if (itemBatchId && sentRows.length > 0) {
			await incrementBatchCounter(itemBatchId, "sentCount");
		}
	} catch (persistError) {
		persistenceFailed = true;
		console.error(
			"🚨 Bulk email was SENT via SES but recording the send failed - leaving item 'processing' (NOT failed) to avoid a duplicate send:",
			{
				emailId,
				batchId: itemBatchId,
				sesMessageId: messageId,
				error: persistError,
			},
		);
	}

	try {
		if (!emailCheckUnlimited) {
			console.log("📊 Tracking email usage with Autumn");
			const { error: trackError } = await autumn.track({
				customer_id: userId,
				feature_id: "emails_sent",
				value: 1,
			});

			if (trackError) {
				console.error("❌ Failed to track email usage (email was sent):", {
					emailId,
					sesMessageId: messageId,
					trackError,
				});
			}
		}
	} catch (trackError) {
		console.error("❌ Failed to track email usage (email was sent):", {
			emailId,
			sesMessageId: messageId,
			error: trackError,
		});
	}

	// Evaluate email for security risks (non-blocking)
	waitUntil(
		evaluateSending(emailId, userId, {
			from: item.from,
			to: toAddresses,
			subject: item.subject,
			textBody: item.textBody || undefined,
			htmlBody: item.htmlBody || undefined,
		}),
	);

	// Check for sending spikes (non-blocking)
	waitUntil(checkSendingSpike(userId));

	console.log("✅ Bulk email item processed successfully:", emailId);

	return NextResponse.json(
		{
			success: true,
			emailId: emailId,
			messageId: messageId,
			...(persistenceFailed && { warning: "sent_but_not_recorded" }),
		},
		{ status: 200 },
	);
}
