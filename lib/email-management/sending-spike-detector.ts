import { and, count, eq, gte, isNull, lt, or } from "drizzle-orm"
import { getAwsSesStats } from "@/lib/aws-ses/aws-stats-core"
import { user } from "@/lib/db/auth-schema"
import { db } from "@/lib/db"
import { sentEmails } from "@/lib/db/schema"
import { quarterHourBucket, sendHarkNotification } from "@/lib/notifications/hark"
import { redis } from "@/lib/redis"

const SLACK_ADMIN_WEBHOOK_URL = process.env.SLACK_ADMIN_WEBHOOK_URL

const SPIKE_DETECTION_CONFIG = {
	HISTORICAL_DAYS: 14,
	SPIKE_THRESHOLD_MULTIPLIER: 8,
	MIN_HISTORICAL_DAILY_AVERAGE: 50,
	MIN_CURRENT_EMAILS_FOR_RELATIVE_ALERT: 500,
	ABSOLUTE_15_MIN_WARNING: 200,
	ABSOLUTE_1H_WARNING: 500,
	ABSOLUTE_1H_HIGH: 1000,
	ABSOLUTE_1H_CRITICAL: 5000,
	ABSOLUTE_24H_WARNING: 500,
	ABSOLUTE_24H_HIGH: 5000,
	ABSOLUTE_24H_CRITICAL: 100000,
	NEW_ACCOUNT_DAYS: 7,
	NEW_ACCOUNT_1H_WARNING: 300,
	NEW_ACCOUNT_24H_WARNING: 2000,
	REPUTATION_RATE_ALERT_MIN_24H_EMAILS: 500,
	ALERT_COOLDOWN_HOURS: 24,
	AWS_REPUTATION_CACHE_SECONDS: 15 * 60,
}

const SPIKE_ALERT_REDIS_PREFIX = "spike-alert:"
const SPIKE_AWS_REPUTATION_CACHE_KEY = "spike-alert:aws-reputation-cache"

type AlertSeverity = "medium" | "high" | "critical"

type AwsReputationSnapshot = {
	latestBounceRatePercent: number
	latestComplaintRatePercent: number
	latestRejectRatePercent: number
	bounceWarningPercent: number
	complaintWarningPercent: number
	bounceAtRiskPercent: number
	complaintAtRiskPercent: number
	isWarning: boolean
	isAtRisk: boolean
	checkedAt: string
}

async function getEmailsSentSince(userId: string, cutoffTime: Date): Promise<number> {
	const result = await db
		.select({ total: count() })
		.from(sentEmails)
		.where(
			and(
				eq(sentEmails.userId, userId),
				eq(sentEmails.status, "sent"),
				or(
					gte(sentEmails.sentAt, cutoffTime),
					and(isNull(sentEmails.sentAt), gte(sentEmails.createdAt, cutoffTime)),
				),
			),
		)

	return Number(result[0]?.total || 0)
}

async function getHistoricalDailyAverage(userId: string, days: number): Promise<number> {
	const now = new Date()
	const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)
	const historicalStart = new Date(now.getTime() - (days + 1) * 24 * 60 * 60 * 1000)

	const result = await db
		.select({ total: count() })
		.from(sentEmails)
		.where(
			and(
				eq(sentEmails.userId, userId),
				eq(sentEmails.status, "sent"),
				or(
					and(gte(sentEmails.sentAt, historicalStart), lt(sentEmails.sentAt, oneDayAgo)),
					and(
						isNull(sentEmails.sentAt),
						gte(sentEmails.createdAt, historicalStart),
						lt(sentEmails.createdAt, oneDayAgo),
					),
				),
			),
		)

	const totalEmails = Number(result[0]?.total || 0)
	return days > 0 ? totalEmails / days : 0
}

async function getUserInfo(
	userId: string,
): Promise<{ email: string; name: string | null; createdAt: Date | string } | null> {
	const result = await db
		.select({
			email: user.email,
			name: user.name,
			createdAt: user.createdAt,
		})
		.from(user)
		.where(eq(user.id, userId))
		.limit(1)

	return result[0] || null
}

