import { t } from "elysia";

export const BatchStatusSchema = t.Union([
	t.Literal("creating"),
	t.Literal("queued"),
	t.Literal("partially_queued"),
	t.Literal("processing"),
	t.Literal("completed"),
	t.Literal("partially_failed"),
	t.Literal("failed"),
	t.Literal("cancelled"),
	t.Literal("requires_attention"),
]);

export const ItemStatusSchema = t.Union([
	t.Literal("pending"),
	t.Literal("processing"),
	t.Literal("sent"),
	t.Literal("failed"),
	t.Literal("cancelled"),
	t.Literal("provider_unknown"),
]);

export const NonNegativeInteger = t.Integer({ minimum: 0 });

export const AttachmentSchema = t.Object({
	filename: t.String({ maxLength: 255 }),
	content: t.String({
		description: "Base64 encoded content (required for batch)",
	}),
	content_type: t.Optional(t.String({ maxLength: 127 })),
	content_id: t.Optional(t.String({ maxLength: 128 })),
});

export const TagSchema = t.Object({
	name: t.String({ maxLength: 64 }),
	value: t.String({ maxLength: 256 }),
});

export const BatchEmailItemSchema = t.Object({
	from: t.String({ maxLength: 500, description: "Sender email address" }),
	to: t.Union(
		[
			t.String({ maxLength: 500 }),
			t.Array(t.String({ maxLength: 500 }), { maxItems: 50 }),
		],
		{
			description: "Recipient email address(es), max 50",
		},
	),
	subject: t.String({ maxLength: 998, description: "Email subject" }),
	html: t.Optional(t.String({ description: "HTML content of the email" })),
	text: t.Optional(
		t.String({ description: "Plain text content of the email" }),
	),
	cc: t.Optional(
		t.Union([
			t.String({ maxLength: 500 }),
			t.Array(t.String({ maxLength: 500 }), { maxItems: 50 }),
		]),
	),
	bcc: t.Optional(
		t.Union([
			t.String({ maxLength: 500 }),
			t.Array(t.String({ maxLength: 500 }), { maxItems: 50 }),
		]),
	),
	reply_to: t.Optional(
		t.Union([
			t.String({ maxLength: 500 }),
			t.Array(t.String({ maxLength: 500 }), { maxItems: 10 }),
		]),
	),
	headers: t.Optional(
		t.Record(t.String({ maxLength: 126 }), t.String({ maxLength: 998 }), {
			description: "Custom email headers, max 50",
		}),
	),
	attachments: t.Optional(t.Array(AttachmentSchema, { maxItems: 100 })),
	tags: t.Optional(t.Array(TagSchema, { maxItems: 20 })),
});

export const BatchCreateBodySchema = t.Object({
	emails: t.Array(BatchEmailItemSchema, {
		minItems: 1,
		maxItems: 100,
		description: "Array of 1-100 emails to send",
	}),
});

export const IdempotencyKeyHeadersSchema = t.Object(
	{
		"idempotency-key": t.Optional(
			t.String({ maxLength: 256, description: "Optional idempotency key" }),
		),
	},
	{ additionalProperties: true },
);

export const BatchItemSummarySchema = t.Object({
	id: t.String(),
	batch_index: NonNegativeInteger,
	status: ItemStatusSchema,
	message_id: t.Optional(t.Nullable(t.String())),
	failure_reason: t.Optional(t.Nullable(t.String())),
	created_at: t.String(),
	sent_at: t.Optional(t.Nullable(t.String())),
});

export const BatchCountsSchema = t.Object({
	total: NonNegativeInteger,
	pending: NonNegativeInteger,
	processing: NonNegativeInteger,
	sent: NonNegativeInteger,
	failed: NonNegativeInteger,
	cancelled: NonNegativeInteger,
	provider_unknown: NonNegativeInteger,
});

export const BatchResponseSchema = t.Object({
	id: t.String(),
	status: BatchStatusSchema,
	counts: BatchCountsSchema,
	created_at: t.String(),
	updated_at: t.Optional(t.String()),
});

export const BatchDetailResponseSchema = t.Object({
	id: t.String(),
	status: BatchStatusSchema,
	counts: BatchCountsSchema,
	items: t.Array(BatchItemSummarySchema),
	created_at: t.String(),
	updated_at: t.Optional(t.String()),
});

export const BatchCancelResponseSchema = t.Object({
	id: t.String(),
	status: BatchStatusSchema,
	cancelled_count: NonNegativeInteger,
	counts: BatchCountsSchema,
});

export const BatchErrorResponseSchema = t.Object({
	error: t.String(),
	details: t.Optional(t.String()),
});

export type BatchEmailItem = typeof BatchEmailItemSchema.static;
export type BatchItemSummary = typeof BatchItemSummarySchema.static;
export type BatchCounts = typeof BatchCountsSchema.static;
