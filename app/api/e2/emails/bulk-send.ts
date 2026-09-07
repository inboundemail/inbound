import { Autumn as autumn } from "autumn-js";
import { and, eq } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { nanoid } from "nanoid";
import { AttachmentSchema, TagSchema } from "@/app/api/e2/emails/send";
import { db } from "@/lib/db";
import {
	BULK_EMAIL_ITEM_STATUS,
	EMAIL_BATCH_STATUS,
	type EmailBatch,
	emailBatches,
	type NewSentEmail,
	sentEmails,
} from "@/lib/db/schema";
import {
	canUserSendFromEmail,
	extractDomain,
	extractEmailAddress,
} from "@/lib/email-management/agent-email-helper";
import { checkRecipientsAgainstBlocklist } from "@/lib/email-management/email-blocking";
import {
	enforceOutboundSendGuard,
	getHourlySendCapacity,
	type OutboundSendGuardResult,
} from "@/lib/email-management/outbound-send-guard";
import {
	type ParsedScheduleDate,
	parseScheduledAt,
	validateScheduledDate,
} from "@/lib/utils/date-parser";
import {
	attachmentsToStorageFormat,
	type ProcessedAttachment,
	processAttachments,
} from "../helper/attachment-processor";
import {
	authenticateEmailSend,
	senderPolicyAllowsAddress,
} from "../lib/send-auth";
import {
	attachmentsCacheKey,
	BULK_CREATION_STALE_MS,
	type BulkAcceptedResponseBody,
	type BulkEmailItemInput,
	buildBulkAcceptedResponse,
	collectItemRecipients,
	isBulkItemClaimable,
	isStaleUnpublishedCreation,
	MAX_BULK_EMAILS,
	MAX_BULK_STORED_ATTACHMENT_BYTES,
	parseQstashMessageIdMap,
	toAddressArray,
	totalStoredAttachmentBytes,
	validateBulkEmailItem,
} from "./bulk-helpers";
import {
	applyBatchPublicationState,
	type BulkQueueConfig,
	getBulkQueueConfig,
	mergeBatchQstashMessageIds,
	publishBulkQueueMessages,
	reconcileBatchPublication,
} from "./bulk-queue";

const BulkEmailItemSchema = t.Object({
	from: t.String({ description: "Sender email address" }),
	to: t.Union([t.String(), t.Array(t.String(), { minItems: 1, maxItems: 1 })], {
		description:
			"Recipient email address (exactly one per email; each item is billed and rate limited as one recipient)",
	}),
	subject: t.String({ description: "Email subject" }),
	html: t.Optional(t.String({ description: "HTML content of the email" })),
	text: t.Optional(
		t.String({ description: "Plain text content of the email" }),
	),
	// cc/bcc stay in the schema so requests carrying them are rejected with a
	// clear 400 by validateBulkEmailItem instead of being silently stripped.
	cc: t.Optional(
		t.Union([t.String(), t.Array(t.String())], {
			description: "Not supported for bulk emails (rejected)",
		}),
	),
	bcc: t.Optional(
		t.Union([t.String(), t.Array(t.String())], {
			description: "Not supported for bulk emails (rejected)",
		}),
	),
	reply_to: t.Optional(t.Union([t.String(), t.Array(t.String())])),
	headers: t.Optional(t.Record(t.String(), t.String())),
	attachments: t.Optional(t.Array(AttachmentSchema)),
	tags: t.Optional(t.Array(TagSchema)),
});

const SendBulkEmailBodySchema = t.Object({
	emails: t.Array(BulkEmailItemSchema, {
		minItems: 1,
		maxItems: MAX_BULK_EMAILS,
		description: `Up to ${MAX_BULK_EMAILS} emails per batch`,
	}),
	scheduled_at: t.Optional(
		t.String({
			description:
				"Batch-level schedule (ISO 8601 or natural language). Applies to every email in the batch.",
		}),
	),
	timezone: t.Optional(
		t.String({ description: "Timezone for natural language parsing" }),
	),
});

const BulkAcceptedResponse = t.Object({
	id: t.String(),
	status: t.String(),
	total: t.Integer(),
	scheduled_at: t.Optional(t.String()),
	timezone: t.Optional(t.String()),
	data: t.Array(t.Object({ id: t.String(), index: t.Integer() })),
});

