import { and, count, eq, gte, isNull, or } from "drizzle-orm";
import { pauseTenantSending } from "@/lib/aws-ses/aws-ses-tenants";
import { db } from "@/lib/db";
import { user } from "@/lib/db/auth-schema";
import {
	emailAddresses,
	emailDomains,
	rateLimitOverrides,
	sentEmails,
	sesTenants,
} from "@/lib/db/schema";
import { getRootDomain, isSubdomain } from "@/lib/domains-and-dns/domain-utils";
import { sendHarkNotification } from "@/lib/notifications/hark";

type GuardReasonCode =
	| "user_not_found"
	| "user_banned"
	| "domain_not_verified"
	| "tenant_inactive"
	| "sender_address_disabled"
	| "hourly_send_limit_exceeded"
	| "guard_check_failed";

export interface OutboundSendGuardResult {
	allowed: boolean;
	statusCode: number;
	error?: string;
	reasonCode?: GuardReasonCode;
	resolvedDomain?: string;
}

interface OutboundSendGuardInput {
	userId: string;
	fromAddress: string;
	fromDomain: string;
	isAgentEmail: boolean;
	/**
	 * What to do when the hourly send limit is hit.
	 *
	 * - "pause_tenant" (default): pause the tenant and alert admins. This is
	 *   the historical single-send behavior: an interactive caller pushing
	 *   past the cap is treated as a potential abuse signal.
	 * - "deny_only": reject this send but leave the tenant untouched and skip
	 *   admin alerts. Used by bulk queue processing, where hitting the cap is
	 *   expected backpressure: queued work must be able to wait for the next
	 *   hourly window without pausing the tenant (which would permanently
	 *   fail every other queued item with tenant_inactive).
	 * - "ignore": skip the hourly-volume denial entirely; every other check
	 *   (ban, tenant state, domain verification, sender address) still runs
	 *   and can deny. Used only when accepting FUTURE-scheduled bulk batches:
	 *   the current rolling window says nothing about capacity at delivery
	 *   time, and the worker re-checks with "deny_only" at execution and
	 *   reschedules overflow past the window.
	 */
	hourlyLimitAction?: "pause_tenant" | "deny_only" | "ignore";
}

const ONE_HOUR_IN_MS = 60 * 60 * 1000;
const DEFAULT_HOURLY_SEND_LIMIT = 500;
const parsedHourlyLimit = Number.parseInt(
	process.env.OUTBOUND_HOURLY_SEND_LIMIT || "",
	10,
);
const HOURLY_SEND_LIMIT =
	Number.isFinite(parsedHourlyLimit) && parsedHourlyLimit > 0
		? parsedHourlyLimit
		: DEFAULT_HOURLY_SEND_LIMIT;
const SLACK_ADMIN_WEBHOOK_URL = process.env.SLACK_ADMIN_WEBHOOK_URL;
const hourlyLimitAlertCache = new Set<string>();

function buildHourlyLimitCacheKey(userId: string, timestamp: Date): string {
	const hourBucket = Math.floor(timestamp.getTime() / ONE_HOUR_IN_MS);
	return `${userId}:${hourBucket}`;
}

function trimHourlyLimitAlertCache(maxEntries = 2000): void {
	if (hourlyLimitAlertCache.size <= maxEntries) {
		return;
	}

	const iterator = hourlyLimitAlertCache.values();
	const entriesToRemove = Math.max(1, hourlyLimitAlertCache.size - maxEntries);
	for (let index = 0; index < entriesToRemove; index++) {
		const next = iterator.next();
		if (next.done) {
			break;
		}
		hourlyLimitAlertCache.delete(next.value);
	}
}

interface HourlyLimitAlertParams {
	userId: string;
	userEmail: string | null;
	tenantId: string;
	sentLastHour: number;
	limit: number;
	windowStart: Date;
	windowEnd: Date;
}

