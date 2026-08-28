import { describe, expect, it } from "bun:test";
import {
	attachmentsCacheKey,
	BULK_CREATION_STALE_MS,
	BULK_PROCESSING_STALE_MS,
	BULK_PUBLICATION_ABANDONED_MS,
	BULK_QSTASH_RETRIES,
	BULK_QSTASH_RETRY_DELAY_EXPRESSION,
	buildBulkAcceptedResponse,
	buildBulkPublishRequest,
	bulkDeduplicationId,
	bulkFlowControlKey,
	bulkHourlyRetryDeduplicationId,
	bulkRepublishDeduplicationId,
	collectItemRecipients,
	computeBatchCounts,
	computeHourlyLimitRetryAtSeconds,
	countStaleProcessingItems,
	countUnconfirmedQueuedItems,
	deriveBatchReadStatus,
	isBatchComplete,
	isBulkItemCancellable,
	isBulkItemClaimable,
	isRetryableSesThrottlingError,
	isStaleUnpublishedCreation,
	MAX_BULK_EMAILS,
	MAX_BULK_STORED_ATTACHMENT_BYTES,
	mergeQstashMessageIdMaps,
	parseQstashMessageIdMap,
	resolveBatchStatusAfterPublish,
	selectItemsNeedingPublication,
	toAddressArray,
	totalStoredAttachmentBytes,
	validateBulkEmailItem,
} from "@/app/api/e2/emails/bulk-helpers";
import { BULK_EMAIL_ITEM_STATUS, EMAIL_BATCH_STATUS } from "@/lib/db/schema";

const validItem = {
	from: "Sender <sender@example.com>",
	to: "to@example.com",
	subject: "Hello",
	text: "Hi there",
};

describe("validateBulkEmailItem", () => {
	it("accepts a minimal valid item", () => {
		expect(validateBulkEmailItem(validItem, 0)).toBeNull();
	});

	it("requires from, to, and subject", () => {
		expect(validateBulkEmailItem({ ...validItem, from: "" }, 2)).toBe(
			"emails[2]: from, to, and subject are required",
		);
		expect(validateBulkEmailItem({ ...validItem, subject: "" }, 5)).toContain(
			"emails[5]",
		);
	});

	it("requires html or text content", () => {
		expect(validateBulkEmailItem({ ...validItem, text: undefined }, 1)).toBe(
			"emails[1]: either html or text content must be provided",
		);
		expect(
			validateBulkEmailItem(
				{ ...validItem, text: undefined, html: "<p>hi</p>" },
				1,
			),
		).toBeNull();
	});

	it("rejects empty recipient arrays", () => {
		expect(validateBulkEmailItem({ ...validItem, to: [] }, 0)).toBe(
			"emails[0]: exactly one 'to' recipient is required per bulk email (got 0)",
		);
	});

	it("rejects more than one 'to' recipient per item", () => {
		expect(
			validateBulkEmailItem(
				{ ...validItem, to: ["a@example.com", "b@example.com"] },
				2,
			),
		).toBe(
			"emails[2]: exactly one 'to' recipient is required per bulk email (got 2)",
		);
	});

	it("accepts a single-element 'to' array", () => {
		expect(
			validateBulkEmailItem({ ...validItem, to: ["one@example.com"] }, 0),
		).toBeNull();
	});

	it("rejects cc and bcc so every item stays one recipient", () => {
		const expected =
			"emails[1]: cc and bcc are not supported for bulk emails; send each recipient as its own email";
		expect(validateBulkEmailItem({ ...validItem, cc: "c@d.co" }, 1)).toBe(
			expected,
		);
		expect(validateBulkEmailItem({ ...validItem, bcc: ["e@f.co"] }, 1)).toBe(
			expected,
		);
		// Empty arrays carry no recipients and are tolerated.
		expect(validateBulkEmailItem({ ...validItem, cc: [], bcc: [] }, 1)).toBe(
			null,
		);
	});

	it("rejects invalid recipient addresses", () => {
		expect(validateBulkEmailItem({ ...validItem, to: "not-an-email" }, 3)).toBe(
			"emails[3]: invalid email format: not-an-email",
		);
		expect(validateBulkEmailItem({ ...validItem, to: ["bad@"] }, 4)).toContain(
			"invalid email format",
		);
	});

	it("accepts display-name recipients", () => {
		expect(
			validateBulkEmailItem(
				{ ...validItem, to: "Jane Doe <jane@example.com>" },
				0,
			),
		).toBeNull();
	});
});

