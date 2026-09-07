import {
	BULK_EMAIL_ITEM_STATUS,
	EMAIL_BATCH_STATUS,
	type EmailBatch,
} from "@/lib/db/schema";
import { extractEmailAddress } from "@/lib/email-management/agent-email-helper";
import { formatScheduledDate } from "@/lib/utils/date-parser";

export const MAX_BULK_EMAILS = 100;

/**
 * Aggregate stored-attachment budget per batch, measured as the serialized
 * (base64 + JSON) bytes written to sent_emails across ALL item rows,
 * including per-row duplicates. 40 MiB keeps the worst-case attachment
 * write per request in the same ballpark as one maximal single-send email
 * instead of 100x it; bulk is intentionally not the vehicle for large
 * attachments.
 */
export const MAX_BULK_STORED_ATTACHMENT_BYTES = 40 * 1024 * 1024;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface BulkEmailItemInput {
	from: string;
	to: string | string[];
	subject: string;
	html?: string;
	text?: string;
	// cc/bcc are intentionally rejected by validateBulkEmailItem: every bulk
	// item must map to exactly one recipient so capacity, hourly, and Autumn
	// accounting (all counted per item) stay truthful.
	cc?: string | string[];
	bcc?: string | string[];
	reply_to?: string | string[];
	headers?: Record<string, string>;
	attachments?: Array<{
		filename: string;
		content: string;
		content_type?: string;
		path?: string;
	}>;
	tags?: Array<{ name: string; value: string }>;
}

export function toAddressArray(value: string | string[] | undefined): string[] {
	if (!value) return [];
	return Array.isArray(value) ? value : [value];
}

/**
 * Defense in depth for blocklist checks: still surfaces cc/bcc if a caller
 * smuggles them past schema validation, even though validateBulkEmailItem
 * rejects any item carrying them.
 */
export function collectItemRecipients(item: BulkEmailItemInput): string[] {
	return [
		...toAddressArray(item.to),
		...toAddressArray(item.cc),
		...toAddressArray(item.bcc),
	];
}

export function validateBulkEmailItem(
	item: BulkEmailItemInput,
	index: number,
): string | null {
	if (!item.from || !item.to || !item.subject) {
		return `emails[${index}]: from, to, and subject are required`;
	}

	if (!item.html && !item.text) {
		return `emails[${index}]: either html or text content must be provided`;
	}

	// Exactly one recipient per item: each item row is billed and rate
	// limited as one send, so one item must equal one recipient.
	const toAddresses = toAddressArray(item.to);
	if (toAddresses.length !== 1) {
		return `emails[${index}]: exactly one 'to' recipient is required per bulk email (got ${toAddresses.length})`;
	}

	if (
		toAddressArray(item.cc).length > 0 ||
		toAddressArray(item.bcc).length > 0
	) {
		return `emails[${index}]: cc and bcc are not supported for bulk emails; send each recipient as its own email`;
	}

	const address = extractEmailAddress(toAddresses[0]);
	if (!EMAIL_REGEX.test(address)) {
		return `emails[${index}]: invalid email format: ${toAddresses[0]}`;
	}

	return null;
}

/**
 * Total serialized attachment bytes that would be persisted across all item
 * rows (duplicates counted once per row, exactly as stored). Byte length is
 * measured on the UTF-8 serialization, matching Postgres text storage.
 */
export function totalStoredAttachmentBytes(
	serializedAttachmentsByItem: Array<string | null>,
): number {
	let total = 0;
	for (const serialized of serializedAttachmentsByItem) {
		if (serialized) {
			total += Buffer.byteLength(serialized, "utf8");
		}
	}
	return total;
}

export interface BulkQueueMessage {
	type: "batch";
	emailId: string;
	userId: string;
	batchId: string;
	batchIndex: number;
}

export function bulkFlowControlKey(userId: string): string {
	return `bulk-send-${userId}`;
}

export function bulkDeduplicationId(emailId: string): string {
	return `bulk_${emailId}`;
}

/**
 * QStash delivery retries per message. Combined with
 * BULK_QSTASH_RETRY_DELAY_EXPRESSION this spreads redelivery of transient
 * pre-send failures (guard DB blips, billing-service errors, SES throttling)
 * over roughly 75 minutes before the message is dead-lettered. DLQ'd items
 * stay 'queued' in the DB and are recovered by publication reconciliation
 * (idempotent replay or batch status reads), not by a cron.
 */
