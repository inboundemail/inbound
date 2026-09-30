import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { SENT_EMAIL_STATUS, sentEmails } from "@/lib/db/schema";

export const MAX_IDEMPOTENCY_KEY_LENGTH = 256;

export type IdempotencyDecision =
	| { kind: "proceed" }
	| {
			kind: "replay";
			email: {
				id: string;
				messageId: string | null;
				sesMessageId: string | null;
			};
	  }
	| { kind: "in_progress"; body: { error: string } };

export function readIdempotencyKey(
	headers: Headers,
): { key: string | null } | { error: string } {
	const key = headers.get("Idempotency-Key")?.trim() || null;
	if (key && key.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
		return {
			error: `Idempotency-Key must be at most ${MAX_IDEMPOTENCY_KEY_LENGTH} characters`,
		};
	}
	return { key };
}

/**
 * Decides what to do with an existing sent_emails row for (userId, key).
 * Sent rows are replayed, in-flight rows are rejected with 409, and rows whose
 * send failed release the key so the client can retry with it.
 */
export async function checkIdempotencyKey(
	userId: string,
	key: string,
): Promise<IdempotencyDecision> {
	const [existing] = await db
		.select({
			id: sentEmails.id,
			status: sentEmails.status,
			messageId: sentEmails.messageId,
			sesMessageId: sentEmails.sesMessageId,
		})
		.from(sentEmails)
		.where(
			and(eq(sentEmails.userId, userId), eq(sentEmails.idempotencyKey, key)),
		)
		.limit(1);

	if (!existing) return { kind: "proceed" };

	if (existing.status === SENT_EMAIL_STATUS.SENT) {
		return {
			kind: "replay",
			email: {
				id: existing.id,
				messageId: existing.messageId,
				sesMessageId: existing.sesMessageId,
			},
		};
	}

	if (existing.status === SENT_EMAIL_STATUS.FAILED) {
		await db
			.update(sentEmails)
			.set({ idempotencyKey: null, updatedAt: new Date() })
			.where(
				and(
					eq(sentEmails.id, existing.id),
					eq(sentEmails.status, SENT_EMAIL_STATUS.FAILED),
				),
			);
		return { kind: "proceed" };
	}

	return {
		kind: "in_progress",
		body: {
			error:
				"A request with this Idempotency-Key is still being processed. Retry shortly.",
		},
	};
}