describe("recipient helpers", () => {
	it("normalizes single values and arrays", () => {
		expect(toAddressArray(undefined)).toEqual([]);
		expect(toAddressArray("a@b.co")).toEqual(["a@b.co"]);
		expect(toAddressArray(["a@b.co", "c@d.co"])).toEqual(["a@b.co", "c@d.co"]);
	});

	it("collects to, cc, and bcc recipients", () => {
		expect(
			collectItemRecipients({
				...validItem,
				to: ["a@b.co"],
				cc: "c@d.co",
				bcc: ["e@f.co"],
			}),
		).toEqual(["a@b.co", "c@d.co", "e@f.co"]);
	});
});

describe("buildBulkPublishRequest", () => {
	it("queues durable IDs only - no message content", () => {
		const request = buildBulkPublishRequest({
			webhookUrl: "https://app.example.com/api/webhooks/send-email",
			emailId: "email_1",
			userId: "user_1",
			batchId: "batch_1",
			batchIndex: 3,
		});

		expect(request.body).toEqual({
			type: "batch",
			emailId: "email_1",
			userId: "user_1",
			batchId: "batch_1",
			batchIndex: 3,
		});
		expect(Object.keys(request.body)).not.toContain("emailData");
		expect(request.retries).toBe(BULK_QSTASH_RETRIES);
		expect(request.retryDelay).toBe(BULK_QSTASH_RETRY_DELAY_EXPRESSION);
		expect(request.notBefore).toBeUndefined();
	});

	it("spaces retries out far enough to ride through transient outages", () => {
		// The expression must reference the retry counter and stay in ms.
		expect(BULK_QSTASH_RETRIES).toBeGreaterThanOrEqual(5);
		expect(BULK_QSTASH_RETRY_DELAY_EXPRESSION).toContain("retried");
		// Abandonment must not trigger while QStash retries are still
		// possible: 5 delays capped at 30 minutes each stay well under 2h.
		expect(BULK_PUBLICATION_ABANDONED_MS).toBeGreaterThanOrEqual(
			2 * 60 * 60 * 1000,
		);
	});

	it("allows a deduplication override for recovery republishes", () => {
		const request = buildBulkPublishRequest({
			webhookUrl: "https://app.example.com/api/webhooks/send-email",
			emailId: "email_1",
			userId: "user_1",
			batchId: "batch_1",
			batchIndex: 0,
			deduplicationId: "bulk_email_1_r123",
		});

		expect(request.deduplicationId).toBe("bulk_email_1_r123");
	});

	it("serializes worker flow per user and dedupes per item", () => {
		const request = buildBulkPublishRequest({
			webhookUrl: "https://app.example.com/api/webhooks/send-email",
			emailId: "email_9",
			userId: "user_7",
			batchId: "batch_2",
			batchIndex: 0,
		});

		expect(request.flowControl).toEqual({
			key: bulkFlowControlKey("user_7"),
			parallelism: 1,
		});
		expect(request.deduplicationId).toBe(bulkDeduplicationId("email_9"));
	});

	it("propagates notBefore for scheduled batches", () => {
		const notBefore = 1_900_000_000;
		const request = buildBulkPublishRequest({
			webhookUrl: "https://app.example.com/api/webhooks/send-email",
			emailId: "email_2",
			userId: "user_1",
			batchId: "batch_1",
			batchIndex: 1,
			notBefore,
		});

		expect(request.notBefore).toBe(notBefore);
	});
});