export const BULK_QSTASH_RETRIES = 5;

/**
 * Delay (milliseconds) between QStash redeliveries: 30s, 150s, 750s, then
 * capped at 30min. `retried` starts at 0. Total span ≈ 75 minutes, which is
 * what BULK_PUBLICATION_ABANDONED_MS must comfortably exceed.
 */
export const BULK_QSTASH_RETRY_DELAY_EXPRESSION =
	"min(1800000, 30000 * pow(5, retried))";

const TEN_MINUTES_MS = 10 * 60 * 1000;
const ONE_HOUR_MS = 60 * 60 * 1000;

/**
 * QStash keeps deduplication ids for ~90 days, and a duplicate publish is
 * "accepted but not enqueued". A recovery republish therefore must NOT reuse
 * the original `bulk_<id>` dedup id: if the original message was already
 * consumed (delivered or dead-lettered), the republish would be silently
 * swallowed and the item stuck forever. Versioning by a 10-minute time
 * bucket makes recovery republishes real messages while still collapsing
 * rapid repeated reconcile attempts into one message per bucket. Duplicate
 * deliveries are safe: the worker's CAS claim lets exactly one win.
 */
export function bulkRepublishDeduplicationId(
	emailId: string,
	nowMs: number,
): string {
	return `bulk_${emailId}_r${Math.floor(nowMs / TEN_MINUTES_MS)}`;
}

/**
 * Dedup id for the delayed replacement published when a bulk item hits the
 * hourly send limit. Includes the retry timestamp so consecutive hourly
 * reschedules of the same item never collide with each other, with the
 * original message id, or with reconcile republishes.
 */
export function bulkHourlyRetryDeduplicationId(
	emailId: string,
	retryAtSeconds: number,
): string {
	return `bulk_${emailId}_h${retryAtSeconds}`;
}

const HOURLY_RETRY_BUFFER_MS = 5 * 60 * 1000;

/**
 * When a bulk item hits the hourly send limit, reschedule it for after the
 * current rolling hourly window has fully aged out. The window is
 * [now - 1h, now], so now + 1h guarantees every send counted against the
 * limit has left the window; the small buffer absorbs clock skew. If the
 * user has refilled the window by then, the redelivered item re-checks and
 * reschedules itself again.
 */
export function computeHourlyLimitRetryAtSeconds(nowMs: number): number {
	return Math.ceil((nowMs + ONE_HOUR_MS + HOURLY_RETRY_BUFFER_MS) / 1000);
}

export interface BulkPublishRequest {
	url: string;
	body: BulkQueueMessage;
	retries: number;
	retryDelay: string;
	deduplicationId: string;
	flowControl: { key: string; parallelism: number };
	notBefore?: number;
}

/**
 * Queue payload carries durable IDs only — item content stays in the DB.
 * flowControl parallelism 1 serializes worker execution per user so the
 * hourly guard re-check in the worker observes every prior bulk send.
 */
export function buildBulkPublishRequest(params: {
	webhookUrl: string;
	emailId: string;
	userId: string;
	batchId: string;
	batchIndex: number;
	notBefore?: number;
	/** Override for recovery republishes; defaults to the original per-item id. */
	deduplicationId?: string;
}): BulkPublishRequest {
	return {
		url: params.webhookUrl,
		body: {
			type: "batch",
			emailId: params.emailId,
			userId: params.userId,
			batchId: params.batchId,
			batchIndex: params.batchIndex,
		},
		retries: BULK_QSTASH_RETRIES,
		retryDelay: BULK_QSTASH_RETRY_DELAY_EXPRESSION,
		deduplicationId:
			params.deduplicationId ?? bulkDeduplicationId(params.emailId),
		flowControl: { key: bulkFlowControlKey(params.userId), parallelism: 1 },
		...(params.notBefore !== undefined && { notBefore: params.notBefore }),
	};
}

export interface BatchCounts {
	queued: number;
	processing: number;
	sent: number;
	failed: number;
	cancelled: number;
}

