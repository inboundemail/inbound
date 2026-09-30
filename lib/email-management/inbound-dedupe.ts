import { createHash } from "crypto";

export function normalizeRecipientForDedupe(recipient: string): string {
	return recipient.trim().toLowerCase();
}

export function normalizeMessageIdForDedupe(
	messageId: string | null | undefined,
): string | null {
	if (!messageId) {
		return null;
	}

	const normalized = messageId.trim().toLowerCase().replace(/^<+|>+$/g, "");
	return normalized.length > 0 ? normalized : null;
}

export function buildInboundDeterministicId(
	prefix: string,
	sesEventId: string,
	recipient: string,
	normalizedMessageId?: string | null,
): string {
	const normalizedRecipient = normalizeRecipientForDedupe(recipient);
	const seed = normalizedMessageId
		? `msg:${normalizedMessageId}:rcpt:${normalizedRecipient}`
		: `ses:${sesEventId}:rcpt:${normalizedRecipient}`;

	const hash = createHash("sha256").update(seed).digest("hex").substring(0, 16);
	return `${prefix}_${hash}`;
}

export function buildInboundDedupeFingerprint(
	userId: string,
	recipient: string,
	normalizedMessageId: string | null,
): string {
	return `${userId}:${normalizeRecipientForDedupe(recipient)}:${normalizedMessageId || "no-message-id"}`;
}

/**
 * Deterministic ID for the single structured email row of a message per user.
 * The user ID is kept case-sensitive because user IDs are case-sensitive.
 */
export function buildInboundMessageRowId(
	prefix: string,
	sesEventId: string,
	userId: string,
	normalizedMessageId?: string | null,
): string {
	const seed = normalizedMessageId
		? `msg:${normalizedMessageId}:user:${userId}`
		: `ses:${sesEventId}:user:${userId}`;
	const hash = createHash("sha256").update(seed).digest("hex").substring(0, 16);
	return `${prefix}_${hash}`;
}

export function envelopeRecipientsOf(email: {
	envelopeRecipients: string[] | null;
	recipient: string | null;
}): string[] {
	if (email.envelopeRecipients && email.envelopeRecipients.length > 0) {
		return email.envelopeRecipients;
	}
	return email.recipient ? [email.recipient] : [];
}
