import { and, eq, sql } from "drizzle-orm";
import { Elysia, t } from "elysia";
import type { MailboxAccess } from "@/app/api/e2/mailboxes/access";
import { authorizeMailboxControl } from "@/app/api/e2/mailboxes/controls";
import { fail } from "@/app/api/e2/mailboxes/folders";
import { normalizeEmailAddress } from "@/app/api/e2/mailboxes/shared";
import { ErrorSchema } from "@/app/api/e2/mailboxes/state";
import {
	SpamFilterLevelSchema,
	spamFilterSettingsFor,
} from "@/app/api/e2/spam-filter/shared";
import { db } from "@/lib/db";
import { imapCredentials } from "@/lib/db/schema";
import type { SpamFilterLevel } from "@/lib/guard/junk-verdict";

export const MAX_SPAM_LIST_ENTRIES = 1000;

const DOMAIN =
	/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*$/;

const PatternSchema = t.String({
	minLength: 2,
	maxLength: 255,
	description:
		"An exact sender address (`alice@example.com`) or a whole domain (`@example.com`). Case-insensitive.",
});

const PatternListSchema = t.Array(PatternSchema, {
	maxItems: MAX_SPAM_LIST_ENTRIES,
});

const MailboxSpamSchema = t.Object({
	level: t.Nullable(SpamFilterLevelSchema, {
		description:
			"The mailbox's junk filter level; null uses the account's level",
	}),
	effectiveLevel: SpamFilterLevelSchema,
	allow: t.Array(t.String(), {
		description: "Senders never marked as junk by the junk filter",
	}),
	block: t.Array(t.String(), {
		description: "Senders always marked as junk",
	}),
});

const MailboxParams = t.Object({ id: t.String() });

const errorResponses = {
	400: ErrorSchema,
	401: ErrorSchema,
	403: ErrorSchema,
	404: ErrorSchema,
	409: ErrorSchema,
};

type ListName = "allow" | "block";

export function normalizeSpamPattern(value: string): string | null {
	const pattern = value.trim().toLowerCase();
	if (pattern.startsWith("@")) {
		const domain = pattern.slice(1);
		return domain.length > 0 && domain.length <= 253 && DOMAIN.test(domain)
			? pattern
			: null;
	}
	return normalizeEmailAddress(pattern);
}

function normalizeList(
	values: string[],
	name: ListName,
): { data: string[] } | { error: string } {
	const result: string[] = [];
	for (const value of values) {
		const pattern = normalizeSpamPattern(value);
		if (!pattern) {
			return {
				error: `${name}: ${JSON.stringify(value)} is not an email address or @domain`,
			};
		}
		if (!result.includes(pattern)) result.push(pattern);
	}
	return { data: result };
}

function credentialScope(access: MailboxAccess) {
	return and(
		eq(imapCredentials.id, access.credential.credentialId),
		eq(imapCredentials.userId, access.userId),
	);
}

const spamColumns = {
	level: imapCredentials.spamLevel,
	allow: imapCredentials.spamAllow,
	block: imapCredentials.spamBlock,
};

async function serialize(
	userId: string,
	row: {
		level: SpamFilterLevel | null;
		allow: string[] | null;
		block: string[] | null;
	},
) {
	const effectiveLevel =
		row.level ?? (await spamFilterSettingsFor(userId)).level;
	return {
		level: row.level,
		effectiveLevel,
		allow: row.allow ?? [],
		block: row.block ?? [],
	};
}

async function loadSpam(access: MailboxAccess) {
	const [row] = await db
		.select(spamColumns)
		.from(imapCredentials)
		.where(credentialScope(access))
		.limit(1);
	return row ?? null;
}

async function authorize(
	request: Request,
	set: { status?: number | string; headers?: unknown },
	id: string,
) {
	return authorizeMailboxControl(request, set, id, "spam");
}

export const getMailboxSpam = new Elysia().get(
	"/mailboxes/:id/spam",
	async ({ request, params, set }) => {
		const result = await authorize(request, set, params.id);
		if (!result.ok) return fail(set, result.status, result.error);
		const row = await loadSpam(result.access);
		if (!row) return fail(set, 404, "Mailbox not found");
		return serialize(result.access.userId, row);
	},
	{
		params: MailboxParams,
		response: { 200: MailboxSpamSchema, ...errorResponses },
		detail: {
			tags: ["Mailboxes"],
			summary: "Get mailbox spam settings",
			description:
				"The mailbox's junk filter level and sender allow and block lists. A mailbox password can use this only when the account allows spam self-service.",
		},
	},
);