export function computeBatchCounts(
	statuses: Array<string | null>,
): BatchCounts {
	const counts: BatchCounts = {
		queued: 0,
		processing: 0,
		sent: 0,
		failed: 0,
		cancelled: 0,
	};

	for (const status of statuses) {
		switch (status) {
			case BULK_EMAIL_ITEM_STATUS.QUEUED:
				counts.queued++;
				break;
			case BULK_EMAIL_ITEM_STATUS.PROCESSING:
				counts.processing++;
				break;
			case BULK_EMAIL_ITEM_STATUS.SENT:
				counts.sent++;
				break;
			case BULK_EMAIL_ITEM_STATUS.FAILED:
				counts.failed++;
				break;
			case BULK_EMAIL_ITEM_STATUS.CANCELLED:
				counts.cancelled++;
				break;
		}
	}

	return counts;
}

export function isBatchComplete(counts: BatchCounts, total: number): boolean {
	return counts.sent + counts.failed + counts.cancelled >= total;
}

/**
 * Honest parent status from the outbox point of view: the batch is only
 * 'queued' when every still-queued item has a confirmed QStash publication;
 * any unconfirmed queued item keeps it 'partially_queued' (recoverable via
 * idempotent replay).
 */
export function resolveBatchStatusAfterPublish(
	unconfirmedQueuedCount: number,
): string {
	return unconfirmedQueuedCount === 0
		? EMAIL_BATCH_STATUS.QUEUED
		: EMAIL_BATCH_STATUS.PARTIALLY_QUEUED;
}

/**
 * Read-time truthful parent status. Item rows are the source of truth; if
 * every item is terminal but the advisory parent status drifted (lost
 * counter update, crashed finisher), report completion without mutating.
 * CANCELLED is sticky — it records a user decision, not item progress.
 *
 * `unconfirmedQueuedCount` (queued items with no confirmed QStash
 * publication) demotes a stored 'queued' to 'partially_queued': after a
 * creator crash the parent may still say 'queued' even though some items
 * were never handed to the delivery queue, and a GET intentionally does
 * not publish them — so it must not present them as fully queued either.
 */
export function deriveBatchReadStatus(
	storedStatus: string,
	counts: BatchCounts,
	total: number,
	unconfirmedQueuedCount = 0,
): string {
	if (storedStatus === EMAIL_BATCH_STATUS.CANCELLED) {
		return storedStatus;
	}
	if (total > 0 && isBatchComplete(counts, total)) {
		return EMAIL_BATCH_STATUS.COMPLETED;
	}
	if (
		unconfirmedQueuedCount > 0 &&
		storedStatus === EMAIL_BATCH_STATUS.QUEUED
	) {
		return EMAIL_BATCH_STATUS.PARTIALLY_QUEUED;
	}
	return storedStatus;
}

/**
 * True only for SES rejections known to happen before the message is
 * accepted for delivery (throttling / HTTP 429 / explicit throttling retry
 * metadata). These are safe to retry because SES has provably not queued
 * the message. Generic network or timeout failures after calling SES are
 * deliberately NOT retryable: the send outcome is ambiguous and a retry
 * could double-send.
 */
export function isRetryableSesThrottlingError(error: unknown): boolean {
	if (!error || typeof error !== "object") {
		return false;
	}

	const candidate = error as {
		name?: unknown;
		$metadata?: { httpStatusCode?: unknown };
		$retryable?: { throttling?: unknown };
	};

	if (
		typeof candidate.name === "string" &&
		(candidate.name === "TooManyRequestsException" ||
			candidate.name === "ThrottlingException")
	) {
		return true;
	}

	if (candidate.$metadata?.httpStatusCode === 429) {
		return true;
	}

	if (candidate.$retryable?.throttling === true) {
		return true;
	}

	return false;
}

export function isBulkItemClaimable(status: string | null): boolean {
	return status === BULK_EMAIL_ITEM_STATUS.QUEUED;
}

export function isBulkItemCancellable(status: string | null): boolean {
	return status === BULK_EMAIL_ITEM_STATUS.QUEUED;
}

export function attachmentsCacheKey(
	attachments: BulkEmailItemInput["attachments"],
): string {
	return JSON.stringify(attachments ?? []);
}