const ErrorResponse = t.Object({
	error: t.String(),
});

const CREATION_IN_PROGRESS_ERROR = `A batch for this Idempotency-Key is still being created. Retry the same request shortly. If the creating request crashed before finishing, a retry with the same key recovers automatically after ${BULK_CREATION_STALE_MS / 60_000} minutes.`;

type ExistingBatchOutcome =
	| {
			kind: "response";
			status: 202 | 409 | 503;
			body: BulkAcceptedResponseBody | { error: string };
	  }
	| { kind: "recreate" };

/**
 * Answers an idempotent replay for an existing batch.
 *
 * This is where the outbox recovery happens: a 202 is only returned once
 * every still-queued item has a confirmed QStash publication (missing ones
 * are republished right here, preserving the batch's notBefore) or the
 * publication gap is honestly represented (partially_queued + lastError).
 * A batch that died mid-creation (items < total) yields a retryable 409
 * while fresh, and is cleaned up and recreated once it is provably stale
 * and nothing was ever published.
 */
async function respondForExistingBatch(
	batch: EmailBatch,
	config: BulkQueueConfig,
	options: { allowRecreate: boolean },
): Promise<ExistingBatchOutcome> {
	const items = await db
		.select({
			id: sentEmails.id,
			batchIndex: sentEmails.batchIndex,
			status: sentEmails.status,
			updatedAt: sentEmails.updatedAt,
		})
		.from(sentEmails)
		.where(
			and(
				eq(sentEmails.batchId, batch.id),
				eq(sentEmails.userId, batch.userId),
			),
		);

	// CANCELLED is a user decision and sticky: replay it verbatim, never
	// republish, even if creation was interrupted.
	if (batch.status === EMAIL_BATCH_STATUS.CANCELLED) {
		return {
			kind: "response",
			status: 202,
			body: buildBulkAcceptedResponse(batch, items),
		};
	}

	if (items.length < batch.total) {
		const messageIdMap = parseQstashMessageIdMap(batch.qstashMessageIds);
		const stale = isStaleUnpublishedCreation({
			batchStatus: batch.status,
			batchCreatedAt: batch.createdAt,
			batchTotal: batch.total,
			itemCount: items.length,
			messageIdMap,
			nowMs: Date.now(),
		});

		if (stale && options.allowRecreate) {
			console.log(
				"🧹 Cleaning up stale partially-created batch for recreation:",
				batch.id,
			);
			// Nothing was ever published for this batch, so no worker can be
			// racing us; still, only remove rows that are safe to remove.
			await db
				.delete(sentEmails)
				.where(
					and(
						eq(sentEmails.batchId, batch.id),
						eq(sentEmails.userId, batch.userId),
						eq(sentEmails.status, BULK_EMAIL_ITEM_STATUS.QUEUED),
					),
				);
			const [remaining] = await db
				.select({ id: sentEmails.id })
				.from(sentEmails)
				.where(eq(sentEmails.batchId, batch.id))
				.limit(1);
			if (remaining) {
				console.error(
					"❌ Stale batch cleanup left non-queued rows behind, refusing to recreate:",
					batch.id,
				);
				return {
					kind: "response",
					status: 409,
					body: { error: CREATION_IN_PROGRESS_ERROR },
				};
			}
			await db.delete(emailBatches).where(eq(emailBatches.id, batch.id));
			return { kind: "recreate" };
		}

		return {
			kind: "response",
			status: 409,
			body: { error: CREATION_IN_PROGRESS_ERROR },
		};
	}

	// Batch is fully created: republish any still-queued item whose
	// publication was never confirmed or whose message was abandoned.
	const reconcile = await reconcileBatchPublication({
		config,
		batch,
		items,
		includeMissing: true,
	});

	if (
		reconcile.unconfirmedQueuedCount > 0 &&
		reconcile.publishedCount === 0 &&
		reconcile.attempted.length > 0
	) {
		return {
			kind: "response",
			status: 503,
			body: {
				error: `Batch ${batch.id} is stored durably but ${reconcile.unconfirmedQueuedCount} queued email(s) could not be published for delivery${reconcile.errorMessage ? ` (${reconcile.errorMessage})` : ""}. Retry this request with the same Idempotency-Key to publish the remainder, or cancel the batch.`,
			},
		};
	}

	// Re-read the parent so the replay body reflects the reconciled status
	// (and any concurrent completion/cancellation).
	const [freshBatch] = await db
		.select()
		.from(emailBatches)
		.where(eq(emailBatches.id, batch.id))
		.limit(1);

	return {
		kind: "response",
		status: 202,
		body: buildBulkAcceptedResponse(freshBatch ?? batch, items),
	};
}

