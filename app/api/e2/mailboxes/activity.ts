import { and, count, desc, eq, gte, inArray, lte, type SQL } from "drizzle-orm";
import { Elysia, t } from "elysia";
import {
	enforceMailboxGatewayAuthorization,
	validateAndRateLimit,
} from "@/app/api/e2/lib/auth";
import {
	authorizeMailboxAccess,
	isMailboxPassword,
} from "@/app/api/e2/mailboxes/access";
import {
	FAILURE_DEDUPE_WINDOW_MS,
	MAILBOX_ACTIVITY_EVENTS,
	type MailboxActivityInput,
	normalizeActivityIp,
	recordMailboxActivity,
} from "@/app/api/e2/mailboxes/activity-log";
import { fail } from "@/app/api/e2/mailboxes/folders";
import { getOwnedCredential } from "@/app/api/e2/mailboxes/shared";
import { ErrorSchema } from "@/app/api/e2/mailboxes/state";
import { db } from "@/lib/db";
import { imapCredentials, mailboxActivity } from "@/lib/db/schema";

type ElysiaSet = { status?: number | string; headers?: unknown };

const EventSchema = t.Union(
	[
		t.Literal("login_succeeded"),
		t.Literal("login_failed"),
		t.Literal("login_refused"),
		t.Literal("session_ended"),
		t.Literal("command_error"),
		t.Literal("quota_exceeded"),
		t.Literal("send_failed"),
		t.Literal("send_rate_limited"),
		t.Literal("events_dropped"),
	],
	{ description: "Activity event type" },
);

const ProtocolSchema = t.Union(
	[t.Literal("imap"), t.Literal("smtp"), t.Literal("api")],
	{ description: "How the mailbox was used" },
);

const DetailSchema = t.Nullable(
	t.Record(t.String(), t.Union([t.String(), t.Number(), t.Boolean()]), {
		description:
			"Small event-specific details, e.g. `status`, `message`, `durationMs`, `commands`, `sentEmailId`, `limit`",
	}),
);

const ActivitySchema = t.Object({
	id: t.String(),
	mailboxId: t.String(),
	occurredAt: t.String({ format: "date-time" }),
	lastOccurredAt: t.String({
		format: "date-time",
		description: "When the last repeat counted in `count` happened",
	}),
	protocol: ProtocolSchema,
	event: EventSchema,
	reason: t.Nullable(t.String()),
	clientIp: t.Nullable(t.String()),
	client: t.Nullable(t.String({ description: "IMAP ID or user agent" })),
	count: t.Integer({ description: "How many times this event repeated" }),
	detail: DetailSchema,
});

const ActivityListResponse = t.Object({
	data: t.Array(ActivitySchema),
	pagination: t.Object({
		limit: t.Number(),
		offset: t.Number(),
		total: t.Number(),
		hasMore: t.Boolean(),
	}),
});

const ActivityFilterFields = {
	event: t.Optional(EventSchema),
	protocol: t.Optional(ProtocolSchema),
	since: t.Optional(
		t.String({ description: "Only events at or after this ISO 8601 time" }),
	),
	until: t.Optional(
		t.String({ description: "Only events at or before this ISO 8601 time" }),
	),
	ip: t.Optional(
		t.String({ maxLength: 64, description: "Only events from this client IP" }),
	),
	limit: t.Optional(t.Integer({ minimum: 1, maximum: 100, default: 50 })),
	offset: t.Optional(t.Integer({ minimum: 0, default: 0 })),
};

interface ActivityFilters {
	event?: string;
	protocol?: string;
	since?: string;
	until?: string;
	ip?: string;
	limit?: number;
	offset?: number;
}

const listResponses = {
	200: ActivityListResponse,
	400: ErrorSchema,
	401: ErrorSchema,
	403: ErrorSchema,
	404: ErrorSchema,
	429: ErrorSchema,
	500: ErrorSchema,
};

function parseTime(value: string | undefined): Date | null | "invalid" {
	if (value === undefined) return null;
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? "invalid" : date;
}