function getUserAgeInDays(createdAt: Date | string): number {
	const created = createdAt instanceof Date ? createdAt : new Date(createdAt)
	return Math.max(0, (Date.now() - created.getTime()) / (1000 * 60 * 60 * 24))
}

async function isInCooldown(userId: string): Promise<boolean> {
	try {
		const redisKey = `${SPIKE_ALERT_REDIS_PREFIX}${userId}`
		const lastAlertTime = await redis.get<number>(redisKey)
		if (!lastAlertTime) {
			return false
		}
		const cooldownMs = SPIKE_DETECTION_CONFIG.ALERT_COOLDOWN_HOURS * 60 * 60 * 1000
		return Date.now() - lastAlertTime < cooldownMs
	} catch (error) {
		console.warn("⚠️ isInCooldown - Redis check failed:", error)
		return false
	}
}

async function markAlertSent(userId: string): Promise<void> {
	try {
		const redisKey = `${SPIKE_ALERT_REDIS_PREFIX}${userId}`
		const cooldownSeconds = SPIKE_DETECTION_CONFIG.ALERT_COOLDOWN_HOURS * 60 * 60
		await redis.set(redisKey, Date.now(), { ex: cooldownSeconds })
	} catch (error) {
		console.warn("⚠️ markAlertSent - Redis set failed:", error)
	}
}

async function getAwsReputationSnapshot(): Promise<AwsReputationSnapshot | null> {
	try {
		const cached = await redis.get<AwsReputationSnapshot>(SPIKE_AWS_REPUTATION_CACHE_KEY)
		if (cached) {
			return cached
		}
	} catch (error) {
		console.warn("⚠️ getAwsReputationSnapshot - Redis read failed:", error)
	}

	try {
		const { output } = await getAwsSesStats({
			lookbackDays: 7,
			periodSeconds: 3600,
		})
		const snapshot: AwsReputationSnapshot = {
			latestBounceRatePercent: output.metrics.latestBounceRatePercent,
			latestComplaintRatePercent: output.metrics.latestComplaintRatePercent,
			latestRejectRatePercent: output.metrics.latestRejectRatePercent,
			bounceWarningPercent: output.metrics.thresholds.bounceWarningPercent,
			complaintWarningPercent: output.metrics.thresholds.complaintWarningPercent,
			bounceAtRiskPercent: output.metrics.thresholds.bounceAtRiskPercent,
			complaintAtRiskPercent: output.metrics.thresholds.complaintAtRiskPercent,
			isWarning:
				output.metrics.latestBounceRatePercent >= output.metrics.thresholds.bounceWarningPercent ||
				output.metrics.latestComplaintRatePercent >=
					output.metrics.thresholds.complaintWarningPercent ||
				output.metrics.latestRejectRatePercent > 0,
			isAtRisk:
				output.metrics.latestBounceRatePercent >= output.metrics.thresholds.bounceAtRiskPercent ||
				output.metrics.latestComplaintRatePercent >=
					output.metrics.thresholds.complaintAtRiskPercent,
			checkedAt: new Date().toISOString(),
		}

		try {
			await redis.set(SPIKE_AWS_REPUTATION_CACHE_KEY, snapshot, {
				ex: SPIKE_DETECTION_CONFIG.AWS_REPUTATION_CACHE_SECONDS,
			})
		} catch (error) {
			console.warn("⚠️ getAwsReputationSnapshot - Redis write failed:", error)
		}

		return snapshot
	} catch (error) {
		console.warn("⚠️ getAwsReputationSnapshot - Failed to load SES reputation rates:", error)
		return null
	}
}

