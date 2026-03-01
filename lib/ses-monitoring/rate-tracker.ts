/**
 * SES Rate Tracker
 *
 * Tracks bounce and complaint rates for tenants using the emailDeliveryEvents table.
 * Replaces per-tenant CloudWatch alarms with application-level rate monitoring.
 *
 * Cost savings: ~$165/month (eliminated 1,652 CloudWatch alarms)
 */

import { and, count, eq, gte } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/lib/db";
import { emailDeliveryEvents, sentEmails, sesTenants } from "@/lib/db/schema";
import { extractDomainFromEmail } from "@/lib/utils/email-utils";

// Rate thresholds for tenant alerting and automatic suspension
export const RATE_THRESHOLDS = {
	bounce: {
		warning: 0.02, // 2.0%
		critical: 0.025, // 2.5%
	},
	complaint: {
		warning: 0.0008, // 0.08%
		critical: 0.001, // 0.1%
	},
} as const;

export const AUTO_SUSPEND_MIN_SENDS = {
	bounce: 200,
	complaint: 1000,
} as const;

// Time window for rate calculation (24 hours)
const RATE_WINDOW_HOURS = 24;

export interface TenantRates {
	tenantId: string;
	configurationSetName: string;
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

		const eventId = `evt_${nanoid()}`;

		// Determine bounce type classification
		let bounceTypeClassified = params.bounceType;
		if (params.eventType === "bounce" && !bounceTypeClassified) {
			bounceTypeClassified = "unknown";
		}

		await db.insert(emailDeliveryEvents).values({
			id: eventId,
			eventType: params.eventType,
			bounceType: bounceTypeClassified,
			bounceSubType: params.bounceSubType,
			diagnosticCode: params.diagnosticCode,
			failedRecipient: params.recipient,
			failedRecipientDomain: extractDomainFromEmail(params.recipient) || null,
			originalMessageId: params.messageId,
			userId: tenant?.userId || null,
			tenantId: tenant?.id || null,
			tenantName: tenant?.tenantName || params.configurationSetName,
			createdAt: params.timestamp,
			updatedAt: params.timestamp,
		});

		console.log(
			`📊 storeSESEvent - Stored ${params.eventType} event: ${eventId}`,
		);
		return { success: true, eventId };
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

		// Count bounces in the window
		const [bounceResult] = await db
			.select({ count: count() })
			.from(emailDeliveryEvents)
			.where(
				and(
					eq(emailDeliveryEvents.tenantId, tenant.id),
					eq(emailDeliveryEvents.eventType, "bounce"),
					gte(emailDeliveryEvents.createdAt, windowStart),
				),
			);

		// Count complaints in the window
		const [complaintResult] = await db
			.select({ count: count() })
			.from(emailDeliveryEvents)
			.where(
				and(
					eq(emailDeliveryEvents.tenantId, tenant.id),
					eq(emailDeliveryEvents.eventType, "complaint"),
					gte(emailDeliveryEvents.createdAt, windowStart),
				),
			);

		// Count total sends in the window (from sentEmails table)
		const [sendResult] = await db
			.select({ count: count() })
			.from(sentEmails)
			.where(
				and(
					eq(sentEmails.userId, tenant.userId),
					eq(sentEmails.status, "sent"),
					gte(sentEmails.sentAt, windowStart),
				),
			);

		const totalBounces = bounceResult?.count || 0;
		const totalComplaints = complaintResult?.count || 0;
		const totalSends = sendResult?.count || 0;

		// Calculate rates (avoid division by zero)
		const bounceRate = totalSends > 0 ? totalBounces / totalSends : 0;
		const complaintRate = totalSends > 0 ? totalComplaints / totalSends : 0;

		return {
			tenantId: tenant.id,
			configurationSetName,
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
	const canAutoSuspendForBounce =
		rates.totalSends >= AUTO_SUSPEND_MIN_SENDS.bounce;
	const canAutoSuspendForComplaint =
		rates.totalSends >= AUTO_SUSPEND_MIN_SENDS.complaint;

	// Check bounce rate
	if (
		canAutoSuspendForBounce &&
		rates.bounceRate >= RATE_THRESHOLDS.bounce.critical
	) {
		alerts.push({
			alertType: "bounce",
			severity: "critical",
			currentRate: rates.bounceRate,
			threshold: RATE_THRESHOLDS.bounce.critical,
			configurationSetName: rates.configurationSetName,
			tenantId: rates.tenantId,
		});
	} else if (rates.bounceRate >= RATE_THRESHOLDS.bounce.warning) {
		alerts.push({
			alertType: "bounce",
			severity: "warning",
			currentRate: rates.bounceRate,
			threshold: RATE_THRESHOLDS.bounce.warning,
			configurationSetName: rates.configurationSetName,
			tenantId: rates.tenantId,
		});
	}

	// Check complaint rate
	if (
		canAutoSuspendForComplaint &&
		rates.complaintRate >= RATE_THRESHOLDS.complaint.critical
	) {
		alerts.push({
			alertType: "complaint",
			severity: "critical",
			currentRate: rates.complaintRate,
			threshold: RATE_THRESHOLDS.complaint.critical,
			configurationSetName: rates.configurationSetName,
			tenantId: rates.tenantId,
		});
	} else if (rates.complaintRate >= RATE_THRESHOLDS.complaint.warning) {
		alerts.push({
			alertType: "complaint",
			severity: "warning",
			currentRate: rates.complaintRate,
			threshold: RATE_THRESHOLDS.complaint.warning,
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
