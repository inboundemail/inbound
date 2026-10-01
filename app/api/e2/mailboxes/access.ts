import { type SQL, sql } from "drizzle-orm";
import {
	AuthError,
	enforceAuthenticatedUserAndRateLimit,
	validateAndRateLimit,
} from "@/app/api/e2/lib/auth";
import {
	authenticateManagedMailCredential,
	getOwnedCredential,
	type ManagedMailCredential,
	resolveManagedMailCredential,
} from "@/app/api/e2/mailboxes/shared";

type ElysiaSet = { status?: number | string; headers?: unknown };

export type MailboxAccess = {
	userId: string;
	credential: ManagedMailCredential;
	/** "account": the owner's API key or session; "mailbox": the mailbox's own password. */
	via: "account" | "mailbox";
};

export type MailboxAccessResult =
	| { ok: true; access: MailboxAccess }
	| { ok: false; status: number; error: string };

function bearerToken(request: Request): string | null {
	const authorization = request.headers.get("authorization");
	return authorization?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || null;
}

export function isMailboxPassword(token: string | null): boolean {
	return !!token && (token.startsWith("mail_") || token.startsWith("imap_"));
}

function unauthorized(set: ElysiaSet): never {
	set.status = 401;
	const headers = {
		"WWW-Authenticate": 'Bearer realm="API", charset="UTF-8"',
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
 * Authorizes access to one mailbox. Accepts either the account's API key (or
 * dashboard session) for any mailbox the account owns, or the mailbox's own
 * password (`mail_…`), which only grants that mailbox. A mailbox password may
 * use the ID `me` for itself.
 */
export async function authorizeMailboxAccess(
	request: Request,
	set: ElysiaSet,
	mailboxId: string,
): Promise<MailboxAccessResult> {
	const token = bearerToken(request);
	if (isMailboxPassword(token)) {
		const credential = await authenticateManagedMailCredential(
			token as string,
			{ requireType: "mailbox" },
		);
		if (!credential) unauthorized(set);
		await enforceAuthenticatedUserAndRateLimit(credential.userId, set);
		if (mailboxId !== "me" && mailboxId !== credential.credentialId) {
			return {
				ok: false,
				status: 403,
				error: "This mailbox password can only access its own mailbox",
			};
		}
		return {
			ok: true,
			access: { userId: credential.userId, credential, via: "mailbox" },
		};
	}

	const userId = await validateAndRateLimit(request, set);
	if (mailboxId === "me") {
		return {
			ok: false,
			status: 400,
			error: "Use a mailbox ID, or authenticate with the mailbox password to use 'me'",
		};
	}
	const owned = await getOwnedCredential(userId, mailboxId);
	if (!owned) return { ok: false, status: 404, error: "Mailbox not found" };
	if (owned.type !== "mailbox") {
		return {
			ok: false,
			status: 400,
			error: "This is an SMTP-only credential and has no mailbox to read",
		};
	}
	if (!owned.enabled) {
		return { ok: false, status: 403, error: "Mailbox is disabled" };
	}
	const credential = await resolveManagedMailCredential(
		{ userId, credentialId: mailboxId },
		{ requireType: "mailbox" },
	);
	if (!credential) {
		return {
			ok: false,
			status: 409,
			error:
				"Mailbox is not usable: its login domain and scopes must be on verified domains",
		};
	}
	return { ok: true, access: { userId, credential, via: "account" } };
}

export function canWrite(credential: ManagedMailCredential): boolean {
	return credential.accessMode === "read_write";
}

function scopeLists(credential: ManagedMailCredential) {
	const addresses = [
		...new Set(
			credential.scopes
				.filter((scope) => scope.type === "address" && scope.address)
				.map((scope) => (scope.address as string).toLowerCase()),
		),
	];
	const domains = [
		...new Set(
			credential.scopes
				.filter((scope) => scope.type === "domain")
				.map((scope) => scope.domain.toLowerCase()),
		),
	];
	return { addresses, domains };
}

function textArray(values: string[]): SQL {
	if (values.length === 0) return sql`ARRAY[]::text[]`;
	return sql`ARRAY[${sql.join(
		values.map((value) => sql`${value}`),
		sql`, `,
	)}]::text[]`;
}

/**
 * SQL condition for received mail (structured_emails) visible to
 * a mailbox. Mirrors the IMAP gateway: mail to a scoped address, or to any
 * address on a scoped domain except dmarc@, excluding Guard-blocked mail.
 */
export function receivedVisibleSql(credential: ManagedMailCredential): SQL {
	const { addresses, domains } = scopeLists(credential);
	const a = textArray(addresses);
	const d = textArray(domains);
	return sql`(structured_emails.guard_blocked IS NOT TRUE AND coalesce(
		lower(structured_emails.recipient) = ANY(${a})
		OR (
			split_part(lower(structured_emails.recipient), '@', 2) = ANY(${d})
			AND split_part(lower(structured_emails.recipient), '@', 1) <> 'dmarc'
		)
		OR coalesce(structured_emails.envelope_recipients, '{}') && ${a}
		OR EXISTS (
			SELECT 1 FROM unnest(structured_emails.envelope_recipients) AS envelope(address)
			WHERE split_part(lower(envelope.address), '@', 2) = ANY(${d})
			  AND split_part(lower(envelope.address), '@', 1) <> 'dmarc'
		), FALSE))`;
}

/**
 * SQL condition for sent mail (sent_emails) visible to a
 * mailbox: sent from its sending address, a scoped address, or any address on
 * a scoped domain.
 */
export function sentVisibleSql(credential: ManagedMailCredential): SQL {
	const { addresses, domains } = scopeLists(credential);
	const senders = [...addresses];
	if (credential.sendingAddress) {
		senders.push(credential.sendingAddress.toLowerCase());
	}
	return sql`(lower(sent_emails.from_address) = ANY(${textArray(senders)})
		OR lower(sent_emails.from_domain) = ANY(${textArray(domains)}))`;
}

/** JS twin of receivedVisibleSql for a single loaded row. */
export function receivedVisibleTo(
	credential: ManagedMailCredential,
	email: {
		recipient: string | null;
		envelopeRecipients: string[] | null;
		guardBlocked: boolean | null;
	},
): boolean {
	if (email.guardBlocked) return false;
	const { addresses, domains } = scopeLists(credential);
	const matches = (value: string | null | undefined) => {
		if (!value) return false;
		const address = value.toLowerCase();
		if (addresses.includes(address)) return true;
		const at = address.lastIndexOf("@");
		return (
			at > 0 &&
			address.slice(0, at) !== "dmarc" &&
			domains.includes(address.slice(at + 1))
		);
	};
	return (
		matches(email.recipient) || (email.envelopeRecipients ?? []).some(matches)
	);
}
