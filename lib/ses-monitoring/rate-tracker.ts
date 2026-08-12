/**
 * SES Rate Tracker
 *
 * Tracks bounce and complaint rates for tenants using the emailDeliveryEvents table.
 * Replaces per-tenant CloudWatch alarms with application-level rate monitoring.
 *
 * Cost savings: ~$165/month (eliminated 1,652 CloudWatch alarms)
 */

import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { emailDeliveryEvents, sentEmails, sesTenants } from "@/lib/db/schema";
import {
	countUniqueDeliveryEvents,
	insertDeliveryEventOnce,
} from "@/lib/email-management/delivery-event-dedupe";

// Rate thresholds for tenant alerting and automatic suspension
export const RATE_THRESHOLDS = {
	bounce: {
		warning: 0.02, // 2.0%
		critical: 0.05, // 5.0%
	},
	complaint: {
		warning: 0.0008, // 0.08%
		critical: 0.001, // 0.1%
	},
} as const;

export const STANDARD_RATE_THRESHOLDS = {
	bounce: {
		warning: RATE_THRESHOLDS.bounce.warning,
		critical: 0.07,
	},
	complaint: {
		warning: RATE_THRESHOLDS.complaint.warning,
		critical: 0.003,
	},
} as const;

export const AUTO_SUSPEND_MIN_SENDS = {
	bounce: 200,
	complaint: 1000,
} as const;

export const AUTO_SUSPEND_MIN_EVENTS = {
	bounce: 5,
	complaint: 2,
} as const;

const EXTREME_ABUSE_THRESHOLDS = {
	bounce: {
		minimumSends: 50,
		minimumEvents: 10,
		rate: 0.15,
	},
	complaint: {
		minimumSends: 100,
		minimumEvents: 2,
		rate: 0.01,
	},
} as const;

export const WARNING_MINIMUMS = {
	bounce: {
		sends: 100,
		events: 3,
	},
	complaint: {
		sends: 500,
		events: 2,
	},
} as const;

// Time window for rate calculation (24 hours)
const RATE_WINDOW_HOURS = 24;

export interface TenantRates {
	tenantId: string;
	configurationSetName: string;
	reputationPolicy: string;
	bounceRate: number;
	complaintRate: number;
	totalSends: number;
	totalBounces: number;
	totalComplaints: number;
	windowStart: Date;
	windowEnd: Date;
}

export interface RateAlert {
	alertType: "bounce" | "complaint";
	severity: "warning" | "critical";
	currentRate: number;
	threshold: number;
	configurationSetName: string;
	tenantId: string;
}

/**
 * Store an SES event (bounce or complaint) in the database
 */
export async function storeSESEvent(params: {
	eventType: "bounce" | "complaint";
	configurationSetName: string;
	messageId: string;
	recipient: string;
	bounceType?: string;
	bounceSubType?: string;
	diagnosticCode?: string;
	timestamp: Date;
}): Promise<{ success: boolean; eventId?: string; error?: string }> {
	try {
		// Look up tenant by configuration set name
		const [tenant] = await db
			.select({
				id: sesTenants.id,
				userId: sesTenants.userId,
				tenantName: sesTenants.tenantName,
			})
			.from(sesTenants)
			.where(eq(sesTenants.configurationSetName, params.configurationSetName))
			.limit(1);

		// Determine bounce type classification
		let bounceTypeClassified = params.bounceType;
		if (params.eventType === "bounce" && !bounceTypeClassified) {
			bounceTypeClassified = "unknown";
		}

		const storedEvent = await insertDeliveryEventOnce({
			eventType: params.eventType,
			bounceType: bounceTypeClassified,
			bounceSubType: params.bounceSubType,
			diagnosticCode: params.diagnosticCode,
			failedRecipient: params.recipient,
			originalMessageId: params.messageId,
			userId: tenant?.userId || null,
			tenantId: tenant?.id || null,
			tenantName: tenant?.tenantName || params.configurationSetName,
			createdAt: params.timestamp,
			updatedAt: params.timestamp,
		});

		if (!storedEvent.inserted) {
			await db
				.update(emailDeliveryEvents)
				.set({
					userId: tenant?.userId || null,
					tenantId: tenant?.id || null,
					tenantName: tenant?.tenantName || params.configurationSetName,
					...(params.eventType === "bounce"
						? {
								bounceType: bounceTypeClassified,
								bounceSubType: params.bounceSubType,
								diagnosticCode: params.diagnosticCode,
							}
						: {}),
					updatedAt: params.timestamp,
				})
				.where(eq(emailDeliveryEvents.id, storedEvent.eventId));
		}

		console.log(
			`📊 storeSESEvent - ${storedEvent.inserted ? "Stored" : "Deduplicated"} ${params.eventType} event: ${storedEvent.eventId}`,
		);
		return { success: true, eventId: storedEvent.eventId };
	} catch (error) {
		console.error("❌ storeSESEvent - Error storing event:", error);
		return {
			success: false,
			error: error instanceof Error ? error.message : "Unknown error",
		};
	}
}

