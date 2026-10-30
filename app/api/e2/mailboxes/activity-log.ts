import { isIP } from "node:net";
import { waitUntil } from "@vercel/functions";
import { and, count, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/lib/db";
import {
	emailDomains,
	imapCredentials,
	mailboxActivity,
} from "@/lib/db/schema";

export const MAILBOX_ACTIVITY_PROTOCOLS = ["imap", "smtp", "api"] as const;
export type MailboxActivityProtocol =
	(typeof MAILBOX_ACTIVITY_PROTOCOLS)[number];

export const MAILBOX_ACTIVITY_EVENTS = [
	"login_succeeded",
	"login_failed",
	"login_refused",
	"session_ended",
	"command_error",
	"quota_exceeded",
	"send_failed",
	"send_rate_limited",
	"events_dropped",
] as const;
export type MailboxActivityEvent = (typeof MAILBOX_ACTIVITY_EVENTS)[number];

export type MailboxLoginRefusal =
	| "ip_not_allowed"
	| "protocol_disabled"
	| "disabled"
	| "domain_unverified"
	| "banned"
	| "rate_limited";

export const MAILBOX_ACTIVITY_RETENTION_DAYS = 30;
export const MAILBOX_ACTIVITY_HOURLY_CAP = 600;
export const LOGIN_DEDUPE_WINDOW_MS = 10 * 60_000;
export const FAILURE_DEDUPE_WINDOW_MS = 60_000;
const HOUR_MS = 60 * 60_000;
const MAX_DETAIL_BYTES = 1024;
const MAX_DETAIL_STRING = 100;
const MAX_CLIENT_LENGTH = 100;
const MAX_REASON_LENGTH = 64;

const DETAIL_KEYS = new Set([
	"status",
	"code",
	"message",
	"durationMs",
	"commands",
	"sentEmailId",
	"limit",
	"session",
]);

export type MailboxActivityDetail = Record<string, string | number | boolean>;

export interface MailboxActivityInput {
	userId: string;
	credentialId: string;
	protocol: MailboxActivityProtocol;
	event: MailboxActivityEvent;
	reason?: string | null;
	clientIp?: string | null;
	client?: string | null;
	count?: number;
	detail?: Record<string, unknown> | null;
	occurredAt?: Date;
	/**
	 * Repeats with the same key inside one window of `windowMs` add to the
	 * existing row's count instead of inserting a row. With `ignoreRepeats`
	 * they are dropped instead (count stays 1).
	 */
	dedupe?: { key: string; windowMs: number; ignoreRepeats?: boolean };
}

const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g;
const EMAIL_LIKE = /[^\s@<>"',;:()[\]]+@[^\s@<>"',;:()[\]]+/g;

/** Strips control characters and anything shaped like an email address. */
export function sanitizeActivityText(
	value: string,
	maxLength: number,
): string | null {
	const clean = value
		.replace(CONTROL_CHARACTERS, " ")
		.replace(EMAIL_LIKE, "[address]")
		.replace(/\s+/g, " ")
		.trim()
		.slice(0, maxLength);
	return clean || null;
}

export function normalizeActivityIp(value: string | null | undefined) {
	const ip = value
		?.trim()
		.toLowerCase()
		.replace(/^::ffff:(?=\d+\.\d+\.\d+\.\d+$)/, "");
	return ip && isIP(ip) ? ip : null;
}

export function sanitizeActivityDetail(
	detail: Record<string, unknown> | null | undefined,
): MailboxActivityDetail | null {
	if (!detail) return null;
	const result: MailboxActivityDetail = {};
	for (const [key, value] of Object.entries(detail)) {
		if (!DETAIL_KEYS.has(key)) continue;
		if (typeof value === "number" && Number.isFinite(value)) {
			result[key] = value;
		} else if (typeof value === "boolean") {
			result[key] = value;
		} else if (typeof value === "string") {
			const text = sanitizeActivityText(value, MAX_DETAIL_STRING);
			if (text) result[key] = text;
		}
	}
	if (Object.keys(result).length === 0) return null;
	return Buffer.byteLength(JSON.stringify(result)) <= MAX_DETAIL_BYTES
		? result
		: null;
}

/**
 * Short product token of an HTTP user agent (`curl/8.4.0`, `node`), so the
 * log shows which client called without storing the full fingerprint.
 */
export function userAgentProduct(value: string | null): string | null {
	const product = value?.trim().split(/\s+/)[0];
	return product ? sanitizeActivityText(product, MAX_CLIENT_LENGTH) : null;
}

function windowBucket(now: number, windowMs: number): number {
	return Math.floor(now / windowMs);
}

function toRow(input: MailboxActivityInput, now: Date) {
	const reason = input.reason
		? sanitizeActivityText(input.reason, MAX_REASON_LENGTH)
		: null;
	return {
		id: nanoid(),
		userId: input.userId,
		credentialId: input.credentialId,
		occurredAt: input.occurredAt ?? now,
		lastOccurredAt: input.occurredAt ?? now,
		protocol: input.protocol,
		event: input.event,
		reason,
		clientIp: normalizeActivityIp(input.clientIp),
		client: input.client
			? sanitizeActivityText(input.client, MAX_CLIENT_LENGTH)
			: null,
		count: Math.max(1, Math.min(Math.floor(input.count ?? 1), 1_000_000)),
		detail: sanitizeActivityDetail(input.detail),
		dedupeKey: input.dedupe
			? `${input.dedupe.key}:${windowBucket(now.getTime(), input.dedupe.windowMs)}`.slice(
					0,
					255,
				)
			: null,
	};
}

async function bumpExisting(row: ReturnType<typeof toRow>): Promise<boolean> {
	if (!row.dedupeKey) return false;
	const updated = await db
		.update(mailboxActivity)
		.set({
			count: sql`${mailboxActivity.count} + ${row.count}`,
			lastOccurredAt: row.lastOccurredAt,
		})
		.where(
			and(
				eq(mailboxActivity.credentialId, row.credentialId),
				eq(mailboxActivity.userId, row.userId),
				eq(mailboxActivity.dedupeKey, row.dedupeKey),
			),
		)
		.returning({ id: mailboxActivity.id });
	return updated.length > 0;
}

async function insertRow(
	row: ReturnType<typeof toRow>,
	ignoreRepeats: boolean,
): Promise<void> {
	const insert = db.insert(mailboxActivity).values(row);
	if (!row.dedupeKey) {
		await insert;
		return;
	}
	if (ignoreRepeats) {
		await insert.onConflictDoNothing({
			target: [mailboxActivity.credentialId, mailboxActivity.dedupeKey],
		});
		return;
	}
	await insert.onConflictDoUpdate({
		target: [mailboxActivity.credentialId, mailboxActivity.dedupeKey],
		set: {
			count: sql`${mailboxActivity.count} + excluded.count`,
			lastOccurredAt: sql`excluded.last_occurred_at`,
		},
	});
}

async function recentRowCount(
	userId: string,
	credentialId: string,
	now: Date,
): Promise<number> {
	const [result] = await db
		.select({ value: count() })
		.from(mailboxActivity)
		.where(
			and(
				eq(mailboxActivity.userId, userId),
				eq(mailboxActivity.credentialId, credentialId),
				gte(mailboxActivity.occurredAt, new Date(now.getTime() - HOUR_MS)),
			),
		);
	return result?.value ?? 0;
}

async function recordForCredential(
	inputs: MailboxActivityInput[],
	now: Date,
): Promise<void> {
	const { userId, credentialId } = inputs[0];
	let budget: number | null = null;
	let dropped = 0;
	for (const input of inputs) {
		const row = toRow(input, now);
		const ignoreRepeats = input.dedupe?.ignoreRepeats === true;
		if (row.dedupeKey && !ignoreRepeats && (await bumpExisting(row))) continue;
		budget ??=
			MAILBOX_ACTIVITY_HOURLY_CAP -
			(await recentRowCount(userId, credentialId, now));
		if (budget <= 0) {
			dropped += row.count;
			continue;
		}
		budget--;
		await insertRow(row, ignoreRepeats);
	}
	if (dropped > 0) {
		await insertRow(
			toRow(
				{
					userId,
					credentialId,
					protocol: inputs[0].protocol,
					event: "events_dropped",
					reason: "hourly_cap",
					count: dropped,
					dedupe: { key: "events_dropped", windowMs: HOUR_MS },
				},
				now,
			),
			false,
		);
	}
}

/**
 * Writes mailbox activity rows. Never throws: activity logging must not
 * change the outcome of the sign-in, command or send it describes. Rows past
 * the per-credential hourly cap are folded into one `events_dropped` row.
 */
export async function recordMailboxActivity(
	inputs: MailboxActivityInput | MailboxActivityInput[],
): Promise<void> {
	const list = Array.isArray(inputs) ? inputs : [inputs];
	if (list.length === 0) return;
	const now = new Date();
	const byCredential = new Map<string, MailboxActivityInput[]>();
	for (const input of list) {
		const key = `${input.userId}\0${input.credentialId}`;
		const group = byCredential.get(key) ?? [];
		group.push(input);
		byCredential.set(key, group);
	}
	await Promise.all(
		[...byCredential.values()].map((group) =>
			recordForCredential(group, now).catch((error: unknown) => {
				console.error(
					"Failed to record mailbox activity:",
					error instanceof Error ? error.message : error,
				);
			}),
		),
	);
}

/**
 * Runs activity recording after the current request without delaying it:
 * the caller's response never waits on (or learns anything from) the
 * lookups and writes, and errors are logged, never surfaced.
 */
export function deferActivity(work: () => Promise<void>): void {
	waitUntil(
		new Promise<void>((resolve) => setImmediate(resolve))
			.then(work)
			.catch((error: unknown) => {
				console.error(
					"Failed to record mailbox activity:",
					error instanceof Error ? error.message : error,
				);
			}),
	);
}

const recentApiLogins = new Map<string, number>();
const MAX_RECENT_API_LOGINS = 10_000;

export interface MailboxLoginContext {
	protocol: MailboxActivityProtocol;
	clientIp: string | null;
	client?: string | null;
}

/**
 * Records a successful sign-in, once per credential, protocol and client IP
 * per 10 minutes. IMAP and SMTP repeats add to the count; HTTP API requests
 * (every request signs in) are recorded once per window and skipped in
 * memory afterwards so normal API traffic does not write on every request.
 */
export async function recordLoginSucceeded(
	credential: { userId: string; credentialId: string },
	context: MailboxLoginContext,
): Promise<void> {
	const ip = normalizeActivityIp(context.clientIp);
	const key = `login_succeeded:${context.protocol}:${ip ?? "-"}`;
	const ignoreRepeats = context.protocol === "api";
	if (ignoreRepeats) {
		const memoryKey = `${credential.credentialId}:${key}`;
		const bucket = windowBucket(Date.now(), LOGIN_DEDUPE_WINDOW_MS);
		if (recentApiLogins.get(memoryKey) === bucket) return;
		if (recentApiLogins.size >= MAX_RECENT_API_LOGINS) recentApiLogins.clear();
		recentApiLogins.set(memoryKey, bucket);
	}
	await recordMailboxActivity({
		...credential,
		protocol: context.protocol,
		event: "login_succeeded",
		clientIp: ip,
		client: context.client,
		dedupe: { key, windowMs: LOGIN_DEDUPE_WINDOW_MS, ignoreRepeats },
	});
}

export async function recordLoginRefused(
	credential: { userId: string; credentialId: string },
	reason: MailboxLoginRefusal,
	context: MailboxLoginContext,
): Promise<void> {
	const ip = normalizeActivityIp(context.clientIp);
	await recordMailboxActivity({
		...credential,
		protocol: context.protocol,
		event: "login_refused",
		reason,
		clientIp: ip,
		client: context.client,
		dedupe: {
			key: `login_refused:${reason}:${context.protocol}:${ip ?? "-"}`,
			windowMs: FAILURE_DEDUPE_WINDOW_MS,
		},
	});
}

/**
 * Credentials whose login is `loginAddress` on a domain their owner has
 * verified. A sign-in to an address no mailbox uses belongs to nobody and is
 * not recorded.
 */
export async function findCredentialsByLoginAddress(
	loginAddress: string,
): Promise<Array<{ userId: string; credentialId: string }>> {
	const domain = loginAddress.slice(loginAddress.lastIndexOf("@") + 1);
	return db
		.select({
			userId: imapCredentials.userId,
			credentialId: imapCredentials.id,
		})
		.from(imapCredentials)
		.innerJoin(
			emailDomains,
			and(
				eq(emailDomains.userId, imapCredentials.userId),
				eq(emailDomains.domain, domain),
				eq(emailDomains.status, "verified"),
			),
		)
		.where(eq(imapCredentials.loginAddress, loginAddress))
		.limit(5);
}

/** Records a wrong password for every mailbox that uses `loginAddress`. */
export async function recordLoginFailed(
	loginAddress: string,
	context: MailboxLoginContext,
): Promise<void> {
	try {
		const credentials = await findCredentialsByLoginAddress(loginAddress);
		const ip = normalizeActivityIp(context.clientIp);
		await recordMailboxActivity(
			credentials.map((credential) => ({
				...credential,
				protocol: context.protocol,
				event: "login_failed" as const,
				reason: "invalid_password",
				clientIp: ip,
				client: context.client,
				dedupe: {
					key: `login_failed:${context.protocol}:${ip ?? "-"}`,
					windowMs: FAILURE_DEDUPE_WINDOW_MS,
				},
			})),
		);
	} catch (error) {
		console.error(
			"Failed to record mailbox activity:",
			error instanceof Error ? error.message : error,
		);
	}
}

/** Records a sign-in refused by the rate limit for every mailbox using `loginAddress`. */
export async function recordLoginRateLimited(
	loginAddress: string,
	context: MailboxLoginContext,
): Promise<void> {
	try {
		const credentials = await findCredentialsByLoginAddress(loginAddress);
		await Promise.all(
			credentials.map((credential) =>
				recordLoginRefused(credential, "rate_limited", context),
			),
		);
	} catch (error) {
		console.error(
			"Failed to record mailbox activity:",
			error instanceof Error ? error.message : error,
		);
	}
}

export interface ActivityCredential {
	userId: string;
	credentialId: string;
	use?: {
		protocol: MailboxActivityProtocol;
		clientIp: string | null;
		client?: string | null;
	};
}

function sendFailureReason(status: number): string {
	if (status === 429) return "rate_limited";
	if (status === 401 || status === 403) return "not_allowed";
	if (status === 409) return "conflict";
	if (status >= 400 && status < 500) return "rejected";
	return "upstream_error";
}

/**
 * Records a send by a mailbox password that was refused or failed. Sends
 * with the account's API key are not mailbox activity and are skipped.
 */
export async function recordSendFailure(
	credential: ActivityCredential | null | undefined,
	failure: {
		status: number;
		message?: string | null;
		sentEmailId?: string | null;
		dailyLimit?: number | null;
	},
): Promise<void> {
	if (!credential?.use) return;
	const dailyLimited = failure.dailyLimit !== undefined;
	await recordMailboxActivity({
		userId: credential.userId,
		credentialId: credential.credentialId,
		protocol: credential.use.protocol,
		event: dailyLimited ? "send_rate_limited" : "send_failed",
		reason: dailyLimited ? "daily_limit" : sendFailureReason(failure.status),
		clientIp: credential.use.clientIp,
		client: credential.use.client,
		detail: {
			status: failure.status,
			...(failure.message ? { message: failure.message } : {}),
			...(failure.sentEmailId ? { sentEmailId: failure.sentEmailId } : {}),
			...(failure.dailyLimit != null ? { limit: failure.dailyLimit } : {}),
		},
		...(dailyLimited
			? {
					dedupe: {
						key: `send_rate_limited:${credential.use.protocol}`,
						windowMs: HOUR_MS,
					},
				}
			: {}),
	});
}

/** Deletes rows past the retention period in bounded batches. */
export async function purgeMailboxActivity(
	options: { batchSize?: number; maxBatches?: number; now?: Date } = {},
): Promise<number> {
	const batchSize = options.batchSize ?? 1000;
	const maxBatches = options.maxBatches ?? 5;
	const cutoff = new Date(
		(options.now ?? new Date()).getTime() -
			MAILBOX_ACTIVITY_RETENTION_DAYS * 24 * HOUR_MS,
	);
	let deleted = 0;
	for (let batch = 0; batch < maxBatches; batch++) {
		const rows = await db
			.delete(mailboxActivity)
			.where(
				inArray(
					mailboxActivity.id,
					db
						.select({ id: mailboxActivity.id })
						.from(mailboxActivity)
						.where(lt(mailboxActivity.occurredAt, cutoff))
						.limit(batchSize),
				),
			)
			.returning({ id: mailboxActivity.id });
		deleted += rows.length;
		if (rows.length < batchSize) break;
	}
	return deleted;
}
