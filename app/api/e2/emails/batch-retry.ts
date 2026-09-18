import { and, eq, notInArray } from "drizzle-orm";
import { Elysia, t } from "elysia";
import {
	incrementPublishAttempt,
	publishBatchToQStash,
	type QueueItem,
	recomputePublishedCount,
} from "@/app/api/e2/emails/batch-queue";
import {
	BatchErrorResponseSchema,
	BatchResponseSchema,
} from "@/app/api/e2/emails/batch-schemas";
import { refreshEmailBatchStatus } from "@/app/api/e2/emails/batch-state";
import { validateAndRateLimit } from "@/app/api/e2/lib/auth";
import { db } from "@/lib/db";
import {
	EMAIL_BATCH_STATUS,
	emailBatches,
	SENT_EMAIL_STATUS,
	sentEmails,
} from "@/lib/db/schema";

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

export const retryEmailBatch = new Elysia().post(
	"/emails/batch/:batchId/retry",
	async ({ request, params, set }) => {
		const userId = await validateAndRateLimit(request, set);

		const [batch] = await db
			.select()
			.from(emailBatches)
			.where(
				and(
					eq(emailBatches.id, params.batchId),
					eq(emailBatches.userId, userId),
				),
			)
			.limit(1);

		if (!batch) {
			set.status = 404;
			return { error: "Batch not found" };
		}

		const preRefreshed = await refreshEmailBatchStatus(params.batchId, userId);

		if (TERMINAL_BATCH_STATUSES_SET.has(preRefreshed.status)) {
			set.status = 409;
			return {
				error: "Cannot retry batch",
				details: `Batch is in terminal status: ${preRefreshed.status}`,
			};
		}

		const pendingRows = await db
			.select({
				id: sentEmails.id,
				batchIndex: sentEmails.batchIndex,
			})
			.from(sentEmails)
			.where(
				and(
					eq(sentEmails.batchId, params.batchId),
					eq(sentEmails.userId, userId),
					eq(sentEmails.status, SENT_EMAIL_STATUS.PENDING),
				),
			);

		if (pendingRows.length === 0) {
			const refreshed = await refreshEmailBatchStatus(params.batchId, userId);
			return {
				id: batch.id,
				status: refreshed.status,
				counts: refreshed.counts,
				created_at: batch.createdAt?.toISOString() ?? new Date().toISOString(),
				updated_at: new Date().toISOString(),
			};
		}

		const itemsToQueue: QueueItem[] = [];
		for (const row of pendingRows) {
			const newAttempt = await incrementPublishAttempt(
				row.id,
				userId,
				params.batchId,
			);
			if (newAttempt > 0) {
				itemsToQueue.push({
					emailId: row.id,
					userId,
					batchId: params.batchId,
					batchIndex: row.batchIndex ?? 0,
					attempt: newAttempt,
				});
			}
		}

		if (itemsToQueue.length > 0) {
			const { lastError } = await publishBatchToQStash(itemsToQueue);

			const newPublishedCount = await recomputePublishedCount(
				params.batchId,
				userId,
			);
			const newStatus =
				newPublishedCount < batch.totalCount
					? EMAIL_BATCH_STATUS.PARTIALLY_QUEUED
					: EMAIL_BATCH_STATUS.QUEUED;

			const finalLastError =
				newPublishedCount >= batch.totalCount ? null : lastError;

			await db
				.update(emailBatches)
				.set({
					status: newStatus,
					publishedCount: newPublishedCount,
					lastError: finalLastError,
					updatedAt: new Date(),
				})
				.where(
					and(
						eq(emailBatches.id, params.batchId),
						eq(emailBatches.userId, userId),
						notInArray(emailBatches.status, [...TERMINAL_BATCH_STATUSES]),
					),
				);
		}

		const refreshed = await refreshEmailBatchStatus(params.batchId, userId);

		return {
			id: batch.id,
			status: refreshed.status,
			counts: refreshed.counts,
			created_at: batch.createdAt?.toISOString() ?? new Date().toISOString(),
			updated_at: new Date().toISOString(),
		};
	},
	{
		params: t.Object({
			batchId: t.String(),
		}),
		response: {
			200: BatchResponseSchema,
			401: BatchErrorResponseSchema,
			403: BatchErrorResponseSchema,
			404: BatchErrorResponseSchema,
			409: BatchErrorResponseSchema,
			429: BatchErrorResponseSchema,
			500: BatchErrorResponseSchema,
			503: BatchErrorResponseSchema,
		},
		detail: {
			tags: ["Emails"],
			summary: "Retry failed batch publications",
			description:
				"Retry publishing pending items that failed to queue to QStash. Increments publish attempts and requeues all pending items.",
		},
	},
);
