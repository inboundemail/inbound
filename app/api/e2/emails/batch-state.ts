import { and, count, eq, notInArray } from "drizzle-orm";

import { db } from "@/lib/db";
import {
	EMAIL_BATCH_STATUS,
	emailBatches,
	SENT_EMAIL_STATUS,
	sentEmails,
} from "@/lib/db/schema";

export interface BatchStatusResult {
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
}

const IMMUTABLE_STATUSES: readonly string[] = [
	EMAIL_BATCH_STATUS.COMPLETED,
	EMAIL_BATCH_STATUS.PARTIALLY_FAILED,
	EMAIL_BATCH_STATUS.FAILED,
	EMAIL_BATCH_STATUS.CANCELLED,
];

const IMMUTABLE_STATUS_SET = new Set<string>(IMMUTABLE_STATUSES);

export async function refreshEmailBatchStatus(
	batchId: string,
	userId: string,
): Promise<BatchStatusResult> {
	const [batch] = await db
		.select({
			id: emailBatches.id,
			status: emailBatches.status,
			totalCount: emailBatches.totalCount,
			publishedCount: emailBatches.publishedCount,
		})
		.from(emailBatches)
		.where(and(eq(emailBatches.id, batchId), eq(emailBatches.userId, userId)))
		.limit(1);

	if (!batch) {
		throw new Error(`Batch not found: ${batchId}`);
	}

	const statusCounts = await db
		.select({
			status: sentEmails.status,
			count: count(),
		})
		.from(sentEmails)
		.where(and(eq(sentEmails.batchId, batchId), eq(sentEmails.userId, userId)))
		.groupBy(sentEmails.status);

	let childTotal = 0;
	const counts = {
		total: batch.totalCount,
		pending: 0,
		processing: 0,
		sent: 0,
		failed: 0,
		cancelled: 0,
		provider_unknown: 0,
	};

	for (const row of statusCounts) {
		const statusCount = Number(row.count);
		childTotal += statusCount;
		switch (row.status) {
			case SENT_EMAIL_STATUS.PENDING:
				counts.pending = statusCount;
				break;
			case SENT_EMAIL_STATUS.PROCESSING:
				counts.processing = statusCount;
				break;
			case SENT_EMAIL_STATUS.SENT:
				counts.sent = statusCount;
				break;
			case SENT_EMAIL_STATUS.FAILED:
				counts.failed = statusCount;
				break;
			case SENT_EMAIL_STATUS.CANCELLED:
				counts.cancelled = statusCount;
				break;
			case SENT_EMAIL_STATUS.PROVIDER_UNKNOWN:
				counts.provider_unknown = statusCount;
				break;
		}
	}

	if (IMMUTABLE_STATUS_SET.has(batch.status)) {
		return { status: batch.status, counts };
	}

	let derivedStatus: string;
	const publishedCount = batch.publishedCount ?? 0;
	const parentTotalCount = batch.totalCount;
	const hasPendingOrProcessing = counts.pending > 0 || counts.processing > 0;
	const hasProviderUnknown = counts.provider_unknown > 0;
	const allChildrenResolved =
		childTotal === parentTotalCount &&
		!hasPendingOrProcessing &&
		!hasProviderUnknown;

	if (hasPendingOrProcessing) {
		if (counts.pending > 0 && publishedCount < parentTotalCount) {
			derivedStatus = EMAIL_BATCH_STATUS.PARTIALLY_QUEUED;
		} else if (counts.pending > 0 && counts.processing > 0) {
			derivedStatus = EMAIL_BATCH_STATUS.PROCESSING;
		} else if (counts.pending > 0) {
			derivedStatus = EMAIL_BATCH_STATUS.QUEUED;
		} else {
			derivedStatus = EMAIL_BATCH_STATUS.PROCESSING;
		}
	} else if (hasProviderUnknown) {
		derivedStatus = EMAIL_BATCH_STATUS.REQUIRES_ATTENTION;
	} else if (allChildrenResolved && parentTotalCount > 0) {
		if (counts.sent === parentTotalCount) {
			derivedStatus = EMAIL_BATCH_STATUS.COMPLETED;
		} else if (counts.cancelled === parentTotalCount) {
			derivedStatus = EMAIL_BATCH_STATUS.CANCELLED;
		} else if (counts.failed === parentTotalCount) {
			derivedStatus = EMAIL_BATCH_STATUS.FAILED;
		} else if (counts.sent > 0 || counts.failed > 0) {
			derivedStatus = EMAIL_BATCH_STATUS.PARTIALLY_FAILED;
		} else {
			derivedStatus = batch.status;
		}
	} else {
		derivedStatus = batch.status;
	}

	const isImmutable = IMMUTABLE_STATUS_SET.has(derivedStatus);

	if (derivedStatus !== batch.status) {
		const updateData: Record<string, unknown> = {
			status: derivedStatus,
			updatedAt: new Date(),
		};

		if (isImmutable) {
			updateData.completedAt = new Date();
		}

		await db
			.update(emailBatches)
			.set(updateData)
			.where(
				and(
					eq(emailBatches.id, batchId),
					eq(emailBatches.userId, userId),
					notInArray(emailBatches.status, [...IMMUTABLE_STATUSES]),
				),
			);
	}

	return { status: derivedStatus, counts };
}
