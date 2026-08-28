import { Client as QStashClient } from "@upstash/qstash";
import { and, eq, inArray, sql } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { db } from "@/lib/db";
import {
	BULK_EMAIL_ITEM_STATUS,
	EMAIL_BATCH_STATUS,
	emailBatches,
	sentEmails,
} from "@/lib/db/schema";
import { authenticateEmailSend } from "../lib/send-auth";
import { parseQstashMessageIdMap } from "./bulk-helpers";

const BulkCancelResponse = t.Object({
	id: t.String(),
	status: t.String(),
	total: t.Integer(),
	cancelled_count: t.Integer(),
	message: t.String(),
});

const ErrorResponse = t.Object({
	error: t.String(),
});

export const cancelBulkEmailBatch = new Elysia().post(
	"/emails/bulk/:id/cancel",
	async ({ request, params, set }) => {
		console.log(
			"🗑️ POST /api/e2/emails/bulk/:id/cancel - Starting request for:",
			params.id,
		);

		// Same credential surface as batch creation: full API keys/sessions
		// (rate limited) and managed mail_/imap_ credentials, scoped to the
		// owning user.
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

		// Atomic cancel: only unclaimed 'queued' items flip to 'cancelled'.
		// Items already claimed by the worker (processing/sent/failed) are
		// untouched — the worker's CAS claim skips cancelled rows.
		const cancelledItems = await db
			.update(sentEmails)
			.set({
				status: BULK_EMAIL_ITEM_STATUS.CANCELLED,
				updatedAt: new Date(),
			})
			.where(
				and(
					eq(sentEmails.batchId, batch.id),
					eq(sentEmails.userId, userId),
					eq(sentEmails.status, BULK_EMAIL_ITEM_STATUS.QUEUED),
				),
			)
			.returning({ id: sentEmails.id });

		const cancelledCount = cancelledItems.length;
		let finalStatus = batch.status;

		if (cancelledCount > 0) {
			finalStatus = EMAIL_BATCH_STATUS.CANCELLED;
			await db
				.update(emailBatches)
				.set({
					status: EMAIL_BATCH_STATUS.CANCELLED,
					cancelledCount: sql`${emailBatches.cancelledCount} + ${cancelledCount}`,
					updatedAt: new Date(),
				})
				.where(
					and(
						eq(emailBatches.id, batch.id),
						inArray(emailBatches.status, [
							EMAIL_BATCH_STATUS.QUEUED,
							EMAIL_BATCH_STATUS.PARTIALLY_QUEUED,
							EMAIL_BATCH_STATUS.CANCELLED,
						]),
					),
				);

			await db
				.update(emailBatches)
				.set({ completedAt: new Date() })
				.where(
					and(
						eq(emailBatches.id, batch.id),
						sql`${emailBatches.sentCount} + ${emailBatches.failedCount} + ${emailBatches.cancelledCount} >= ${emailBatches.total}`,
					),
				);

			const messageIdMap = parseQstashMessageIdMap(batch.qstashMessageIds);
			const messageIds = cancelledItems
				.map((item) => messageIdMap[item.id])
				.filter((messageId): messageId is string => Boolean(messageId));

			if (messageIds.length > 0) {
				try {
					const qstashClient = new QStashClient({
						token: process.env.QSTASH_TOKEN!,
					});
					const deleted = await qstashClient.messages.deleteMany(messageIds);
					console.log(
						`✅ Deleted ${deleted} queued QStash messages for batch:`,
						batch.id,
					);
				} catch (qstashError) {
					// Non-fatal: the worker's CAS claim ignores cancelled items,
					// so an undeleted QStash delivery cannot cause a send.
					console.error(
						"⚠️ Failed to delete QStash messages (continuing):",
						qstashError,
					);
				}
			}
		}

		console.log("✅ Bulk batch cancel processed:", {
			batchId: batch.id,
			cancelledCount,
			status: finalStatus,
		});

		return {
			id: batch.id,
			status: finalStatus,
			total: batch.total,
			cancelled_count: cancelledCount,
			message:
				cancelledCount > 0
					? `Cancelled ${cancelledCount} queued email(s)`
					: "No queued emails were eligible for cancellation",
		};
	},
	{
		params: t.Object({
			id: t.String(),
		}),
		response: {
			200: BulkCancelResponse,
			401: ErrorResponse,
			404: ErrorResponse,
			500: ErrorResponse,
		},
		detail: {
			hide: true,
			tags: ["Emails"],
			summary: "Cancel a bulk batch (internal)",
			description:
				"Cancels all still-queued items in a batch. Items already claimed, sent, failed, or cancelled are not affected.",
		},
	},
);
