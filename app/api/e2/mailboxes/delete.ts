import { and, eq } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { validateAndRateLimit } from "@/app/api/e2/lib/auth";
import {
	deleteImapApiKey,
	getOwnedCredential,
	MailboxErrorSchema,
} from "@/app/api/e2/mailboxes/shared";
import { db } from "@/lib/db";
import { imapCredentials } from "@/lib/db/schema";

const DeleteMailboxResponse = t.Object({ success: t.Literal(true) });

export const deleteMailbox = new Elysia().delete(
	"/mailboxes/:id",
	async ({ request, params, set }) => {
		const userId = await validateAndRateLimit(request, set);
		const existing = await getOwnedCredential(userId, params.id);
		if (!existing) {
			set.status = 404;
			return { error: "Mailbox not found" };
		}

		const deleted = await db
			.delete(imapCredentials)
			.where(
				and(
					eq(imapCredentials.id, params.id),
					eq(imapCredentials.userId, userId),
				),
			)
			.returning({ id: imapCredentials.id });
		if (!deleted[0]) {
			set.status = 404;
			return { error: "Mailbox not found" };
		}

		try {
			await deleteImapApiKey(existing.apiKeyId, userId);
		} catch (error) {
			console.error("Failed to delete IMAP API key:", error);
		}

		return { success: true as const };
	},
	{
		params: t.Object({ id: t.String() }),
		response: {
			200: DeleteMailboxResponse,
			401: MailboxErrorSchema,
			403: MailboxErrorSchema,
			404: MailboxErrorSchema,
			429: MailboxErrorSchema,
			500: MailboxErrorSchema,
		},
		detail: { tags: ["Mailboxes"], summary: "Delete a managed mailbox" },
	},
);
