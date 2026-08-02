import { Elysia, t } from "elysia";
import {
	authenticateManagedMailCredential,
	MailboxErrorSchema,
	MailboxScopeSchema,
	normalizeEmailAddress,
} from "@/app/api/e2/mailboxes/shared";

const AuthenticateSmtpBody = t.Object({
	loginAddress: t.String({ minLength: 3, maxLength: 255 }),
	password: t.String({ minLength: 1 }),
});

const AuthenticateSmtpResponse = t.Object({
	credentialId: t.String(),
	userId: t.String(),
	loginAddress: t.String(),
	type: t.Union([t.Literal("mailbox"), t.Literal("smtp")]),
	sendingMode: t.Union([t.Literal("identity"), t.Literal("scoped_domains")]),
	sendingName: t.Nullable(t.String()),
	sendingAddress: t.Nullable(t.String()),
	allowedDomains: t.Array(t.String()),
	accessMode: t.Union([t.Literal("read"), t.Literal("read_write")]),
	scopes: t.Array(MailboxScopeSchema),
});

function unauthorized(set: { status?: number | string }) {
	set.status = 401;
	return { error: "Invalid mail credentials" };
}

export const authenticateSmtp = new Elysia().post(
	"/mailboxes/authenticate-smtp",
	async ({ body, set }) => {
		const loginAddress = normalizeEmailAddress(body.loginAddress);
		if (!loginAddress) return unauthorized(set);

		const credential = await authenticateManagedMailCredential(body.password, {
			loginAddress,
		});
		if (!credential) return unauthorized(set);

		return credential;
	},
	{
		body: AuthenticateSmtpBody,
		response: {
			200: AuthenticateSmtpResponse,
			400: MailboxErrorSchema,
			401: MailboxErrorSchema,
			500: MailboxErrorSchema,
		},
		detail: { tags: ["Mailboxes"], summary: "Authenticate for SMTP" },
	},
);
