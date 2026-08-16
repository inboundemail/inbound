import { and, asc, eq } from "drizzle-orm";
import { Elysia, t } from "elysia";
import {
	BatchDetailResponseSchema,
	BatchErrorResponseSchema,
} from "@/app/api/e2/emails/batch-schemas";
import { refreshEmailBatchStatus } from "@/app/api/e2/emails/batch-state";
import { validateAndRateLimit } from "@/app/api/e2/lib/auth";
import { db } from "@/lib/db";
import { emailBatches, sentEmails } from "@/lib/db/schema";

export const getEmailBatch = new Elysia().get(
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

		const refreshed = await refreshEmailBatchStatus(params.batchId, userId);

		const items = await db
			.select({
				id: sentEmails.id,
				batchIndex: sentEmails.batchIndex,
				status: sentEmails.status,
				messageId: sentEmails.messageId,
				failureReason: sentEmails.failureReason,
				createdAt: sentEmails.createdAt,
				sentAt: sentEmails.sentAt,
			})
			.from(sentEmails)
			.where(
				and(
					eq(sentEmails.batchId, params.batchId),
					eq(sentEmails.userId, userId),
				),
			)
			.orderBy(asc(sentEmails.batchIndex));

		return {
			id: batch.id,
			status: refreshed.status,
			counts: refreshed.counts,
			items: items.map((item) => ({
				id: item.id,
				batch_index: item.batchIndex ?? 0,
				status: item.status,
				message_id: item.messageId ?? null,
				failure_reason: item.failureReason ?? null,
				created_at: item.createdAt?.toISOString() ?? new Date().toISOString(),
				sent_at: item.sentAt?.toISOString() ?? null,
			})),
			created_at: batch.createdAt?.toISOString() ?? new Date().toISOString(),
			updated_at: batch.updatedAt?.toISOString(),
		};
	},
	{
		params: t.Object({
			batchId: t.String(),
		}),
		response: {
			200: BatchDetailResponseSchema,
			401: BatchErrorResponseSchema,
			403: BatchErrorResponseSchema,
			404: BatchErrorResponseSchema,
			429: BatchErrorResponseSchema,
			500: BatchErrorResponseSchema,
			503: BatchErrorResponseSchema,
		},
		detail: {
			tags: ["Emails"],
			summary: "Get batch status",
			description:
				"Retrieve the current status of a batch email send, including counts and individual item summaries.",
		},
	},
);