describe("batch aggregation", () => {
	it("computes counts from item statuses", () => {
		expect(
			computeBatchCounts([
				BULK_EMAIL_ITEM_STATUS.QUEUED,
				BULK_EMAIL_ITEM_STATUS.QUEUED,
				BULK_EMAIL_ITEM_STATUS.PROCESSING,
				BULK_EMAIL_ITEM_STATUS.SENT,
				BULK_EMAIL_ITEM_STATUS.FAILED,
				BULK_EMAIL_ITEM_STATUS.CANCELLED,
				null,
			]),
		).toEqual({
			queued: 2,
			processing: 1,
			sent: 1,
			failed: 1,
			cancelled: 1,
		});
	});

	it("marks a batch complete only when all items are terminal", () => {
		expect(
			isBatchComplete(
				{ queued: 0, processing: 0, sent: 2, failed: 1, cancelled: 1 },
				4,
			),
		).toBe(true);
		expect(
			isBatchComplete(
				{ queued: 1, processing: 0, sent: 2, failed: 1, cancelled: 0 },
				4,
			),
		).toBe(false);
		expect(
			isBatchComplete(
				{ queued: 0, processing: 1, sent: 3, failed: 0, cancelled: 0 },
				4,
			),
		).toBe(false);
	});

	it("resolves post-publish batch status honestly", () => {
		// Status is driven by unconfirmed queued items, not raw publish counts.
		expect(resolveBatchStatusAfterPublish(0)).toBe(EMAIL_BATCH_STATUS.QUEUED);
		expect(resolveBatchStatusAfterPublish(1)).toBe(
			EMAIL_BATCH_STATUS.PARTIALLY_QUEUED,
		);
		expect(resolveBatchStatusAfterPublish(10)).toBe(
			EMAIL_BATCH_STATUS.PARTIALLY_QUEUED,
		);
	});
});

describe("claim and cancel eligibility", () => {
	it("only queued items are claimable by the worker", () => {
		expect(isBulkItemClaimable(BULK_EMAIL_ITEM_STATUS.QUEUED)).toBe(true);
		expect(isBulkItemClaimable(BULK_EMAIL_ITEM_STATUS.PROCESSING)).toBe(false);
		expect(isBulkItemClaimable(BULK_EMAIL_ITEM_STATUS.SENT)).toBe(false);
		expect(isBulkItemClaimable(BULK_EMAIL_ITEM_STATUS.FAILED)).toBe(false);
		expect(isBulkItemClaimable(BULK_EMAIL_ITEM_STATUS.CANCELLED)).toBe(false);
		expect(isBulkItemClaimable(null)).toBe(false);
	});

	it("only queued (unclaimed) items are cancellable", () => {
		expect(isBulkItemCancellable(BULK_EMAIL_ITEM_STATUS.QUEUED)).toBe(true);
		expect(isBulkItemCancellable(BULK_EMAIL_ITEM_STATUS.PROCESSING)).toBe(
			false,
		);
		expect(isBulkItemCancellable(BULK_EMAIL_ITEM_STATUS.SENT)).toBe(false);
	});
});

describe("idempotent replay response", () => {
	const batch = {
		id: "batch_1",
		status: EMAIL_BATCH_STATUS.QUEUED,
		total: 3,
		scheduledAt: null,
		timezone: null,
	};

	it("returns a deterministic shape ordered by batch index", () => {
		const items = [
			{ id: "email_c", batchIndex: 2 },
			{ id: "email_a", batchIndex: 0 },
			{ id: "email_b", batchIndex: 1 },
		];

		const first = buildBulkAcceptedResponse(batch, items);
		const second = buildBulkAcceptedResponse(batch, [...items].reverse());

		expect(first).toEqual(second);
		expect(first.data.map((item) => item.id)).toEqual([
			"email_a",
			"email_b",
			"email_c",
		]);
		expect(first.scheduled_at).toBeUndefined();
	});

	it("includes batch-level schedule information when present", () => {
		const scheduledAt = new Date("2026-08-09T10:00:00.000Z");
		const response = buildBulkAcceptedResponse(
			{ ...batch, scheduledAt, timezone: "America/New_York" },
			[{ id: "email_a", batchIndex: 0 }],
		);

		expect(response.scheduled_at).toBe(scheduledAt.toISOString());
		expect(response.timezone).toBe("America/New_York");
	});
});

