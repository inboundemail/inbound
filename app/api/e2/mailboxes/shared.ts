import { and, eq, inArray } from "drizzle-orm";
import { t } from "elysia";
import { nanoid } from "nanoid";
import { auth } from "@/lib/auth/auth";
import { db } from "@/lib/db";
import { apikey, user } from "@/lib/db/auth-schema";
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
	type: t.Union([t.Literal("mailbox"), t.Literal("smtp")]),
	accessMode: t.Union([t.Literal("read"), t.Literal("read_write")]),
	sendingMode: t.Union([t.Literal("identity"), t.Literal("scoped_domains")]),
	sendingName: t.Nullable(t.String({ maxLength: 255 })),
	sendingAddress: t.Nullable(t.String({ maxLength: 255 })),
	scopes: t.Array(MailboxScopeInputSchema, { minItems: 1, maxItems: 100 }),
});

export const MailboxUpdateInputSchema = t.Object(
	{
		name: t.Optional(t.String({ minLength: 1, maxLength: 255 })),
		loginAddress: t.Optional(t.String({ minLength: 3, maxLength: 255 })),
		type: t.Optional(t.Union([t.Literal("mailbox"), t.Literal("smtp")])),
		accessMode: t.Optional(
			t.Union([t.Literal("read"), t.Literal("read_write")]),
		),
		sendingMode: t.Optional(
			t.Union([t.Literal("identity"), t.Literal("scoped_domains")]),
		),
		sendingName: t.Optional(t.Nullable(t.String({ maxLength: 255 }))),
		sendingAddress: t.Optional(t.Nullable(t.String({ maxLength: 255 }))),
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
	type: t.Union([t.Literal("mailbox"), t.Literal("smtp")]),
	accessMode: t.Union([t.Literal("read"), t.Literal("read_write")]),
	sendingMode: t.Union([t.Literal("identity"), t.Literal("scoped_domains")]),
	sendingName: t.Nullable(t.String()),
	sendingAddress: t.Nullable(t.String()),
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

export interface MailboxInput {
	name: string;
	loginAddress: string;
	type: "mailbox" | "smtp";
	accessMode: "read" | "read_write";
	sendingMode: "identity" | "scoped_domains";
	sendingName: string | null;
	sendingAddress: string | null;
	scopes: MailboxScopeInput[];
}

export interface ValidatedMailboxInput {
	name: string;
	loginAddress: string;
	type: "mailbox" | "smtp";
	accessMode: "read" | "read_write";
	sendingMode: "identity" | "scoped_domains";
	sendingName: string | null;
	sendingAddress: string | null;
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
	type: string;
	accessMode: string;
	sendingMode: string;
	sendingName: string | null;
	sendingAddress: string | null;
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
		domain.length > 253 ||
		address.length > 255 ||
		!/^[-a-z0-9.!#$%&'*+/=?^_`{|}~]+$/.test(local) ||
		local.includes("*") ||
		local.startsWith(".") ||
		local.endsWith(".") ||
		local.includes("..") ||
		domain.split(".").some((label) => label.length > 63) ||
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
	if (input.scopes.length === 0)
		return { error: "At least one scope is required" };
	const sendingName = input.sendingName?.trim() || null;

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

	let sendingAddress: string | null = null;
	if (input.sendingMode === "identity") {
		sendingAddress = input.sendingAddress
			? normalizeEmailAddress(input.sendingAddress)
			: null;
		if (!sendingAddress) {
			return { error: "Identity sending requires a valid sending address" };
		}

		const sendingDomain = sendingAddress.slice(
			sendingAddress.lastIndexOf("@") + 1,
		);
		if (!domains.some((domain) => domain.domain === sendingDomain)) {
			return {
				error: "Sending address must use an exact owned, verified domain",
			};
		}

		const covered = scopes.some(
			(scope) =>
				(scope.type === "domain" && scope.domain === sendingDomain) ||
				(scope.type === "address" && scope.address === sendingAddress),
		);
		if (!covered) {
			return { error: "Sending address must be covered by a configured scope" };
		}
	}

	return {
		data: {
			name,
			loginAddress,
			type: input.type,
			accessMode: input.type === "smtp" ? "read_write" : input.accessMode,
			sendingMode: input.sendingMode,
			sendingName,
			sendingAddress,
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

export interface ManagedMailCredential {
	credentialId: string;
	userId: string;
	loginAddress: string;
	type: "mailbox" | "smtp";
	sendingMode: "identity" | "scoped_domains";
	sendingName: string | null;
	sendingAddress: string | null;
	allowedDomains: string[];
	accessMode: "read" | "read_write";
	scopes: Array<{
		id: string;
		type: "domain" | "address";
		domainId: string;
		domain: string;
		address: string | null;
	}>;
}

export async function authenticateManagedMailCredential(
	password: string,
	options: {
		loginAddress?: string;
		requireType?: "mailbox";
	} = {},
): Promise<ManagedMailCredential | null> {
	let verification: Awaited<ReturnType<typeof auth.api.verifyApiKey>> | null =
		null;
	const configIds = password.startsWith("imap_")
		? (["imap", "mail"] as const)
		: (["mail", "imap"] as const);
	for (const configId of configIds) {
		try {
			const candidate = await auth.api.verifyApiKey({
				body: { key: password, configId },
			});
			if (candidate.valid) {
				verification = candidate;
				break;
			}
		} catch {
			continue;
		}
	}
	if (!verification) return null;

	const apiKeyId = verification.valid ? verification.key?.id : null;
	const apiKeyOwnerId = verification.valid
		? verification.key?.referenceId
		: null;
	if (!apiKeyId || !apiKeyOwnerId) return null;

	const conditions = [
		eq(imapCredentials.apiKeyId, apiKeyId),
		eq(imapCredentials.userId, apiKeyOwnerId),
	];
	if (options.loginAddress) {
		conditions.push(eq(imapCredentials.loginAddress, options.loginAddress));
	}

	const [credential] = await db
		.select({
			id: imapCredentials.id,
			userId: imapCredentials.userId,
			loginAddress: imapCredentials.loginAddress,
			type: imapCredentials.type,
			accessMode: imapCredentials.accessMode,
			sendingMode: imapCredentials.sendingMode,
			sendingName: imapCredentials.sendingName,
			sendingAddress: imapCredentials.sendingAddress,
			enabled: imapCredentials.enabled,
			banned: user.banned,
			banExpires: user.banExpires,
		})
		.from(imapCredentials)
		.innerJoin(user, eq(imapCredentials.userId, user.id))
		.where(and(...conditions))
		.limit(1);
	if (!credential?.enabled) return null;
	if (credential.type !== "mailbox" && credential.type !== "smtp") return null;
	if (options.requireType && credential.type !== options.requireType)
		return null;
	if (
		credential.type === "mailbox" &&
		credential.accessMode !== "read" &&
		credential.accessMode !== "read_write"
	) {
		return null;
	}
	if (
		credential.sendingMode !== "identity" &&
		credential.sendingMode !== "scoped_domains"
	) {
		return null;
	}

	const banExpires = credential.banExpires
		? new Date(credential.banExpires)
		: null;
	if (
		credential.banned &&
		(!banExpires || banExpires.getTime() >= Date.now())
	) {
		return null;
	}

	const verifiedScopes = (
		await loadCredentialScopes(credential.userId, [credential.id], true)
	).filter((scope) => scope.credentialId === credential.id);
	if (verifiedScopes.length === 0) return null;

	let sendingAddress: string | null = null;
	let allowedDomains: string[] = [];
	if (credential.sendingMode === "identity") {
		sendingAddress = credential.sendingAddress
			? normalizeEmailAddress(credential.sendingAddress)
			: null;
		if (!sendingAddress) return null;
		const sendingDomain = sendingAddress.slice(
			sendingAddress.lastIndexOf("@") + 1,
		);
		if (
			!verifiedScopes.some(
				(scope) =>
					(scope.type === "domain" && scope.domain === sendingDomain) ||
					(scope.type === "address" && scope.address === sendingAddress),
			)
		) {
			return null;
		}
	} else {
		allowedDomains = [
			...new Set(verifiedScopes.map((scope) => scope.domain.toLowerCase())),
		];
	}

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
		type: credential.type,
		sendingMode: credential.sendingMode,
		sendingName: credential.sendingName,
		sendingAddress,
		allowedDomains,
		accessMode:
			credential.type === "smtp"
				? "read_write"
				: (credential.accessMode as "read" | "read_write"),
		scopes: verifiedScopes.map((scope) => ({
			id: scope.id,
			type: scope.type as "domain" | "address",
			domainId: scope.domainId,
			domain: scope.domain,
			address: scope.address,
		})),
	};
}

export function serializeMailbox(
	credential: CredentialRecord,
	scopes: ScopeRecord[],
) {
	return {
		id: credential.id,
		name: credential.name,
		loginAddress: credential.loginAddress,
		type: credential.type as "mailbox" | "smtp",
		accessMode:
			credential.type === "smtp"
				? ("read_write" as const)
				: (credential.accessMode as "read" | "read_write"),
		sendingMode: credential.sendingMode as "identity" | "scoped_domains",
		sendingName: credential.sendingName,
		sendingAddress: credential.sendingAddress,
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

export async function deleteMailApiKey(
	keyId: string,
	userId: string,
): Promise<void> {
	const [record] = await db
		.select({ configId: apikey.configId })
		.from(apikey)
		.where(
			and(
				eq(apikey.id, keyId),
				eq(apikey.referenceId, userId),
				inArray(apikey.configId, ["mail", "imap"]),
			),
		)
		.limit(1);
	if (!record || (record.configId !== "mail" && record.configId !== "imap")) {
		return;
	}
	try {
		await auth.api.deleteApiKey({
			body: { keyId, configId: record.configId },
		});
	} catch {
		await db
			.delete(apikey)
			.where(
				and(
					eq(apikey.id, keyId),
					eq(apikey.configId, record.configId),
					eq(apikey.referenceId, userId),
				),
			);
	}
}
