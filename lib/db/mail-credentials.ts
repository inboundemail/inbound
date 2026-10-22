import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { imapCredentials } from "@/lib/db/schema";

/**
 * Disables every mailbox and SMTP credential a user owns, for permanent bans.
 * The imap_credential_changed trigger tells the IMAP gateway, which logs their
 * sessions out. Unbanning does not re-enable them. Temporary bans leave
 * credentials enabled; resolveManagedMailCredential refuses them until the
 * ban expires.
 */
export async function disableMailCredentialsForUser(
	userId: string,
): Promise<number> {
	const disabled = await db
		.update(imapCredentials)
		.set({ enabled: false, updatedAt: new Date() })
		.where(
			and(
				eq(imapCredentials.userId, userId),
				eq(imapCredentials.enabled, true),
			),
		)
		.returning({ id: imapCredentials.id });
	return disabled.length;
}
