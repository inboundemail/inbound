import { Client as QStashClient } from "@upstash/qstash";
import { and, count, eq, isNotNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { SENT_EMAIL_STATUS, sentEmails } from "@/lib/db/schema";

export interface QueueItem {
	emailId: string;
	userId: string;
	batchId: string;
	batchIndex: number;
	attempt: number;
}

interface PublishResult {
	emailId: string;
	success: boolean;
	qstashMessageId?: string;
	error?: string;
}

const QSTASH_RETRIES = 3;
const FLOW_PARALLELISM = 5;
const FLOW_RATE_PER_SECOND = 10;

export async function incrementPublishAttempt(
	emailId: string,
	userId: string,
	batchId: string,
): Promise<number> {
	const result = await db
		.update(sentEmails)
		.set({
			qstashPublishAttempt: sql`${sentEmails.qstashPublishAttempt} + 1`,
			qstashMessageId: null,
			updatedAt: new Date(),
		})
		.where(
			and(
				eq(sentEmails.id, emailId),
				eq(sentEmails.userId, userId),
				eq(sentEmails.batchId, batchId),
				eq(sentEmails.status, SENT_EMAIL_STATUS.PENDING),
			),
		)
		.returning({ attempt: sentEmails.qstashPublishAttempt });

	return result[0]?.attempt ?? 0;
}

export async function publishBatchToQStash(items: QueueItem[]): Promise<{
	results: PublishResult[];
	publishedCount: number;
	failedCount: number;
	lastError: string | null;
}> {
	const qstashToken = process.env.QSTASH_TOKEN;
	const appUrl = process.env.NEXT_PUBLIC_APP_URL;

	if (!qstashToken || !appUrl) {
		const error = "QStash configuration missing";
		return {
			results: items.map((item) => ({
				emailId: item.emailId,
				success: false,
				error,
			})),
			publishedCount: 0,
			failedCount: items.length,
			lastError: error,
		};
	}

	const qstashClient = new QStashClient({ token: qstashToken });
	const webhookUrl = `${appUrl}/api/webhooks/send-email`;

	const results: PublishResult[] = [];
	let publishedCount = 0;
	let failedCount = 0;
	let lastError: string | null = null;

	for (let i = 0; i < items.length; i += FLOW_PARALLELISM) {
		const batch = items.slice(i, i + FLOW_PARALLELISM);

		const batchResults = await Promise.allSettled(
			batch.map(async (item) => {
				const deduplicationId = `${item.batchId}:${item.batchIndex}:${item.attempt}`;

				try {
					const response = await qstashClient.publishJSON({
						url: webhookUrl,
						body: {
							type: "batch",
							emailId: item.emailId,
							userId: item.userId,
							batchId: item.batchId,
							batchIndex: item.batchIndex,
						},
						retries: QSTASH_RETRIES,
						deduplicationId,
						flowControl: {
							key: `batch-email-${item.userId}`,
							parallelism: FLOW_PARALLELISM,
							ratePerSecond: FLOW_RATE_PER_SECOND,
						},
					});

					const updateResult = await db
						.update(sentEmails)
						.set({
							qstashMessageId: response.messageId,
							updatedAt: new Date(),
						})
						.where(
							and(
								eq(sentEmails.id, item.emailId),
								eq(sentEmails.userId, item.userId),
								eq(sentEmails.batchId, item.batchId),
								eq(sentEmails.status, SENT_EMAIL_STATUS.PENDING),
								eq(sentEmails.qstashPublishAttempt, item.attempt),
							),
						)
						.returning({ id: sentEmails.id });

					if (updateResult.length === 0) {
						return {
							emailId: item.emailId,
							success: false,
							error: "Row state changed during publish",
						};
					}

					return {
						emailId: item.emailId,
						success: true,
						qstashMessageId: response.messageId,
					};
				} catch (err) {
					const errorMsg =
						err instanceof Error ? err.message : "Unknown publish error";
					return {
						emailId: item.emailId,
						success: false,
						error: errorMsg,
					};
				}
			}),
		);

		for (let j = 0; j < batchResults.length; j++) {
			const result = batchResults[j];
			if (result.status === "fulfilled") {
				results.push(result.value);
				if (result.value.success) {
					publishedCount++;
				} else {
					failedCount++;
					lastError = result.value.error ?? null;
				}
			} else {
				const errorMsg =
					result.reason instanceof Error
						? result.reason.message
						: "Promise rejected";
				const batchItem = batch[j];
				results.push({
					emailId: batchItem?.emailId ?? "unknown",
					success: false,
					error: errorMsg,
				});
				failedCount++;
				lastError = errorMsg;
			}
		}
	}

	return { results, publishedCount, failedCount, lastError };
}

export async function recomputePublishedCount(
	batchId: string,
	userId: string,
): Promise<number> {
	const [result] = await db
		.select({ count: count() })
		.from(sentEmails)
		.where(
			and(
				eq(sentEmails.batchId, batchId),
				eq(sentEmails.userId, userId),
				isNotNull(sentEmails.qstashMessageId),
			),
		);
	return Number(result?.count ?? 0);
}

export async function deleteQStashMessages(
	messageIds: string[],
): Promise<{ deleted: number; errors: string[] }> {
	const qstashToken = process.env.QSTASH_TOKEN;
	if (!qstashToken || messageIds.length === 0) {
		return { deleted: 0, errors: [] };
	}

	const qstashClient = new QStashClient({ token: qstashToken });
	let deleted = 0;
	const errors: string[] = [];

	for (let i = 0; i < messageIds.length; i += FLOW_PARALLELISM) {
		const batch = messageIds.slice(i, i + FLOW_PARALLELISM);

		const results = await Promise.allSettled(
			batch.map(async (messageId) => {
				await qstashClient.messages.delete(messageId);
				return messageId;
			}),
		);

		for (const result of results) {
			if (result.status === "fulfilled") {
				deleted++;
			} else {
				const errorMsg =
					result.reason instanceof Error
						? result.reason.message
						: "Delete failed";
				errors.push(errorMsg);
			}
		}
	}

	return { deleted, errors };
}

export function collectQstashMessageIds(
	items: Array<{ qstashMessageId: string | null }>,
): string[] {
	const ids: string[] = [];
	for (const item of items) {
		if (item.qstashMessageId !== null) {
			ids.push(item.qstashMessageId);
		}
	}
	return ids;
}
