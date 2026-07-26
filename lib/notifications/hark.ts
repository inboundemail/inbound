/**
 * Hark push notifications for admin alerts.
 *
 * Sends to a persistent Hark webhook service (title/image/tap URL are configured
 * on the service itself), so callers only supply event-specific fields.
 *
 * Every send requires an idempotency key: these alerts fire from SNS deliveries,
 * cron runs, and hot send paths that all retry, and Hark dedupes on the key.
 *
 * Delivery is best effort and never throws. Admin alerting must not break an
 * email send or fail a cron run.
 */

const HARK_WEBHOOK_URL = process.env.HARK_WEBHOOK_URL;

const REQUEST_TIMEOUT_MS = 5000;
const MAX_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 250;

export interface HarkNotificationInput {
	/** Notification body. Keep it short: this renders on a phone lock screen. */
	body: string;
	/** Overrides the service default title. */
	title?: string;
	/** Overrides the service default tap destination. */
	url?: string;
	/** Stable per logical event, so retries collapse into one notification. */
	idempotencyKey: string;
}

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * POST a notification to the Hark webhook service.
 *
 * Returns true when Hark accepted the notification, false when it was skipped,
 * rejected, or could not be delivered.
 */
export async function sendHarkNotification(
	input: HarkNotificationInput,
): Promise<boolean> {
	if (!HARK_WEBHOOK_URL) {
		console.log(
			"⚠️ HARK_WEBHOOK_URL not configured, skipping Hark notification",
		);
		return false;
	}

	if (!input.idempotencyKey) {
		console.error("❌ Hark notification requires an idempotency key, skipping");
		return false;
	}

	const payload: Record<string, string> = { body: input.body };
	if (input.title) {
		payload.title = input.title;
	}
	if (input.url) {
		payload.url = input.url;
	}

	for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
		try {
			const response = await fetch(HARK_WEBHOOK_URL, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"Idempotency-Key": input.idempotencyKey,
				},
				body: JSON.stringify(payload),
				signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
			});

			if (response.ok) {
				return true;
			}

			// 409 means this idempotency key was already accepted. The notification
			// exists, so this is a success for the caller: a retry must not be
			// reported as a delivery failure.
			if (response.status === 409) {
				console.log(
					`ℹ️ Hark notification already sent for key ${input.idempotencyKey}`,
				);
				return true;
			}

			// Other 4xx (except 429) is permanent: bad payload, revoked or rotated
			// webhook. Retrying wastes time in a request-scoped path.
			if (
				response.status !== 429 &&
				response.status >= 400 &&
				response.status < 500
			) {
				console.error(
					`❌ Hark notification rejected (${response.status} ${response.statusText}) for key ${input.idempotencyKey}`,
				);
				return false;
			}

			console.warn(
				`⚠️ Hark notification attempt ${attempt}/${MAX_ATTEMPTS} failed (${response.status} ${response.statusText})`,
			);
		} catch (error) {
			console.warn(
				`⚠️ Hark notification attempt ${attempt}/${MAX_ATTEMPTS} errored:`,
				error instanceof Error ? error.message : error,
			);
		}

		if (attempt < MAX_ATTEMPTS) {
			await delay(RETRY_BASE_DELAY_MS * 2 ** (attempt - 1));
		}
	}

	console.error(
		`❌ Hark notification failed after ${MAX_ATTEMPTS} attempts for key ${input.idempotencyKey}`,
	);
	return false;
}

/**
 * Truncate an hour-aligned bucket for an idempotency key, so repeated alerts
 * inside the same hour collapse into one notification.
 */
export function hourBucket(timestamp: Date = new Date()): string {
	return timestamp.toISOString().slice(0, 13);
}

/**
 * Truncate to a 15-minute bucket, for alerts that should be allowed to repeat
 * more often than hourly but still not on every triggering event.
 */
export function quarterHourBucket(timestamp: Date = new Date()): string {
	const quarter = Math.floor(timestamp.getUTCMinutes() / 15) * 15;
	return `${timestamp.toISOString().slice(0, 13)}:${String(quarter).padStart(2, "0")}`;
}