export interface BulkAcceptedResponseBody {
	id: string;
	status: string;
	total: number;
	scheduled_at?: string;
	timezone?: string;
	data: Array<{ id: string; index: number }>;
}

/**
 * Deterministic acceptance/replay shape: same batch produces the same body
 * (modulo lifecycle status) so Idempotency-Key retries are safe.
 */
export function buildBulkAcceptedResponse(
	batch: Pick<
		EmailBatch,
		"id" | "status" | "total" | "scheduledAt" | "timezone"
	>,
	items: Array<{ id: string; batchIndex: number | null }>,
): BulkAcceptedResponseBody {
	const sorted = [...items].sort(
		(a, b) => (a.batchIndex ?? 0) - (b.batchIndex ?? 0),
	);

	return {
		id: batch.id,
		status: batch.status,
		total: batch.total,
		...(batch.scheduledAt && {
			scheduled_at: formatScheduledDate(batch.scheduledAt),
			timezone: batch.timezone || "UTC",
		}),
		data: sorted.map((item) => ({
			id: item.id,
			index: item.batchIndex ?? 0,
		})),
	};
}

/**
 * How long a batch may sit with fewer item rows than `total` and no
 * publication before it is treated as a dead partial creation, letting an
 * idempotent retry clean up the unsent rows and recreate instead of
 * returning 409 forever. Creation inserts item rows in seconds; the
 * threshold is deliberately far beyond the maximum serverless function
 * lifetime (15 min on Vercel) so a cleanup can never race a creator that
 * is merely slow — by 45 minutes the creating invocation is provably dead.
 */
export const BULK_CREATION_STALE_MS = 45 * 60 * 1000;

/**
 * True when a partially-created batch (items < total) provably never
 * published anything and is old enough that its creator is dead. Only such
 * batches are safe to clean up: no QStash message ids were ever recorded,
 * so no worker can be racing us on these rows.
 */
export function isStaleUnpublishedCreation(params: {
	batchStatus: string;
	batchCreatedAt: Date | null;
	batchTotal: number;
	itemCount: number;
	messageIdMap: Record<string, string>;
	nowMs: number;
}): boolean {
	if (params.itemCount >= params.batchTotal) return false;
	if (params.batchStatus === EMAIL_BATCH_STATUS.CANCELLED) return false;
	if (Object.keys(params.messageIdMap).length > 0) return false;
	if (!params.batchCreatedAt) return true;
	return (
		params.nowMs - params.batchCreatedAt.getTime() > BULK_CREATION_STALE_MS
	);
}

/**
 * How long past its due time a queued item with a confirmed publication may
 * go untouched before reconciliation treats the message as lost (delivery
 * retries exhausted / DLQ'd) and republishes it. Must comfortably exceed
 * the ~75 minute QStash retry span (BULK_QSTASH_RETRY_DELAY_EXPRESSION) and
 * the ~65 minute hourly-limit reschedule delay; every worker touch (claim /
 * requeue) bumps the item's updatedAt, restarting this clock.
 */
export const BULK_PUBLICATION_ABANDONED_MS = 2 * 60 * 60 * 1000;

export interface BulkPublicationItemState {
	id: string;
	batchIndex: number | null;
	status: string | null;
	updatedAt: Date | null;
}

export interface BulkItemToPublish {
	id: string;
	batchIndex: number;
	deduplicationId: string;
	reason: "missing" | "abandoned";
}

/**
 * Pure outbox scan: decides which still-queued items need a (re)publish.
 *
 * - "missing": queued with no recorded message id — publication was never
 *   confirmed (crash between item insert and QStash confirmation, or a
 *   failed publish call). Only selected when `includeMissing` is true,
 *   i.e. on an explicit idempotent replay: the client was never told these
 *   were queued, so a background status read must not start delivering
 *   them behind the client's back.
 * - "abandoned": queued with a recorded message id, but long past due and
 *   untouched — QStash exhausted delivery retries (DLQ) or the message was
 *   otherwise lost. These were accepted as queued, so both replays and
 *   status reads recover them.
 *
 * Cancelled/processing/terminal items are never selected, and items in a
 * future-scheduled batch are never treated as abandoned (their messages
 * are legitimately parked until notBefore). Republishes always use
 * versioned dedup ids; duplicates are neutralized by the worker's CAS.
 */
