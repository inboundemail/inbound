import { createHash } from "node:crypto";
import {
	AuthError,
	enforceAuthenticatedUserAndRateLimit,
	enforceMailboxAuthenticationRateLimit,
	validateAndRateLimit,
} from "@/app/api/e2/lib/auth";
import {
	authenticateManagedMailCredential,
	type ManagedMailCredential,
	normalizeEmailAddress,
} from "@/app/api/e2/mailboxes/shared";

export interface ManagedSenderPolicy {
	sendingMode: "identity" | "scoped_domains";
	sendingAddress: string | null;
	allowedDomains: string[];
}

export const READ_ONLY_SEND_ERROR =
	"This mailbox password is read only and cannot send mail. Set the mailbox to Read & write to send with it.";

function mailTokenRateLimitKey(token: string): string {
	const digest = createHash("sha256").update(token).digest("hex");
	return `token:${digest.slice(0, 32)}`;
}

function rejectInvalidMailToken(set: {
	status?: number | string;
	headers?: unknown;
}): never {
	set.status = 401;
	const headers = {
		"WWW-Authenticate": 'Bearer realm="API", error="invalid_token"',
		"Content-Type": "application/json; charset=utf-8",
	};
	set.headers = headers;
	throw new AuthError(
		{
			error: "Unauthorized",
			message: "Invalid mailbox credentials.",
			statusCode: 401,
		},
		headers,
	);
}

/**
 * Verifies a mailbox or SMTP password (`mail_…`/`imap_…`) presented as a
 * bearer token. Failures count against the mailbox authentication rate limit
 * (per client IP and per token hash), and once that limit is hit even a
 * correct password is refused with 429 until it resets.
 */
export async function authenticateRateLimitedMailToken(
	request: Request,
	token: string,
	set: { status?: number | string; headers?: unknown },
	options: { requireType?: "mailbox" } = {},
): Promise<ManagedMailCredential | null> {
	const rateLimitKey = mailTokenRateLimitKey(token);
	await enforceMailboxAuthenticationRateLimit(request, rateLimitKey, set, {
		consume: false,
	});
	const credential = await authenticateManagedMailCredential(token, options);
	if (!credential) {
		await enforceMailboxAuthenticationRateLimit(request, rateLimitKey, set);
	}
	return credential;
}

/**
 * Authenticates a send. A mailbox or SMTP password (`mail_…`/`imap_…`) may
 * send only when it is read & write; anything else needs an account API key or
 * session.
 */
export async function authenticateEmailSend(
	request: Request,
	set: { status?: number | string; headers?: unknown },
): Promise<{
	userId: string;
	senderPolicy: ManagedSenderPolicy | null;
	credential: ManagedMailCredential | null;
}> {
	const authorization = request.headers.get("authorization");
	const apiKey = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
	if (apiKey?.startsWith("mail_") || apiKey?.startsWith("imap_")) {
		const credential = await authenticateRateLimitedMailToken(
			request,
			apiKey,
			set,
		);
		if (!credential) rejectInvalidMailToken(set);
		if (credential.accessMode !== "read_write") {
			set.status = 403;
			const headers = { "Content-Type": "application/json; charset=utf-8" };
			set.headers = headers;
			throw new AuthError(
				{
					error: "Forbidden",
					message: READ_ONLY_SEND_ERROR,
					statusCode: 403,
				},
				headers,
			);
		}
		await enforceAuthenticatedUserAndRateLimit(credential.userId, set);
		return {
			userId: credential.userId,
			senderPolicy: {
				sendingMode: credential.sendingMode,
				sendingAddress: credential.sendingAddress,
				allowedDomains: credential.allowedDomains,
			},
			credential,
		};
	}

	return {
		userId: await validateAndRateLimit(request, set),
		senderPolicy: null,
		credential: null,
	};
}

export function senderPolicyAllowsAddress(
	policy: ManagedSenderPolicy,
	fromAddress: string,
): boolean {
	const address = normalizeEmailAddress(fromAddress);
	if (!address) return false;
	if (policy.sendingMode === "identity") {
		return address === policy.sendingAddress;
	}

	const domain = address.slice(address.lastIndexOf("@") + 1);
	return policy.allowedDomains.includes(domain);
}
