import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import { Receiver } from "@upstash/qstash";
import { waitUntil } from "@vercel/functions";
import { and, eq, isNull, lt } from "drizzle-orm";
import { nanoid } from "nanoid";
import { type NextRequest, NextResponse } from "next/server";

import { refreshEmailBatchStatus } from "@/app/api/e2/emails/batch-state";
import { buildSentEmailTags } from "@/app/api/e2/helper/ses-email-tags";
import {
	getAgentIdentityArn,
	getTenantSendingInfoForDomainOrParent,
	type TenantSendingInfo,
} from "@/lib/aws-ses/identity-arn-helper";
import { db } from "@/lib/db";
import {
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

const awsRegion = process.env.AWS_REGION || "us-east-2";
const awsAccessKeyId = process.env.AWS_ACCESS_KEY_ID;
const awsSecretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

let sesClient: SESv2Client | null = null;
let batchSesClient: SESv2Client | null = null;

if (awsAccessKeyId && awsSecretAccessKey) {
	sesClient = new SESv2Client({
		region: awsRegion,
		credentials: {
			accessKeyId: awsAccessKeyId,
			secretAccessKey: awsSecretAccessKey,
		},
	});
	batchSesClient = new SESv2Client({
		region: awsRegion,
		credentials: {
			accessKeyId: awsAccessKeyId,
			secretAccessKey: awsSecretAccessKey,
		},
		maxAttempts: 1,
	});
} else {
	console.warn(
		"⚠️ AWS credentials not configured. Scheduled email processing will not work.",
	);
}

const qstashReceiver = new Receiver({
	currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY!,
	nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY!,
});

const PROCESSING_LEASE_TIMEOUT_MS = 10 * 60 * 1000;

interface QStashPayload {
	type: "scheduled" | "batch";
	scheduledEmailId?: string;
	emailId?: string;
	userId?: string;
	batchId?: string;
	batchIndex?: number;
}

interface StoredAttachment {
	filename?: string;
	contentType?: string;
	content_type?: string;
	content?: string;
	size?: number;
	content_id?: string;
}

function parseJsonArraySafe<T>(jsonString: string | null): T[] {
	if (!jsonString) return [];
	try {
		const parsed: unknown = JSON.parse(jsonString);
		return Array.isArray(parsed) ? (parsed as T[]) : [];
	} catch {
		return [];
	}
}

function parseJsonObjectSafe<T extends Record<string, unknown>>(
	jsonString: string | null,
): T | undefined {
	if (!jsonString) return undefined;
	try {
		const parsed: unknown = JSON.parse(jsonString);
		return typeof parsed === "object" &&
			parsed !== null &&
			!Array.isArray(parsed)
			? (parsed as T)
			: undefined;
	} catch {
		return undefined;
	}
}

function isSesRetryableError(error: unknown): boolean {
	if (!(error instanceof Error)) return false;

	const errorName = (error as { name?: string }).name ?? "";
	const errorCode = (error as { $metadata?: { httpStatusCode?: number } })
		.$metadata?.httpStatusCode;

	if (errorCode === 429 || errorCode === 503) return true;

	const retryableNames = [
		"Throttling",
		"ThrottlingException",
		"TooManyRequestsException",
		"ServiceUnavailableException",
		"ServiceUnavailable",
	];

	return retryableNames.some(
		(name) => errorName.includes(name) || error.message.includes(name),
	);
}

function getContentTypeForAttachment(
	att: StoredAttachment,
	index: number,
): string {
	if (att.contentType) return att.contentType;
	if (att.content_type) return att.content_type;

	console.log(`⚠️ Attachment ${index + 1} missing contentType, using fallback`);
	const filename = att.filename || "unknown";
	const ext = filename.toLowerCase().split(".").pop();

	const contentTypeMap: Record<string, string> = {
		pdf: "application/pdf",
		jpg: "image/jpeg",
		jpeg: "image/jpeg",
		png: "image/png",
		gif: "image/gif",
		txt: "text/plain",
		html: "text/html",
		json: "application/json",
		zip: "application/zip",
		doc: "application/msword",
		docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
		xls: "application/vnd.ms-excel",
		xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
	};

	return contentTypeMap[ext || ""] || "application/octet-stream";
}

function generateDeterministicMessageId(
	emailId: string,
	fromDomain: string,
): string {
	return `<${emailId}@${fromDomain}>`;
}

export async function POST(request: NextRequest) {
	console.log("📨 QStash Webhook - Received scheduled email request");

	try {
		const signature = request.headers.get("upstash-signature");
		if (!signature) {
			console.error("❌ QStash Webhook - Missing signature");
			return NextResponse.json({ error: "Missing signature" }, { status: 401 });
		}

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

		const payload: QStashPayload = JSON.parse(body);

		if (payload.type === "batch") {
			return handleBatchEmail(payload);
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
		if (!sesClient) {
			console.error("❌ AWS SES not configured");
			return NextResponse.json(
				{
					error: "AWS SES not configured",
				},
				{ status: 500 },
			);
		}

		const [scheduledEmail] = await db
			.select()
			.from(scheduledEmails)
			.where(eq(scheduledEmails.id, scheduledEmailId))
			.limit(1);

		if (!scheduledEmail) {
			console.error("❌ Scheduled email not found:", scheduledEmailId);
			return NextResponse.json(
				{ error: "Scheduled email not found" },
				{ status: 400 },
			);
		}

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

		if (scheduledEmail.status === SCHEDULED_EMAIL_STATUS.PAUSED) {
			console.log("⏸️ Email is paused, skipping:", scheduledEmailId);
			return NextResponse.json({ message: "Email is paused" }, { status: 200 });
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

			await db
				.update(scheduledEmails)
				.set({
					status: SCHEDULED_EMAIL_STATUS.FAILED,
					lastError: `Email blocked: ${scheduledGuard.error || "Outbound security guard"}`,
					updatedAt: new Date(),
				})
				.where(eq(scheduledEmails.id, scheduledEmailId));

			return NextResponse.json(
				{
					error: scheduledGuard.error || "Email blocked",
					reason: scheduledGuard.reasonCode,
				},
				{ status: 200 },
			);
		}

		await db
			.update(scheduledEmails)
			.set({
				status: SCHEDULED_EMAIL_STATUS.PROCESSING,
				attempts: (scheduledEmail.attempts || 0) + 1,
				updatedAt: new Date(),
			})
			.where(eq(scheduledEmails.id, scheduledEmailId));

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

		const attachments = rawAttachments.map(
			(att: StoredAttachment, index: number) => ({
				...att,
				contentType: getContentTypeForAttachment(att, index),
			}),
		);

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

		await Promise.all([
			db
				.update(scheduledEmails)
				.set({
					status: SCHEDULED_EMAIL_STATUS.SENT,
					sentAt: new Date(),
					sentEmailId: createdSentEmail.id,
					updatedAt: new Date(),
				})
				.where(eq(scheduledEmails.id, scheduledEmailId)),

			db
				.update(sentEmails)
				.set({
					status: SENT_EMAIL_STATUS.SENT,
					messageId: messageId,
					sesMessageId: messageId,
					providerResponse: JSON.stringify(sesResponse),
					sentAt: new Date(),
					updatedAt: new Date(),
				})
				.where(eq(sentEmails.id, createdSentEmail.id)),
		]);

		waitUntil(
			evaluateSending(createdSentEmail.id, scheduledEmail.userId, {
				from: scheduledEmail.fromAddress,
				to: toAddresses,
				subject: scheduledEmail.subject,
				textBody: scheduledEmail.textBody || undefined,
				htmlBody: scheduledEmail.htmlBody || undefined,
			}),
		);

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

		return NextResponse.json(
			{
				error: "Failed to process scheduled email",
				details: errorMessage,
			},
			{ status: 500 },
		);
	}
}

async function handleBatchEmail(payload: QStashPayload) {
	const { emailId, userId, batchId, batchIndex } = payload;

	if (
		!emailId ||
		!userId ||
		!batchId ||
		batchIndex === undefined ||
		batchIndex === null
	) {
		console.error("❌ QStash Webhook - Missing required batch fields", {
			emailId,
			userId,
			batchId,
			batchIndex,
		});
		return NextResponse.json(
			{
				error:
					"Missing required batch fields: emailId, userId, batchId, batchIndex",
			},
			{ status: 400 },
		);
	}

	console.log("📧 Processing batch email:", { emailId, batchId, batchIndex });

	if (!batchSesClient) {
		console.error("❌ AWS SES not configured");
		return NextResponse.json(
			{ error: "AWS SES not configured" },
			{ status: 500 },
		);
	}

	const [sentEmail] = await db
		.select()
		.from(sentEmails)
		.where(and(eq(sentEmails.id, emailId), eq(sentEmails.userId, userId)))
		.limit(1);

	if (!sentEmail) {
		console.error("❌ Sent email not found or user mismatch:", emailId);
		return NextResponse.json(
			{ error: "Sent email not found" },
			{ status: 400 },
		);
	}

	if (sentEmail.batchId !== batchId || sentEmail.batchIndex !== batchIndex) {
		console.error("❌ QStash Webhook - Batch metadata mismatch", {
			emailId,
			expectedBatchId: batchId,
			actualBatchId: sentEmail.batchId,
			expectedBatchIndex: batchIndex,
			actualBatchIndex: sentEmail.batchIndex,
		});
		return NextResponse.json(
			{ error: "Batch metadata mismatch" },
			{ status: 400 },
		);
	}

	const [batch] = await db
		.select({
			id: emailBatches.id,
			status: emailBatches.status,
		})
		.from(emailBatches)
		.where(and(eq(emailBatches.id, batchId), eq(emailBatches.userId, userId)))
		.limit(1);

	if (!batch) {
		console.error("❌ Batch not found or user mismatch:", batchId);
		return NextResponse.json({ error: "Batch not found" }, { status: 400 });
	}

	if (batch.status === EMAIL_BATCH_STATUS.CANCELLED) {
		if (sentEmail.status === SENT_EMAIL_STATUS.PENDING) {
			await db
				.update(sentEmails)
				.set({
					status: SENT_EMAIL_STATUS.CANCELLED,
					updatedAt: new Date(),
				})
				.where(
					and(
						eq(sentEmails.id, emailId),
						eq(sentEmails.userId, userId),
						eq(sentEmails.batchId, batchId),
						eq(sentEmails.status, SENT_EMAIL_STATUS.PENDING),
					),
				);
			waitUntil(refreshEmailBatchStatus(batchId, userId).catch(console.error));
		}
		console.log("⏭️ Parent batch cancelled, skipping:", emailId);
		return NextResponse.json(
			{ message: "Parent batch cancelled" },
			{ status: 200 },
		);
	}

	const currentStatus = sentEmail.status;

	if (
		currentStatus === SENT_EMAIL_STATUS.SENT ||
		currentStatus === SENT_EMAIL_STATUS.FAILED ||
		currentStatus === SENT_EMAIL_STATUS.CANCELLED ||
		currentStatus === SENT_EMAIL_STATUS.PROVIDER_UNKNOWN
	) {
		console.log(`⏭️ Email already ${currentStatus}, skipping:`, emailId);
		return NextResponse.json(
			{ message: `Email already ${currentStatus}` },
			{ status: 200 },
		);
	}

	const processingToken = nanoid();
	const now = new Date();
	let claimedEmail: { id: string } | undefined;

	if (currentStatus === SENT_EMAIL_STATUS.PENDING) {
		const [claimed] = await db
			.update(sentEmails)
			.set({
				status: SENT_EMAIL_STATUS.PROCESSING,
				processingToken: processingToken,
				processingStartedAt: now,
				providerSubmittedAt: null,
				failureReason: null,
				updatedAt: now,
			})
			.where(
				and(
					eq(sentEmails.id, emailId),
					eq(sentEmails.userId, userId),
					eq(sentEmails.batchId, batchId),
					eq(sentEmails.status, SENT_EMAIL_STATUS.PENDING),
				),
			)
			.returning({ id: sentEmails.id });
		claimedEmail = claimed;
	} else if (currentStatus === SENT_EMAIL_STATUS.PROCESSING) {
		if (sentEmail.providerSubmittedAt) {
			console.log("⏭️ Processing with provider submitted, skipping:", emailId);
			return NextResponse.json(
				{ message: "Provider outcome unresolved" },
				{ status: 200 },
			);
		}

		const staleThreshold = new Date(
			now.getTime() - PROCESSING_LEASE_TIMEOUT_MS,
		);
		if (
			sentEmail.processingStartedAt &&
			sentEmail.processingStartedAt > staleThreshold
		) {
			console.log("⏭️ Processing lease still valid, skipping:", emailId);
			return NextResponse.json(
				{ message: "Processing lease still valid" },
				{ status: 200 },
			);
		}

		console.log("🔄 Reclaiming stale processing lease:", emailId);
		const [claimed] = await db
			.update(sentEmails)
			.set({
				processingToken: processingToken,
				processingStartedAt: now,
				providerSubmittedAt: null,
				failureReason: null,
				updatedAt: now,
			})
			.where(
				and(
					eq(sentEmails.id, emailId),
					eq(sentEmails.userId, userId),
					eq(sentEmails.batchId, batchId),
					eq(sentEmails.status, SENT_EMAIL_STATUS.PROCESSING),
					isNull(sentEmails.providerSubmittedAt),
					lt(sentEmails.processingStartedAt, staleThreshold),
				),
			)
			.returning({ id: sentEmails.id });
		claimedEmail = claimed;
	}

	if (!claimedEmail) {
		console.log("⏭️ Lost race to claim email, skipping:", emailId);
		return NextResponse.json(
			{ message: "Lost race to claim email" },
			{ status: 200 },
		);
	}

	const [parentAfterClaim] = await db
		.select({ status: emailBatches.status })
		.from(emailBatches)
		.where(and(eq(emailBatches.id, batchId), eq(emailBatches.userId, userId)))
		.limit(1);

	if (parentAfterClaim?.status === EMAIL_BATCH_STATUS.CANCELLED) {
		console.log("⏭️ Parent cancelled after claim, reverting:", emailId);
		await db
			.update(sentEmails)
			.set({
				status: SENT_EMAIL_STATUS.CANCELLED,
				processingToken: null,
				processingStartedAt: null,
				updatedAt: new Date(),
			})
			.where(
				and(
					eq(sentEmails.id, emailId),
					eq(sentEmails.userId, userId),
					eq(sentEmails.batchId, batchId),
					eq(sentEmails.status, SENT_EMAIL_STATUS.PROCESSING),
					eq(sentEmails.processingToken, processingToken),
				),
			);
		waitUntil(refreshEmailBatchStatus(batchId, userId).catch(console.error));
		return NextResponse.json(
			{ message: "Parent batch cancelled after claim" },
			{ status: 200 },
		);
	}

	const batchFromAddress = extractEmailAddress(sentEmail.from);
	const { isAgentEmail: batchIsAgentEmail } = canUserSendFromEmail(
		sentEmail.from,
	);
	const batchGuard = await enforceOutboundSendGuard({
		userId,
		fromAddress: batchFromAddress,
		fromDomain: sentEmail.fromDomain,
		isAgentEmail: batchIsAgentEmail,
	});

	if (!batchGuard.allowed) {
		console.log(
			`🚫 Blocking batch email for user ${userId}: ${batchGuard.reasonCode}`,
		);

		if (batchGuard.statusCode >= 500) {
			console.log("🔄 Guard retryable error, resetting to pending:", emailId);
			await db
				.update(sentEmails)
				.set({
					status: SENT_EMAIL_STATUS.PENDING,
					processingToken: null,
					processingStartedAt: null,
					providerSubmittedAt: null,
					qstashMessageId: null,
					updatedAt: new Date(),
				})
				.where(
					and(
						eq(sentEmails.id, emailId),
						eq(sentEmails.userId, userId),
						eq(sentEmails.batchId, batchId),
						eq(sentEmails.status, SENT_EMAIL_STATUS.PROCESSING),
						eq(sentEmails.processingToken, processingToken),
					),
				);
			return NextResponse.json(
				{ error: "Guard check temporarily unavailable" },
				{ status: 500 },
			);
		}

		await db
			.update(sentEmails)
			.set({
				status: SENT_EMAIL_STATUS.FAILED,
				failureReason: `Email blocked: ${batchGuard.error || "Outbound security guard"}`,
				processingToken: null,
				updatedAt: new Date(),
			})
			.where(
				and(
					eq(sentEmails.id, emailId),
					eq(sentEmails.userId, userId),
					eq(sentEmails.batchId, batchId),
					eq(sentEmails.status, SENT_EMAIL_STATUS.PROCESSING),
					eq(sentEmails.processingToken, processingToken),
				),
			);

		waitUntil(refreshEmailBatchStatus(batchId, userId).catch(console.error));

		return NextResponse.json(
			{
				error: batchGuard.error || "Email blocked",
				reason: batchGuard.reasonCode,
			},
			{ status: 200 },
		);
	}

	const toAddresses = parseJsonArraySafe<string>(sentEmail.to);
	const ccAddresses = parseJsonArraySafe<string>(sentEmail.cc);
	const bccAddresses = parseJsonArraySafe<string>(sentEmail.bcc);
	const allRecipients = [...toAddresses, ...ccAddresses, ...bccAddresses];

	const blocklistCheck = await checkRecipientsAgainstBlocklist(allRecipients);
	if (blocklistCheck.hasBlockedRecipients) {
		console.log(
			`🚫 Blocked recipients found for batch email ${emailId}: ${blocklistCheck.blockedAddresses.join(", ")}`,
		);

		await db
			.update(sentEmails)
			.set({
				status: SENT_EMAIL_STATUS.FAILED,
				failureReason: `Cannot send to blocked recipient(s): ${blocklistCheck.blockedAddresses.join(", ")}`,
				processingToken: null,
				updatedAt: new Date(),
			})
			.where(
				and(
					eq(sentEmails.id, emailId),
					eq(sentEmails.userId, userId),
					eq(sentEmails.batchId, batchId),
					eq(sentEmails.status, SENT_EMAIL_STATUS.PROCESSING),
					eq(sentEmails.processingToken, processingToken),
				),
			);

		waitUntil(refreshEmailBatchStatus(batchId, userId).catch(console.error));

		return NextResponse.json(
			{
				error: `Blocked recipients: ${blocklistCheck.blockedAddresses.join(", ")}`,
			},
			{ status: 200 },
		);
	}

	const { Autumn: autumn } = await import("autumn-js");

	try {
		const { data: emailCheck, error: emailCheckError } = await autumn.check({
			customer_id: userId,
			feature_id: "emails_sent",
			required_balance: 1,
		});

		if (emailCheckError) {
			console.error(
				"❌ Autumn email check error (retryable):",
				emailCheckError,
			);
			await db
				.update(sentEmails)
				.set({
					status: SENT_EMAIL_STATUS.PENDING,
					processingToken: null,
					processingStartedAt: null,
					providerSubmittedAt: null,
					qstashMessageId: null,
					updatedAt: new Date(),
				})
				.where(
					and(
						eq(sentEmails.id, emailId),
						eq(sentEmails.userId, userId),
						eq(sentEmails.batchId, batchId),
						eq(sentEmails.status, SENT_EMAIL_STATUS.PROCESSING),
						eq(sentEmails.processingToken, processingToken),
					),
				);

			return NextResponse.json(
				{ error: "Billing check temporarily unavailable" },
				{ status: 500 },
			);
		}

		if (!emailCheck.allowed) {
			console.log("❌ Email sending quota exceeded for user:", userId);
			await db
				.update(sentEmails)
				.set({
					status: SENT_EMAIL_STATUS.FAILED,
					failureReason: "Email sending quota exceeded",
					processingToken: null,
					updatedAt: new Date(),
				})
				.where(
					and(
						eq(sentEmails.id, emailId),
						eq(sentEmails.userId, userId),
						eq(sentEmails.batchId, batchId),
						eq(sentEmails.status, SENT_EMAIL_STATUS.PROCESSING),
						eq(sentEmails.processingToken, processingToken),
					),
				);

			waitUntil(refreshEmailBatchStatus(batchId, userId).catch(console.error));

			return NextResponse.json(
				{ error: "Email sending quota exceeded" },
				{ status: 200 },
			);
		}
	} catch (autumnError) {
		console.error("❌ Autumn check failed (retryable):", autumnError);
		await db
			.update(sentEmails)
			.set({
				status: SENT_EMAIL_STATUS.PENDING,
				processingToken: null,
				processingStartedAt: null,
				providerSubmittedAt: null,
				qstashMessageId: null,
				updatedAt: new Date(),
			})
			.where(
				and(
					eq(sentEmails.id, emailId),
					eq(sentEmails.userId, userId),
					eq(sentEmails.batchId, batchId),
					eq(sentEmails.status, SENT_EMAIL_STATUS.PROCESSING),
					eq(sentEmails.processingToken, processingToken),
				),
			);

		return NextResponse.json(
			{ error: "Billing check temporarily unavailable" },
			{ status: 500 },
		);
	}

	let rawMessage: string;
	let batchTenantInfo: TenantSendingInfo;
	const deterministicMessageId = generateDeterministicMessageId(
		emailId,
		sentEmail.fromDomain,
	);

	try {
		const replyToAddresses = parseJsonArraySafe<string>(sentEmail.replyTo);
		const headers = parseJsonObjectSafe<Record<string, string>>(
			sentEmail.headers,
		);
		const rawAttachments = parseJsonArraySafe<StoredAttachment>(
			sentEmail.attachments,
		);

		const attachments = rawAttachments.map((att, index) => ({
			...att,
			contentType: getContentTypeForAttachment(att, index),
			filename: att.filename || "attachment",
			content: att.content || "",
			size: att.size || 0,
		}));

		console.log("📧 Building raw email message for batch email");
		rawMessage = buildRawEmailMessage({
			from: sentEmail.from,
			to: toAddresses,
			cc: ccAddresses.length > 0 ? ccAddresses : undefined,
			bcc: bccAddresses.length > 0 ? bccAddresses : undefined,
			replyTo: replyToAddresses.length > 0 ? replyToAddresses : undefined,
			subject: sentEmail.subject,
			textBody: sentEmail.textBody || undefined,
			htmlBody: sentEmail.htmlBody || undefined,
			customHeaders: headers,
			attachments: attachments,
			messageId: deterministicMessageId,
			date: new Date(),
		});

		const batchFromDomain = sentEmail.fromDomain;

		batchTenantInfo = {
			identityArn: null,
			configurationSetName: null,
			tenantName: null,
		};
		if (batchIsAgentEmail) {
			batchTenantInfo = {
				identityArn: getAgentIdentityArn(),
				configurationSetName: null,
				tenantName: null,
			};
		} else {
			const batchParentDomain = isSubdomain(batchFromDomain)
				? getRootDomain(batchFromDomain)
				: undefined;
			batchTenantInfo = await getTenantSendingInfoForDomainOrParent(
				userId,
				batchFromDomain,
				batchParentDomain || undefined,
			);
		}

		if (batchTenantInfo.identityArn) {
			console.log(
				`🏢 Using SourceArn for batch email tenant tracking: ${batchTenantInfo.identityArn}`,
			);
		} else {
			console.warn(
				"⚠️ No SourceArn available - batch email will not be tracked at tenant level",
			);
		}

		if (batchTenantInfo.configurationSetName) {
			console.log(
				`📋 Using ConfigurationSet for batch email tenant tracking: ${batchTenantInfo.configurationSetName}`,
			);
		} else {
			console.warn(
				"⚠️ No ConfigurationSet available - batch email metrics may not be tracked correctly",
			);
		}

		if (batchTenantInfo.tenantName) {
			console.log(
				`🏠 Using TenantName for batch email AWS SES tracking: ${batchTenantInfo.tenantName}`,
			);
		} else {
			console.warn(
				"⚠️ No TenantName available - batch email will NOT appear in tenant dashboard!",
			);
		}
	} catch (prepError) {
		console.error("❌ Pre-SES preparation error (retryable):", prepError);
		await db
			.update(sentEmails)
			.set({
				status: SENT_EMAIL_STATUS.PENDING,
				processingToken: null,
				processingStartedAt: null,
				providerSubmittedAt: null,
				qstashMessageId: null,
				updatedAt: new Date(),
			})
			.where(
				and(
					eq(sentEmails.id, emailId),
					eq(sentEmails.userId, userId),
					eq(sentEmails.batchId, batchId),
					eq(sentEmails.status, SENT_EMAIL_STATUS.PROCESSING),
					eq(sentEmails.processingToken, processingToken),
				),
			);

		return NextResponse.json(
			{ error: "Email preparation temporarily unavailable" },
			{ status: 500 },
		);
	}

	const [tokenValid] = await db
		.update(sentEmails)
		.set({
			providerSubmittedAt: new Date(),
			messageId: deterministicMessageId,
			updatedAt: new Date(),
		})
		.where(
			and(
				eq(sentEmails.id, emailId),
				eq(sentEmails.userId, userId),
				eq(sentEmails.batchId, batchId),
				eq(sentEmails.status, SENT_EMAIL_STATUS.PROCESSING),
				eq(sentEmails.processingToken, processingToken),
			),
		)
		.returning({ id: sentEmails.id });

	if (!tokenValid) {
		console.log("⏭️ Token lost before SES submission, aborting:", emailId);
		return NextResponse.json(
			{ message: "Token lost before submission" },
			{ status: 200 },
		);
	}

	try {
		const rawCommand = new SendEmailCommand({
			FromEmailAddress: sentEmail.from,
			...(batchTenantInfo.identityArn && {
				FromEmailAddressIdentityArn: batchTenantInfo.identityArn,
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
			...(batchTenantInfo.configurationSetName && {
				ConfigurationSetName: batchTenantInfo.configurationSetName,
			}),
			...(batchTenantInfo.tenantName && {
				TenantName: batchTenantInfo.tenantName,
			}),
			EmailTags: buildSentEmailTags(emailId),
		});

		const sesResponse = await batchSesClient.send(rawCommand);
		const sesMessageId = sesResponse.MessageId;

		console.log("✅ Batch email sent successfully via SES:", sesMessageId);

		const [updatedEmail] = await db
			.update(sentEmails)
			.set({
				status: SENT_EMAIL_STATUS.SENT,
				sesMessageId: sesMessageId,
				providerResponse: JSON.stringify(sesResponse),
				sentAt: new Date(),
				processingToken: null,
				updatedAt: new Date(),
			})
			.where(
				and(
					eq(sentEmails.id, emailId),
					eq(sentEmails.userId, userId),
					eq(sentEmails.batchId, batchId),
					eq(sentEmails.status, SENT_EMAIL_STATUS.PROCESSING),
					eq(sentEmails.processingToken, processingToken),
				),
			)
			.returning({ id: sentEmails.id });

		if (!updatedEmail) {
			console.warn(
				"⚠️ Token lost after SES success, another worker may have taken over:",
				emailId,
			);
			return NextResponse.json(
				{ message: "Token lost after SES success" },
				{ status: 200 },
			);
		}

		try {
			const { error: trackError } = await autumn.track({
				customer_id: userId,
				feature_id: "emails_sent",
				value: 1,
				idempotency_key: emailId,
			});

			if (trackError) {
				console.error("❌ Failed to track email usage:", trackError);
				await db
					.update(sentEmails)
					.set({
						usageTrackingError: String(trackError),
						updatedAt: new Date(),
					})
					.where(eq(sentEmails.id, emailId));
			} else {
				await db
					.update(sentEmails)
					.set({
						usageTrackedAt: new Date(),
						usageTrackingError: null,
						updatedAt: new Date(),
					})
					.where(eq(sentEmails.id, emailId));
			}
		} catch (trackError) {
			console.error("❌ Failed to track email usage:", trackError);
			await db
				.update(sentEmails)
				.set({
					usageTrackingError:
						trackError instanceof Error
							? trackError.message
							: String(trackError),
					updatedAt: new Date(),
				})
				.where(eq(sentEmails.id, emailId));
		}

		waitUntil(
			evaluateSending(emailId, userId, {
				from: sentEmail.from,
				to: toAddresses,
				subject: sentEmail.subject,
				textBody: sentEmail.textBody || undefined,
				htmlBody: sentEmail.htmlBody || undefined,
			}),
		);

		waitUntil(checkSendingSpike(userId));

		waitUntil(refreshEmailBatchStatus(batchId, userId).catch(console.error));

		console.log("✅ Batch email processed successfully:", emailId);

		return NextResponse.json(
			{
				success: true,
				emailId: emailId,
				messageId: sesMessageId,
			},
			{ status: 200 },
		);
	} catch (sesError) {
		console.error("❌ SES submission error:", sesError);

		if (isSesRetryableError(sesError)) {
			console.log("🔄 Retryable SES error, resetting to pending:", emailId);
			await db
				.update(sentEmails)
				.set({
					status: SENT_EMAIL_STATUS.PENDING,
					processingToken: null,
					processingStartedAt: null,
					providerSubmittedAt: null,
					messageId: null,
					qstashMessageId: null,
					updatedAt: new Date(),
				})
				.where(
					and(
						eq(sentEmails.id, emailId),
						eq(sentEmails.userId, userId),
						eq(sentEmails.batchId, batchId),
						eq(sentEmails.status, SENT_EMAIL_STATUS.PROCESSING),
						eq(sentEmails.processingToken, processingToken),
					),
				);

			return NextResponse.json(
				{ error: "SES temporarily unavailable, will retry" },
				{ status: 500 },
			);
		}

		const errorMessage =
			sesError instanceof Error ? sesError.message : "Unknown error";

		console.log("⚠️ Ambiguous SES error, marking PROVIDER_UNKNOWN:", emailId);
		await db
			.update(sentEmails)
			.set({
				status: SENT_EMAIL_STATUS.PROVIDER_UNKNOWN,
				failureReason: `Provider outcome unknown: ${errorMessage}`,
				processingToken: null,
				providerResponse: JSON.stringify(sesError),
				updatedAt: new Date(),
			})
			.where(
				and(
					eq(sentEmails.id, emailId),
					eq(sentEmails.userId, userId),
					eq(sentEmails.batchId, batchId),
					eq(sentEmails.status, SENT_EMAIL_STATUS.PROCESSING),
					eq(sentEmails.processingToken, processingToken),
				),
			);

		waitUntil(refreshEmailBatchStatus(batchId, userId).catch(console.error));

		return NextResponse.json(
			{
				error: "Provider outcome unknown",
				details: errorMessage,
			},
			{ status: 200 },
		);
	}
}
