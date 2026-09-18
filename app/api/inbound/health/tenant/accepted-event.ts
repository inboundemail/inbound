import { and, eq, inArray, sql } from "drizzle-orm";

import { refreshEmailBatchStatus } from "@/app/api/e2/emails/batch-state";
import { SENT_EMAIL_ID_TAG } from "@/app/api/e2/helper/ses-email-tags";
import { db } from "@/lib/db";
import { SENT_EMAIL_STATUS, sentEmails } from "@/lib/db/schema";

export interface SesAcceptedEvent {
	eventType: string;
	mail: {
		messageId: string;
		timestamp: string;
		tags?: Record<string, string[]>;
	};
}

export interface ParsedAcceptedEvent {
	sentEmailId: string;
	sesMessageId: string;
	acceptedAt: Date;
}

export function parseAcceptedEvent(
	event: SesAcceptedEvent,
): ParsedAcceptedEvent | null {
	const eventTypeLower = event.eventType.toLowerCase();
	if (eventTypeLower !== "send" && eventTypeLower !== "delivery") {
		return null;
	}

	if (!event.mail.messageId) {
		return null;
	}

	const acceptedAt = new Date(event.mail.timestamp);
	if (Number.isNaN(acceptedAt.getTime())) {
		return null;
	}

	const sentEmailId = event.mail.tags?.[SENT_EMAIL_ID_TAG]?.[0];
	if (!sentEmailId) {
		return null;
	}

	return {
		sentEmailId,
		sesMessageId: event.mail.messageId,
		acceptedAt,
	};
}

export async function handleAcceptedEvent(
	event: SesAcceptedEvent,
): Promise<void> {
	const parsed = parseAcceptedEvent(event);
	if (!parsed) {
		return;
	}

	const { sentEmailId, sesMessageId, acceptedAt } = parsed;

	const [updatedRow] = await db
		.update(sentEmails)
		.set({
			status: SENT_EMAIL_STATUS.SENT,
			messageId: sesMessageId,
			sesMessageId: sesMessageId,
			sentAt: acceptedAt,
			failureReason: null,
			processingToken: null,
			processingStartedAt: null,
			providerSubmittedAt: sql`COALESCE(${sentEmails.providerSubmittedAt}, ${acceptedAt})`,
			updatedAt: new Date(),
		})
		.where(
			and(
				eq(sentEmails.id, sentEmailId),
				inArray(sentEmails.status, [
					SENT_EMAIL_STATUS.PROCESSING,
					SENT_EMAIL_STATUS.PROVIDER_UNKNOWN,
				]),
			),
		)
		.returning({
			id: sentEmails.id,
			userId: sentEmails.userId,
			batchId: sentEmails.batchId,
			usageTrackedAt: sentEmails.usageTrackedAt,
		});

	if (!updatedRow) {
		return;
	}

	if (!updatedRow.batchId) {
		return;
	}

	if (!updatedRow.usageTrackedAt) {
		const { Autumn: autumn } = await import("autumn-js");

		try {
			const { error: trackError } = await autumn.track({
				customer_id: updatedRow.userId,
				feature_id: "emails_sent",
				value: 1,
				idempotency_key: sentEmailId,
			});

			if (trackError) {
				console.error(
					"❌ handleAcceptedEvent - Failed to track email usage:",
					trackError,
				);
				await db
					.update(sentEmails)
					.set({
						usageTrackingError: String(trackError),
						updatedAt: new Date(),
					})
					.where(
						and(
							eq(sentEmails.id, sentEmailId),
							eq(sentEmails.userId, updatedRow.userId),
							eq(sentEmails.batchId, updatedRow.batchId),
						),
					);
			} else {
				await db
					.update(sentEmails)
					.set({
						usageTrackedAt: new Date(),
						usageTrackingError: null,
						updatedAt: new Date(),
					})
					.where(
						and(
							eq(sentEmails.id, sentEmailId),
							eq(sentEmails.userId, updatedRow.userId),
							eq(sentEmails.batchId, updatedRow.batchId),
						),
					);
			}
		} catch (trackError) {
			console.error(
				"❌ handleAcceptedEvent - Failed to track email usage:",
				trackError,
			);
			await db
				.update(sentEmails)
				.set({
					usageTrackingError:
						trackError instanceof Error
							? trackError.message
							: String(trackError),
					updatedAt: new Date(),
				})
				.where(
					and(
						eq(sentEmails.id, sentEmailId),
						eq(sentEmails.userId, updatedRow.userId),
						eq(sentEmails.batchId, updatedRow.batchId),
					),
				);
		}
	}

	await refreshEmailBatchStatus(updatedRow.batchId, updatedRow.userId);
}
