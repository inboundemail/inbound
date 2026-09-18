import { Autumn as autumn } from "autumn-js";
import { and, eq, isNull, notInArray } from "drizzle-orm";
import { Elysia } from "elysia";
import { nanoid } from "nanoid";
import {
	incrementPublishAttempt,
	publishBatchToQStash,
	type QueueItem,
	recomputePublishedCount,
} from "@/app/api/e2/emails/batch-queue";
import {
	BatchCreateBodySchema,
	type BatchEmailItem,
	BatchErrorResponseSchema,
	BatchResponseSchema,
	IdempotencyKeyHeadersSchema,
} from "@/app/api/e2/emails/batch-schemas";
import { refreshEmailBatchStatus } from "@/app/api/e2/emails/batch-state";
import {
	computeCanonicalHash,
	computeChildIdempotencyHash,
	extractDomain,
	extractEmailAddress,
	getAllRecipients,
	getDistinctSenders,
	isPostgresUniqueViolation,
	toArray,
	validateAggregateBatchAttachments,
	validateEmailItem,
} from "@/app/api/e2/emails/batch-utils";
import {
	type ProcessedAttachment,
	processAttachments,
} from "@/app/api/e2/helper/attachment-processor";
import {
	authenticateEmailSend,
	senderPolicyAllowsAddress,
} from "@/app/api/e2/lib/send-auth";
import { db } from "@/lib/db";
import {
	EMAIL_BATCH_STATUS,
	emailBatches,
	SENT_EMAIL_STATUS,
	sentEmails,
} from "@/lib/db/schema";
import { canUserSendFromEmail } from "@/lib/email-management/agent-email-helper";
import { checkRecipientsAgainstBlocklist } from "@/lib/email-management/email-blocking";
import { enforceOutboundSendGuard } from "@/lib/email-management/outbound-send-guard";

interface ValidatedEmail {
	item: BatchEmailItem;
	index: number;
	fromAddress: string;
	fromDomain: string;
	toAddresses: string[];
	ccAddresses: string[];
	bccAddresses: string[];
	replyToAddresses: string[];
	processedAttachments: ProcessedAttachment[];
}

const TERMINAL_BATCH_STATUSES = [
	EMAIL_BATCH_STATUS.COMPLETED,
	EMAIL_BATCH_STATUS.FAILED,
	EMAIL_BATCH_STATUS.PARTIALLY_FAILED,
	EMAIL_BATCH_STATUS.CANCELLED,
	EMAIL_BATCH_STATUS.REQUIRES_ATTENTION,
] as const;

const TERMINAL_BATCH_STATUSES_SET: Set<string> = new Set(
	TERMINAL_BATCH_STATUSES,
);