async function listActivity(
	set: ElysiaSet,
	userId: string,
	credentialId: string | undefined,
	query: ActivityFilters,
) {
	const conditions: SQL[] = [eq(mailboxActivity.userId, userId)];
	if (credentialId) {
		conditions.push(eq(mailboxActivity.credentialId, credentialId));
	}
	if (query.event) conditions.push(eq(mailboxActivity.event, query.event));
	if (query.protocol) {
		conditions.push(eq(mailboxActivity.protocol, query.protocol));
	}
	const since = parseTime(query.since);
	const until = parseTime(query.until);
	if (since === "invalid" || until === "invalid") {
		return fail(set, 400, "since and until must be ISO 8601 times");
	}
	if (since) conditions.push(gte(mailboxActivity.occurredAt, since));
	if (until) conditions.push(lte(mailboxActivity.occurredAt, until));
	if (query.ip !== undefined) {
		const ip = normalizeActivityIp(query.ip);
		if (!ip) return fail(set, 400, "ip must be an IPv4 or IPv6 address");
		conditions.push(eq(mailboxActivity.clientIp, ip));
	}

	const limit = Math.min(query.limit ?? 50, 100);
	const offset = query.offset ?? 0;
	const where = and(...conditions);
	const [rows, [totalResult]] = await Promise.all([
		db
			.select()
			.from(mailboxActivity)
			.where(where)
			.orderBy(desc(mailboxActivity.occurredAt), desc(mailboxActivity.id))
			.limit(limit)
			.offset(offset),
		db.select({ value: count() }).from(mailboxActivity).where(where),
	]);
	const total = totalResult?.value ?? 0;
	return {
		data: rows.map((row) => ({
			id: row.id,
			mailboxId: row.credentialId,
			occurredAt: row.occurredAt.toISOString(),
			lastOccurredAt: row.lastOccurredAt.toISOString(),
			protocol: row.protocol as "imap" | "smtp" | "api",
			event: row.event as (typeof MAILBOX_ACTIVITY_EVENTS)[number],
			reason: row.reason,
			clientIp: row.clientIp,
			client: row.client,
			count: row.count,
			detail: row.detail ?? null,
		})),
		pagination: {
			limit,
			offset,
			total,
			hasMore: offset + rows.length < total,
		},
	};
}

function bearerToken(request: Request): string | null {
	const authorization = request.headers.get("authorization");
	return authorization?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || null;
}

export const listAllMailboxActivity = new Elysia().get(
	"/mailboxes/activity",
	async ({ request, query, set }) => {
		if (isMailboxPassword(bearerToken(request))) {
			return fail(
				set,
				403,
				"Use the account API key to read activity for all mailboxes",
			);
		}
		const userId = await validateAndRateLimit(request, set);
		if (query.mailboxId) {
			const owned = await getOwnedCredential(userId, query.mailboxId);
			if (!owned) return fail(set, 404, "Mailbox not found");
		}
		return listActivity(set, userId, query.mailboxId, query);
	},
	{
		query: t.Object({
			...ActivityFilterFields,
			mailboxId: t.Optional(
				t.String({ maxLength: 255, description: "Only this mailbox's events" }),
			),
		}),
		response: listResponses,
		detail: {
			tags: ["Mailboxes"],
			summary: "List activity for all mailboxes",
			description:
				"Sign-ins, refused sign-ins, IMAP sessions, command errors and send failures for every mailbox in the account, newest first. Kept for 30 days. Account API key only.",
		},
	},
);

export const listMailboxActivity = new Elysia().get(
	"/mailboxes/:id/activity",
	async ({ request, params, query, set }) => {
		if (isMailboxPassword(bearerToken(request))) {
			const result = await authorizeMailboxAccess(request, set, params.id);
			if (!result.ok) return fail(set, result.status, result.error);
			if (!result.access.credential.selfService.activity) {
				return fail(set, 403, "This mailbox can't read its own activity");
			}
			return listActivity(
				set,
				result.access.userId,
				result.access.credential.credentialId,
				query,
			);
		}
		const userId = await validateAndRateLimit(request, set);
		if (params.id === "me") {
			return fail(
				set,
				400,
				"Use a mailbox ID, or authenticate with the mailbox password to use 'me'",
			);
		}
		const owned = await getOwnedCredential(userId, params.id);
		if (!owned) return fail(set, 404, "Mailbox not found");
		return listActivity(set, userId, owned.id, query);
	},
	{
		params: t.Object({ id: t.String() }),
		query: t.Object(ActivityFilterFields),
		response: listResponses,
		detail: {
			tags: ["Mailboxes"],
			summary: "List mailbox activity",
			description:
				"Sign-ins, refused sign-ins, IMAP sessions, command errors and send failures for one mailbox, newest first. Kept for 30 days. The mailbox's own password may read it only when the account turned on `selfService.activity`.",
		},
	},
);

