import { and, asc, count, eq, sql } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { nanoid } from "nanoid";
import type { MailboxAccess } from "@/app/api/e2/mailboxes/access";
import { authorizeMailboxControl } from "@/app/api/e2/mailboxes/controls";
import {
	checkFilterDefinition,
	type FilterDefinition,
	FilterInputSchema,
	FilterSchema,
	FilterUpdateSchema,
	MAX_FILTERS_PER_MAILBOX,
	type MailboxFilterRow,
	resolveFilterTargets,
	serializeFilter,
} from "@/app/api/e2/mailboxes/filter-rules";
import {
	fail,
	handleStateError,
	ownerOf,
} from "@/app/api/e2/mailboxes/folders";
import {
	ErrorSchema,
	findFolder,
	folderPathFromParam,
} from "@/app/api/e2/mailboxes/state";
import { db } from "@/lib/db";
import { imapCredentials, mailboxFilters } from "@/lib/db/schema";

const APPLY_MAX_BATCH = 500;

const MailboxParams = t.Object({ id: t.String() });
const FilterParams = t.Object({ id: t.String(), filterId: t.String() });

const errorResponses = {
	400: ErrorSchema,
	401: ErrorSchema,
	403: ErrorSchema,
	404: ErrorSchema,
	409: ErrorSchema,
};

const ApplyBodySchema = t.Object({
	folder: t.String({
		minLength: 1,
		maxLength: 255,
		description: "Folder to run the filters over, for example `INBOX`",
	}),
	afterUid: t.Optional(
		t.Integer({
			minimum: 0,
			description:
				"Only messages with a higher UID. Pass the previous response's lastUid to continue.",
		}),
	),
	limit: t.Optional(
		t.Integer({
			minimum: 1,
			maximum: APPLY_MAX_BATCH,
			default: APPLY_MAX_BATCH,
			description: `Messages to process in this call (at most ${APPLY_MAX_BATCH})`,
		}),
	),
});

const ApplyResultSchema = t.Object({
	folder: t.String(),
	processed: t.Number({ description: "Messages examined in this batch" }),
	lastUid: t.Nullable(
		t.Number({
			description:
				"UID of the last message examined (afterUid when nothing was processed)",
		}),
	),
	hasMore: t.Boolean({
		description: "True when the batch was full and more messages may remain",
	}),
});

type ElysiaSet = { status?: number | string; headers?: unknown };

function filterScope(access: MailboxAccess) {
	return and(
		eq(mailboxFilters.userId, access.userId),
		eq(mailboxFilters.credentialId, access.credential.credentialId),
	);
}

function lockCredential(access: MailboxAccess) {
	return db
		.select({ id: imapCredentials.id })
		.from(imapCredentials)
		.where(
			and(
				eq(imapCredentials.id, access.credential.credentialId),
				eq(imapCredentials.userId, access.userId),
			),
		)
		.for("update");
}

async function loadFilter(
	access: MailboxAccess,
	filterId: string,
): Promise<MailboxFilterRow | null> {
	const [row] = await db
		.select()
		.from(mailboxFilters)
		.where(and(filterScope(access), eq(mailboxFilters.id, filterId)))
		.limit(1);
	return row ?? null;
}

async function listAll(access: MailboxAccess) {
	return db
		.select()
		.from(mailboxFilters)
		.where(filterScope(access))
		.orderBy(asc(mailboxFilters.position), asc(mailboxFilters.id));
}

async function validateDefinition(
	access: MailboxAccess,
	input: Parameters<typeof checkFilterDefinition>[0],
): Promise<{ data: FilterDefinition } | { error: string }> {
	const checked = checkFilterDefinition(input);
	if ("error" in checked) return checked;
	return resolveFilterTargets(ownerOf(access), checked.data);
}

