import { NextResponse } from "next/server";
import { type AwsStatsOutput, getAwsSesStats } from "@/lib/aws-ses/aws-stats-core";
import { hourBucket, sendHarkNotification } from "@/lib/notifications/hark";

const SLACK_ADMIN_WEBHOOK_URL = process.env.SLACK_ADMIN_WEBHOOK_URL;
const CRON_SECRET = process.env.CRON_SECRET;

function assertCronAuthorized(request: Request): NextResponse | null {
	if (!CRON_SECRET) {
		return null;
	}

	const authHeader = request.headers.get("authorization") || "";
	const expected = `Bearer ${CRON_SECRET}`;
	if (authHeader !== expected) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	return null;
}

function toPercent(value: number, digits = 3): string {
	return `${value.toFixed(digits)}%`;
}

function getWarningBreaches(stats: AwsStatsOutput): Array<{
	label: string;
	value: number;
	threshold: number;
}> {
	const breaches: Array<{ label: string; value: number; threshold: number }> = [];

	if (
		stats.metrics.latestBounceRatePercent >=
		stats.metrics.thresholds.bounceWarningPercent
	) {
		breaches.push({
			label: "Bounce rate",
			value: stats.metrics.latestBounceRatePercent,
			threshold: stats.metrics.thresholds.bounceWarningPercent,
		});
	}

	if (
		stats.metrics.latestComplaintRatePercent >=
		stats.metrics.thresholds.complaintWarningPercent
	) {
		breaches.push({
			label: "Complaint rate",
			value: stats.metrics.latestComplaintRatePercent,
			threshold: stats.metrics.thresholds.complaintWarningPercent,
		});
	}

	if (stats.metrics.latestRejectRatePercent > 0) {
		breaches.push({
			label: "Reject rate",
			value: stats.metrics.latestRejectRatePercent,
			threshold: 0,
		});
	}

	return breaches;
}

async function sendSlackWarning(
	stats: AwsStatsOutput,
	breaches: Array<{ label: string; value: number; threshold: number }>,
): Promise<void> {
	if (!SLACK_ADMIN_WEBHOOK_URL) {
		console.warn(
			"SLACK_ADMIN_WEBHOOK_URL is not configured, skipping cron alert",
		);
		return;
	}

	const fields = breaches.map((breach) => ({
		type: "mrkdwn",
		text:
			breach.label === "Reject rate"
				? `*${breach.label}:*\n${toPercent(breach.value)} (warning > 0%)`
				: `*${breach.label}:*\n${toPercent(breach.value)} (warning ${toPercent(breach.threshold)})`,
	}));

	const payload = {
		blocks: [
			{
				type: "header",
				text: {
					type: "plain_text",
					text: "SES Warning Threshold Breached",
					emoji: true,
				},
			},
			{
				type: "section",
				fields: [
					...fields,
					{
						type: "mrkdwn",
						text: `*Window:*\n${stats.window.lookbackDays}d @ ${stats.window.periodSeconds}s`,
					},
					{
						type: "mrkdwn",
						text: `*Generated:*\n${new Date(stats.generatedAt).toLocaleString()}`,
					},
				],
			},
			{
				type: "context",
				elements: [
					{
						type: "mrkdwn",
						text: `Latest bounce ${toPercent(stats.metrics.latestBounceRatePercent)} | Latest complaint ${toPercent(stats.metrics.latestComplaintRatePercent)} | Latest reject ${toPercent(stats.metrics.latestRejectRatePercent)}`,
					},
				],
			},
		],
	};

	const response = await fetch(SLACK_ADMIN_WEBHOOK_URL, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(payload),
	});

	if (!response.ok) {
		const body = await response.text();
		throw new Error(
			`Slack webhook failed (${response.status} ${response.statusText}): ${body}`,
		);
	}
}

type Breach = { label: string; value: number; threshold: number };

/**
 * Push notify admins that SES warning thresholds were breached.
 *
 * This cron runs hourly, so the key is the hour bucket plus the breached metric
 * names: a re-run or retry of the same hour is silent, while a newly breached
 * metric still pages.
 */
async function sendHarkWarning(
	stats: AwsStatsOutput,
	breaches: Breach[],
): Promise<void> {
	const breachLines = breaches.map((breach) =>
		breach.label === "Reject rate"
			? `${breach.label} ${toPercent(breach.value)} (warn > 0%)`
			: `${breach.label} ${toPercent(breach.value)} (warn ${toPercent(breach.threshold)})`,
	);

	const body = [
		"⚠️ SES warning threshold breached",
		...breachLines,
		`Window ${stats.window.lookbackDays}d @ ${stats.window.periodSeconds}s`,
	].join("\n");

	const breachKey = breaches
		.map((breach) => breach.label)
		.sort()
		.join(",");

	await sendHarkNotification({
		title: "inbound",
		body,
		url: "https://inbound.new/admin",
		idempotencyKey: `ses-stats-warning:${hourBucket()}:${breachKey}`,
	});
}

/**
 * Fan the cron alert out to every channel.
 *
 * Hark is attempted even when Slack fails. A Slack failure is still rethrown
 * afterwards so the cron run reports non-200 and stays visible in Vercel.
 */
async function sendWarningAlerts(
	stats: AwsStatsOutput,
	breaches: Breach[],
): Promise<void> {
	const [slackResult, harkResult] = await Promise.allSettled([
		sendSlackWarning(stats, breaches),
		sendHarkWarning(stats, breaches),
	]);

	if (harkResult.status === "rejected") {
		console.error(
			"aws-stats-alert Hark notification failed:",
			harkResult.reason,
		);
	}

	if (slackResult.status === "rejected") {
		throw slackResult.reason;
	}
}

export async function GET(request: Request) {
	const unauthorizedResponse = assertCronAuthorized(request);
	if (unauthorizedResponse) {
		return unauthorizedResponse;
	}

	try {
		const { output: stats } = await getAwsSesStats({
			lookbackDays: 7,
			periodSeconds: 3600,
		});
		const breaches = getWarningBreaches(stats);

		console.log("aws-stats-alert latest rates", {
			bounce: stats.metrics.latestBounceRatePercent,
			complaint: stats.metrics.latestComplaintRatePercent,
			reject: stats.metrics.latestRejectRatePercent,
		});
		console.log("aws-stats-alert breaches", breaches);

		if (breaches.length > 0) {
			await sendWarningAlerts(stats, breaches);
		}

		return NextResponse.json({ success: true });
	} catch (error) {
		console.error("aws-stats cron failed:", error);
		return NextResponse.json(
			{
				ok: false,
				error: error instanceof Error ? error.message : "Unknown error",
			},
			{ status: 500 },
		);
	}
}