export const sendBulkEmails = new Elysia().post(
	"/emails/bulk",
	async ({ request, body, set }) => {
		console.log("📧 POST /api/e2/emails/bulk - Starting request");

		const { userId, senderPolicy } = await authenticateEmailSend(request, set);
		console.log("✅ Authentication successful for userId:", userId);

		const idempotencyKey = request.headers.get("Idempotency-Key");
		if (idempotencyKey && idempotencyKey.length > 256) {
			set.status = 400;
			return { error: "Idempotency-Key must be 256 characters or fewer" };
		}

		// Fail fast on missing configuration before any persistence or replay:
		// creation would produce a batch no worker ever picks up, and replays
		// could not republish missing publications.
		const queueConfig = getBulkQueueConfig();
		if (!queueConfig) {
			console.error("❌ Bulk send misconfigured:", {
				hasAppUrl: Boolean(process.env.NEXT_PUBLIC_APP_URL),
				hasQstashToken: Boolean(process.env.QSTASH_TOKEN),
			});
			set.status = 500;
			return { error: "Email queueing is not configured on this server" };
		}

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
				const outcome = await respondForExistingBatch(
					existingBatch,
					queueConfig,
					{ allowRecreate: true },
				);
				if (outcome.kind === "response") {
					console.log(
						"♻️ Idempotent bulk request - replaying existing batch:",
						existingBatch.id,
						"status:",
						outcome.status,
					);
					set.status = outcome.status;
					return outcome.body;
				}
				// Stale dead creation was cleaned up: fall through and create
				// the batch again under the same key.
			}
		}

		const items = body.emails as BulkEmailItemInput[];

		let parsedDate: ParsedScheduleDate | null = null;
		if (body.scheduled_at) {
			parsedDate = parseScheduledAt(body.scheduled_at, body.timezone || "UTC");
			if (!parsedDate.isValid) {
				set.status = 400;
				return { error: parsedDate.error || "Invalid scheduled date" };
			}

			const dateValidation = validateScheduledDate(parsedDate.date);
			if (!dateValidation.isValid) {
				set.status = 400;
				return { error: dateValidation.error || "Invalid scheduled date" };
			}
		}

		// A batch scheduled for the future is not competing for the CURRENT
		// rolling hourly window, so acceptance must not reject it on that
		// window: the worker re-checks the guard (deny_only) per item at
		// execution time and reschedules overflow past the window. All other
		// guard denials (ban, tenant, domain, sender address) and the Autumn
		// plan-capacity check below still apply at acceptance.
		const isFutureSchedule = Boolean(
			parsedDate && parsedDate.date.getTime() > Date.now(),
		);

		for (let index = 0; index < items.length; index++) {
			const validationError = validateBulkEmailItem(items[index], index);
			if (validationError) {
				set.status = 400;
				return { error: validationError };
			}

			if (senderPolicy) {
				const fromAddress = extractEmailAddress(items[index].from);
				if (!senderPolicyAllowsAddress(senderPolicy, fromAddress)) {
					set.status = 403;
					return {
						error: `emails[${index}]: this credential cannot send from that address`,
					};
				}
			}
		}

		const guardResults = new Map<string, OutboundSendGuardResult>();
		for (let index = 0; index < items.length; index++) {
			const item = items[index];
			const fromAddress = extractEmailAddress(item.from);
			const fromDomain = extractDomain(item.from);
			const { isAgentEmail } = canUserSendFromEmail(item.from);
			const guardKey = `${fromAddress}|${fromDomain}|${isAgentEmail}`;

			let guard = guardResults.get(guardKey);
			if (!guard) {
				// deny_only: rejecting an over-capacity bulk submission is
				// plain backpressure (the weighted capacity check below
				// enforces the hourly window). Pausing the tenant here would
				// permanently fail every already-queued batch item as
				// tenant_inactive. Single sends keep the pause behavior.
				// Future-scheduled batches use "ignore": the current window is
				// irrelevant to them and the worker enforces it at execution.
				guard = await enforceOutboundSendGuard({
					userId,
					fromAddress,
					fromDomain,
					isAgentEmail,
					hourlyLimitAction: isFutureSchedule ? "ignore" : "deny_only",
				});
				guardResults.set(guardKey, guard);
			}

			if (!guard.allowed) {
				console.log("🚫 Bulk outbound send blocked:", {
					userId,
					fromAddress,
					fromDomain,
					reasonCode: guard.reasonCode,
				});
				set.status = guard.statusCode;
				return {
					error: `emails[${index}]: ${guard.error || "Email send blocked"}`,
				};
			}
		}

		const allRecipients = items.flatMap(collectItemRecipients);
		const blocklistCheck = await checkRecipientsAgainstBlocklist(allRecipients);
		if (blocklistCheck.hasBlockedRecipients) {
			set.status = 400;
			return {
				error: `Cannot send to blocked recipient(s): ${blocklistCheck.blockedAddresses.join(", ")}. These addresses previously bounced.`,
			};
		}

		// Weighted acceptance for immediate batches: a bulk request must fit
		// in the remaining hourly window up front because the guard alone
		// only rejects per-send. One item = one recipient (enforced above),
		// so items.length is the true recipient count. Future-scheduled
		// batches skip this — the window that matters is the one at delivery
		// time, which the worker enforces per item (and reschedules past).
		if (!isFutureSchedule) {
			const capacity = await getHourlySendCapacity(userId);
			if (capacity.remaining !== null && items.length > capacity.remaining) {
				set.status = 429;
				return {
					error: `Bulk request of ${items.length} emails exceeds remaining hourly capacity (${capacity.remaining} of ${capacity.limit}).`,
				};
			}
		}

		const { data: emailCheck, error: emailCheckError } = await autumn.check({
			customer_id: userId,
			feature_id: "emails_sent",
			required_balance: items.length,
		});

		if (emailCheckError) {
			console.error("❌ Autumn bulk email check error:", emailCheckError);
			set.status = 500;
			return { error: "Failed to check email sending limits" };
		}

		if (!emailCheck.allowed) {
			set.status = 429;
			return {
				error: `Email sending limit does not cover ${items.length} more emails. Please upgrade your plan.`,
			};
		}

		// Dedupe attachment processing across items sharing identical inputs;
		// storage stays per-item so the worker reads a self-contained row.
		const processedAttachmentsByItem: Array<ProcessedAttachment[]> = [];
		const attachmentCache = new Map<string, ProcessedAttachment[]>();
		for (let index = 0; index < items.length; index++) {
			const item = items[index];
			if (!item.attachments || item.attachments.length === 0) {
				processedAttachmentsByItem.push([]);
				continue;
			}

			const cacheKey = attachmentsCacheKey(item.attachments);
			const cached = attachmentCache.get(cacheKey);
			if (cached) {
				processedAttachmentsByItem.push(cached);
				continue;
			}

			try {
				const processed = await processAttachments(item.attachments);
				attachmentCache.set(cacheKey, processed);
				processedAttachmentsByItem.push(processed);
			} catch (attachmentError) {
				set.status = 400;
				return {
					error: `emails[${index}]: ${
						attachmentError instanceof Error
							? attachmentError.message
							: "Failed to process attachments"
					}`,
				};
			}
		}

		// Aggregate stored-attachment cap: dedup above only saves processing
		// work — every item row still persists its own copy, so 100 items
		// repeating a 25MB attachment would otherwise write gigabytes into
		// sent_emails. Measure the exact serialized bytes per row (duplicates
		// included) and reject before creating any batch state.
		const serializedAttachmentsByItem: Array<string | null> =
			processedAttachmentsByItem.map((processed) =>
				processed.length > 0
					? JSON.stringify(attachmentsToStorageFormat(processed))
					: null,
			);
		const storedAttachmentBytes = totalStoredAttachmentBytes(
			serializedAttachmentsByItem,
		);
		if (storedAttachmentBytes > MAX_BULK_STORED_ATTACHMENT_BYTES) {
			const gotMib = (storedAttachmentBytes / (1024 * 1024)).toFixed(1);
			const maxMib = Math.floor(
				MAX_BULK_STORED_ATTACHMENT_BYTES / (1024 * 1024),
			);
			set.status = 400;
			return {
				error: `Batch attachment payload too large: ${gotMib}MiB stored across all emails (max ${maxMib}MiB per batch, counting each email's attachments separately). Reduce attachment sizes or split the batch.`,
			};
		}

		const batchId = nanoid();
		const now = new Date();
		const batchRow = {
			id: batchId,
			userId,
			status: EMAIL_BATCH_STATUS.QUEUED,
			total: items.length,
			scheduledAt: parsedDate?.date ?? null,
			timezone: parsedDate?.timezone ?? null,
			idempotencyKey: idempotencyKey ?? null,
			createdAt: now,
			updatedAt: now,
		};

		let createdBatch: EmailBatch;
		if (idempotencyKey) {
			const inserted = await db
				.insert(emailBatches)
				.values(batchRow)
				.onConflictDoNothing({
					target: [emailBatches.userId, emailBatches.idempotencyKey],
				})
				.returning();

			if (inserted.length === 0) {
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

				if (!existingBatch) {
					set.status = 500;
					return { error: "Failed to create batch" };
				}

				// A row that appeared between the pre-check and this insert is
				// seconds old, so recreation (stale cleanup) is never valid here.
				const outcome = await respondForExistingBatch(
					existingBatch,
					queueConfig,
					{ allowRecreate: false },
				);
				if (outcome.kind === "response") {
					console.log(
						"♻️ Concurrent idempotent bulk request - replaying batch:",
						existingBatch.id,
						"status:",
						outcome.status,
					);
					set.status = outcome.status;
					return outcome.body;
				}
				set.status = 409;
				return { error: CREATION_IN_PROGRESS_ERROR };
			}
			createdBatch = inserted[0];
		} else {
			const inserted = await db
				.insert(emailBatches)
				.values(batchRow)
				.returning();
			createdBatch = inserted[0];
		}

		const itemRows: NewSentEmail[] = items.map((item, index) => {
			// Validation guarantees exactly one 'to' recipient and no cc/bcc,
			// so each row is exactly one recipient for accounting purposes.
			const toAddresses = toAddressArray(item.to);
			const replyToAddresses = toAddressArray(item.reply_to);

			return {
				id: nanoid(),
				from: item.from,
				fromAddress: extractEmailAddress(item.from),
				fromDomain: extractDomain(item.from),
				to: JSON.stringify(toAddresses),
				cc: null,
				bcc: null,
				replyTo:
					replyToAddresses.length > 0 ? JSON.stringify(replyToAddresses) : null,
				subject: item.subject,
				textBody: item.text ?? null,
				htmlBody: item.html ?? null,
				headers: item.headers ? JSON.stringify(item.headers) : null,
				attachments: serializedAttachmentsByItem[index],
				tags: item.tags ? JSON.stringify(item.tags) : null,
				status: BULK_EMAIL_ITEM_STATUS.QUEUED,
				userId,
				batchId,
				batchIndex: index,
				createdAt: now,
				updatedAt: now,
			};
		});

		try {
			const chunkSize = 25;
			for (let start = 0; start < itemRows.length; start += chunkSize) {
				await db
					.insert(sentEmails)
					.values(itemRows.slice(start, start + chunkSize));
			}
		} catch (insertError) {
			console.error("❌ Failed to persist bulk items:", insertError);
			try {
				await db.delete(sentEmails).where(eq(sentEmails.batchId, batchId));
				await db.delete(emailBatches).where(eq(emailBatches.id, batchId));
			} catch (cleanupError) {
				console.error("❌ Failed to clean up partial batch:", cleanupError);
			}
			set.status = 500;
			return { error: "Failed to persist batch items" };
		}

		const notBefore = parsedDate
			? Math.floor(parsedDate.date.getTime() / 1000)
			: undefined;

		// Publication must skip items a racing cancel already flipped: the
		// worker's CAS claim would refuse them anyway, but we avoid creating
		// queue messages for cancelled rows at all. If the re-read fails,
		// fall back to the rows we just inserted (all queued moments ago).
		let publishableRows = itemRows.map((row) => ({
			id: row.id as string,
			batchIndex: row.batchIndex as number,
		}));
		try {
			const currentItems = await db
				.select({
					id: sentEmails.id,
					batchIndex: sentEmails.batchIndex,
					status: sentEmails.status,
				})
				.from(sentEmails)
				.where(
					and(eq(sentEmails.batchId, batchId), eq(sentEmails.userId, userId)),
				);
			publishableRows = currentItems
				.filter((item) => isBulkItemClaimable(item.status))
				.map((item) => ({
					id: item.id,
					batchIndex: item.batchIndex ?? 0,
				}));
		} catch (rereadError) {
			console.error(
				"⚠️ Pre-publish item re-read failed, publishing inserted rows:",
				rereadError,
			);
		}

		const outcome = await publishBulkQueueMessages({
			config: queueConfig,
			userId,
			batchId,
			entries: publishableRows,
			notBefore,
		});

		if (outcome.publishedCount > 0) {
			await mergeBatchQstashMessageIds(batchId, outcome.messageIdMap);
		}

		const unconfirmedQueued = publishableRows.filter(
			(row) => !outcome.messageIdMap[row.id],
		).length;

		// Never resurrects a batch cancelled while we were publishing: the
		// state update only touches queued/partially_queued parents.
		await applyBatchPublicationState({
			batchId,
			unconfirmedQueuedCount: unconfirmedQueued,
			errorMessage:
				unconfirmedQueued > 0
					? `${unconfirmedQueued} of ${publishableRows.length} email(s) are stored but not yet queued for delivery${outcome.errorMessage ? `: ${outcome.errorMessage}` : ""}. Retry the request with the same Idempotency-Key to publish the remainder, or cancel the batch.`
					: null,
		});

		// Total publication failure: the batch and all items are durable and
		// still 'queued', but nothing has been handed to the delivery queue.
		// Answer retryable so the caller replays under the same
		// Idempotency-Key (which republishes) instead of trusting a 202.
		if (publishableRows.length > 0 && outcome.publishedCount === 0) {
			console.error("❌ Bulk batch publication failed entirely:", {
				batchId,
				total: itemRows.length,
				error: outcome.errorMessage,
			});
			set.status = 503;
			return {
				error: `Batch ${batchId} was stored durably (status: partially_queued) but none of its ${publishableRows.length} email(s) could be queued for delivery. Retry this request with the same Idempotency-Key to publish them, or cancel the batch via POST /emails/bulk/${batchId}/cancel.`,
			};
		}

		let finalStatus: string =
			unconfirmedQueued === 0
				? EMAIL_BATCH_STATUS.QUEUED
				: EMAIL_BATCH_STATUS.PARTIALLY_QUEUED;

		// A cancel that raced this creation (possible once a concurrent
		// replay exposed the batch id) flipped items to cancelled; report
		// the parent's actual status instead of pretending it is queued.
		if (publishableRows.length < itemRows.length) {
			const [freshBatch] = await db
				.select({ status: emailBatches.status })
				.from(emailBatches)
				.where(eq(emailBatches.id, batchId))
				.limit(1);
			if (freshBatch) {
				finalStatus = freshBatch.status;
			}
		}

		console.log("✅ Bulk batch accepted:", {
			batchId,
			total: itemRows.length,
			publishedCount: outcome.publishedCount,
			unconfirmedQueued,
			status: finalStatus,
		});

		set.status = 202;
		return buildBulkAcceptedResponse(
			{
				id: createdBatch.id,
				status: finalStatus,
				total: createdBatch.total,
				scheduledAt: createdBatch.scheduledAt,
				timezone: createdBatch.timezone,
			},
			itemRows.map((row) => ({
				id: row.id as string,
				batchIndex: row.batchIndex as number,
			})),
		);
	},
	{
		body: SendBulkEmailBodySchema,
		response: {
			202: BulkAcceptedResponse,
			400: ErrorResponse,
			401: ErrorResponse,
			403: ErrorResponse,
			409: ErrorResponse,
			429: ErrorResponse,
			500: ErrorResponse,
			503: ErrorResponse,
		},
		detail: {
			hide: true,
			tags: ["Emails"],
			summary: "Send emails in bulk (internal)",
			description:
				"Accepts up to 100 emails (exactly one recipient each; cc/bcc are rejected), persists them durably, and queues each for delivery. Supports batch-level scheduled_at/timezone and an Idempotency-Key header.",
		},
	},
);
