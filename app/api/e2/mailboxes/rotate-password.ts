import { and, eq } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { validateAndRateLimit } from "@/app/api/e2/lib/auth";
import {
	deleteImapApiKey,
	getOwnedCredential,
	MailboxErrorSchema,
} from "@/app/api/e2/mailboxes/shared";
import { auth } from "@/lib/auth/auth";
import { db } from "@/lib/db";
import { imapCredentials } from "@/lib/db/schema";

const RotatePasswordResponse = t.Object({ password: t.String() });

export const rotateMailboxPassword = new Elysia().post(
	"/mailboxes/:id/rotate-password",
	async ({ request, params, set }) => {
		const userId = await validateAndRateLimit(request, set);
		const existing = await getOwnedCredential(userId, params.id);
		if (!existing) {
			set.status = 404;
			return { error: "Mailbox not found" };
		}

		const replacement = await auth.api.createApiKey({
			body: {
				configId: "imap",
				name: existing.name,
				userId,
			},
		});
		let updated: { id: string } | undefined;
		try {
			[updated] = await db
				.update(imapCredentials)
				.set({ apiKeyId: replacement.id, updatedAt: new Date() })
				.where(
					and(
						eq(imapCredentials.id, params.id),
						eq(imapCredentials.userId, userId),
						eq(imapCredentials.apiKeyId, existing.apiKeyId),
					),
				)
				.returning({ id: imapCredentials.id });
		} catch (error) {
			await deleteImapApiKey(replacement.id, userId);
			console.error("Failed to update rotated IMAP API key:", error);
			set.status = 500;
			return { error: "Failed to rotate mailbox password" };
		}

		if (!updated) {
			await deleteImapApiKey(replacement.id, userId);
			set.status = 404;
			return { error: "Mailbox not found" };
		}

		try {
			await deleteImapApiKey(existing.apiKeyId, userId);
		} catch (error) {
			console.error("Failed to delete rotated IMAP API key:", error);
		}

		return { password: replacement.key };
	},
	{
		params: t.Object({ id: t.String() }),
		response: {
			200: RotatePasswordResponse,
			401: MailboxErrorSchema,
			403: MailboxErrorSchema,
			404: MailboxErrorSchema,
			429: MailboxErrorSchema,
			500: MailboxErrorSchema,
		},
		detail: { tags: ["Mailboxes"], summary: "Rotate a mailbox password" },
	},
);