/**
 * Push notify admins that a user hit the hourly send limit.
 *
 * The idempotency key uses the same user + hour bucket as the in-process cache,
 * so Hark still collapses duplicates across serverless instances and cold
 * starts, where that in-memory cache cannot.
 */
async function sendHourlyLimitHarkAlert(
	params: HourlyLimitAlertParams,
): Promise<void> {
	const hourBucketId = Math.floor(params.windowEnd.getTime() / ONE_HOUR_IN_MS);

	const body = [
		"🛑 Hourly send limit reached",
		`${params.sentLastHour} sent in the last hour (limit ${params.limit})`,
		`User ${params.userEmail || params.userId}`,
		"Tenant sending paused.",
	].join("\n");

	await sendHarkNotification({
		title: "inbound",
		body,
		url: "https://inbound.new/guard",
		idempotencyKey: `outbound-hourly-limit:${params.userId}:${hourBucketId}`,
	});
}

async function sendHourlyLimitSlackAlert(
	params: HourlyLimitAlertParams,
): Promise<void> {
	if (!SLACK_ADMIN_WEBHOOK_URL) {
		return;
	}

	const message = {
		text: "Outbound hourly send limit reached",
		blocks: [
			{
				type: "header",
				text: {
					type: "plain_text",
					text: "Outbound hourly send limit reached",
				},
			},
			{
				type: "section",
				fields: [
					{
						type: "mrkdwn",
						text: `*User ID:*\n${params.userId}`,
					},
					{
						type: "mrkdwn",
						text: `*User Email:*\n${params.userEmail || "unknown"}`,
					},
					{
						type: "mrkdwn",
						text: `*Tenant ID:*\n${params.tenantId}`,
					},
					{
						type: "mrkdwn",
						text: `*Last 1h Sent:*\n${params.sentLastHour}`,
					},
					{
						type: "mrkdwn",
						text: `*Limit:*\n${params.limit}`,
					},
					{
						type: "mrkdwn",
						text: `*Window:*\n${params.windowStart.toISOString()} to ${params.windowEnd.toISOString()}`,
					},
				],
			},
		],
	};

	try {
		const response = await fetch(SLACK_ADMIN_WEBHOOK_URL, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify(message),
		});

		if (!response.ok) {
			console.error(
				"❌ Failed to send hourly send limit Slack alert:",
				response.status,
				response.statusText,
			);
		}
	} catch (error) {
		console.error("❌ Failed to send hourly send limit Slack alert:", error);
	}
}

/**
 * Notify admins on every configured channel that the hourly limit was hit.
 *
 * The one-alert-per-user-per-hour cache is applied here rather than inside a
 * single channel, so both channels stay in step and neither can throw into the
 * send path.
 */
async function sendHourlyLimitAlert(
	params: HourlyLimitAlertParams,
): Promise<void> {
	const cacheKey = buildHourlyLimitCacheKey(params.userId, params.windowEnd);
	if (hourlyLimitAlertCache.has(cacheKey)) {
		return;
	}

	hourlyLimitAlertCache.add(cacheKey);
	trimHourlyLimitAlertCache();

	const results = await Promise.allSettled([
		sendHourlyLimitSlackAlert(params),
		sendHourlyLimitHarkAlert(params),
	]);

	for (const result of results) {
		if (result.status === "rejected") {
			console.error("❌ Hourly limit alert channel failed:", result.reason);
		}
	}
}

async function pauseTenantForHourlyLimit(params: {
	tenantId: string;
	configurationSetName: string | null;
}): Promise<void> {
	const reason =
		"Automatic pause: hourly send limit reached and threshold exceeded";

	try {
		if (params.configurationSetName) {
			const pauseResult = await pauseTenantSending(
				params.configurationSetName,
				reason,
			);
			if (pauseResult.success) {
				console.log(
					`✅ pauseTenantForHourlyLimit - Tenant paused in AWS for tenantId: ${params.tenantId}`,
				);
				return;
			}

			console.warn(
				`⚠️ pauseTenantForHourlyLimit - AWS pause failed for tenantId ${params.tenantId}, falling back to DB status update: ${pauseResult.error}`,
			);
		}

		await db
			.update(sesTenants)
			.set({
				status: "paused",
				updatedAt: new Date(),
			})
			.where(eq(sesTenants.id, params.tenantId));

		console.log(
			`✅ pauseTenantForHourlyLimit - Tenant status updated to paused for tenantId: ${params.tenantId}`,
		);
	} catch (error) {
		console.error(
			"❌ pauseTenantForHourlyLimit - Failed to pause tenant:",
			error,
		);
	}
}