describe("attachment dedup cache key", () => {
	it("is stable for identical attachment lists", () => {
		const attachments = [
			{
				filename: "a.pdf",
				content: "aGVsbG8=",
				content_type: "application/pdf",
			},
		];
		expect(attachmentsCacheKey(attachments)).toBe(
			attachmentsCacheKey([...attachments]),
		);
	});

	it("differs when content differs", () => {
		expect(
			attachmentsCacheKey([{ filename: "a.pdf", content: "aGVsbG8=" }]),
		).not.toBe(
			attachmentsCacheKey([{ filename: "a.pdf", content: "d29ybGQ=" }]),
		);
	});

	it("treats missing and empty attachment lists the same", () => {
		expect(attachmentsCacheKey(undefined)).toBe(attachmentsCacheKey([]));
	});
});

describe("parseQstashMessageIdMap", () => {
	it("parses a valid map", () => {
		expect(
			parseQstashMessageIdMap('{"email_1":"msg_1","email_2":"msg_2"}'),
		).toEqual({ email_1: "msg_1", email_2: "msg_2" });
	});

	it("returns an empty map for null, invalid JSON, and non-objects", () => {
		expect(parseQstashMessageIdMap(null)).toEqual({});
		expect(parseQstashMessageIdMap("not json")).toEqual({});
		expect(parseQstashMessageIdMap('["msg_1"]')).toEqual({});
	});

	it("drops non-string values", () => {
		expect(parseQstashMessageIdMap('{"email_1":"msg_1","email_2":7}')).toEqual({
			email_1: "msg_1",
		});
	});
});

describe("stored attachment accounting", () => {
	it("sums serialized bytes across rows, counting duplicates per row", () => {
		const serialized = JSON.stringify([
			{
				content: "aGVsbG8=",
				filename: "a.pdf",
				content_type: "application/pdf",
			},
		]);
		const rowBytes = Buffer.byteLength(serialized, "utf8");

		expect(
			totalStoredAttachmentBytes([serialized, serialized, serialized]),
		).toBe(rowBytes * 3);
	});

	it("skips rows without attachments", () => {
		const serialized = '[{"content":"aGVsbG8=","filename":"a.txt"}]';
		expect(totalStoredAttachmentBytes([null, serialized, null])).toBe(
			Buffer.byteLength(serialized, "utf8"),
		);
		expect(totalStoredAttachmentBytes([])).toBe(0);
		expect(totalStoredAttachmentBytes([null, null])).toBe(0);
	});

	it("measures UTF-8 bytes, not string length", () => {
		const multibyte = '[{"filename":"héllo–✓.txt","content":"aGVsbG8="}]';
		expect(totalStoredAttachmentBytes([multibyte])).toBe(
			Buffer.byteLength(multibyte, "utf8"),
		);
		expect(totalStoredAttachmentBytes([multibyte])).toBeGreaterThan(
			multibyte.length,
		);
	});
});

describe("isRetryableSesThrottlingError", () => {
	it("classifies known SES throttling names as retryable", () => {
		expect(
			isRetryableSesThrottlingError({ name: "TooManyRequestsException" }),
		).toBe(true);
		expect(isRetryableSesThrottlingError({ name: "ThrottlingException" })).toBe(
			true,
		);
	});

	it("classifies HTTP 429 responses as retryable", () => {
		expect(
			isRetryableSesThrottlingError({
				name: "UnknownError",
				$metadata: { httpStatusCode: 429 },
			}),
		).toBe(true);
	});

	it("classifies explicit throttling retry metadata as retryable", () => {
		expect(
			isRetryableSesThrottlingError({
				name: "SomethingElse",
				$retryable: { throttling: true },
			}),
		).toBe(true);
	});

	it("does not classify generic network or timeout errors as retryable", () => {
		expect(isRetryableSesThrottlingError(new Error("socket hang up"))).toBe(
			false,
		);
		expect(isRetryableSesThrottlingError({ name: "TimeoutError" })).toBe(false);
		expect(
			isRetryableSesThrottlingError({ name: "ECONNRESET", code: "ECONNRESET" }),
		).toBe(false);
	});

	it("does not treat non-throttling retryable metadata or 5xx as safe", () => {
		expect(isRetryableSesThrottlingError({ $retryable: {} })).toBe(false);
		expect(
			isRetryableSesThrottlingError({
				name: "InternalServiceErrorException",
				$metadata: { httpStatusCode: 500 },
			}),
		).toBe(false);
	});

	it("handles non-object inputs", () => {
		expect(isRetryableSesThrottlingError(null)).toBe(false);
		expect(isRetryableSesThrottlingError(undefined)).toBe(false);
		expect(isRetryableSesThrottlingError("throttled")).toBe(false);
		expect(isRetryableSesThrottlingError(429)).toBe(false);
	});
});

