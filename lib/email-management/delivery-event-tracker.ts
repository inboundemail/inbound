/**
 * Delivery Event Tracker
 *
 * Tracks email delivery events (bounces, complaints, failures) from DSNs.
 * Used to:
 * - Record bounce events in the database
 * - Automatically add hard bounces to blocklists
 * - Track delivery issues per user/domain/tenant
 */

import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/lib/db";
import {
	BOUNCE_SUB_TYPES,
	BOUNCE_TYPES,
	type BounceSubType,
	type BounceType,
	blockedEmails,
	DELIVERY_EVENT_ACTIONS,
	EMAIL_DELIVERY_EVENT_TYPES,
	emailDeliveryEvents,
	type NewEmailDeliveryEvent,
} from "@/lib/db/schema";
import { dispatchEmailBouncedEvent } from "@/lib/svix/event-dispatcher";
import {
	insertDeliveryEventOnce,
	normalizeDeliveryEventRecipient,
} from "./delivery-event-dedupe";
import { getDsnSourceInfo, parseDsn } from "./dsn-parser";

export interface RecordDeliveryEventOptions {
	// The raw DSN content
	rawDsnContent: string;
	// The DSN email's ID in structured_emails (optional)
	dsnEmailId?: string;
	// Whether to automatically add hard bounces to blocklist
	autoBlocklist?: boolean;
	// Store the raw DSN content (can be large)
	storeRawContent?: boolean;
}

export interface RecordDeliveryEventResult {
	success: boolean;
	eventId?: string;
	eventType?: string;
	bounceType?: BounceType;
	bounceSubType?: BounceSubType;
	failedRecipient?: string;
	addedToBlocklist?: boolean;
	blocklistId?: string;
	error?: string;
	// Source info if found
	sourceFound: boolean;
	userId?: string;
	domainName?: string;
	tenantName?: string;
	// SVIX webhook dispatch (async)
	svixDispatchTriggered?: boolean;
}

/**
 * Determine the bounce sub-type from status code
 */
function getBounceSubType(
	statusCode: string | undefined,
	diagnosticCode: string | undefined,
): BounceSubType {
	if (!statusCode) return BOUNCE_SUB_TYPES.UNKNOWN;

	// Check diagnostic code for specific patterns first
	const diag = diagnosticCode?.toLowerCase() || "";

	if (diag.includes("suppression list")) {
		return BOUNCE_SUB_TYPES.SUPPRESSION_LIST;
	}

	// Map status codes to sub-types
	const statusMap: Record<string, BounceSubType> = {
		"5.1.1": BOUNCE_SUB_TYPES.USER_UNKNOWN,
		"5.1.2": BOUNCE_SUB_TYPES.BAD_DESTINATION,
		"5.2.1": BOUNCE_SUB_TYPES.MAILBOX_DISABLED,
		"5.2.2": BOUNCE_SUB_TYPES.MAILBOX_FULL,
		"5.3.4": BOUNCE_SUB_TYPES.MESSAGE_TOO_LARGE,
		"5.4.4": BOUNCE_SUB_TYPES.INVALID_DOMAIN,
		"5.7.1": BOUNCE_SUB_TYPES.POLICY_REJECTION,
		"5.6.1": BOUNCE_SUB_TYPES.CONTENT_REJECTED,
		"4.2.2": BOUNCE_SUB_TYPES.MAILBOX_FULL,
		"4.4.4": BOUNCE_SUB_TYPES.DNS_FAILURE,
		"4.4.7": BOUNCE_SUB_TYPES.DELIVERY_TIMEOUT,
		"4.4.1": BOUNCE_SUB_TYPES.CONNECTION_FAILED,
	};

	return statusMap[statusCode] || BOUNCE_SUB_TYPES.GENERAL_FAILURE;
}

/**
 * Extract domain from email address
 */
function extractDomain(email: string): string | undefined {
	const atIndex = email.indexOf("@");
	if (atIndex === -1) return undefined;
	return email.substring(atIndex + 1).toLowerCase();
}

/**
 * Record a delivery event from a DSN
 */