async function applyFilters(
	access: MailboxAccess,
	set: ElysiaSet,
	body: { folder: string; afterUid?: number; limit?: number },
	filterId: string | null,
) {
	const path = folderPathFromParam(body.folder);
	if (!path) return fail(set, 400, "Invalid folder path");
	const owner = ownerOf(access);
	try {
		const folder = await findFolder(owner, path);
		if (!folder) return fail(set, 404, "Folder not found");
		const limit = Math.min(body.limit ?? APPLY_MAX_BATCH, APPLY_MAX_BATCH);
		const result = await db.execute(sql`
			SELECT processed, last_uid FROM imap_apply_filters(${owner.userId},
				${owner.credentialId}, ${folder.id}, ${body.afterUid ?? 0}::integer,
				${limit}::integer, ${filterId}::text)`);
		const row = result.rows[0];
		const processed = Number(row?.processed ?? 0);
		const lastUid =
			row?.last_uid === null || row?.last_uid === undefined
				? null
				: Number(row.last_uid);
		return {
			folder: folder.path,
			processed,
			lastUid,
			hasMore: processed >= limit,
		};
	} catch (error) {
		return handleStateError(set, error);
	}
}

export const listMailboxFilters = new Elysia().get(
	"/mailboxes/:id/filters",
	async ({ request, params, query, set }) => {
		const result = await authorizeMailboxControl(
			request,
			set,
			params.id,
			"filters",
		);
		if (!result.ok) return fail(set, result.status, result.error);
		const limit = Math.min(query.limit ?? 50, 100);
		const offset = query.offset ?? 0;
		const scope = filterScope(result.access);
		const [rows, [{ total }]] = await Promise.all([
			db
				.select()
				.from(mailboxFilters)
				.where(scope)
				.orderBy(asc(mailboxFilters.position), asc(mailboxFilters.id))
				.limit(limit)
				.offset(offset),
			db.select({ total: count() }).from(mailboxFilters).where(scope),
		]);
		return {
			data: rows.map(serializeFilter),
			pagination: {
				limit,
				offset,
				total,
				hasMore: offset + rows.length < total,
			},
		};
	},
	{
		params: MailboxParams,
		query: t.Object({
			limit: t.Optional(t.Integer({ minimum: 1, maximum: 100, default: 50 })),
			offset: t.Optional(t.Integer({ minimum: 0, default: 0 })),
		}),
		response: {
			200: t.Object({
				data: t.Array(FilterSchema),
				pagination: t.Object({
					limit: t.Number(),
					offset: t.Number(),
					total: t.Number(),
					hasMore: t.Boolean(),
				}),
			}),
			...errorResponses,
		},
		detail: {
			tags: ["Mailboxes"],
			summary: "List mailbox filters",
			description:
				"List the mailbox's filters in the order they run. A mailbox password can use this only when the account allows filter self-service.",
		},
	},
);

export const createMailboxFilter = new Elysia().post(
	"/mailboxes/:id/filters",
	async ({ request, params, body, set }) => {
		const result = await authorizeMailboxControl(
			request,
			set,
			params.id,
			"filters",
		);
		if (!result.ok) return fail(set, result.status, result.error);
		const { access } = result;
		try {
			const validated = await validateDefinition(access, body);
			if ("error" in validated) return fail(set, 400, validated.error);
			const definition = validated.data;
			const id = nanoid();
			const [, inserted] = await db.batch([
				lockCredential(access),
				db.execute(sql`
					INSERT INTO mailbox_filters (id, user_id, credential_id, name, position,
						enabled, match, conditions, actions, stop_processing)
					SELECT ${id}, ${access.userId}, ${access.credential.credentialId},
						${definition.name}, coalesce(max(position) + 1, 0),
						${definition.enabled}, ${definition.match},
						${JSON.stringify(definition.conditions)}::jsonb,
						${JSON.stringify(definition.actions)}::jsonb,
						${definition.stopProcessing}
					FROM mailbox_filters
					WHERE user_id = ${access.userId}
						AND credential_id = ${access.credential.credentialId}
					HAVING count(*) < ${MAX_FILTERS_PER_MAILBOX}
					RETURNING id`),
			]);
			if (inserted.rows.length === 0) {
				return fail(
					set,
					409,
					`A mailbox can have at most ${MAX_FILTERS_PER_MAILBOX} filters`,
				);
			}
			const row = await loadFilter(access, id);
			if (!row) return fail(set, 404, "Filter not found");
			set.status = 201;
			return serializeFilter(row);
		} catch (error) {
			return handleStateError(set, error);
		}
	},
	{
		params: MailboxParams,
		body: FilterInputSchema,
		response: { 201: FilterSchema, ...errorResponses },
		detail: {
			tags: ["Mailboxes"],
			summary: "Create a mailbox filter",
			description: `Add a filter that runs last. Filters apply to mail as it reaches the mailbox (and to existing mail with the apply endpoint). \`move_to\` folders must exist and can't be scope folders. At most ${MAX_FILTERS_PER_MAILBOX} filters per mailbox, 20 conditions and 20 actions per filter.`,
		},
	},
);