describe("deriveBatchReadStatus", () => {
	const allTerminal = {
		queued: 0,
		processing: 0,
		sent: 3,
		failed: 1,
		cancelled: 1,
	};
	const inFlight = {
		queued: 1,
		processing: 1,
		sent: 3,
		failed: 0,
		cancelled: 0,
	};

	it("reports completion when items are all terminal but parent drifted", () => {
		expect(
			deriveBatchReadStatus(EMAIL_BATCH_STATUS.QUEUED, allTerminal, 5),
		).toBe(EMAIL_BATCH_STATUS.COMPLETED);
		expect(
			deriveBatchReadStatus(
				EMAIL_BATCH_STATUS.PARTIALLY_QUEUED,
				allTerminal,
				5,
			),
		).toBe(EMAIL_BATCH_STATUS.COMPLETED);
	});

	it("preserves CANCELLED even when all items are terminal", () => {
		expect(
			deriveBatchReadStatus(EMAIL_BATCH_STATUS.CANCELLED, allTerminal, 5),
		).toBe(EMAIL_BATCH_STATUS.CANCELLED);
	});

	it("keeps the stored status while items are still in flight", () => {
		expect(deriveBatchReadStatus(EMAIL_BATCH_STATUS.QUEUED, inFlight, 5)).toBe(
			EMAIL_BATCH_STATUS.QUEUED,
		);
		expect(
			deriveBatchReadStatus(EMAIL_BATCH_STATUS.PARTIALLY_QUEUED, inFlight, 5),
		).toBe(EMAIL_BATCH_STATUS.PARTIALLY_QUEUED);
	});

	it("keeps COMPLETED stable and ignores empty totals", () => {
		expect(
			deriveBatchReadStatus(EMAIL_BATCH_STATUS.COMPLETED, allTerminal, 5),
		).toBe(EMAIL_BATCH_STATUS.COMPLETED);
		expect(
			deriveBatchReadStatus(
				EMAIL_BATCH_STATUS.QUEUED,
				{ queued: 0, processing: 0, sent: 0, failed: 0, cancelled: 0 },
				0,
			),
		).toBe(EMAIL_BATCH_STATUS.QUEUED);
	});

	it("does not report completion during the creation window (items < total)", () => {
		expect(
			deriveBatchReadStatus(
				EMAIL_BATCH_STATUS.QUEUED,
				{ queued: 0, processing: 0, sent: 2, failed: 0, cancelled: 0 },
				5,
			),
		).toBe(EMAIL_BATCH_STATUS.QUEUED);
	});

	it("demotes a stored 'queued' to partially_queued when queued items were never published", () => {
		// Creator crashed before confirming publications: the parent still
		// says 'queued' but some items were never handed to the queue.
		expect(
			deriveBatchReadStatus(EMAIL_BATCH_STATUS.QUEUED, inFlight, 5, 1),
		).toBe(EMAIL_BATCH_STATUS.PARTIALLY_QUEUED);
		expect(
			deriveBatchReadStatus(EMAIL_BATCH_STATUS.QUEUED, inFlight, 5, 0),
		).toBe(EMAIL_BATCH_STATUS.QUEUED);
	});

	it("keeps unconfirmed-publication demotion subordinate to sticky and terminal states", () => {
		// partially_queued is already honest.
		expect(
			deriveBatchReadStatus(
				EMAIL_BATCH_STATUS.PARTIALLY_QUEUED,
				inFlight,
				5,
				2,
			),
		).toBe(EMAIL_BATCH_STATUS.PARTIALLY_QUEUED);
		// CANCELLED records a user decision and always wins.
		expect(
			deriveBatchReadStatus(EMAIL_BATCH_STATUS.CANCELLED, inFlight, 5, 2),
		).toBe(EMAIL_BATCH_STATUS.CANCELLED);
		// All-terminal item rows win (unconfirmed queued cannot coexist).
		expect(
			deriveBatchReadStatus(EMAIL_BATCH_STATUS.QUEUED, allTerminal, 5, 2),
		).toBe(EMAIL_BATCH_STATUS.COMPLETED);
	});
});

