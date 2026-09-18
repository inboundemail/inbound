import { and, eq, inArray, notInArray } from "drizzle-orm";
import { Elysia, t } from "elysia";
import {
	collectQstashMessageIds,
	deleteQStashMessages,
} from "@/app/api/e2/emails/batch-queue";
import {
	BatchCancelResponseSchema,
	BatchErrorResponseSchema,
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

const TERMINAL_BATCH_STATUSES: Set<string> = new Set([
	EMAIL_BATCH_STATUS.COMPLETED,
	EMAIL_BATCH_STATUS.FAILED,
	EMAIL_BATCH_STATUS.PARTIALLY_FAILED,
	EMAIL_BATCH_STATUS.REQUIRES_ATTENTION,
]);

export const cancelEmailBatch = new Elysia().delete(
	"/emails/batch/:batchId",
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

		if (TERMINAL_BATCH_STATUSES.has(preRefreshed.status)) {
			set.status = 409;
			return {
				error: "Cannot cancel batch",
				details: `Batch is in terminal status: ${preRefreshed.status}`,
			};
		}

		const casResult = await db
			.update(emailBatches)
			.set({
				status: EMAIL_BATCH_STATUS.CANCELLED,
				completedAt: new Date(),
				updatedAt: new Date(),
			})
			.where(
				and(
					eq(emailBatches.id, params.batchId),
					eq(emailBatches.userId, userId),
					notInArray(emailBatches.status, [
						EMAIL_BATCH_STATUS.COMPLETED,
						EMAIL_BATCH_STATUS.FAILED,
						EMAIL_BATCH_STATUS.PARTIALLY_FAILED,
						EMAIL_BATCH_STATUS.REQUIRES_ATTENTION,
					]),
				),
			)
			.returning({ id: emailBatches.id });

		if (casResult.length === 0) {
			const refreshed = await refreshEmailBatchStatus(params.batchId, userId);
			if (refreshed.status === EMAIL_BATCH_STATUS.CANCELLED) {
				return {
					id: batch.id,
					status: EMAIL_BATCH_STATUS.CANCELLED,
					cancelled_count: 0,
					counts: refreshed.counts,
				};
			}
			set.status = 409;
			return {
				error: "Cannot cancel batch",
				details: `Batch is in terminal status: ${refreshed.status}`,
			};
		}

		const pendingChildren = await db
			.select({
				id: sentEmails.id,
				qstashMessageId: sentEmails.qstashMessageId,
			})
			.from(sentEmails)
			.where(
				and(
					eq(sentEmails.batchId, params.batchId),
					eq(sentEmails.userId, userId),
					eq(sentEmails.status, SENT_EMAIL_STATUS.PENDING),
				),
			);

		let cancelledCount = 0;
		if (pendingChildren.length > 0) {
			const pendingIds = pendingChildren.map((c) => c.id);
			const cancelResult = await db
				.update(sentEmails)
				.set({
					status: SENT_EMAIL_STATUS.CANCELLED,
					updatedAt: new Date(),
				})
				.where(
					and(
						inArray(sentEmails.id, pendingIds),
						eq(sentEmails.userId, userId),
						eq(sentEmails.batchId, params.batchId),
						eq(sentEmails.status, SENT_EMAIL_STATUS.PENDING),
					),
				)
				.returning({ id: sentEmails.id });

			cancelledCount = cancelResult.length;
		}

		const qstashIds = collectQstashMessageIds(pendingChildren);
		if (qstashIds.length > 0) {
			await deleteQStashMessages(qstashIds);
		}

		const refreshed = await refreshEmailBatchStatus(params.batchId, userId);

		return {
			id: batch.id,
			status: EMAIL_BATCH_STATUS.CANCELLED,
			cancelled_count: cancelledCount,
			counts: refreshed.counts,
		};
	},
	{
		params: t.Object({
			batchId: t.String(),
		}),
		response: {
			200: BatchCancelResponseSchema,
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
			summary: "Cancel a batch",
			description:
				"Cancel a batch email send. Only pending items are cancelled; items already processing or sent remain unchanged. Returns 409 if batch is already in a terminal state.",
		},
	},
);