export const updateMailboxSpam = new Elysia().put(
	"/mailboxes/:id/spam",
	async ({ request, params, body, set }) => {
		const result = await authorize(request, set, params.id);
		if (!result.ok) return fail(set, result.status, result.error);
		const allow = normalizeList(body.allow, "allow");
		if ("error" in allow) return fail(set, 400, allow.error);
		const block = normalizeList(body.block, "block");
		if ("error" in block) return fail(set, 400, block.error);
		const overlap = allow.data.find((pattern) => block.data.includes(pattern));
		if (overlap) {
			return fail(
				set,
				400,
				`${overlap} can't be on both the allow and block lists`,
			);
		}
		const [row] = await db
			.update(imapCredentials)
			.set({
				spamLevel: body.level,
				spamAllow: allow.data,
				spamBlock: block.data,
				updatedAt: new Date(),
			})
			.where(credentialScope(result.access))
			.returning(spamColumns);
		if (!row) return fail(set, 404, "Mailbox not found");
		return serialize(result.access.userId, row);
	},
	{
		params: MailboxParams,
		body: t.Object({
			level: t.Nullable(SpamFilterLevelSchema, {
				description: "null uses the account's level",
			}),
			allow: PatternListSchema,
			block: PatternListSchema,
		}),
		response: { 200: MailboxSpamSchema, ...errorResponses },
		detail: {
			tags: ["Mailboxes"],
			summary: "Replace mailbox spam settings",
			description: `Set the mailbox's junk filter level and replace both sender lists (at most ${MAX_SPAM_LIST_ENTRIES} entries each). The allow list wins over the block list. Applies to new mail and reclassifies existing INBOX and Junk messages without a mailbox-specific decision.`,
		},
	},
);

function addEntry(list: ListName) {
	const target =
		list === "allow" ? imapCredentials.spamAllow : imapCredentials.spamBlock;
	const other =
		list === "allow" ? imapCredentials.spamBlock : imapCredentials.spamAllow;
	return new Elysia().post(
		`/mailboxes/:id/spam/${list}`,
		async ({ request, params, body, set }) => {
			const result = await authorize(request, set, params.id);
			if (!result.ok) return fail(set, result.status, result.error);
			const pattern = normalizeSpamPattern(body.pattern);
			if (!pattern)
				return fail(set, 400, "pattern must be an email address or @domain");
			const current = sql`coalesce(${target}, ARRAY[]::text[])`;
			const added = sql<
				string[]
			>`CASE WHEN ${pattern}::text = ANY(${current}) THEN ${current} ELSE array_append(${current}, ${pattern}::text) END`;
			const removed = sql<string[]>`array_remove(${other}, ${pattern}::text)`;
			const lists =
				list === "allow"
					? { spamAllow: added, spamBlock: removed }
					: { spamBlock: added, spamAllow: removed };
			const [row] = await db
				.update(imapCredentials)
				.set({ ...lists, updatedAt: new Date() })
				.where(
					and(
						credentialScope(result.access),
						sql`(${pattern}::text = ANY(${current}) OR cardinality(${current}) < ${MAX_SPAM_LIST_ENTRIES})`,
					),
				)
				.returning(spamColumns);
			if (!row) {
				if (!(await loadSpam(result.access))) {
					return fail(set, 404, "Mailbox not found");
				}
				return fail(
					set,
					409,
					`The ${list} list already has ${MAX_SPAM_LIST_ENTRIES} entries`,
				);
			}
			return serialize(result.access.userId, row);
		},
		{
			params: MailboxParams,
			body: t.Object({ pattern: PatternSchema }),
			response: { 200: MailboxSpamSchema, ...errorResponses },
			detail: {
				tags: ["Mailboxes"],
				summary: `Add a sender to the mailbox spam ${list} list`,
				description: `Adds the address or @domain (removing it from the ${list === "allow" ? "block" : "allow"} list if it was there). A list holds at most ${MAX_SPAM_LIST_ENTRIES} entries.`,
			},
		},
	);
}

function removeEntry(list: ListName) {
	const target =
		list === "allow" ? imapCredentials.spamAllow : imapCredentials.spamBlock;
	return new Elysia().delete(
		`/mailboxes/:id/spam/${list}`,
		async ({ request, params, body, set }) => {
			const result = await authorize(request, set, params.id);
			if (!result.ok) return fail(set, result.status, result.error);
			const pattern = normalizeSpamPattern(body.pattern);
			if (!pattern)
				return fail(set, 400, "pattern must be an email address or @domain");
			const removed = sql<string[]>`array_remove(${target}, ${pattern}::text)`;
			const lists =
				list === "allow" ? { spamAllow: removed } : { spamBlock: removed };
			const [row] = await db
				.update(imapCredentials)
				.set({ ...lists, updatedAt: new Date() })
				.where(
					and(
						credentialScope(result.access),
						sql`${pattern}::text = ANY(coalesce(${target}, ARRAY[]::text[]))`,
					),
				)
				.returning(spamColumns);
			if (!row) {
				if (!(await loadSpam(result.access))) {
					return fail(set, 404, "Mailbox not found");
				}
				return fail(set, 404, `${pattern} is not on the ${list} list`);
			}
			return serialize(result.access.userId, row);
		},
		{
			params: MailboxParams,
			body: t.Object({ pattern: PatternSchema }),
			response: { 200: MailboxSpamSchema, ...errorResponses },
			detail: {
				tags: ["Mailboxes"],
				summary: `Remove a sender from the mailbox spam ${list} list`,
			},
		},
	);
}

export const addMailboxSpamAllow = addEntry("allow");
export const removeMailboxSpamAllow = removeEntry("allow");
export const addMailboxSpamBlock = addEntry("block");
export const removeMailboxSpamBlock = removeEntry("block");

export const mailboxSpamRoutes = new Elysia()
	.use(getMailboxSpam)
	.use(updateMailboxSpam)
	.use(addMailboxSpamAllow)
	.use(removeMailboxSpamAllow)
	.use(addMailboxSpamBlock)
	.use(removeMailboxSpamBlock);