export const reorderMailboxFilters = new Elysia().post(
	"/mailboxes/:id/filters/reorder",
	async ({ request, params, body, set }) => {
		const result = await authorizeMailboxControl(
			request,
			set,
			params.id,
			"filters",
		);
		if (!result.ok) return fail(set, result.status, result.error);
		const { access } = result;
		const ids = body.ids;
		if (new Set(ids).size !== ids.length) {
			return fail(set, 400, "Filter IDs must be unique");
		}
		const idArray =
			ids.length === 0
				? sql`ARRAY[]::text[]`
				: sql`ARRAY[${sql.join(
						ids.map((id) => sql`${id}`),
						sql`, `,
					)}]::text[]`;
		const [, reordered] = await db.batch([
			lockCredential(access),
			db.execute(sql`
				WITH wanted AS (
					SELECT id, ord FROM unnest(${idArray}) WITH ORDINALITY AS o(id, ord)
				), complete AS (
					SELECT (SELECT count(*) FROM mailbox_filters f
						WHERE f.user_id = ${access.userId}
							AND f.credential_id = ${access.credential.credentialId}) = ${ids.length}
						AND (SELECT count(*) FROM mailbox_filters f JOIN wanted w ON w.id = f.id
							WHERE f.user_id = ${access.userId}
								AND f.credential_id = ${access.credential.credentialId}) = ${ids.length}
						AS ok
				)
				UPDATE mailbox_filters f SET position = (w.ord - 1)::integer
				FROM wanted w, complete c
				WHERE c.ok AND f.id = w.id AND f.user_id = ${access.userId}
					AND f.credential_id = ${access.credential.credentialId}
				RETURNING f.id`),
		]);
		if (reordered.rows.length !== ids.length) {
			return fail(
				set,
				409,
				"ids must list every filter of this mailbox exactly once",
			);
		}
		const rows = await listAll(access);
		return { data: rows.map(serializeFilter) };
	},
	{
		params: MailboxParams,
		body: t.Object({
			ids: t.Array(t.String({ minLength: 1, maxLength: 255 }), {
				maxItems: MAX_FILTERS_PER_MAILBOX,
				description:
					"Every filter ID of the mailbox, in the order the filters should run",
			}),
		}),
		response: {
			200: t.Object({ data: t.Array(FilterSchema) }),
			...errorResponses,
		},
		detail: {
			tags: ["Mailboxes"],
			summary: "Reorder mailbox filters",
			description:
				"Set the order filters run in. The list must contain every filter of the mailbox exactly once; otherwise nothing changes and the response is 409.",
		},
	},
);

export const applyMailboxFilters = new Elysia().post(
	"/mailboxes/:id/filters/apply",
	async ({ request, params, body, set }) => {
		const result = await authorizeMailboxControl(
			request,
			set,
			params.id,
			"filters",
		);
		if (!result.ok) return fail(set, result.status, result.error);
		return applyFilters(result.access, set, body, null);
	},
	{
		params: MailboxParams,
		body: ApplyBodySchema,
		response: { 200: ApplyResultSchema, ...errorResponses },
		detail: {
			tags: ["Mailboxes"],
			summary: "Run mailbox filters on a folder",
			description: `Run the mailbox's enabled filters over existing messages in a folder, in UID order, up to ${APPLY_MAX_BATCH} messages per call. Repeat with \`afterUid\` set to \`lastUid\` while \`hasMore\` is true.`,
		},
	},
);

export const getMailboxFilter = new Elysia().get(
	"/mailboxes/:id/filters/:filterId",
	async ({ request, params, set }) => {
		const result = await authorizeMailboxControl(
			request,
			set,
			params.id,
			"filters",
		);
		if (!result.ok) return fail(set, result.status, result.error);
		const row = await loadFilter(result.access, params.filterId);
		if (!row) return fail(set, 404, "Filter not found");
		return serializeFilter(row);
	},
	{
		params: FilterParams,
		response: { 200: FilterSchema, ...errorResponses },
		detail: {
			tags: ["Mailboxes"],
			summary: "Get a mailbox filter",
		},
	},
);

