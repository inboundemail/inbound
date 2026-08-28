import { Client as QStashClient } from "@upstash/qstash";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
	BULK_EMAIL_ITEM_STATUS,
	EMAIL_BATCH_STATUS,
	type EmailBatch,
	emailBatches,
	sentEmails,
} from "@/lib/db/schema";
import {
	type BulkItemToPublish,
	type BulkPublicationItemState,
	buildBulkPublishRequest,
	countUnconfirmedQueuedItems,
	mergeQstashMessageIdMaps,
	parseQstashMessageIdMap,
	resolveBatchStatusAfterPublish,
	selectItemsNeedingPublication,
} from "./bulk-helpers";

/**
 * Shared QStash publication + reconciliation for bulk batches.
 *
 * Publication is intentionally not transactional with item creation, so this
 * module implements the recovery half of the outbox pattern: item rows are
 * the durable source of truth, `email_batches.qstash_message_ids` records
 * which items have a confirmed publication, and reconciliation republishes
 * still-queued items whose message was never confirmed or was lost. The
 * worker's compare-and-swap claim makes duplicate deliveries safe, so
 * reconciliation only ever risks wasted deliveries, never double sends.
 */

export interface BulkQueueConfig {
	webhookUrl: string;
	qstashToken: string;
}

export function getBulkQueueConfig(): BulkQueueConfig | null {
	const appUrl = process.env.NEXT_PUBLIC_APP_URL;
	const qstashToken = process.env.QSTASH_TOKEN;
	if (!appUrl || !qstashToken) {
		return null;
	}
	return {
		webhookUrl: `${appUrl}/api/webhooks/send-email`,
		qstashToken,
	};
}

export interface BulkPublishEntry {
	id: string;
	batchIndex: number;
	/** Optional dedup override for recovery republishes. */
	deduplicationId?: string;
}

export interface BulkPublishOutcome {
	/** Item id -> QStash message id for every confirmed publication. */
	messageIdMap: Record<string, string>;
	publishedCount: number;
	failedCount: number;
	errorMessage: string | null;
}

/**
 * Publishes queue messages for the given items. Never throws: failures are
 * reported in the outcome so callers can persist partial progress before
 * deciding how to answer.
 */
export async function publishBulkQueueMessages(params: {
	config: BulkQueueConfig;
	userId: string;
	batchId: string;
	entries: BulkPublishEntry[];
	notBefore?: number;
}): Promise<BulkPublishOutcome> {
	const { config, userId, batchId, entries, notBefore } = params;

	if (entries.length === 0) {
		return {
			messageIdMap: {},
			publishedCount: 0,
			failedCount: 0,
			errorMessage: null,
		};
	}

	const requests = entries.map((entry) =>
		buildBulkPublishRequest({
			webhookUrl: config.webhookUrl,
			emailId: entry.id,
			userId,
			batchId,
			batchIndex: entry.batchIndex,
			notBefore,
			deduplicationId: entry.deduplicationId,
		}),
	);

	const messageIdMap: Record<string, string> = {};
	let errorMessage: string | null = null;

	try {
		const qstashClient = new QStashClient({ token: config.qstashToken });
		const responses = await qstashClient.batchJSON(requests);

		responses.forEach((response, index) => {
			const messageId = response?.messageId;
			if (messageId) {
				messageIdMap[requests[index].body.emailId] = messageId;
			}
		});
	} catch (qstashError) {
		console.error("❌ Failed to publish bulk queue messages:", qstashError);
		errorMessage =
			qstashError instanceof Error
				? qstashError.message
				: "Failed to enqueue batch";
	}

	const publishedCount = Object.keys(messageIdMap).length;
	return {
		messageIdMap,
		publishedCount,
		failedCount: entries.length - publishedCount,
		errorMessage,
	};
}

/**
 * Merges newly confirmed message ids into the parent's JSON map without
 * clobbering concurrent writers. The merge happens inside Postgres in a
 * single statement (`jsonb ||`), so a creator, a replay, and a status-read
 * reconciler can all record ids concurrently; last-writer-wins only applies
 * per key, which is fine because a given item id maps to equivalent ids.
 * Falls back to read-merge-write if the stored value is not valid JSON.
 */
export async function mergeBatchQstashMessageIds(
	batchId: string,
	newIds: Record<string, string>,
): Promise<void> {
	if (Object.keys(newIds).length === 0) return;

	const serialized = JSON.stringify(newIds);
	try {
		await db
			.update(emailBatches)
			.set({
				qstashMessageIds: sql`(COALESCE(${emailBatches.qstashMessageIds}, '{}')::jsonb || ${serialized}::jsonb)::text`,
				updatedAt: new Date(),
			})
			.where(eq(emailBatches.id, batchId));
	} catch (mergeError) {
		console.error(
			"⚠️ Atomic message-id merge failed, falling back to read-merge-write:",
			mergeError,
		);
		const [row] = await db
			.select({ qstashMessageIds: emailBatches.qstashMessageIds })
			.from(emailBatches)
			.where(eq(emailBatches.id, batchId))
			.limit(1);
		const merged = mergeQstashMessageIdMaps(
			parseQstashMessageIdMap(row?.qstashMessageIds ?? null),
			newIds,
		);
		await db
			.update(emailBatches)
			.set({
				qstashMessageIds: JSON.stringify(merged),
				updatedAt: new Date(),
			})
			.where(eq(emailBatches.id, batchId));
	}
}

/**
 * Records the publication state on the parent without ever resurrecting a
 * terminal batch: only 'queued'/'partially_queued' parents are touched, so
 * a concurrent cancel (CANCELLED) or the last finishing worker (COMPLETED)
 * always wins over a slower creator or reconciler.
 */