export function selectItemsNeedingPublication(params: {
	items: BulkPublicationItemState[];
	messageIdMap: Record<string, string>;
	batchScheduledAt: Date | null;
	batchCreatedAt: Date | null;
	nowMs: number;
	includeMissing: boolean;
}): BulkItemToPublish[] {
	const {
		items,
		messageIdMap,
		batchScheduledAt,
		batchCreatedAt,
		nowMs,
		includeMissing,
	} = params;

	const dueAtMs = Math.max(
		batchScheduledAt?.getTime() ?? 0,
		batchCreatedAt?.getTime() ?? 0,
	);

	const toPublish: BulkItemToPublish[] = [];
	for (const item of items) {
		if (item.status !== BULK_EMAIL_ITEM_STATUS.QUEUED) continue;

		const lastTouchedMs = item.updatedAt?.getTime() ?? dueAtMs;

		if (!messageIdMap[item.id]) {
			if (includeMissing) {
				toPublish.push({
					id: item.id,
					batchIndex: item.batchIndex ?? 0,
					deduplicationId: bulkRepublishDeduplicationId(item.id, nowMs),
					reason: "missing",
				});
			}
			continue;
		}

		const overdue =
			nowMs - dueAtMs > BULK_PUBLICATION_ABANDONED_MS &&
			nowMs - lastTouchedMs > BULK_PUBLICATION_ABANDONED_MS;
		if (overdue) {
			toPublish.push({
				id: item.id,
				batchIndex: item.batchIndex ?? 0,
				deduplicationId: bulkRepublishDeduplicationId(item.id, nowMs),
				reason: "abandoned",
			});
		}
	}

	return toPublish;
}

/**
 * How long a claimed ('processing') item may go untouched before status
 * reads surface it as stale. Deliberately conservative: 45 minutes is 3x
 * the maximum serverless function lifetime (15 min on Vercel), same
 * reasoning as BULK_CREATION_STALE_MS, so a legitimately in-flight send
 * can never be flagged. Stale items are surfaced for ops visibility only
 * — they are intentionally NOT auto-requeued, because a claim that died
 * after handing the message to SES must never be retried (double send).
 */
export const BULK_PROCESSING_STALE_MS = 45 * 60 * 1000;

/**
 * Items stuck in 'processing' well past any legitimate worker lifetime
 * (crashed mid-send, or sent but the success write failed). Items without
 * an updatedAt are skipped rather than guessed at: every claim stamps
 * updatedAt, so a missing value says nothing about staleness.
 */
export function countStaleProcessingItems(
	items: Array<Pick<BulkPublicationItemState, "status" | "updatedAt">>,
	nowMs: number,
): number {
	let stale = 0;
	for (const item of items) {
		if (item.status !== BULK_EMAIL_ITEM_STATUS.PROCESSING) continue;
		if (!item.updatedAt) continue;
		if (nowMs - item.updatedAt.getTime() > BULK_PROCESSING_STALE_MS) {
			stale++;
		}
	}
	return stale;
}

/**
 * Queued items whose publication has never been confirmed (no recorded
 * QStash message id). While this is non-zero the batch must not be
 * presented as fully queued.
 */
export function countUnconfirmedQueuedItems(
	items: BulkPublicationItemState[],
	messageIdMap: Record<string, string>,
): number {
	let unconfirmed = 0;
	for (const item of items) {
		if (
			item.status === BULK_EMAIL_ITEM_STATUS.QUEUED &&
			!messageIdMap[item.id]
		) {
			unconfirmed++;
		}
	}
	return unconfirmed;
}

export function mergeQstashMessageIdMaps(
	base: Record<string, string>,
	incoming: Record<string, string>,
): Record<string, string> {
	return { ...base, ...incoming };
}

export function parseQstashMessageIdMap(
	raw: string | null,
): Record<string, string> {
	if (!raw) return {};
	try {
		const parsed: unknown = JSON.parse(raw);
		if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
			const result: Record<string, string> = {};
			for (const [key, value] of Object.entries(parsed)) {
				if (typeof value === "string") {
					result[key] = value;
				}
			}
			return result;
		}
	} catch {
		return {};
	}
	return {};
}