export const updateMailboxFilter = new Elysia().patch(
	"/mailboxes/:id/filters/:filterId",
	async ({ request, params, body, set }) => {
		const result = await authorizeMailboxControl(
			request,
			set,
			params.id,
			"filters",
		);
		if (!result.ok) return fail(set, result.status, result.error);
		const { access } = result;
		try {
			const existing = await loadFilter(access, params.filterId);
			if (!existing) return fail(set, 404, "Filter not found");
			const validated = await validateDefinition(access, {
				name: body.name ?? existing.name,
				enabled: body.enabled ?? existing.enabled,
				match: body.match ?? existing.match,
				conditions: body.conditions ?? existing.conditions,
				actions: body.actions ?? existing.actions,
				stopProcessing: body.stopProcessing ?? existing.stopProcessing,
			});
			if ("error" in validated) return fail(set, 400, validated.error);
			const [row] = await db
				.update(mailboxFilters)
				.set({ ...validated.data, updatedAt: new Date() })
				.where(and(filterScope(access), eq(mailboxFilters.id, existing.id)))
				.returning();
			if (!row) return fail(set, 404, "Filter not found");
			return serializeFilter(row);
		} catch (error) {
			return handleStateError(set, error);
		}
	},
	{
		params: FilterParams,
		body: FilterUpdateSchema,
		response: { 200: FilterSchema, ...errorResponses },
		detail: {
			tags: ["Mailboxes"],
			summary: "Update a mailbox filter",
			description:
				"Change any of a filter's fields. `conditions` and `actions` replace the whole list. Use the reorder endpoint to change its position.",
		},
	},
);

export const deleteMailboxFilter = new Elysia().delete(
	"/mailboxes/:id/filters/:filterId",
	async ({ request, params, set }) => {
		const result = await authorizeMailboxControl(
			request,
			set,
			params.id,
			"filters",
		);
		if (!result.ok) return fail(set, result.status, result.error);
		const [row] = await db
			.delete(mailboxFilters)
			.where(
				and(filterScope(result.access), eq(mailboxFilters.id, params.filterId)),
			)
			.returning({ id: mailboxFilters.id });
		if (!row) return fail(set, 404, "Filter not found");
		return { id: row.id, deleted: true };
	},
	{
		params: FilterParams,
		response: {
			200: t.Object({ id: t.String(), deleted: t.Boolean() }),
			...errorResponses,
		},
		detail: {
			tags: ["Mailboxes"],
			summary: "Delete a mailbox filter",
			description:
				"Mail the filter already moved or flagged stays where it is.",
		},
	},
);

export const applyMailboxFilter = new Elysia().post(
	"/mailboxes/:id/filters/:filterId/apply",
	async ({ request, params, body, set }) => {
		const result = await authorizeMailboxControl(
			request,
			set,
			params.id,
			"filters",
		);
		if (!result.ok) return fail(set, result.status, result.error);
		const row = await loadFilter(result.access, params.filterId);
		if (!row) return fail(set, 404, "Filter not found");
		if (!row.enabled) return fail(set, 409, "Filter is disabled");
		return applyFilters(result.access, set, body, row.id);
	},
	{
		params: FilterParams,
		body: ApplyBodySchema,
		response: { 200: ApplyResultSchema, ...errorResponses },
		detail: {
			tags: ["Mailboxes"],
			summary: "Run one mailbox filter on a folder",
			description: `Run a single filter over existing messages in a folder, up to ${APPLY_MAX_BATCH} messages per call. Repeat with \`afterUid\` set to \`lastUid\` while \`hasMore\` is true.`,
		},
	},
);

export const mailboxFilterRoutes = new Elysia()
	.use(listMailboxFilters)
	.use(createMailboxFilter)
	.use(reorderMailboxFilters)
	.use(applyMailboxFilters)
	.use(getMailboxFilter)
	.use(updateMailboxFilter)
	.use(deleteMailboxFilter)
	.use(applyMailboxFilter);
