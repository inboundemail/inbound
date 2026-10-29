import { createHash } from "node:crypto";
import {
	AuthError,
	enforceAuthenticatedUserAndRateLimit,
	enforceMailboxAuthenticationRateLimit,
	getGatewayClientIp,
	getGatewayClientName,
	getTrustedHttpClientIp,
	isMailboxGatewayRequest,
	validateAndRateLimit,
} from "@/app/api/e2/lib/auth";
import { userAgentProduct } from "@/app/api/e2/mailboxes/activity-log";
import {
	type MailboxPasswordUse,
	type ManagedMailCredential,
	normalizeEmailAddress,
	verifyManagedMailCredential,
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
 * How a mailbox password presented over HTTP is being used. Requests that
 * prove they come from the SMTP gateway (valid gateway secret) are SMTP use
 * from the client IP the gateway forwards; everything else is HTTP API use
 * from the platform-verified client IP.
 */
export function httpMailboxPasswordUse(
	request: Request,
	options: { allowGateway: boolean },
): MailboxPasswordUse {
	if (options.allowGateway && isMailboxGatewayRequest(request)) {
		return {
			protocol: "smtp",
			clientIp: getGatewayClientIp(request),
			client: getGatewayClientName(request),
		};
	}
	return {
		protocol: "api",
		clientIp: getTrustedHttpClientIp(request),
		client: userAgentProduct(request.headers.get("user-agent")),
	};
}

/**
 * Verifies a mailbox or SMTP password (`mail_…`/`imap_…`) presented as a
 * bearer token and applies its protocol and IP controls for `use`. A wrong
 * password counts against the mailbox authentication rate limit per client IP
 * and per token hash; a correct password refused by its protocol or IP
 * controls counts only per client IP, so refused attempts cannot lock the
 * password out where it is allowed. Both return null (the same 401). Once a
 * limit is hit even a correct password is refused with 429 until it resets.
 */
export async function authenticateRateLimitedMailToken(
	request: Request,
	token: string,
	set: { status?: number | string; headers?: unknown },
	options: { requireType?: "mailbox"; use: MailboxPasswordUse },
): Promise<ManagedMailCredential | null> {
	const rateLimitKey = mailTokenRateLimitKey(token);
	await enforceMailboxAuthenticationRateLimit(request, rateLimitKey, set, {
		login: "check",
		ip: "check",
	});
	const outcome = await verifyManagedMailCredential(token, options);
	if (outcome.status === "authenticated") return outcome.credential;
	await enforceMailboxAuthenticationRateLimit(request, rateLimitKey, set, {
		login: outcome.status === "refused" ? "skip" : "consume",
		ip: "consume",
	});
	return null;
}

/**
 * Authenticates a send. A mailbox or SMTP password (`mail_…`/`imap_…`) may
 * send only when it is read & write and its controls allow this use: SMTP when
 * the SMTP gateway relays the send, the HTTP API otherwise. Anything else
 * needs an account API key or session.
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
			{ use: httpMailboxPasswordUse(request, { allowGateway: true }) },
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
