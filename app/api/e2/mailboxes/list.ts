import { count, desc, eq } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { validateAndRateLimit } from "@/app/api/e2/lib/auth";
import {
	loadCredentialScopes,
	MailboxErrorSchema,
	MailboxSchema,
	serializeMailbox,
} from "@/app/api/e2/mailboxes/shared";
import { db } from "@/lib/db";
import { imapCredentials } from "@/lib/db/schema";

const ListMailboxesQuery = t.Object({
	limit: t.Optional(t.Integer({ minimum: 1, maximum: 100, default: 50 })),
	offset: t.Optional(t.Integer({ minimum: 0, default: 0 })),
});

const ListMailboxesResponse = t.Object({
	data: t.Array(MailboxSchema),
	pagination: t.Object({
		limit: t.Number(),
		offset: t.Number(),
		total: t.Number(),
		hasMore: t.Boolean(),
	}),
});

export const listMailboxes = new Elysia().get(
	"/mailboxes",
	async ({ request, query, set }) => {
		const userId = await validateAndRateLimit(request, set);
		const limit = Math.min(query.limit ?? 50, 100);
		const offset = query.offset ?? 0;
		const credentials = await db
			.select()
			.from(imapCredentials)
			.where(eq(imapCredentials.userId, userId))
			.orderBy(desc(imapCredentials.createdAt))
			.limit(limit)
			.offset(offset);
		const [totalResult] = await db
			.select({ count: count() })
			.from(imapCredentials)
			.where(eq(imapCredentials.userId, userId));
		const total = totalResult?.count ?? 0;
		const scopes = await loadCredentialScopes(
			userId,
			credentials.map((credential) => credential.id),
		);

		return {
			data: credentials.map((credential) =>
				serializeMailbox(credential, scopes),
			),
			pagination: {
				limit,
				offset,
				total,
				hasMore: offset + credentials.length < total,
			},
		};
	},
	{
		query: ListMailboxesQuery,
		response: {
			200: ListMailboxesResponse,
			401: MailboxErrorSchema,
			403: MailboxErrorSchema,
			429: MailboxErrorSchema,
			500: MailboxErrorSchema,
		},
		detail: { tags: ["Mailboxes"], summary: "List managed mailboxes" },
	},
);
