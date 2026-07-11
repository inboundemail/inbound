import { createHash } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/lib/db";
import type { NewEmailDeliveryEvent } from "@/lib/db/schema";
import { emailDeliveryEvents } from "@/lib/db/schema";

interface DeliveryEventIdentity {
	eventType: string;
	originalMessageId: string | null | undefined;
	dsnEmailId?: string | null;
	failedRecipient: string;
}

export function normalizeDeliveryEventRecipient(recipient: string): string {
	const formattedAddress = recipient.match(/<([^<>]+@[^<>]+)>/)?.[1];
	return (formattedAddress || recipient.replace(/^rfc822;\s*/i, ""))
		.trim()
		.toLowerCase();
}

export function normalizeDeliveryEventMessageId(
	messageId: string | null | undefined,
): string | null {
	if (!messageId) {
		return null;
	}

	const normalized = messageId
		.trim()
		.toLowerCase()
		.replace(/^<+|>+$/g, "");
	return normalized || null;
}

export function buildDeliveryEventIdentityKey(
	event: DeliveryEventIdentity,
): string | null {
	const messageId = normalizeDeliveryEventMessageId(event.originalMessageId);
	const dsnEmailId = event.dsnEmailId?.trim() || null;
	if (!messageId && !dsnEmailId) {
		return null;
	}

	return JSON.stringify([
		event.eventType,
		messageId ? "message" : "dsn",
		messageId || dsnEmailId,
		normalizeDeliveryEventRecipient(event.failedRecipient),
	]);
}

export function buildDeliveryEventId(
	event: DeliveryEventIdentity,
): string | null {
	const identityKey = buildDeliveryEventIdentityKey(event);
	if (!identityKey) {
		return null;
	}

	const hash = createHash("sha256")
		.update(identityKey)
		.digest("hex")
		.slice(0, 32);
	return `evt_${hash}`;
}

export function getDeliveryEventDedupeKey(
	event: DeliveryEventIdentity & { id: string },
): string {
	return buildDeliveryEventIdentityKey(event) || `id:${event.id}`;
}

export function countUniqueDeliveryEvents(
	events: Array<DeliveryEventIdentity & { id: string }>,
): { bounces: number; complaints: number } {
	const seen = new Set<string>();
	let bounces = 0;
	let complaints = 0;

	for (const event of events) {
		const key = getDeliveryEventDedupeKey(event);
		if (seen.has(key)) {
			continue;
		}

		seen.add(key);
		if (event.eventType === "bounce") {
			bounces++;
		} else if (event.eventType === "complaint") {
			complaints++;
		}
	}

	return { bounces, complaints };
}

export async function insertDeliveryEventOnce(
	event: Omit<NewEmailDeliveryEvent, "id">,
): Promise<{
	eventId: string;
	inserted: boolean;
	existingDsnEmailId: string | null;
}> {
	const failedRecipient = normalizeDeliveryEventRecipient(
		event.failedRecipient,
	);
	const originalMessageId = normalizeDeliveryEventMessageId(
		event.originalMessageId,
	);
	const dsnEmailId = event.dsnEmailId?.trim() || null;

	let existingCandidates: Array<{
		id: string;
		dsnEmailId: string | null;
		failedRecipient: string;
	}> = [];

	if (originalMessageId) {
		const messageIdCandidates = Array.from(
			new Set(
				[
					event.originalMessageId?.trim(),
					originalMessageId,
					`<${originalMessageId}>`,
				].filter((value): value is string => Boolean(value)),
			),
		);
		existingCandidates = await db
			.select({
				id: emailDeliveryEvents.id,
				dsnEmailId: emailDeliveryEvents.dsnEmailId,
				failedRecipient: emailDeliveryEvents.failedRecipient,
			})
			.from(emailDeliveryEvents)
			.where(
				and(
					eq(emailDeliveryEvents.eventType, event.eventType),
					inArray(emailDeliveryEvents.originalMessageId, messageIdCandidates),
				),
			);
	} else if (dsnEmailId) {
		existingCandidates = await db
			.select({
				id: emailDeliveryEvents.id,
				dsnEmailId: emailDeliveryEvents.dsnEmailId,
				failedRecipient: emailDeliveryEvents.failedRecipient,
			})
			.from(emailDeliveryEvents)
			.where(
				and(
					eq(emailDeliveryEvents.eventType, event.eventType),
					eq(emailDeliveryEvents.dsnEmailId, dsnEmailId),
				),
			);
	}

	const existingIdentity = existingCandidates.find(
		(candidate) =>
			normalizeDeliveryEventRecipient(candidate.failedRecipient) ===
			failedRecipient,
	);
	if (existingIdentity) {
		return {
			eventId: existingIdentity.id,
			inserted: false,
			existingDsnEmailId: existingIdentity.dsnEmailId,
		};
	}

	const eventId =
		buildDeliveryEventId({
			eventType: event.eventType,
			originalMessageId,
			dsnEmailId,
			failedRecipient,
		}) || `evt_${nanoid()}`;
	const [inserted] = await db
		.insert(emailDeliveryEvents)
		.values({
			...event,
			id: eventId,
			failedRecipient,
			failedRecipientDomain: failedRecipient.split("@")[1] || null,
			originalMessageId,
			dsnEmailId,
		})
		.onConflictDoNothing()
		.returning({
			id: emailDeliveryEvents.id,
			dsnEmailId: emailDeliveryEvents.dsnEmailId,
		});

	if (inserted) {
		return {
			eventId: inserted.id,
			inserted: true,
			existingDsnEmailId: inserted.dsnEmailId,
		};
	}

	const [existing] = await db
		.select({
			id: emailDeliveryEvents.id,
			dsnEmailId: emailDeliveryEvents.dsnEmailId,
		})
		.from(emailDeliveryEvents)
		.where(eq(emailDeliveryEvents.id, eventId))
		.limit(1);

	if (!existing) {
		throw new Error(`Delivery event conflict without existing row: ${eventId}`);
	}

	return {
		eventId: existing.id,
		inserted: false,
		existingDsnEmailId: existing.dsnEmailId,
	};
}