describe("countStaleProcessingItems", () => {
	const nowMs = 1_700_000_000_000;
	const stale = new Date(nowMs - BULK_PROCESSING_STALE_MS - 60_000);
	const fresh = new Date(nowMs - 60_000);

	it("counts only processing items untouched beyond the stale horizon", () => {
		expect(
			countStaleProcessingItems(
				[
					{ status: BULK_EMAIL_ITEM_STATUS.PROCESSING, updatedAt: stale },
					{ status: BULK_EMAIL_ITEM_STATUS.PROCESSING, updatedAt: fresh },
					{ status: BULK_EMAIL_ITEM_STATUS.QUEUED, updatedAt: stale },
					{ status: BULK_EMAIL_ITEM_STATUS.SENT, updatedAt: stale },
					{ status: BULK_EMAIL_ITEM_STATUS.FAILED, updatedAt: stale },
					{ status: BULK_EMAIL_ITEM_STATUS.CANCELLED, updatedAt: stale },
				],
				nowMs,
			),
		).toBe(1);
	});

	it("is conservative at the boundary and for missing timestamps", () => {
		// Exactly at the horizon is not yet stale (must be strictly past).
		expect(
			countStaleProcessingItems(
				[
					{
						status: BULK_EMAIL_ITEM_STATUS.PROCESSING,
						updatedAt: new Date(nowMs - BULK_PROCESSING_STALE_MS),
					},
				],
				nowMs,
			),
		).toBe(0);
		// A missing updatedAt says nothing about staleness — never guessed.
		expect(
			countStaleProcessingItems(
				[{ status: BULK_EMAIL_ITEM_STATUS.PROCESSING, updatedAt: null }],
				nowMs,
			),
		).toBe(0);
		expect(countStaleProcessingItems([], nowMs)).toBe(0);
	});

	it("uses a horizon safely beyond the maximum serverless lifetime", () => {
		expect(BULK_PROCESSING_STALE_MS).toBe(45 * 60 * 1000);
	});
});

describe("recovery deduplication ids", () => {
	it("versions republish ids by 10-minute bucket so retries collapse but recovery is never swallowed", () => {
		// Align to a bucket boundary so the +9min case stays in-bucket.
		const base = Math.floor(1_700_000_000_000 / 600_000) * 600_000;
		expect(bulkRepublishDeduplicationId("email_1", base)).toBe(
			bulkRepublishDeduplicationId("email_1", base + 9 * 60 * 1000),
		);
		expect(bulkRepublishDeduplicationId("email_1", base)).not.toBe(
			bulkRepublishDeduplicationId("email_1", base + 11 * 60 * 1000),
		);
		// Never collides with the original publication id.
		expect(bulkRepublishDeduplicationId("email_1", base)).not.toBe(
			bulkDeduplicationId("email_1"),
		);
	});

	it("includes the retry time in hourly reschedule ids", () => {
		expect(bulkHourlyRetryDeduplicationId("email_1", 1_700_000_000)).toBe(
			"bulk_email_1_h1700000000",
		);
		expect(bulkHourlyRetryDeduplicationId("email_1", 1_700_000_000)).not.toBe(
			bulkHourlyRetryDeduplicationId("email_1", 1_700_003_600),
		);
		expect(bulkHourlyRetryDeduplicationId("email_1", 1_700_000_000)).not.toBe(
			bulkDeduplicationId("email_1"),
		);
	});
});

describe("computeHourlyLimitRetryAtSeconds", () => {
	it("schedules past the full rolling hour plus a buffer", () => {
		const nowMs = 1_700_000_000_000;
		const retryAt = computeHourlyLimitRetryAtSeconds(nowMs);
		const nowSeconds = nowMs / 1000;
		expect(retryAt).toBeGreaterThanOrEqual(nowSeconds + 3600);
		expect(retryAt).toBeLessThanOrEqual(nowSeconds + 2 * 3600);
	});
});