/**
 * Get the current bounce and complaint rates for a tenant
 */
export async function getTenantRates(
	configurationSetName: string,
): Promise<TenantRates | null> {
	try {
		const windowEnd = new Date();
		const windowStart = new Date(
			windowEnd.getTime() - RATE_WINDOW_HOURS * 60 * 60 * 1000,
		);

		// Look up tenant
		const [tenant] = await db
			.select({
				id: sesTenants.id,
				userId: sesTenants.userId,
				tenantName: sesTenants.tenantName,
				reputationPolicy: sesTenants.reputationPolicy,
			})
			.from(sesTenants)
			.where(eq(sesTenants.configurationSetName, configurationSetName))
			.limit(1);

		if (!tenant) {
			console.log(
				`⚠️ getTenantRates - Tenant not found for config set: ${configurationSetName}`,
			);
			return null;
		}

		const deliveryEvents = await db
			.select({
				id: emailDeliveryEvents.id,
				eventType: emailDeliveryEvents.eventType,
				bounceType: emailDeliveryEvents.bounceType,
				originalMessageId: emailDeliveryEvents.originalMessageId,
				dsnEmailId: emailDeliveryEvents.dsnEmailId,
				failedRecipient: emailDeliveryEvents.failedRecipient,
			})
			.from(emailDeliveryEvents)
			.where(
				and(
					eq(emailDeliveryEvents.tenantId, tenant.id),
					inArray(emailDeliveryEvents.eventType, ["bounce", "complaint"]),
					gte(emailDeliveryEvents.createdAt, windowStart),
				),
			);

		const deliveryEventCounts = countUniqueDeliveryEvents(deliveryEvents);

		// SES reputation events are per recipient, so the denominator must be too.
		const [sendResult] = await db
			.select({
				count: sql<number>`coalesce(sum(
					jsonb_array_length(${sentEmails.to}::jsonb) +
					coalesce(jsonb_array_length(${sentEmails.cc}::jsonb), 0) +
					coalesce(jsonb_array_length(${sentEmails.bcc}::jsonb), 0)
				), 0)`,
			})
			.from(sentEmails)
			.where(
				and(
					eq(sentEmails.userId, tenant.userId),
					eq(sentEmails.status, "sent"),
					gte(sentEmails.sentAt, windowStart),
				),
			);

		const totalBounces = deliveryEventCounts.bounces;
		const totalComplaints = deliveryEventCounts.complaints;
		const totalSends = Number(sendResult?.count || 0);

		// Calculate rates (avoid division by zero)
		const bounceRate = totalSends > 0 ? totalBounces / totalSends : 0;
		const complaintRate = totalSends > 0 ? totalComplaints / totalSends : 0;

		return {
			tenantId: tenant.id,
			configurationSetName,
			reputationPolicy: tenant.reputationPolicy,
			bounceRate,
			complaintRate,
			totalSends,
			totalBounces,
			totalComplaints,
			windowStart,
			windowEnd,
		};
	} catch (error) {
		console.error("❌ getTenantRates - Error getting rates:", error);
		return null;
	}
}

/**
 * Check if any rate thresholds are exceeded and return alerts
 */
