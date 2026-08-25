import { Elysia, t } from "elysia";
import { enforceMailboxAuthenticationRateLimit } from "@/app/api/e2/lib/auth";
import {
	authenticateManagedMailCredential,
	MailboxErrorSchema,
	MailboxScopeSchema,
	normalizeEmailAddress,
} from "@/app/api/e2/mailboxes/shared";

const AuthenticateBody = t.Object({
	loginAddress: t.String({ minLength: 3, maxLength: 255 }),
	password: t.String({ minLength: 1, maxLength: 1024 }),
});

const AuthenticateResponse = t.Object({
	credentialId: t.String(),
	userId: t.String(),
	loginAddress: t.String(),
	type: t.Literal("mailbox"),
	sendingMode: t.Union([t.Literal("identity"), t.Literal("scoped_domains")]),
	sendingName: t.Nullable(t.String()),
	sendingAddress: t.Nullable(t.String()),
	accessMode: t.Union([t.Literal("read"), t.Literal("read_write")]),
	scopes: t.Array(MailboxScopeSchema),
});

function unauthorized(set: { status?: number | string }) {
	set.status = 401;
	return { error: "Invalid mailbox credentials" };
}

export const authenticateMailbox = new Elysia().post(
	"/mailboxes/authenticate",
	async ({ request, body, set }) => {
		const loginAddress = normalizeEmailAddress(body.loginAddress);
		await enforceMailboxAuthenticationRateLimit(
			request,
			loginAddress ?? body.loginAddress.trim().toLowerCase(),
			set,
		);
		if (!loginAddress) return unauthorized(set);

		const credential = await authenticateManagedMailCredential(body.password, {
			loginAddress,
			requireType: "mailbox",
		});
		if (!credential) return unauthorized(set);

		return {
			credentialId: credential.credentialId,
			userId: credential.userId,
			loginAddress: credential.loginAddress,
			type: "mailbox" as const,
			sendingMode: credential.sendingMode,
			sendingName: credential.sendingName,
			sendingAddress: credential.sendingAddress,
			accessMode: credential.accessMode,
			scopes: credential.scopes,
		};
	},
	{
		body: AuthenticateBody,
		response: {
			200: AuthenticateResponse,
			400: MailboxErrorSchema,
			401: MailboxErrorSchema,
			429: MailboxErrorSchema,
			500: MailboxErrorSchema,
			503: MailboxErrorSchema,
		},
		detail: { tags: ["Mailboxes"], summary: "Authenticate a mailbox" },
	},
);
