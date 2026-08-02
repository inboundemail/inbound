import { and, eq, inArray } from "drizzle-orm";
import { t } from "elysia";
import { nanoid } from "nanoid";
import { auth } from "@/lib/auth/auth";
import { db } from "@/lib/db";
import { apikey } from "@/lib/db/auth-schema";
import {
	emailDomains,
	imapCredentialScopes,
	imapCredentials,
} from "@/lib/db/schema";

export const MailboxScopeInputSchema = t.Object({
	type: t.Union([t.Literal("domain"), t.Literal("address")]),
	domainId: t.String({ minLength: 1, maxLength: 255 }),
	address: t.Optional(t.String({ minLength: 3, maxLength: 255 })),
});

export const MailboxInputSchema = t.Object({
	name: t.String({ minLength: 1, maxLength: 255 }),
	loginAddress: t.String({ minLength: 3, maxLength: 255 }),
	accessMode: t.Union([t.Literal("read"), t.Literal("read_write")]),
	scopes: t.Array(MailboxScopeInputSchema, { minItems: 1, maxItems: 100 }),
});

export const MailboxUpdateInputSchema = t.Object(
	{
		name: t.Optional(t.String({ minLength: 1, maxLength: 255 })),
		loginAddress: t.Optional(t.String({ minLength: 3, maxLength: 255 })),
		accessMode: t.Optional(
			t.Union([t.Literal("read"), t.Literal("read_write")]),
		),
		enabled: t.Optional(t.Boolean()),
		scopes: t.Optional(
			t.Array(MailboxScopeInputSchema, { minItems: 1, maxItems: 100 }),
		),
	},
	{ minProperties: 1 },
);

export const MailboxScopeSchema = t.Object({
	id: t.String(),
	type: t.Union([t.Literal("domain"), t.Literal("address")]),
	domainId: t.String(),
	domain: t.String(),
	address: t.Nullable(t.String()),
});

export const MailboxSchema = t.Object({
	id: t.String(),
	name: t.String(),
	loginAddress: t.String(),
	accessMode: t.Union([t.Literal("read"), t.Literal("read_write")]),
	enabled: t.Boolean(),
	scopes: t.Array(MailboxScopeSchema),
	createdAt: t.String({ format: "date-time" }),
	updatedAt: t.String({ format: "date-time" }),
	lastUsedAt: t.Nullable(t.String({ format: "date-time" })),
});

export const MailboxErrorSchema = t.Object({
	error: t.String(),
});

export interface MailboxScopeInput {
	type: "domain" | "address";
	domainId: string;
	address?: string;
}

interface MailboxInput {
	name: string;
	loginAddress: string;
	accessMode: "read" | "read_write";
	scopes: MailboxScopeInput[];
}

export interface ValidatedMailboxInput {
	name: string;
	loginAddress: string;
	accessMode: "read" | "read_write";
	scopes: Array<{
		id: string;
		type: "domain" | "address";
		domainId: string;
		domain: string;
		address: string | null;
		scopeKey: string;
	}>;
}

interface CredentialRecord {
	id: string;
	name: string;
	loginAddress: string;
	accessMode: string;
	enabled: boolean;
	createdAt: Date;
	updatedAt: Date;
	lastUsedAt: Date | null;
}

interface ScopeRecord {
	id: string;
	credentialId: string;
	type: string;
	domainId: string;
	domain: string;
	address: string | null;
}

export function normalizeEmailAddress(value: string): string | null {
	const address = value.trim().toLowerCase();
	const at = address.lastIndexOf("@");
	if (at <= 0 || at !== address.indexOf("@") || at === address.length - 1) {
		return null;
	}

	const local = address.slice(0, at);
	const domain = address.slice(at + 1);
	if (
		local.length > 64 ||
		address.length > 255 ||
		/\s/.test(local) ||
		local.includes("*") ||
		local.startsWith(".") ||
		local.endsWith(".") ||
		local.includes("..") ||
		!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*$/.test(
			domain,
		)
	) {
		return null;
	}

	return address;
}