export function checkRateThresholds(rates: TenantRates): RateAlert[] {
	const alerts: RateAlert[] = [];
	const thresholds =
		rates.reputationPolicy === "standard"
			? STANDARD_RATE_THRESHOLDS
			: RATE_THRESHOLDS;
	const canAutoSuspendForBounce =
		(rates.totalSends >= AUTO_SUSPEND_MIN_SENDS.bounce &&
			rates.totalBounces >= AUTO_SUSPEND_MIN_EVENTS.bounce) ||
		(rates.totalSends >= EXTREME_ABUSE_THRESHOLDS.bounce.minimumSends &&
			rates.totalBounces >= EXTREME_ABUSE_THRESHOLDS.bounce.minimumEvents &&
			rates.bounceRate >= EXTREME_ABUSE_THRESHOLDS.bounce.rate);
	const canAutoSuspendForComplaint =
		(rates.totalSends >= AUTO_SUSPEND_MIN_SENDS.complaint &&
			rates.totalComplaints >= AUTO_SUSPEND_MIN_EVENTS.complaint) ||
		(rates.totalSends >= EXTREME_ABUSE_THRESHOLDS.complaint.minimumSends &&
			rates.totalComplaints >=
				EXTREME_ABUSE_THRESHOLDS.complaint.minimumEvents &&
			rates.complaintRate >= EXTREME_ABUSE_THRESHOLDS.complaint.rate);
	const canWarnForBounce =
		rates.totalSends >= WARNING_MINIMUMS.bounce.sends ||
		rates.totalBounces >= WARNING_MINIMUMS.bounce.events;
	const canWarnForComplaint =
		rates.totalSends >= WARNING_MINIMUMS.complaint.sends ||
		rates.totalComplaints >= WARNING_MINIMUMS.complaint.events;

	// Check bounce rate
	if (
		canAutoSuspendForBounce &&
		rates.bounceRate >= thresholds.bounce.critical
	) {
		alerts.push({
			alertType: "bounce",
			severity: "critical",
			currentRate: rates.bounceRate,
			threshold: thresholds.bounce.critical,
			configurationSetName: rates.configurationSetName,
			tenantId: rates.tenantId,
		});
	} else if (
		canWarnForBounce &&
		rates.bounceRate >= thresholds.bounce.warning
	) {
		alerts.push({
			alertType: "bounce",
			severity: "warning",
			currentRate: rates.bounceRate,
			threshold: thresholds.bounce.warning,
			configurationSetName: rates.configurationSetName,
			tenantId: rates.tenantId,
		});
	}

	// Check complaint rate
	if (
		canAutoSuspendForComplaint &&
		rates.complaintRate >= thresholds.complaint.critical
	) {
		alerts.push({
			alertType: "complaint",
			severity: "critical",
			currentRate: rates.complaintRate,
			threshold: thresholds.complaint.critical,
			configurationSetName: rates.configurationSetName,
			tenantId: rates.tenantId,
		});
	} else if (
		canWarnForComplaint &&
		rates.complaintRate >= thresholds.complaint.warning
	) {
		alerts.push({
			alertType: "complaint",
			severity: "warning",
			currentRate: rates.complaintRate,
			threshold: thresholds.complaint.warning,
			configurationSetName: rates.configurationSetName,
			tenantId: rates.tenantId,
		});
	}

	return alerts;
}

/**
 * Process an SES event: store it, calculate rates, and return any alerts
 */
export async function processSESEvent(params: {
	eventType: "bounce" | "complaint";
	configurationSetName: string;
	messageId: string;
	recipient: string;
	bounceType?: string;
	bounceSubType?: string;
	diagnosticCode?: string;
	timestamp: Date;
}): Promise<{ stored: boolean; alerts: RateAlert[] }> {
	// Store the event
	const storeResult = await storeSESEvent(params);

	if (!storeResult.success) {
		console.error(
			`❌ processSESEvent - Failed to store event: ${storeResult.error}`,
		);
		return { stored: false, alerts: [] };
	}

	// Get current rates
	const rates = await getTenantRates(params.configurationSetName);

	if (!rates) {
		return { stored: true, alerts: [] };
	}

	// Check thresholds
	const alerts = checkRateThresholds(rates);

	if (alerts.length > 0) {
		console.log(
			`🚨 processSESEvent - ${alerts.length} alert(s) triggered for ${params.configurationSetName}`,
		);
		for (const alert of alerts) {
			console.log(
				`   ${alert.severity.toUpperCase()}: ${alert.alertType} rate ${(alert.currentRate * 100).toFixed(2)}% >= ${(alert.threshold * 100).toFixed(2)}%`,
			);
		}
	}

	return { stored: true, alerts };
}