export async function applyBatchPublicationState(params: {
	batchId: string;
	unconfirmedQueuedCount: number;
	errorMessage: string | null;
}): Promise<void> {
	const fullyPublished = params.unconfirmedQueuedCount === 0;
	await db
		.update(emailBatches)
		.set({
			status: resolveBatchStatusAfterPublish(params.unconfirmedQueuedCount),
			lastError: fullyPublished ? null : params.errorMessage,
			updatedAt: new Date(),
		})
		.where(
			and(
				eq(emailBatches.id, params.batchId),
				inArray(emailBatches.status, [
					EMAIL_BATCH_STATUS.QUEUED,
					EMAIL_BATCH_STATUS.PARTIALLY_QUEUED,
				]),
			),
		);
}

export interface BulkReconcileResult {
	/** Items this pass tried to (re)publish. */
	attempted: BulkItemToPublish[];
	publishedCount: number;
	/** Queued items still lacking a confirmed publication after this pass. */
	unconfirmedQueuedCount: number;
	errorMessage: string | null;
}

/**
 * Outbox reconciliation for one batch: republishes still-queued items whose
 * publication was never confirmed ("missing") or whose message is provably
 * overdue ("abandoned"), then records the honest publication state on the
 * parent. Scheduled batches keep their original notBefore. Cancelled
 * batches are never touched.
 */
export async function reconcileBatchPublication(params: {
	config: BulkQueueConfig;
	batch: Pick<
		EmailBatch,
		| "id"
		| "userId"
		| "status"
		| "scheduledAt"
		| "createdAt"
		| "qstashMessageIds"
	>;
	items: BulkPublicationItemState[];
	/**
	 * true on explicit idempotent replays (republish never-confirmed items);
	 * false on status reads (only recover abandoned confirmed publications —
	 * a read must not start delivering emails the client was told were not
	 * queued).
	 */
	includeMissing: boolean;
}): Promise<BulkReconcileResult> {
	const { config, batch, items, includeMissing } = params;
	const nowMs = Date.now();
	const messageIdMap = parseQstashMessageIdMap(batch.qstashMessageIds);

	if (batch.status === EMAIL_BATCH_STATUS.CANCELLED) {
		return {
			attempted: [],
			publishedCount: 0,
			unconfirmedQueuedCount: countUnconfirmedQueuedItems(items, messageIdMap),
			errorMessage: null,
		};
	}

	const toPublish = selectItemsNeedingPublication({
		items,
		messageIdMap,
		batchScheduledAt: batch.scheduledAt,
		batchCreatedAt: batch.createdAt,
		nowMs,
		includeMissing,
	});

	if (toPublish.length === 0) {
		const unconfirmedQueuedCount = countUnconfirmedQueuedItems(
			items,
			messageIdMap,
		);
		// Repair advisory drift: every queued item has a confirmed
		// publication but the parent still says partially_queued (e.g. the
		// creator crashed between recording ids and updating the status).
		if (
			unconfirmedQueuedCount === 0 &&
			batch.status === EMAIL_BATCH_STATUS.PARTIALLY_QUEUED
		) {
			await applyBatchPublicationState({
				batchId: batch.id,
				unconfirmedQueuedCount: 0,
				errorMessage: null,
			});
		}
		return {
			attempted: [],
			publishedCount: 0,
			unconfirmedQueuedCount,
			errorMessage: null,
		};
	}

	// Preserve the batch-level schedule on republish: a replay of a
	// scheduled batch must not deliver early.
	const notBefore =
		batch.scheduledAt && batch.scheduledAt.getTime() > nowMs
			? Math.floor(batch.scheduledAt.getTime() / 1000)
			: undefined;

	const outcome = await publishBulkQueueMessages({
		config,
		userId: batch.userId,
		batchId: batch.id,
		entries: toPublish,
		notBefore,
	});

	if (outcome.publishedCount > 0) {
		await mergeBatchQstashMessageIds(batch.id, outcome.messageIdMap);

		// Bump updatedAt on the republished (still-queued) rows so repeated
		// reconciliation passes back off instead of republishing every time.
		try {
			await db
				.update(sentEmails)
				.set({ updatedAt: new Date() })
				.where(
					and(
						inArray(
							sentEmails.id,
							toPublish
								.filter((item) => outcome.messageIdMap[item.id])
								.map((item) => item.id),
						),
						eq(sentEmails.userId, batch.userId),
						eq(sentEmails.status, BULK_EMAIL_ITEM_STATUS.QUEUED),
					),
				);
		} catch (bumpError) {
			console.error(
				"⚠️ Failed to bump reconciled bulk items (non-fatal):",
				bumpError,
			);
		}
	}

	const mergedMap = mergeQstashMessageIdMaps(
		messageIdMap,
		outcome.messageIdMap,
	);
	const unconfirmedQueuedCount = countUnconfirmedQueuedItems(items, mergedMap);

	const errorMessage =
		unconfirmedQueuedCount > 0
			? (outcome.errorMessage ??
				`${unconfirmedQueuedCount} queued email(s) awaiting publication`)
			: null;

	await applyBatchPublicationState({
		batchId: batch.id,
		unconfirmedQueuedCount,
		errorMessage,
	});

	console.log("🔁 Bulk batch publication reconciled:", {
		batchId: batch.id,
		attempted: toPublish.length,
		published: outcome.publishedCount,
		unconfirmedQueuedCount,
	});

	return {
		attempted: toPublish,
		publishedCount: outcome.publishedCount,
		unconfirmedQueuedCount,
		errorMessage,
	};
}
