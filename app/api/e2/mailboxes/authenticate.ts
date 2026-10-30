import { Elysia, t } from "elysia";
import {
	enforceMailboxAuthenticationRateLimit,
	enforceMailboxGatewayAuthorization,
	getGatewayClientIp,
	getGatewayClientName,
	isGatewayRevalidation,
	isMailboxGatewayRequest,
} from "@/app/api/e2/lib/auth";
import {
	deferActivity,
	recordLoginRateLimited,
} from "@/app/api/e2/mailboxes/activity-log";
import {
	authenticateManagedMailCredential,
	type MailboxPasswordUse,
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

/** How a gateway sign-in uses the password: protocol, client IP and client name. */
export function gatewayPasswordUse(
	request: Request,
	protocol: "imap" | "smtp",
): MailboxPasswordUse {
	return {
		protocol,
		clientIp: getGatewayClientIp(request),
		client: getGatewayClientName(request),
		record: !isGatewayRevalidation(request),
	};
}

/**
 * Applies the mailbox sign-in rate limit; a limited gateway sign-in to a
 * known mailbox is recorded in its activity log as `rate_limited`.
 */
export async function enforceGatewayLoginRateLimit(
	request: Request,
	loginAddress: string | null,
	rawLoginAddress: string,
	set: { status?: number | string; headers?: unknown },
	protocol: "imap" | "smtp",
): Promise<void> {
	try {
		await enforceMailboxAuthenticationRateLimit(
			request,
			loginAddress ?? rawLoginAddress.trim().toLowerCase(),
			set,
		);
	} catch (error) {
		const use = gatewayPasswordUse(request, protocol);
		if (
			set.status === 429 &&
			loginAddress &&
			use.record &&
			isMailboxGatewayRequest(request)
		) {
			deferActivity(() => recordLoginRateLimited(loginAddress, use));
		}
		throw error;
	}
}

export const authenticateMailbox = new Elysia().post(
	"/mailboxes/authenticate",
	async ({ request, body, set }) => {
		const loginAddress = normalizeEmailAddress(body.loginAddress);
		await enforceGatewayLoginRateLimit(
			request,
			loginAddress,
			body.loginAddress,
			set,
			"imap",
		);
		enforceMailboxGatewayAuthorization(request, set);
		if (!loginAddress) return unauthorized(set);

		const credential = await authenticateManagedMailCredential(body.password, {
			loginAddress,
			requireType: "mailbox",
			use: gatewayPasswordUse(request, "imap"),
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
			403: MailboxErrorSchema,
			429: MailboxErrorSchema,
			500: MailboxErrorSchema,
			503: MailboxErrorSchema,
		},
		detail: { tags: ["Mailboxes"], summary: "Authenticate a mailbox" },
	},
);