export async function recordDeliveryEventFromDsn(
	options: RecordDeliveryEventOptions,
): Promise<RecordDeliveryEventResult> {
	const {
		rawDsnContent,
		dsnEmailId,
		autoBlocklist = true,
		storeRawContent = false,
	} = options;

	try {
		// Parse the DSN
		const dsn = await parseDsn(rawDsnContent);

		if (!dsn.isDsn) {
			return {
				success: false,
				error: "Not a valid DSN",
				sourceFound: false,
			};
		}

		// Get source information
		const source = await getDsnSourceInfo(dsn);

		// Determine event type and bounce classification
		const eventType = EMAIL_DELIVERY_EVENT_TYPES.BOUNCE;
		const bounceType = (dsn.bounceType as BounceType) || BOUNCE_TYPES.SOFT;
		const bounceSubType = getBounceSubType(
			dsn.deliveryStatus?.status,
			dsn.deliveryStatus?.diagnosticCode,
		);
		const parsedFailedRecipient = dsn.deliveryStatus?.finalRecipient;

		if (!parsedFailedRecipient) {
			return {
				success: false,
				error: "No failed recipient found in DSN",
				sourceFound: !!source,
			};
		}

		const failedRecipient = normalizeDeliveryEventRecipient(
			parsedFailedRecipient,
		);
		const failedRecipientDomain = extractDomain(failedRecipient);

		// Prepare the event record
		const eventRecord: Omit<NewEmailDeliveryEvent, "id"> = {
			eventType,
			bounceType,
			bounceSubType,
			statusCode: dsn.deliveryStatus?.status,
			statusClass: dsn.statusClass,
			statusCategory: dsn.statusCategory,
			diagnosticCode: dsn.deliveryStatus?.diagnosticCode,
			failedRecipient,
			failedRecipientDomain,
			originalMessageId:
				source?.triggeringEmailMessageId ||
				dsn.deliveryStatus?.originalMessageId ||
				dsn.originalMessage?.messageId,
			originalSentEmailId: source?.triggeringEmailId,
			originalFrom: source?.triggeringEmailFrom || dsn.originalMessage?.from,
			originalTo: source?.triggeringEmailTo || dsn.originalMessage?.to,
			originalSubject:
				source?.triggeringEmailSubject || dsn.originalMessage?.subject,
			originalSentAt: source?.triggeringEmailSentAt,
			dsnEmailId,
			dsnReceivedAt: new Date(),
			reportingMta: dsn.deliveryStatus?.reportingMta,
			remoteMta: dsn.deliveryStatus?.remoteMta,
			userId: source?.userId,
			domainId: source?.domainId,
			domainName: source?.domainName,
			tenantId: source?.tenantId,
			tenantName: source?.tenantName,
			actionTaken: DELIVERY_EVENT_ACTIONS.NONE,
			addedToBlocklist: false,
			rawDsnContent: storeRawContent ? rawDsnContent : undefined,
		};

		const storedEvent = await insertDeliveryEventOnce(eventRecord);
		const eventId = storedEvent.eventId;

		if (!storedEvent.inserted) {
			await db
				.update(emailDeliveryEvents)
				.set({
					...(storedEvent.existingDsnEmailId
						? {
								bounceType: eventRecord.bounceType,
								bounceSubType: eventRecord.bounceSubType,
								diagnosticCode: eventRecord.diagnosticCode,
							}
						: {}),
					statusCode: eventRecord.statusCode,
					statusClass: eventRecord.statusClass,
					statusCategory: eventRecord.statusCategory,
					originalSentEmailId: eventRecord.originalSentEmailId,
					originalFrom: eventRecord.originalFrom,
					originalTo: eventRecord.originalTo,
					originalSubject: eventRecord.originalSubject,
					originalSentAt: eventRecord.originalSentAt,
					dsnEmailId: eventRecord.dsnEmailId,
					dsnReceivedAt: eventRecord.dsnReceivedAt,
					reportingMta: eventRecord.reportingMta,
					remoteMta: eventRecord.remoteMta,
					userId: eventRecord.userId,
					domainId: eventRecord.domainId,
					domainName: eventRecord.domainName,
					tenantId: eventRecord.tenantId,
					tenantName: eventRecord.tenantName,
					updatedAt: new Date(),
				})
				.where(eq(emailDeliveryEvents.id, eventId));
		}

		const result: RecordDeliveryEventResult = {
			success: true,
			eventId,
			eventType,
			bounceType,
			bounceSubType,
			failedRecipient,
			addedToBlocklist: false,
			sourceFound: !!source,
			userId: source?.userId,
			domainName: source?.domainName,
			tenantName: source?.tenantName,
		};

		// Auto-add hard bounces to blocklist if enabled
		if (
			autoBlocklist &&
			bounceType === BOUNCE_TYPES.HARD &&
			source?.userId &&
			source?.domainId
		) {
			try {
				// Check if already in blocklist
				const existing = await db
					.select({ id: blockedEmails.id })
					.from(blockedEmails)
					.where(
						and(
							eq(blockedEmails.emailAddress, failedRecipient),
							eq(blockedEmails.domainId, source.domainId),
						),
					)
					.limit(1);

				if (existing.length === 0) {
					const blocklistId = `blk_${nanoid()}`;

					await db.insert(blockedEmails).values({
						id: blocklistId,
						emailAddress: failedRecipient,
						domainId: source.domainId,
						reason: `Hard bounce: ${bounceSubType} (${dsn.deliveryStatus?.status || "unknown"})`,
						blockedBy: "system", // Auto-blocked by system
					});

					// Update the event with blocklist info
					await db
						.update(emailDeliveryEvents)
						.set({
							actionTaken: DELIVERY_EVENT_ACTIONS.ADDED_TO_BLOCKLIST,
							actionTakenAt: new Date(),
							addedToBlocklist: true,
							blocklistId,
							updatedAt: new Date(),
						})
						.where(eq(emailDeliveryEvents.id, eventId));

					result.addedToBlocklist = true;
					result.blocklistId = blocklistId;
				}
			} catch (blocklistError) {
				console.error("Error adding to blocklist:", blocklistError);
				// Don't fail the whole operation if blocklist fails
			}
		}

		// Dispatch SVIX webhook event for the bounce (async, don't block)
		// Only dispatch if we have a userId (can send to their webhook endpoints)
		if (source?.userId) {
			result.svixDispatchTriggered = true;
			dispatchEmailBouncedEvent(eventId).catch((svixError) => {
				console.error(
					"[Delivery Event Tracker] Error dispatching SVIX bounce event:",
					svixError,
				);
				// Don't fail the whole operation if SVIX dispatch fails
			});
		}

		return result;
	} catch (error) {
		console.error("Error recording delivery event:", error);
		return {
			success: false,
			error: error instanceof Error ? error.message : "Unknown error",
			sourceFound: false,
		};
	}
}