async function validateAllEmails(
	emails: readonly BatchEmailItem[],
	userId: string,
	senderPolicy: Parameters<typeof senderPolicyAllowsAddress>[0] | null,
): Promise<{ validated: ValidatedEmail[]; error: string | null }> {
	const validated: ValidatedEmail[] = [];

	for (let i = 0; i < emails.length; i++) {
		const item = emails[i];

		const itemValidation = validateEmailItem(item, i);
		if (!itemValidation.valid) {
			return {
				validated: [],
				error: itemValidation.error ?? "Validation failed",
			};
		}

		const fromAddress = extractEmailAddress(item.from);
		const fromDomain = extractDomain(item.from);

		if (senderPolicy && !senderPolicyAllowsAddress(senderPolicy, fromAddress)) {
			return {
				validated: [],
				error: `Email at index ${i}: This credential cannot send from that address`,
			};
		}

		const toAddresses = toArray(item.to);
		const ccAddresses = toArray(item.cc);
		const bccAddresses = toArray(item.bcc);
		const replyToAddresses = toArray(item.reply_to);

		let processedAttachments: ProcessedAttachment[] = [];
		if (item.attachments && item.attachments.length > 0) {
			try {
				processedAttachments = await processAttachments(
					item.attachments.map((att) => ({
						filename: att.filename,
						content: att.content,
						content_type: att.content_type,
						content_id: att.content_id,
					})),
				);
			} catch (err) {
				const msg =
					err instanceof Error ? err.message : "Attachment processing failed";
				return {
					validated: [],
					error: `Email at index ${i}: ${msg}`,
				};
			}
		}

		validated.push({
			item,
			index: i,
			fromAddress,
			fromDomain,
			toAddresses,
			ccAddresses,
			bccAddresses,
			replyToAddresses,
			processedAttachments,
		});
	}

	const allAttachments = validated.map((v) => v.processedAttachments);
	const aggregateCheck = validateAggregateBatchAttachments(allAttachments);
	if (!aggregateCheck.valid) {
		return {
			validated: [],
			error: aggregateCheck.error ?? "Attachment validation failed",
		};
	}

	const allRecipients: string[] = [];
	for (const v of validated) {
		allRecipients.push(...getAllRecipients(v.item));
	}

	const blocklistCheck = await checkRecipientsAgainstBlocklist(allRecipients);
	if (blocklistCheck.hasBlockedRecipients) {
		return {
			validated: [],
			error: `Cannot send to blocked recipient(s): ${blocklistCheck.blockedAddresses.join(", ")}`,
		};
	}

	const distinctSenders = getDistinctSenders(emails);
	for (const sender of distinctSenders) {
		const { isAgentEmail } = canUserSendFromEmail(sender.address);

		const guardResult = await enforceOutboundSendGuard({
			userId,
			fromAddress: sender.address,
			fromDomain: sender.domain,
			isAgentEmail,
		});

		if (!guardResult.allowed) {
			return {
				validated: [],
				error:
					guardResult.error || `Cannot send from address: ${sender.address}`,
			};
		}
	}

	return { validated, error: null };
}

async function republishPendingItems(
	batchId: string,
	userId: string,
): Promise<{ publishedCount: number; lastError: string | null }> {
	const pendingRows = await db
		.select({
			id: sentEmails.id,
			batchIndex: sentEmails.batchIndex,
		})
		.from(sentEmails)
		.where(
			and(
				eq(sentEmails.batchId, batchId),
				eq(sentEmails.userId, userId),
				eq(sentEmails.status, SENT_EMAIL_STATUS.PENDING),
				isNull(sentEmails.qstashMessageId),
			),
		);

	if (pendingRows.length === 0) {
		return { publishedCount: 0, lastError: null };
	}

	const itemsToQueue: QueueItem[] = [];
	for (const row of pendingRows) {
		const newAttempt = await incrementPublishAttempt(row.id, userId, batchId);
		if (newAttempt > 0) {
			itemsToQueue.push({
				emailId: row.id,
				userId,
				batchId,
				batchIndex: row.batchIndex ?? 0,
				attempt: newAttempt,
			});
		}
	}

	if (itemsToQueue.length === 0) {
		return { publishedCount: 0, lastError: null };
	}

	const { lastError } = await publishBatchToQStash(itemsToQueue);
	const publishedCount = await recomputePublishedCount(batchId, userId);
	return { publishedCount, lastError };
}

async function updateBatchStatusWithCAS(
	batchId: string,
	userId: string,
	totalCount: number,
	publishedCount: number,
	lastError: string | null,
): Promise<boolean> {
	const newStatus =
		publishedCount < totalCount
			? EMAIL_BATCH_STATUS.PARTIALLY_QUEUED
			: EMAIL_BATCH_STATUS.QUEUED;

	const casResult = await db
		.update(emailBatches)
		.set({
			status: newStatus,
			publishedCount,
			lastError: lastError ?? null,
			updatedAt: new Date(),
		})
		.where(
			and(
				eq(emailBatches.id, batchId),
				eq(emailBatches.userId, userId),
				notInArray(emailBatches.status, [...TERMINAL_BATCH_STATUSES]),
			),
		)
		.returning({ id: emailBatches.id });

	return casResult.length > 0;
}