describe("isStaleUnpublishedCreation", () => {
	const nowMs = 1_700_000_000_000;
	const base = {
		batchStatus: EMAIL_BATCH_STATUS.QUEUED,
		batchTotal: 10,
		itemCount: 4,
		messageIdMap: {},
		nowMs,
	};

	it("treats an old partial creation with no publications as stale", () => {
		expect(
			isStaleUnpublishedCreation({
				...base,
				batchCreatedAt: new Date(nowMs - BULK_CREATION_STALE_MS - 1000),
			}),
		).toBe(true);
	});

	it("keeps fresh partial creations (still being inserted) alive", () => {
		expect(
			isStaleUnpublishedCreation({
				...base,
				batchCreatedAt: new Date(nowMs - 30_000),
			}),
		).toBe(false);
	});

	it("never treats a fully created batch as stale", () => {
		expect(
			isStaleUnpublishedCreation({
				...base,
				itemCount: 10,
				batchCreatedAt: new Date(nowMs - 10 * BULK_CREATION_STALE_MS),
			}),
		).toBe(false);
	});

	it("never cleans up once any publication was recorded", () => {
		expect(
			isStaleUnpublishedCreation({
				...base,
				messageIdMap: { email_1: "msg_1" },
				batchCreatedAt: new Date(nowMs - 10 * BULK_CREATION_STALE_MS),
			}),
		).toBe(false);
	});

	it("never cleans up cancelled batches", () => {
		expect(
			isStaleUnpublishedCreation({
				...base,
				batchStatus: EMAIL_BATCH_STATUS.CANCELLED,
				batchCreatedAt: new Date(nowMs - 10 * BULK_CREATION_STALE_MS),
			}),
		).toBe(false);
	});
});