const IngestEvent = t.Object(
	{
		credentialId: t.String({ minLength: 1, maxLength: 255 }),
		userId: t.Optional(t.String({ minLength: 1, maxLength: 255 })),
		protocol: t.Union([t.Literal("imap"), t.Literal("smtp")]),
		event: t.Union([
			t.Literal("session_ended"),
			t.Literal("command_error"),
			t.Literal("quota_exceeded"),
			t.Literal("send_failed"),
		]),
		reason: t.Optional(t.String({ maxLength: 64 })),
		clientIp: t.Optional(t.String({ maxLength: 64 })),
		client: t.Optional(t.String({ maxLength: 200 })),
		session: t.Optional(t.String({ maxLength: 64 })),
		count: t.Optional(t.Integer({ minimum: 1, maximum: 100_000 })),
		occurredAt: t.Optional(t.String({ maxLength: 64 })),
		detail: t.Optional(
			t.Record(
				t.String({ maxLength: 32 }),
				t.Union([t.String({ maxLength: 200 }), t.Number(), t.Boolean()]),
				{ maxProperties: 16 },
			),
		),
	},
	{ additionalProperties: false },
);

const MAX_INGEST_AGE_MS = 60 * 60_000;
const MAX_INGEST_SKEW_MS = 5 * 60_000;

function ingestTime(value: string | undefined, now: number): Date | undefined {
	if (!value) return undefined;
	const time = new Date(value).getTime();
	if (
		Number.isNaN(time) ||
		time < now - MAX_INGEST_AGE_MS ||
		time > now + MAX_INGEST_SKEW_MS
	) {
		return undefined;
	}
	return new Date(time);
}

export const ingestMailboxActivity = new Elysia().post(
	"/mailboxes/activity/ingest",
	async ({ request, body, set }) => {
		enforceMailboxGatewayAuthorization(request, set);
		const ids = [...new Set(body.events.map((event) => event.credentialId))];
		const owners = new Map(
			(ids.length
				? await db
						.select({ id: imapCredentials.id, userId: imapCredentials.userId })
						.from(imapCredentials)
						.where(inArray(imapCredentials.id, ids))
				: []
			).map((row) => [row.id, row.userId]),
		);
		const now = Date.now();
		const accepted: MailboxActivityInput[] = [];
		let rejected = 0;
		for (const event of body.events) {
			const userId = owners.get(event.credentialId);
			if (!userId || (event.userId && event.userId !== userId)) {
				rejected++;
				continue;
			}
			const session = event.session?.replace(/[^A-Za-z0-9_-]/g, "") || null;
			const detail: Record<string, unknown> = { ...event.detail };
			if (session) detail.session = session;
			accepted.push({
				userId,
				credentialId: event.credentialId,
				protocol: event.protocol,
				event: event.event,
				reason: event.reason,
				clientIp: event.clientIp,
				client: event.client,
				count: event.count,
				detail,
				occurredAt: ingestTime(event.occurredAt, now),
				...((event.event === "command_error" ||
					event.event === "quota_exceeded") &&
				session
					? {
							dedupe: {
								key: `${event.event}:${session}:${event.reason ?? "-"}`,
								windowMs: FAILURE_DEDUPE_WINDOW_MS,
							},
						}
					: {}),
			});
		}
		await recordMailboxActivity(accepted);
		return { accepted: accepted.length, rejected };
	},
	{
		body: t.Object({
			events: t.Array(IngestEvent, { minItems: 1, maxItems: 500 }),
		}),
		response: {
			200: t.Object({ accepted: t.Integer(), rejected: t.Integer() }),
			400: ErrorSchema,
			403: ErrorSchema,
			422: ErrorSchema,
			500: ErrorSchema,
		},
		detail: {
			tags: ["Mailboxes"],
			summary: "Ingest gateway mailbox activity",
			description:
				"Internal: the IMAP and SMTP gateways report session and send events here with the gateway secret.",
			hide: true,
		},
	},
);