export async function validateMailboxInput(
	userId: string,
	input: MailboxInput,
): Promise<{ data: ValidatedMailboxInput } | { error: string }> {
	const name = input.name.trim();
	if (!name) return { error: "Name is required" };

	const loginAddress = normalizeEmailAddress(input.loginAddress);
	if (!loginAddress) return { error: "Login address must be a valid email" };

	const loginDomain = loginAddress.slice(loginAddress.lastIndexOf("@") + 1);
	const [ownedLoginDomain] = await db
		.select({ id: emailDomains.id })
		.from(emailDomains)
		.where(
			and(
				eq(emailDomains.userId, userId),
				eq(emailDomains.domain, loginDomain),
				eq(emailDomains.status, "verified"),
			),
		)
		.limit(1);
	if (!ownedLoginDomain) {
		return { error: "Login address must use an exact owned, verified domain" };
	}

	const domainIds = [...new Set(input.scopes.map((scope) => scope.domainId))];
	const domains = await db
		.select({ id: emailDomains.id, domain: emailDomains.domain })
		.from(emailDomains)
		.where(
			and(
				eq(emailDomains.userId, userId),
				eq(emailDomains.status, "verified"),
				inArray(emailDomains.id, domainIds),
			),
		);
	if (domains.length !== domainIds.length) {
		return {
			error: "Every scope must reference an exact owned, verified domain",
		};
	}

	const domainsById = new Map(
		domains.map((domain) => [domain.id, domain.domain]),
	);
	const scopeKeys = new Set<string>();
	const scopes: ValidatedMailboxInput["scopes"] = [];

	for (const scope of input.scopes) {
		const domain = domainsById.get(scope.domainId);
		if (!domain) {
			return { error: "Every scope must reference an owned domain" };
		}

		let address: string | null = null;
		let scopeKey = `domain:${scope.domainId}`;
		if (scope.type === "address") {
			address = scope.address ? normalizeEmailAddress(scope.address) : null;
			if (!address) return { error: "Address scopes require a valid address" };
			if (address.slice(address.lastIndexOf("@") + 1) !== domain) {
				return {
					error: "Scope address must exactly match its referenced domain",
				};
			}
			scopeKey = `address:${address}`;
		}

		if (scopeKeys.has(scopeKey)) return { error: "Duplicate mailbox scope" };
		scopeKeys.add(scopeKey);
		scopes.push({
			id: nanoid(),
			type: scope.type,
			domainId: scope.domainId,
			domain,
			address,
			scopeKey,
		});
	}

	return {
		data: {
			name,
			loginAddress,
			accessMode: input.accessMode,
			scopes,
		},
	};
}

export async function loadCredentialScopes(
	userId: string,
	credentialIds: string[],
	verifiedOnly = false,
): Promise<ScopeRecord[]> {
	if (credentialIds.length === 0) return [];
	const conditions = [
		inArray(imapCredentialScopes.credentialId, credentialIds),
		eq(imapCredentials.userId, userId),
		eq(emailDomains.userId, userId),
	];
	if (verifiedOnly) conditions.push(eq(emailDomains.status, "verified"));

	return db
		.select({
			id: imapCredentialScopes.id,
			credentialId: imapCredentialScopes.credentialId,
			type: imapCredentialScopes.type,
			domainId: imapCredentialScopes.domainId,
			domain: emailDomains.domain,
			address: imapCredentialScopes.address,
		})
		.from(imapCredentialScopes)
		.innerJoin(
			imapCredentials,
			eq(imapCredentialScopes.credentialId, imapCredentials.id),
		)
		.innerJoin(emailDomains, eq(imapCredentialScopes.domainId, emailDomains.id))
		.where(and(...conditions));
}

export function serializeMailbox(
	credential: CredentialRecord,
	scopes: ScopeRecord[],
) {
	return {
		id: credential.id,
		name: credential.name,
		loginAddress: credential.loginAddress,
		accessMode: credential.accessMode as "read" | "read_write",
		enabled: credential.enabled,
		scopes: scopes
			.filter((scope) => scope.credentialId === credential.id)
			.map((scope) => ({
				id: scope.id,
				type: scope.type as "domain" | "address",
				domainId: scope.domainId,
				domain: scope.domain,
				address: scope.address,
			})),
		createdAt: credential.createdAt.toISOString(),
		updatedAt: credential.updatedAt.toISOString(),
		lastUsedAt: credential.lastUsedAt?.toISOString() ?? null,
	};
}

export async function getOwnedCredential(userId: string, id: string) {
	const [credential] = await db
		.select()
		.from(imapCredentials)
		.where(and(eq(imapCredentials.id, id), eq(imapCredentials.userId, userId)))
		.limit(1);
	return credential;
}

export function isUniqueViolation(error: unknown): boolean {
	if (typeof error !== "object" || error === null) return false;
	if ("code" in error && error.code === "23505") return true;
	return "cause" in error && isUniqueViolation(error.cause);
}

export async function deleteImapApiKey(
	keyId: string,
	userId: string,
): Promise<void> {
	try {
		await auth.api.deleteApiKey({
			body: { keyId, configId: "imap" },
		});
	} catch {
		await db
			.delete(apikey)
			.where(
				and(
					eq(apikey.id, keyId),
					eq(apikey.configId, "imap"),
					eq(apikey.referenceId, userId),
				),
			);
	}
}
