import { and, asc, eq } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { db } from "@/lib/db";
import { emailBatches, sentEmails } from "@/lib/db/schema";
import { formatScheduledDate } from "@/lib/utils/date-parser";
import { authenticateEmailSend } from "../lib/send-auth";
import {
	computeBatchCounts,
	countStaleProcessingItems,
	countUnconfirmedQueuedItems,
	deriveBatchReadStatus,
	parseQstashMessageIdMap,
} from "./bulk-helpers";
import { getBulkQueueConfig, reconcileBatchPublication } from "./bulk-queue";

const BulkBatchItemSchema = t.Object({
	id: t.String(),
	index: t.Integer(),
	status: t.String(),
	from: t.String(),
	subject: t.String(),
	message_id: t.Optional(t.String()),
	failure_reason: t.Optional(t.String()),
	sent_at: t.Optional(t.String()),
});

const BulkBatchStatusResponse = t.Object({
	id: t.String(),
	status: t.String(),
	total: t.Integer(),
	counts: t.Object({
		queued: t.Integer(),
		processing: t.Integer(),
		sent: t.Integer(),
		failed: t.Integer(),
		cancelled: t.Integer(),
	}),
	// Ops visibility only: items stuck in 'processing' beyond any
	// legitimate worker lifetime. Never auto-requeued (could double-send).
	stale_processing: t.Optional(t.Integer()),
	scheduled_at: t.Optional(t.String()),
	timezone: t.Optional(t.String()),
	created_at: t.Optional(t.String()),
	completed_at: t.Optional(t.String()),
	last_error: t.Optional(t.String()),
	data: t.Array(BulkBatchItemSchema),
});

const ErrorResponse = t.Object({
	error: t.String(),
});

export const getBulkEmailBatch = new Elysia().get(
	"/emails/bulk/:id",
	async ({ request, params, set }) => {
		console.log(
			"📊 GET /api/e2/emails/bulk/:id - Starting request for:",
			params.id,
		);

		// Same credential surface as batch creation: full API keys/sessions
		// (rate limited) and managed mail_/imap_ credentials. The sender
		// policy is irrelevant for reads; scoping stays per user.
		const { userId } = await authenticateEmailSend(request, set);

		const [batch] = await db
			.select()
			.from(emailBatches)
			.where(
				and(eq(emailBatches.id, params.id), eq(emailBatches.userId, userId)),
			)
			.limit(1);

		if (!batch) {
			set.status = 404;
			return { error: "Batch not found" };
		}

		const items = await db
			.select({
				id: sentEmails.id,
				batchIndex: sentEmails.batchIndex,
				status: sentEmails.status,
				from: sentEmails.from,
				subject: sentEmails.subject,
				messageId: sentEmails.messageId,
				failureReason: sentEmails.failureReason,
				sentAt: sentEmails.sentAt,
				updatedAt: sentEmails.updatedAt,
			})
			.from(sentEmails)
			.where(
				and(eq(sentEmails.batchId, batch.id), eq(sentEmails.userId, userId)),
			)
			.orderBy(asc(sentEmails.batchIndex));

		const counts = computeBatchCounts(items.map((item) => item.status));

		// Stuck-claim visibility: claimed items untouched far beyond any
		// worker lifetime (crashed mid-send, or sent but the success write
		// failed). Surfaced for ops, never auto-requeued — a retry after an
		// ambiguous SES hand-off could double-send.
		const staleProcessing = countStaleProcessingItems(items, Date.now());

		// Never-confirmed queued items (creator crashed before publishing).
		// GET deliberately does not publish them — only an idempotent replay
		// may — but the derived status below must not claim 'queued' either.
		const unconfirmedQueued = countUnconfirmedQueuedItems(
			items,
			parseQstashMessageIdMap(batch.qstashMessageIds),
		);

		// Abandonment recovery on status reads: items that were confirmed
		// queued but whose delivery message is long overdue (retries
		// exhausted / DLQ'd) get a replacement published. Never publishes
		// never-confirmed items (includeMissing: false) — a read must not
		// start delivering emails the client was told were not queued — and
		// never touches cancelled batches. Failures are swallowed: a status
		// read must keep working even when the queue is down.
		if (counts.queued > 0) {
			const queueConfig = getBulkQueueConfig();
			if (queueConfig) {
				try {
					await reconcileBatchPublication({
						config: queueConfig,
						batch,
						items,
						includeMissing: false,
					});
				} catch (reconcileError) {
					console.error(
						"⚠️ Bulk batch status reconciliation failed (continuing):",
						reconcileError,
					);
				}
			}
		}

		return {
			id: batch.id,
			// Derived (not mutated): item rows are the source of truth, so a
			// batch whose advisory status drifted still reads as completed
			// once every item is terminal, and a stored 'queued' with
			// never-published items reads as partially_queued. CANCELLED is
			// preserved.
			status: deriveBatchReadStatus(
				batch.status,
				counts,
				batch.total,
				unconfirmedQueued,
			),
			total: batch.total,
			counts,
			...(staleProcessing > 0 && { stale_processing: staleProcessing }),
			...(batch.scheduledAt && {
				scheduled_at: formatScheduledDate(batch.scheduledAt),
				timezone: batch.timezone || "UTC",
			}),
			...(batch.createdAt && { created_at: batch.createdAt.toISOString() }),
			...(batch.completedAt && {
				completed_at: batch.completedAt.toISOString(),
			}),
			...(batch.lastError && { last_error: batch.lastError }),
			data: items.map((item) => ({
				id: item.id,
				index: item.batchIndex ?? 0,
				status: item.status,
				from: item.from,
				subject: item.subject,
				...(item.messageId && { message_id: item.messageId }),
				...(item.failureReason && { failure_reason: item.failureReason }),
				...(item.sentAt && { sent_at: item.sentAt.toISOString() }),
			})),
		};
	},
	{
		params: t.Object({
			id: t.String(),
		}),
		response: {
			200: BulkBatchStatusResponse,
			401: ErrorResponse,
			404: ErrorResponse,
			500: ErrorResponse,
		},
		detail: {
			hide: true,
			tags: ["Emails"],
			summary: "Get bulk batch status (internal)",
			description:
				"Aggregate and per-item status for a bulk email batch. Item rows are the source of truth for counts.",
		},
	},
);
