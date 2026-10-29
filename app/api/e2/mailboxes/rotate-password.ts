import { and, eq } from "drizzle-orm";
import { Elysia, t } from "elysia";
import {
	enforceAuthenticatedUserAndRateLimit,
	validateAndRateLimit,
} from "@/app/api/e2/lib/auth";
import {
	authenticateRateLimitedMailToken,
	httpMailboxPasswordUse,
} from "@/app/api/e2/lib/send-auth";
import { isMailboxPassword } from "@/app/api/e2/mailboxes/access";
import {
	deleteMailApiKey,
	getOwnedCredential,
	MailboxErrorSchema,
} from "@/app/api/e2/mailboxes/shared";
import { auth } from "@/lib/auth/auth";
import { db } from "@/lib/db";
import { imapCredentials } from "@/lib/db/schema";

const RotatePasswordResponse = t.Object({ password: t.String() });

function bearerToken(request: Request): string | null {
	const authorization = request.headers.get("authorization");
	return authorization?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || null;
}

/**
 * The account rotates any of its mailboxes by ID. A mailbox password may
 * rotate itself (ID `me` or its own ID) only when the account allowed
 * self-service password changes; the old password stops working at once.
 */
async function authorizeRotation(
	request: Request,
	set: { status?: number | string; headers?: unknown },
	mailboxId: string,
): Promise<
	{ userId: string; credentialId: string } | { status: number; error: string }
> {
	const token = bearerToken(request);
	if (isMailboxPassword(token)) {
		const credential = await authenticateRateLimitedMailToken(
			request,
			token as string,
			set,
			{ use: httpMailboxPasswordUse(request, { allowGateway: false }) },
		);
		if (!credential)
			return { status: 401, error: "Invalid mailbox credentials" };
		await enforceAuthenticatedUserAndRateLimit(credential.userId, set);
		if (mailboxId !== "me" && mailboxId !== credential.credentialId) {
			return {
				status: 403,
				error: "This mailbox password can only access its own mailbox",
			};
		}
		if (!credential.selfService.password) {
			return {
				status: 403,
				error: "Self-service password changes are not enabled for this mailbox",
			};
		}
		return { userId: credential.userId, credentialId: credential.credentialId };
	}

	const userId = await validateAndRateLimit(request, set);
	if (mailboxId === "me") {
		return {
			status: 400,
			error:
				"Use a mailbox ID, or authenticate with the mailbox password to use 'me'",
		};
	}
	return { userId, credentialId: mailboxId };
}

export const rotateMailboxPassword = new Elysia().post(
	"/mailboxes/:id/rotate-password",
	async ({ request, params, set }) => {
		const authorized = await authorizeRotation(request, set, params.id);
		if ("error" in authorized) {
			set.status = authorized.status;
			return { error: authorized.error };
		}
		const { userId, credentialId: id } = authorized;
		const existing = await getOwnedCredential(userId, id);
		if (!existing) {
			set.status = 404;
			return { error: "Mailbox not found" };
		}

		const replacement = await auth.api.createApiKey({
			body: {
				configId: "mail",
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
						eq(imapCredentials.id, id),
						eq(imapCredentials.userId, userId),
						eq(imapCredentials.apiKeyId, existing.apiKeyId),
					),
				)
				.returning({ id: imapCredentials.id });
		} catch (error) {
			console.error("Failed to update rotated mail API key:", error);
			let current: Awaited<ReturnType<typeof getOwnedCredential>>;
			try {
				current = await getOwnedCredential(userId, id);
			} catch (readError) {
				console.error(
					"Failed to verify rotation state; keeping replacement API key:",
					readError,
				);
				set.status = 500;
				return { error: "Failed to rotate mailbox password" };
			}
			if (current?.apiKeyId !== replacement.id) {
				try {
					await deleteMailApiKey(replacement.id, userId);
				} catch (cleanupError) {
					console.error(
						"Failed to delete unused replacement API key:",
						cleanupError,
					);
				}
				set.status = 500;
				return { error: "Failed to rotate mailbox password" };
			}
			updated = { id: current.id };
		}

		if (!updated) {
			try {
				await deleteMailApiKey(replacement.id, userId);
			} catch (error) {
				console.error("Failed to delete unused replacement API key:", error);
			}
			const stillExists = await getOwnedCredential(userId, id);
			if (stillExists) {
				set.status = 409;
				return {
					error: "Mailbox changed concurrently. Retry password rotation.",
				};
			}
			set.status = 404;
			return { error: "Mailbox not found" };
		}

		try {
			await deleteMailApiKey(existing.apiKeyId, userId);
		} catch (error) {
			console.error("Failed to delete rotated mail API key:", error);
		}

		return { password: replacement.key };
	},
	{
		params: t.Object({ id: t.String() }),
		response: {
			200: RotatePasswordResponse,
			400: MailboxErrorSchema,
			401: MailboxErrorSchema,
			403: MailboxErrorSchema,
			404: MailboxErrorSchema,
			409: MailboxErrorSchema,
			429: MailboxErrorSchema,
			500: MailboxErrorSchema,
		},
		detail: {
			tags: ["Mailboxes"],
			summary: "Rotate a mailbox password",
			description:
				"Replace a mailbox password; the old one stops working immediately. Authenticate with the account API key, or with the mailbox password and the ID `me` when the mailbox allows self-service password changes.",
		},
	},
);