export const createEmailBatch = new Elysia().post(
	"/emails/batch",
	async ({ request, body, set }) => {
		const { userId, senderPolicy } = await authenticateEmailSend(request, set);

		const idempotencyKey = request.headers.get("idempotency-key");
		const requestHash = computeCanonicalHash(body.emails);

		if (idempotencyKey) {
			const [existingBatch] = await db
				.select()
				.from(emailBatches)
				.where(
					and(
						eq(emailBatches.userId, userId),
						eq(emailBatches.idempotencyKey, idempotencyKey),
					),
				)
				.limit(1);

			if (existingBatch) {
				if (existingBatch.requestHash !== requestHash) {
					set.status = 409;
					return {
						error: "Conflict",
						details: "Idempotency key already used with different request body",
					};
				}

				if (TERMINAL_BATCH_STATUSES_SET.has(existingBatch.status)) {
					const refreshed = await refreshEmailBatchStatus(
						existingBatch.id,
						userId,
					);
					set.status = 202;
					return {
						id: existingBatch.id,
						status: refreshed.status,
						counts: refreshed.counts,
						created_at:
							existingBatch.createdAt?.toISOString() ??
							new Date().toISOString(),
						updated_at: new Date().toISOString(),
					};
				}

				const { lastError } = await republishPendingItems(
					existingBatch.id,
					userId,
				);

				const newPublishedCount = await recomputePublishedCount(
					existingBatch.id,
					userId,
				);
				const casSuccess = await updateBatchStatusWithCAS(
					existingBatch.id,
					userId,
					existingBatch.totalCount,
					newPublishedCount,
					lastError,
				);

				if (!casSuccess) {
					const refreshed = await refreshEmailBatchStatus(
						existingBatch.id,
						userId,
					);
					set.status = 202;
					return {
						id: existingBatch.id,
						status: refreshed.status,
						counts: refreshed.counts,
						created_at:
							existingBatch.createdAt?.toISOString() ??
							new Date().toISOString(),
						updated_at: new Date().toISOString(),
					};
				}

				const refreshed = await refreshEmailBatchStatus(
					existingBatch.id,
					userId,
				);
				set.status = 202;
				return {
					id: existingBatch.id,
					status: refreshed.status,
					counts: refreshed.counts,
					created_at:
						existingBatch.createdAt?.toISOString() ?? new Date().toISOString(),
					updated_at: new Date().toISOString(),
				};
			}
		}

		const { validated, error: validationError } = await validateAllEmails(
			body.emails,
			userId,
			senderPolicy,
		);

		if (validationError) {
			set.status = 400;
			return { error: validationError };
		}

		const { data: emailCheck, error: emailCheckError } = await autumn.check({
			customer_id: userId,
			feature_id: "emails_sent",
			required_balance: body.emails.length,
		});

		if (emailCheckError) {
			set.status = 500;
			return { error: "Failed to check email sending limits" };
		}

		if (!emailCheck.allowed) {
			set.status = 429;
			return {
				error:
					"Email sending limit reached. Please upgrade your plan to send more emails.",
			};
		}

		const batchId = nanoid();
		const now = new Date();

		const childIds = validated.map(() => nanoid());

		const parentRow = {
			id: batchId,
			userId,
			status: EMAIL_BATCH_STATUS.QUEUED,
			totalCount: body.emails.length,
			publishedCount: 0,
			idempotencyKey: idempotencyKey ?? null,
			requestHash,
			createdAt: now,
			updatedAt: now,
		};

		const childRows = validated.map((v, idx) => ({
			id: childIds[idx],
			from: v.item.from,
			fromAddress: v.fromAddress,
			fromDomain: v.fromDomain,
			to: JSON.stringify(v.toAddresses),
			cc: v.ccAddresses.length > 0 ? JSON.stringify(v.ccAddresses) : null,
			bcc: v.bccAddresses.length > 0 ? JSON.stringify(v.bccAddresses) : null,
			replyTo:
				v.replyToAddresses.length > 0
					? JSON.stringify(v.replyToAddresses)
					: null,
			subject: v.item.subject,
			textBody: v.item.text ?? null,
			htmlBody: v.item.html ?? null,
			headers: v.item.headers ? JSON.stringify(v.item.headers) : null,
			attachments:
				v.processedAttachments.length > 0
					? JSON.stringify(v.processedAttachments)
					: null,
			tags: v.item.tags ? JSON.stringify(v.item.tags) : null,
			status: SENT_EMAIL_STATUS.PENDING,
			userId,
			batchId,
			batchIndex: idx,
			idempotencyKey: idempotencyKey
				? computeChildIdempotencyHash(idempotencyKey, batchId, idx)
				: null,
			qstashPublishAttempt: 0,
			createdAt: now,
			updatedAt: now,
		}));

		try {
			await db.batch([
				db.insert(emailBatches).values(parentRow),
				db.insert(sentEmails).values(childRows),
			]);
		} catch (err) {
			if (isPostgresUniqueViolation(err) && idempotencyKey) {
				const [raceBatch] = await db
					.select()
					.from(emailBatches)
					.where(
						and(
							eq(emailBatches.userId, userId),
							eq(emailBatches.idempotencyKey, idempotencyKey),
						),
					)
					.limit(1);

				if (raceBatch && raceBatch.requestHash === requestHash) {
					let refreshed: {
						status: string;
						counts: {
							total: number;
							pending: number;
							processing: number;
							sent: number;
							failed: number;
							cancelled: number;
							provider_unknown: number;
						};
					};
					try {
						refreshed = await refreshEmailBatchStatus(raceBatch.id, userId);
					} catch {
						refreshed = {
							status: raceBatch.status,
							counts: {
								total: raceBatch.totalCount,
								pending: 0,
								processing: 0,
								sent: 0,
								failed: 0,
								cancelled: 0,
								provider_unknown: 0,
							},
						};
					}

					set.status = 202;
					return {
						id: raceBatch.id,
						status: refreshed.status,
						counts: refreshed.counts,
						created_at: raceBatch.createdAt?.toISOString() ?? now.toISOString(),
						updated_at: raceBatch.updatedAt?.toISOString(),
					};
				}

				set.status = 409;
				return {
					error: "Conflict",
					details: "Idempotency key already used with different request body",
				};
			}
			throw err;
		}

		const itemsToQueue: QueueItem[] = childRows.map((row, idx) => ({
			emailId: row.id,
			userId,
			batchId,
			batchIndex: idx,
			attempt: 0,
		}));

		const { lastError } = await publishBatchToQStash(itemsToQueue);

		const finalPublishedCount = await recomputePublishedCount(batchId, userId);
		const finalLastError =
			finalPublishedCount >= body.emails.length ? null : lastError;

		await updateBatchStatusWithCAS(
			batchId,
			userId,
			body.emails.length,
			finalPublishedCount,
			finalLastError,
		);

		const refreshed = await refreshEmailBatchStatus(batchId, userId);

		set.status = 202;
		return {
			id: batchId,
			status: refreshed.status,
			counts: refreshed.counts,
			created_at: now.toISOString(),
			updated_at: new Date().toISOString(),
		};
	},
	{
		body: BatchCreateBodySchema,
		headers: IdempotencyKeyHeadersSchema,
		response: {
			202: BatchResponseSchema,
			400: BatchErrorResponseSchema,
			401: BatchErrorResponseSchema,
			403: BatchErrorResponseSchema,
			409: BatchErrorResponseSchema,
			429: BatchErrorResponseSchema,
			500: BatchErrorResponseSchema,
			503: BatchErrorResponseSchema,
		},
		detail: {
			tags: ["Emails"],
			summary: "Send a batch of emails",
			description:
				"Send up to 100 emails in a single batch request. All emails are validated before any are queued. Returns immediately with batch status; emails are processed asynchronously.",
		},
	},
);