function getSeverity(
	current15m: number,
	current1h: number,
	current24h: number,
	reputation: AwsReputationSnapshot | null,
): AlertSeverity {
	if (
		current24h >= SPIKE_DETECTION_CONFIG.ABSOLUTE_24H_CRITICAL ||
		current1h >= SPIKE_DETECTION_CONFIG.ABSOLUTE_1H_CRITICAL ||
		reputation?.isAtRisk
	) {
		return "critical"
	}

	if (
		current24h >= SPIKE_DETECTION_CONFIG.ABSOLUTE_24H_HIGH ||
		current1h >= SPIKE_DETECTION_CONFIG.ABSOLUTE_1H_HIGH
	) {
		return "high"
	}

	return "medium"
}

interface SpikeAlertParams {
	userId: string
	userEmail: string
	userName: string | null
	current15m: number
	current1h: number
	current24h: number
	historicalAverage: number
	spikeMultiplier: number | null
	severity: AlertSeverity
	reasons: string[]
	reputation: AwsReputationSnapshot | null
}

/**
 * Push notify admins about a sending spike.
 *
 * Keyed by user, severity, and 15-minute bucket: an escalation from high to
 * critical still pages, but a burst of sends inside one bucket does not.
 */
async function sendSpikeHarkAlert(params: SpikeAlertParams): Promise<boolean> {
	const emoji =
		params.severity === "critical" ? "🚨" : params.severity === "high" ? "⚠️" : "🔎"
	const multiplierText =
		params.spikeMultiplier === null ? "N/A" : `${params.spikeMultiplier.toFixed(1)}x`

	const body = [
		`${emoji} Sending spike (${params.severity})`,
		`15m ${params.current15m.toLocaleString()} · 1h ${params.current1h.toLocaleString()} · 24h ${params.current24h.toLocaleString()}`,
		`${multiplierText} vs ${params.historicalAverage.toFixed(1)}/day avg`,
		`User ${params.userEmail}`,
		`Triggers: ${params.reasons.join(", ")}`,
	].join("\n")

	return await sendHarkNotification({
		title: "inbound",
		body,
		url: "https://inbound.new/admin",
		idempotencyKey: `sending-spike:${params.userId}:${params.severity}:${quarterHourBucket()}`,
	})
}

async function sendSpikeSlackAlert(params: SpikeAlertParams): Promise<boolean> {
	if (!SLACK_ADMIN_WEBHOOK_URL) {
		console.log("⚠️ SLACK_ADMIN_WEBHOOK_URL not configured, skipping spike alert")
		return false
	}

	const emoji =
		params.severity === "critical" ? "🚨" : params.severity === "high" ? "⚠️" : "🔎"
	const titleSeverity = params.severity.toUpperCase()
	const multiplierText =
		params.spikeMultiplier === null ? "N/A" : `${params.spikeMultiplier.toFixed(1)}x`

	try {
		const slackMessage = {
			blocks: [
				{
					type: "header",
					text: {
						type: "plain_text",
						text: `${emoji} Email Sending Spike Detected (${titleSeverity})`,
						emoji: true,
					},
				},
				{
					type: "section",
					fields: [
						{
							type: "mrkdwn",
							text: `*User:*\n${params.userName || "N/A"} (${params.userEmail})`,
						},
						{
							type: "mrkdwn",
							text: `*User ID:*\n\`${params.userId}\``,
						},
						{
							type: "mrkdwn",
							text: `*Last 15m:*\n${params.current15m.toLocaleString()}`,
						},
						{
							type: "mrkdwn",
							text: `*Last 1h:*\n${params.current1h.toLocaleString()}`,
						},
						{
							type: "mrkdwn",
							text: `*Last 24h:*\n${params.current24h.toLocaleString()}`,
						},
						{
							type: "mrkdwn",
							text: `*Historical Daily Avg:*\n${params.historicalAverage.toFixed(1)}`,
						},
						{
							type: "mrkdwn",
							text: `*Spike Multiplier:*\n${multiplierText}`,
						},
						{
							type: "mrkdwn",
							text: `*Detected At:*\n${new Date().toLocaleString()}`,
						},
					],
				},
				{
					type: "section",
					text: {
						type: "mrkdwn",
						text: `*Triggers:* ${params.reasons.join(" • ")}`,
					},
				},
				...(params.reputation
					? [
							{
								type: "context" as const,
								elements: [
									{
										type: "mrkdwn" as const,
										text: `SES latest rates → bounce ${params.reputation.latestBounceRatePercent.toFixed(3)}% (warn ${params.reputation.bounceWarningPercent.toFixed(3)}%), complaint ${params.reputation.latestComplaintRatePercent.toFixed(3)}% (warn ${params.reputation.complaintWarningPercent.toFixed(3)}%), reject ${params.reputation.latestRejectRatePercent.toFixed(3)}%`,
									},
								],
							},
						]
					: []),
				{
					type: "actions",
					elements: [
						{
							type: "button",
							text: {
								type: "plain_text",
								text: "View in Admin",
								emoji: true,
							},
							url: "https://inbound.new/admin",
							action_id: "view_admin",
						},
					],
				},
			],
		}

		const response = await fetch(SLACK_ADMIN_WEBHOOK_URL, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(slackMessage),
		})

		if (!response.ok) {
			console.error(`❌ Slack spike alert failed: ${response.status} ${response.statusText}`)
			return false
		}

		console.log(`✅ Slack spike alert sent for user: ${params.userEmail}`)
		return true
	} catch (error) {
		console.error("❌ Failed to send Slack spike alert:", error)
		return false
	}
}

