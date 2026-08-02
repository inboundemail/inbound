import { and, eq } from "drizzle-orm";
import { Elysia, t } from "elysia";
import {
	loadCredentialScopes,
	MailboxErrorSchema,
	MailboxScopeSchema,
	normalizeEmailAddress,
} from "@/app/api/e2/mailboxes/shared";
import { auth } from "@/lib/auth/auth";
import { db } from "@/lib/db";
import { user } from "@/lib/db/auth-schema";
import { imapCredentials } from "@/lib/db/schema";

const AuthenticateBody = t.Object({
	loginAddress: t.String({ minLength: 3, maxLength: 255 }),
	password: t.String({ minLength: 1 }),
});

const AuthenticateResponse = t.Object({
	credentialId: t.String(),
	userId: t.String(),
	loginAddress: t.String(),
	accessMode: t.Union([t.Literal("read"), t.Literal("read_write")]),
	scopes: t.Array(MailboxScopeSchema),
});

function unauthorized(set: { status?: number | string }) {
	set.status = 401;
	return { error: "Invalid mailbox credentials" };
}

export const authenticateMailbox = new Elysia().post(
	"/mailboxes/authenticate",
	async ({ body, set }) => {
		const loginAddress = normalizeEmailAddress(body.loginAddress);
		if (!loginAddress) return unauthorized(set);

		let verification: Awaited<ReturnType<typeof auth.api.verifyApiKey>> | null =
			null;
		try {
			verification = await auth.api.verifyApiKey({
				body: {
					key: body.password,
					configId: "imap",
				},
			});
		} catch {
			return unauthorized(set);
		}

		const apiKeyId = verification.valid ? verification.key?.id : null;
		const apiKeyOwnerId = verification.valid
			? verification.key?.referenceId
			: null;
		if (!apiKeyId || !apiKeyOwnerId) return unauthorized(set);

		const [credential] = await db
			.select({
				id: imapCredentials.id,
				userId: imapCredentials.userId,
				loginAddress: imapCredentials.loginAddress,
				accessMode: imapCredentials.accessMode,
				enabled: imapCredentials.enabled,
				banned: user.banned,
				banExpires: user.banExpires,
			})
			.from(imapCredentials)
			.innerJoin(user, eq(imapCredentials.userId, user.id))
			.where(
				and(
					eq(imapCredentials.apiKeyId, apiKeyId),
					eq(imapCredentials.loginAddress, loginAddress),
					eq(imapCredentials.userId, apiKeyOwnerId),
				),
			)
			.limit(1);
		if (!credential?.enabled) return unauthorized(set);

		const banExpires = credential.banExpires
			? new Date(credential.banExpires)
			: null;
		if (
			credential.banned &&
			(!banExpires || banExpires.getTime() >= Date.now())
		) {
			return unauthorized(set);
		}

		const scopes = await loadCredentialScopes(
			credential.userId,
			[credential.id],
			true,
		);
		const verifiedScopes = scopes.filter(
			(scope) => scope.credentialId === credential.id,
		);
		if (verifiedScopes.length === 0) return unauthorized(set);

		await db
			.update(imapCredentials)
			.set({ lastUsedAt: new Date() })
			.where(
				and(
					eq(imapCredentials.id, credential.id),
					eq(imapCredentials.userId, credential.userId),
				),
			);

		return {
			credentialId: credential.id,
			userId: credential.userId,
			loginAddress: credential.loginAddress,
			accessMode: credential.accessMode as "read" | "read_write",
			scopes: verifiedScopes.map((scope) => ({
				id: scope.id,
				type: scope.type as "domain" | "address",
				domainId: scope.domainId,
				domain: scope.domain,
				address: scope.address,
			})),
		};
	},
	{
		body: AuthenticateBody,
		response: {
			200: AuthenticateResponse,
			400: MailboxErrorSchema,
			401: MailboxErrorSchema,
			500: MailboxErrorSchema,
		},
		detail: { tags: ["Mailboxes"], summary: "Authenticate a mailbox" },
	},
);