/**
 * Check if a DSN has already been processed
 */
export async function isDsnAlreadyProcessed(
	dsnEmailId: string,
): Promise<boolean> {
	const existing = await db
		.select({ id: emailDeliveryEvents.id })
		.from(emailDeliveryEvents)
		.where(eq(emailDeliveryEvents.dsnEmailId, dsnEmailId))
		.limit(1);

	return existing.length > 0;
}

/**
 * Get bounce statistics for a user
 */
export async function getUserBounceStats(userId: string): Promise<{
	total: number;
	hard: number;
	soft: number;
	transient: number;
	bySubType: Record<string, number>;
}> {
	const events = await db
		.select({
			bounceType: emailDeliveryEvents.bounceType,
			bounceSubType: emailDeliveryEvents.bounceSubType,
		})
		.from(emailDeliveryEvents)
		.where(eq(emailDeliveryEvents.userId, userId));

	const stats = {
		total: events.length,
		hard: 0,
		soft: 0,
		transient: 0,
		bySubType: {} as Record<string, number>,
	};

	for (const event of events) {
		if (event.bounceType === BOUNCE_TYPES.HARD) stats.hard++;
		else if (event.bounceType === BOUNCE_TYPES.SOFT) stats.soft++;
		else if (event.bounceType === BOUNCE_TYPES.TRANSIENT) stats.transient++;

		if (event.bounceSubType) {
			stats.bySubType[event.bounceSubType] =
				(stats.bySubType[event.bounceSubType] || 0) + 1;
		}
	}

	return stats;
}

/**
 * Get recent bounces for a domain
 */
export async function getDomainRecentBounces(
	domainId: string,
	limit: number = 50,
): Promise<
	Array<{
		id: string;
		failedRecipient: string;
		bounceType: string | null;
		bounceSubType: string | null;
		statusCode: string | null;
		createdAt: Date | null;
	}>
> {
	return db
		.select({
			id: emailDeliveryEvents.id,
			failedRecipient: emailDeliveryEvents.failedRecipient,
			bounceType: emailDeliveryEvents.bounceType,
			bounceSubType: emailDeliveryEvents.bounceSubType,
			statusCode: emailDeliveryEvents.statusCode,
			createdAt: emailDeliveryEvents.createdAt,
		})
		.from(emailDeliveryEvents)
		.where(eq(emailDeliveryEvents.domainId, domainId))
		.orderBy(emailDeliveryEvents.createdAt)
		.limit(limit);
}