function deny(
	statusCode: number,
	error: string,
	reasonCode: GuardReasonCode,
): OutboundSendGuardResult {
	return {
		allowed: false,
		statusCode,
		error,
		reasonCode,
	};
}

export interface HourlySendCapacity {
	limit: number | null;
	sentLastHour: number;
	remaining: number | null;
	windowStart: Date;
	windowEnd: Date;
}

/**
 * Remaining hourly send capacity for a user (limit null = unlimited).
 * Shares the exact window/override semantics used by enforceOutboundSendGuard
 * so bulk acceptance cannot admit more items than the guard would allow.
 */
export async function getHourlySendCapacity(
	userId: string,
): Promise<HourlySendCapacity> {
	const windowEnd = new Date();
	const windowStart = new Date(windowEnd.getTime() - ONE_HOUR_IN_MS);
	const [hourlyCountResult] = await db
		.select({
			total: count(),
		})
		.from(sentEmails)
		.where(
			and(
				eq(sentEmails.userId, userId),
				eq(sentEmails.status, "sent"),
				or(
					gte(sentEmails.sentAt, windowStart),
					and(
						isNull(sentEmails.sentAt),
						gte(sentEmails.createdAt, windowStart),
					),
				),
			),
		)
		.limit(1);

	const sentLastHour = Number(hourlyCountResult?.total || 0);

	const [override] = await db
		.select({
			hourlyLimit: rateLimitOverrides.hourlyLimit,
			expiresAt: rateLimitOverrides.expiresAt,
		})
		.from(rateLimitOverrides)
		.where(
			and(
				eq(rateLimitOverrides.userId, userId),
				eq(rateLimitOverrides.isActive, true),
			),
		)
		.limit(1);

	const isOverrideValid =
		override &&
		(!override.expiresAt || override.expiresAt.getTime() > Date.now());

	// null hourlyLimit = unlimited (no cap)
	const limit = isOverrideValid ? override.hourlyLimit : HOURLY_SEND_LIMIT;

	return {
		limit,
		sentLastHour,
		remaining: limit === null ? null : Math.max(0, limit - sentLastHour),
		windowStart,
		windowEnd,
	};
}