describe("selectItemsNeedingPublication", () => {
	const nowMs = 1_700_000_000_000;
	const old = new Date(nowMs - BULK_PUBLICATION_ABANDONED_MS - 60_000);
	const recent = new Date(nowMs - 60_000);

	const queuedItem = (id: string, updatedAt: Date, batchIndex = 0) => ({
		id,
		batchIndex,
		status: BULK_EMAIL_ITEM_STATUS.QUEUED,
		updatedAt,
	});

	it("republishes never-confirmed items only on explicit replays", () => {
		const items = [queuedItem("email_1", recent)];

		const onReplay = selectItemsNeedingPublication({
			items,
			messageIdMap: {},
			batchScheduledAt: null,
			batchCreatedAt: new Date(nowMs - 5 * 60 * 1000),
			nowMs,
			includeMissing: true,
		});
		expect(onReplay).toHaveLength(1);
		expect(onReplay[0]).toMatchObject({ id: "email_1", reason: "missing" });
		expect(onReplay[0].deduplicationId).toBe(
			bulkRepublishDeduplicationId("email_1", nowMs),
		);

		// A status read must never start delivering never-confirmed items.
		const onStatusRead = selectItemsNeedingPublication({
			items,
			messageIdMap: {},
			batchScheduledAt: null,
			batchCreatedAt: new Date(nowMs - 5 * 60 * 1000),
			nowMs,
			includeMissing: false,
		});
		expect(onStatusRead).toHaveLength(0);
	});

	it("recovers abandoned confirmed publications on both replays and status reads", () => {
		const items = [queuedItem("email_1", old)];
		const messageIdMap = { email_1: "msg_1" };
		const batchCreatedAt = new Date(
			nowMs - BULK_PUBLICATION_ABANDONED_MS - 120_000,
		);

		for (const includeMissing of [true, false]) {
			const selected = selectItemsNeedingPublication({
				items,
				messageIdMap,
				batchScheduledAt: null,
				batchCreatedAt,
				nowMs,
				includeMissing,
			});
			expect(selected).toHaveLength(1);
			expect(selected[0].reason).toBe("abandoned");
		}
	});

	it("does not treat recently touched or recently due items as abandoned", () => {
		// Touched recently (worker requeue bumps updatedAt).
		expect(
			selectItemsNeedingPublication({
				items: [queuedItem("email_1", recent)],
				messageIdMap: { email_1: "msg_1" },
				batchScheduledAt: null,
				batchCreatedAt: new Date(nowMs - BULK_PUBLICATION_ABANDONED_MS * 2),
				nowMs,
				includeMissing: true,
			}),
		).toHaveLength(0);

		// Batch only just became due.
		expect(
			selectItemsNeedingPublication({
				items: [queuedItem("email_1", old)],
				messageIdMap: { email_1: "msg_1" },
				batchScheduledAt: new Date(nowMs - 60_000),
				batchCreatedAt: new Date(nowMs - BULK_PUBLICATION_ABANDONED_MS * 2),
				nowMs,
				includeMissing: true,
			}),
		).toHaveLength(0);
	});

	it("never treats future-scheduled batches as abandoned", () => {
		expect(
			selectItemsNeedingPublication({
				items: [queuedItem("email_1", old)],
				messageIdMap: { email_1: "msg_1" },
				batchScheduledAt: new Date(nowMs + 60 * 60 * 1000),
				batchCreatedAt: old,
				nowMs,
				includeMissing: true,
			}),
		).toHaveLength(0);
	});

	it("still republishes missing items of future-scheduled batches on replay", () => {
		const selected = selectItemsNeedingPublication({
			items: [queuedItem("email_1", recent)],
			messageIdMap: {},
			batchScheduledAt: new Date(nowMs + 60 * 60 * 1000),
			batchCreatedAt: recent,
			nowMs,
			includeMissing: true,
		});
		expect(selected).toHaveLength(1);
		expect(selected[0].reason).toBe("missing");
	});

	it("skips cancelled, processing, and terminal items entirely", () => {
		const items = [
			{
				id: "email_1",
				batchIndex: 0,
				status: BULK_EMAIL_ITEM_STATUS.CANCELLED,
				updatedAt: old,
			},
			{
				id: "email_2",
				batchIndex: 1,
				status: BULK_EMAIL_ITEM_STATUS.PROCESSING,
				updatedAt: old,
			},
			{
				id: "email_3",
				batchIndex: 2,
				status: BULK_EMAIL_ITEM_STATUS.SENT,
				updatedAt: old,
			},
			{
				id: "email_4",
				batchIndex: 3,
				status: BULK_EMAIL_ITEM_STATUS.FAILED,
				updatedAt: old,
			},
		];

		expect(
			selectItemsNeedingPublication({
				items,
				messageIdMap: {},
				batchScheduledAt: null,
				batchCreatedAt: old,
				nowMs,
				includeMissing: true,
			}),
		).toHaveLength(0);
	});
});

describe("unconfirmed queued accounting", () => {
	it("counts queued items lacking a confirmed publication", () => {
		const items = [
			{
				id: "a",
				batchIndex: 0,
				status: BULK_EMAIL_ITEM_STATUS.QUEUED,
				updatedAt: null,
			},
			{
				id: "b",
				batchIndex: 1,
				status: BULK_EMAIL_ITEM_STATUS.QUEUED,
				updatedAt: null,
			},
			{
				id: "c",
				batchIndex: 2,
				status: BULK_EMAIL_ITEM_STATUS.SENT,
				updatedAt: null,
			},
		];

		expect(countUnconfirmedQueuedItems(items, { a: "msg_a" })).toBe(1);
		expect(countUnconfirmedQueuedItems(items, {})).toBe(2);
		expect(countUnconfirmedQueuedItems(items, { a: "m", b: "m" })).toBe(0);
	});

	it("merges message id maps with newer ids winning", () => {
		expect(
			mergeQstashMessageIdMaps({ a: "old", b: "kept" }, { a: "new", c: "add" }),
		).toEqual({ a: "new", b: "kept", c: "add" });
	});
});

describe("limits", () => {
	it("caps bulk requests at 100 emails", () => {
		expect(MAX_BULK_EMAILS).toBe(100);
	});

	it("caps stored attachment payload at 40 MiB per batch", () => {
		expect(MAX_BULK_STORED_ATTACHMENT_BYTES).toBe(40 * 1024 * 1024);
	});
});