/**
 * Alert admins about a spike on every configured channel.
 *
 * The redis dedupe marker is only written when at least one channel accepted the
 * alert, so a total delivery failure does not silence the next detection.
 */
async function sendSpikeAlert(params: SpikeAlertParams): Promise<void> {
	const results = await Promise.allSettled([
		sendSpikeSlackAlert(params),
		sendSpikeHarkAlert(params),
	])

	let anyDelivered = false
	for (const result of results) {
		if (result.status === "rejected") {
			console.error("❌ Spike alert channel failed:", result.reason)
		} else if (result.value) {
			anyDelivered = true
		}
	}

	if (anyDelivered) {
		await markAlertSent(params.userId)
	}
}

export interface SpikeDetectionResult {
	isSpike: boolean
	currentCount: number
	current1h: number
	current15m: number
	historicalAverage: number
	spikeMultiplier: number | null
	alertSent: boolean
	severity?: AlertSeverity
	reason?: string
}

export async function checkSendingSpike(userId: string): Promise<SpikeDetectionResult> {
	try {
		console.log(`📊 Checking sending spike for user ${userId}`)

		if (await isInCooldown(userId)) {
			console.log(`⏳ User ${userId} is in cooldown, skipping spike check`)
			return {
				isSpike: false,
				currentCount: 0,
				current1h: 0,
				current15m: 0,
				historicalAverage: 0,
				spikeMultiplier: null,
				alertSent: false,
				reason: "User in cooldown period",
			}
		}

		const now = Date.now()
		const fifteenMinutesAgo = new Date(now - 15 * 60 * 1000)
		const oneHourAgo = new Date(now - 60 * 60 * 1000)
		const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000)

		const [current15m, current1h, current24h, historicalAverage, userInfo] =
			await Promise.all([
				getEmailsSentSince(userId, fifteenMinutesAgo),
				getEmailsSentSince(userId, oneHourAgo),
				getEmailsSentSince(userId, oneDayAgo),
				getHistoricalDailyAverage(userId, SPIKE_DETECTION_CONFIG.HISTORICAL_DAYS),
				getUserInfo(userId),
			])

		const baselineReady =
			historicalAverage >= SPIKE_DETECTION_CONFIG.MIN_HISTORICAL_DAILY_AVERAGE
		const spikeMultiplier = baselineReady ? current24h / historicalAverage : null

		const reasons: string[] = []

		const isRelativeSpike =
			baselineReady &&
			current24h >= SPIKE_DETECTION_CONFIG.MIN_CURRENT_EMAILS_FOR_RELATIVE_ALERT &&
			(spikeMultiplier || 0) >= SPIKE_DETECTION_CONFIG.SPIKE_THRESHOLD_MULTIPLIER

		if (isRelativeSpike) {
			reasons.push(
				`relative_spike_${(spikeMultiplier || 0).toFixed(1)}x_vs_${SPIKE_DETECTION_CONFIG.HISTORICAL_DAYS}d_avg`,
			)
		}

		if (current15m >= SPIKE_DETECTION_CONFIG.ABSOLUTE_15_MIN_WARNING) {
			reasons.push(`burst_15m_${current15m}`)
		}
		if (current1h >= SPIKE_DETECTION_CONFIG.ABSOLUTE_1H_WARNING) {
			reasons.push(`volume_1h_${current1h}`)
		}
		if (current24h >= SPIKE_DETECTION_CONFIG.ABSOLUTE_24H_WARNING) {
			reasons.push(`volume_24h_${current24h}`)
		}

		const userAgeDays = userInfo ? getUserAgeInDays(userInfo.createdAt) : null
		const isNewAccount =
			userAgeDays !== null && userAgeDays <= SPIKE_DETECTION_CONFIG.NEW_ACCOUNT_DAYS
		if (
			isNewAccount &&
			(current1h >= SPIKE_DETECTION_CONFIG.NEW_ACCOUNT_1H_WARNING ||
				current24h >= SPIKE_DETECTION_CONFIG.NEW_ACCOUNT_24H_WARNING)
		) {
			reasons.push(`new_account_volume_${Math.round(userAgeDays || 0)}d_old`)
		}

		const shouldCheckReputation =
			reasons.length > 0 ||
			current24h >= SPIKE_DETECTION_CONFIG.REPUTATION_RATE_ALERT_MIN_24H_EMAILS
		const reputation = shouldCheckReputation ? await getAwsReputationSnapshot() : null

		if (
			reputation?.isWarning &&
			current24h >= SPIKE_DETECTION_CONFIG.REPUTATION_RATE_ALERT_MIN_24H_EMAILS
		) {
			reasons.push("aws_reputation_warning")
		}

		const shouldAlert = reasons.length > 0
		const severity = shouldAlert
			? getSeverity(current15m, current1h, current24h, reputation)
			: undefined

		console.log(
			`📊 Spike check for user ${userId}: 15m=${current15m}, 1h=${current1h}, 24h=${current24h}, avg=${historicalAverage.toFixed(1)}, multiplier=${spikeMultiplier?.toFixed(1) || "N/A"}, reasons=${reasons.join(",") || "none"}`,
		)

		if (!shouldAlert) {
			return {
				isSpike: false,
				currentCount: current24h,
				current1h,
				current15m,
				historicalAverage,
				spikeMultiplier,
				alertSent: false,
				reason: "No spam-oriented spike thresholds exceeded",
			}
		}

		if (!userInfo) {
			return {
				isSpike: true,
				currentCount: current24h,
				current1h,
				current15m,
				historicalAverage,
				spikeMultiplier,
				alertSent: false,
				severity,
				reason: "User metadata missing; alert skipped",
			}
		}

		await sendSpikeAlert({
			userId,
			userEmail: userInfo.email,
			userName: userInfo.name,
			current15m,
			current1h,
			current24h,
			historicalAverage,
			spikeMultiplier,
			severity: severity || "medium",
			reasons,
			reputation,
		})

		return {
			isSpike: true,
			currentCount: current24h,
			current1h,
			current15m,
			historicalAverage,
			spikeMultiplier,
			alertSent: true,
			severity,
			reason: reasons.join(", "),
		}
	} catch (error) {
		console.error(`❌ Error checking sending spike for user ${userId}:`, error)
		return {
			isSpike: false,
			currentCount: 0,
			current1h: 0,
			current15m: 0,
			historicalAverage: 0,
			spikeMultiplier: null,
			alertSent: false,
			reason: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
		}
	}
}