export async function enforceOutboundSendGuard(
	input: OutboundSendGuardInput,
): Promise<OutboundSendGuardResult> {
	const {
		userId,
		fromAddress,
		fromDomain,
		isAgentEmail,
		hourlyLimitAction = "pause_tenant",
	} = input;

	try {
		const [userRecord] = await db
			.select({
				email: user.email,
				banned: user.banned,
				banReason: user.banReason,
				banExpires: user.banExpires,
			})
			.from(user)
			.where(eq(user.id, userId))
			.limit(1);

		if (!userRecord) {
			return deny(
				403,
				"You do not have permission to send email from this account.",
				"user_not_found",
			);
		}

		if (userRecord.banned) {
			const banExpiresAt = userRecord.banExpires
				? new Date(userRecord.banExpires)
				: null;
			const banStillActive = banExpiresAt
				? banExpiresAt.getTime() >= Date.now()
				: true;

			if (banStillActive) {
				return deny(
					403,
					`Account suspended${userRecord.banReason ? `: ${userRecord.banReason}` : ""}`,
					"user_banned",
				);
			}
		}

		const [userTenant] = await db
			.select({
				id: sesTenants.id,
				status: sesTenants.status,
				configurationSetName: sesTenants.configurationSetName,
			})
			.from(sesTenants)
			.where(eq(sesTenants.userId, userId))
			.limit(1);

		if (!userTenant || userTenant.status !== "active") {
			return deny(
				403,
				"Email sending is disabled for this account.",
				"tenant_inactive",
			);
		}

		const capacity = await getHourlySendCapacity(userId);
		const { sentLastHour, windowStart, windowEnd } = capacity;
		const effectiveLimit = capacity.limit;

		// effectiveLimit === null means unlimited — skip the check entirely.
		// "ignore" skips only this denial (future-scheduled acceptance); all
		// other guard checks above and below still apply.
		if (
			effectiveLimit !== null &&
			sentLastHour >= effectiveLimit &&
			hourlyLimitAction !== "ignore"
		) {
			if (hourlyLimitAction === "pause_tenant") {
				await pauseTenantForHourlyLimit({
					tenantId: userTenant.id,
					configurationSetName: userTenant.configurationSetName,
				});

				await sendHourlyLimitAlert({
					userId,
					userEmail: userRecord.email,
					tenantId: userTenant.id,
					sentLastHour,
					limit: effectiveLimit,
					windowStart,
					windowEnd,
				});
			} else {
				// deny_only: expected backpressure (bulk queue). No pause, no
				// admin alert - the caller reschedules the work instead.
				console.log(
					`⏳ Hourly send limit reached for user ${userId} (deny_only): ${sentLastHour}/${effectiveLimit} in the last hour`,
				);
			}

			return deny(
				429,
				`Hourly sending limit reached (${effectiveLimit} emails per hour). Please contact support to request a higher limit.`,
				"hourly_send_limit_exceeded",
			);
		}

		if (isAgentEmail) {
			return { allowed: true, statusCode: 200 };
		}

		let [verifiedDomain] = await db
			.select({
				id: emailDomains.id,
				domain: emailDomains.domain,
				tenantId: emailDomains.tenantId,
			})
			.from(emailDomains)
			.where(
				and(
					eq(emailDomains.userId, userId),
					eq(emailDomains.domain, fromDomain),
					eq(emailDomains.status, "verified"),
				),
			)
			.limit(1);

		if (!verifiedDomain && isSubdomain(fromDomain)) {
			const rootDomain = getRootDomain(fromDomain);
			if (rootDomain) {
				[verifiedDomain] = await db
					.select({
						id: emailDomains.id,
						domain: emailDomains.domain,
						tenantId: emailDomains.tenantId,
					})
					.from(emailDomains)
					.where(
						and(
							eq(emailDomains.userId, userId),
							eq(emailDomains.domain, rootDomain),
							eq(emailDomains.status, "verified"),
						),
					)
					.limit(1);
			}
		}

		if (!verifiedDomain) {
			return deny(
				403,
				`You don't have permission to send from domain: ${fromDomain}`,
				"domain_not_verified",
			);
		}

		if (verifiedDomain.tenantId && verifiedDomain.tenantId !== userTenant.id) {
			return deny(
				403,
				"Email sending is disabled for this account.",
				"tenant_inactive",
			);
		}

		const [senderAddressRecord] = await db
			.select({
				isActive: emailAddresses.isActive,
			})
			.from(emailAddresses)
			.where(
				and(
					eq(emailAddresses.userId, userId),
					eq(emailAddresses.address, fromAddress),
				),
			)
			.limit(1);

		if (senderAddressRecord && senderAddressRecord.isActive === false) {
			return deny(
				403,
				`Sender address is disabled: ${fromAddress}`,
				"sender_address_disabled",
			);
		}

		return {
			allowed: true,
			statusCode: 200,
			resolvedDomain: verifiedDomain.domain,
		};
	} catch (error) {
		console.error("❌ Outbound send guard check failed:", error);
		return deny(
			503,
			"Email sending is temporarily unavailable while security checks are running.",
			"guard_check_failed",
		);
	}
}
