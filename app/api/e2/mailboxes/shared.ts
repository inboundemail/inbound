import { and, eq, inArray } from "drizzle-orm";
import { t } from "elysia";
import { nanoid } from "nanoid";
import {
	deferActivity,
	type MailboxLoginRefusal,
	recordLoginFailed,
	recordLoginRefused,
	recordLoginSucceeded,
} from "@/app/api/e2/mailboxes/activity-log";
import {
	ipAllowed,
	normalizeAllowedIps,
} from "@/app/api/e2/mailboxes/ip-allowlist";
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

export const MAX_DAILY_SEND_LIMIT = 1_000_000;

const MailboxProtocolsInputSchema = t.Object(
	{
		imap: t.Optional(t.Boolean()),
		smtp: t.Optional(t.Boolean()),
		api: t.Optional(t.Boolean()),
	},
	{ additionalProperties: false },
);

const MailboxSelfServiceInputSchema = t.Object(
	{
		filters: t.Optional(t.Boolean()),
		spam: t.Optional(t.Boolean()),
		password: t.Optional(t.Boolean()),
		activity: t.Optional(t.Boolean()),
	},
	{ additionalProperties: false },
);

const MailboxControlsInputFields = {
	protocols: t.Optional(t.Nullable(MailboxProtocolsInputSchema)),
	allowedIps: t.Optional(
		t.Nullable(
			t.Array(t.String({ minLength: 1, maxLength: 64 }), { maxItems: 100 }),
		),
	),
	storageQuotaBytes: t.Optional(
		t.Nullable(t.Integer({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER })),
	),
	dailySendLimit: t.Optional(
		t.Nullable(t.Integer({ minimum: 0, maximum: MAX_DAILY_SEND_LIMIT })),
	),
	selfService: t.Optional(t.Nullable(MailboxSelfServiceInputSchema)),
};

export const MailboxInputSchema = t.Object({
	...MailboxControlsInputFields,
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
		...MailboxControlsInputFields,
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
	protocols: t.Object({
		imap: t.Boolean(),
		smtp: t.Boolean(),
		api: t.Boolean(),
	}),
	allowedIps: t.Array(t.String()),
	storageQuotaBytes: t.Nullable(t.Number()),
	dailySendLimit: t.Nullable(t.Integer()),
	selfService: t.Object({
		filters: t.Boolean(),
		spam: t.Boolean(),
		password: t.Boolean(),
		activity: t.Boolean(),
	}),
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

export interface MailboxProtocols {
	imap: boolean;
	smtp: boolean;
	api: boolean;
}

export interface MailboxSelfService {
	filters: boolean;
	spam: boolean;
	password: boolean;
	activity: boolean;
}

export type MailboxProtocol = keyof MailboxProtocols;

export interface MailboxControlsInput {
	protocols?: Partial<MailboxProtocols> | null;
	allowedIps?: string[] | null;
	storageQuotaBytes?: number | null;
	dailySendLimit?: number | null;
	selfService?: Partial<MailboxSelfService> | null;
}

export interface StoredMailboxControls {
	protocols: MailboxProtocols | null;
	allowedIps: string[] | null;
	storageQuotaBytes: number | null;
	dailySendLimit: number | null;
	selfService: MailboxSelfService | null;
}

/** Stored protocols: null (or a missing key) means the protocol is enabled. */
export function resolveProtocols(
	stored: Partial<MailboxProtocols> | null | undefined,
): MailboxProtocols {
	return {
		imap: stored?.imap !== false,
		smtp: stored?.smtp !== false,
		api: stored?.api !== false,
	};
}

/** Stored self-service flags: null (or a missing key) means not allowed. */
export function resolveSelfService(
	stored: Partial<MailboxSelfService> | null | undefined,
): MailboxSelfService {
	return {
		filters: stored?.filters === true,
		spam: stored?.spam === true,
		password: stored?.password === true,
		activity: stored?.activity === true,
	};
}

/**
 * Validates the access and sending controls in a create or update body. Keys
 * left out keep their current value (or the default on create); protocols and
 * selfService merge key by key, and null resets a control to its default.
 */
export function validateMailboxControls(
	input: MailboxControlsInput,
	existing: StoredMailboxControls | null,
): { data: StoredMailboxControls } | { error: string } {
	let protocols = existing?.protocols ?? null;
	if (input.protocols === null) protocols = null;
	else if (input.protocols !== undefined) {
		protocols = { ...resolveProtocols(protocols), ...input.protocols };
	}

	let selfService = existing?.selfService ?? null;
	if (input.selfService === null) selfService = null;
	else if (input.selfService !== undefined) {
		selfService = { ...resolveSelfService(selfService), ...input.selfService };
	}

	let allowedIps = existing?.allowedIps ?? null;
	if (input.allowedIps !== undefined) {
		const normalized = normalizeAllowedIps(input.allowedIps);
		if ("error" in normalized) return { error: normalized.error };
		allowedIps = normalized.value;
	}

	return {
		data: {
			protocols,
			allowedIps,
			storageQuotaBytes:
				input.storageQuotaBytes === undefined
					? (existing?.storageQuotaBytes ?? null)
					: input.storageQuotaBytes,
			dailySendLimit:
				input.dailySendLimit === undefined
					? (existing?.dailySendLimit ?? null)
					: input.dailySendLimit,
			selfService,
		},
	};
}

interface CredentialRecord extends StoredMailboxControls {
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

export function containsControlCharacters(value: string): boolean {
	for (const char of value) {
		const code = char.codePointAt(0) ?? 0;
		if (code < 0x20 || code === 0x7f) return true;
	}
	return false;
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
	if (containsControlCharacters(input.name)) {
		return { error: "Name must not contain control characters" };
	}
	if (input.scopes.length === 0)
		return { error: "At least one scope is required" };
	if (input.sendingName && containsControlCharacters(input.sendingName)) {
		return { error: "Sending name must not contain control characters" };
	}
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
	protocols: MailboxProtocols;
	allowedIps: string[];
	storageQuotaBytes: number | null;
	dailySendLimit: number | null;
	selfService: MailboxSelfService;
	spamLevel: string | null;
	spamAllow: string[] | null;
	spamBlock: string[] | null;
	/** How the password was used when it authenticated this request, for the activity log. */
	use?: MailboxPasswordUse;
}

/**
 * How a mailbox password is being used: the protocol (IMAP or SMTP through a
 * gateway, or the HTTP API) and the end client's IP from a trusted source
 * (null when unknown). A disabled protocol or an IP outside the allowlist
 * fails like a wrong password.
 */
export interface MailboxPasswordUse {
	protocol: MailboxProtocol;
	clientIp: string | null;
	/** Client name for the activity log (IMAP ID or HTTP user agent product). */
	client?: string | null;
	/** Set false to keep this check out of the activity log (gateway session revalidation). */
	record?: boolean;
}

export function credentialAllowsUse(
	credential: {
		protocols: Partial<MailboxProtocols> | null;
		allowedIps: string[] | null;
	},
	use: MailboxPasswordUse,
): boolean {
	return credentialUseRefusal(credential, use) === null;
}

function credentialUseRefusal(
	credential: {
		protocols: Partial<MailboxProtocols> | null;
		allowedIps: string[] | null;
	},
	use: MailboxPasswordUse,
): "protocol_disabled" | "ip_not_allowed" | null {
	if (!resolveProtocols(credential.protocols)[use.protocol]) {
		return "protocol_disabled";
	}
	return ipAllowed(credential.allowedIps, use.clientIp)
		? null
		: "ip_not_allowed";
}

/**
 * Internal outcome of checking a mailbox password. `refused` means the
 * password itself is correct but its protocol or IP controls do not allow
 * this use. Callers use it only to decide which rate limits to count, and
 * must answer it exactly like `invalid` so the policy is never revealed.
 */
export type ManagedMailAuthOutcome =
	| { status: "authenticated"; credential: ManagedMailCredential }
	| { status: "invalid"; refusal?: CredentialRefusal }
	| { status: "refused"; refusal?: CredentialRefusal };

/**
 * Why a correct password for a known credential was not accepted, for the
 * activity log only (never returned to the client).
 */
export interface CredentialRefusal {
	reason: MailboxLoginRefusal;
	userId: string;
	credentialId: string;
}

const INVALID_MAIL_AUTH: ManagedMailAuthOutcome = { status: "invalid" };

export async function authenticateManagedMailCredential(
	password: string,
	options: {
		loginAddress?: string;
		requireType?: "mailbox";
		use?: MailboxPasswordUse;
	} = {},
): Promise<ManagedMailCredential | null> {
	const outcome = await verifyManagedMailCredential(password, options);
	return outcome.status === "authenticated" ? outcome.credential : null;
}

/**
 * Like `authenticateManagedMailCredential`, but tells a wrong password apart
 * from a correct one refused by protocol or IP controls (see
 * `ManagedMailAuthOutcome`).
 */
export async function verifyManagedMailCredential(
	password: string,
	options: {
		loginAddress?: string;
		requireType?: "mailbox";
		use?: MailboxPasswordUse;
	} = {},
): Promise<ManagedMailAuthOutcome> {
	const outcome = await verifyManagedMailPassword(password, options);
	if (outcome.status === "authenticated" && options.use) {
		outcome.credential.use = options.use;
	}
	const use = options.use;
	if (use && use.record !== false) {
		deferActivity(() => recordLoginOutcome(outcome, options.loginAddress, use));
	}
	return outcome;
}

async function recordLoginOutcome(
	outcome: ManagedMailAuthOutcome,
	loginAddress: string | undefined,
	use: MailboxPasswordUse,
): Promise<void> {
	const context = {
		protocol: use.protocol,
		clientIp: use.clientIp,
		client: use.client,
	};
	if (outcome.status === "authenticated") {
		await recordLoginSucceeded(outcome.credential, context);
	} else if (outcome.refusal) {
		await recordLoginRefused(outcome.refusal, outcome.refusal.reason, context);
	} else if (loginAddress) {
		await recordLoginFailed(loginAddress, context);
	}
}

async function verifyManagedMailPassword(
	password: string,
	options: {
		loginAddress?: string;
		requireType?: "mailbox";
		use?: MailboxPasswordUse;
	},
): Promise<ManagedMailAuthOutcome> {
	let verification: Awaited<ReturnType<typeof auth.api.verifyApiKey>> | null =
		null;
	let verificationFailed = false;
	let verificationError: unknown;
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
		} catch (error) {
			verificationFailed = true;
			verificationError = error;
		}
	}
	if (!verification) {
		if (verificationFailed) throw verificationError;
		return INVALID_MAIL_AUTH;
	}

	const apiKeyId = verification.valid ? verification.key?.id : null;
	const apiKeyOwnerId = verification.valid
		? verification.key?.referenceId
		: null;
	if (!apiKeyId || !apiKeyOwnerId) return INVALID_MAIL_AUTH;

	return resolveManagedMailCredentialOutcome(
		{
			userId: apiKeyOwnerId,
			apiKeyId,
			loginAddress: options.loginAddress,
		},
		{ requireType: options.requireType, use: options.use },
	);
}

/**
 * Loads a mailbox or SMTP credential and the policy it grants, applying the
 * same checks as password authentication: enabled, owner not banned, login
 * domain verified, at least one verified scope and a valid sending identity.
 * Used after verifying a mailbox password (pass `use` to apply its protocol
 * and IP controls), and when the account owner acts on one of their own
 * mailboxes by ID (account access is not limited by those controls).
 */
export async function resolveManagedMailCredential(
	where: {
		userId: string;
		apiKeyId?: string;
		credentialId?: string;
		loginAddress?: string;
	},
	options: { requireType?: "mailbox"; use?: MailboxPasswordUse } = {},
): Promise<ManagedMailCredential | null> {
	const outcome = await resolveManagedMailCredentialOutcome(where, options);
	return outcome.status === "authenticated" ? outcome.credential : null;
}

async function resolveManagedMailCredentialOutcome(
	where: {
		userId: string;
		apiKeyId?: string;
		credentialId?: string;
		loginAddress?: string;
	},
	options: { requireType?: "mailbox"; use?: MailboxPasswordUse },
): Promise<ManagedMailAuthOutcome> {
	if (!where.apiKeyId && !where.credentialId) return INVALID_MAIL_AUTH;
	const conditions = [eq(imapCredentials.userId, where.userId)];
	if (where.apiKeyId) {
		conditions.push(eq(imapCredentials.apiKeyId, where.apiKeyId));
	}
	if (where.credentialId) {
		conditions.push(eq(imapCredentials.id, where.credentialId));
	}
	if (where.loginAddress) {
		conditions.push(eq(imapCredentials.loginAddress, where.loginAddress));
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
			protocols: imapCredentials.protocols,
			allowedIps: imapCredentials.allowedIps,
			storageQuotaBytes: imapCredentials.storageQuotaBytes,
			dailySendLimit: imapCredentials.dailySendLimit,
			selfService: imapCredentials.selfService,
			spamLevel: imapCredentials.spamLevel,
			spamAllow: imapCredentials.spamAllow,
			spamBlock: imapCredentials.spamBlock,
			banned: user.banned,
			banExpires: user.banExpires,
		})
		.from(imapCredentials)
		.innerJoin(user, eq(imapCredentials.userId, user.id))
		.where(and(...conditions))
		.limit(1);
	if (!credential) return INVALID_MAIL_AUTH;
	const refuse = (
		reason: MailboxLoginRefusal,
		status: "invalid" | "refused" = "invalid",
	): ManagedMailAuthOutcome => ({
		status,
		refusal: { reason, userId: credential.userId, credentialId: credential.id },
	});
	if (!credential.enabled) return refuse("disabled");
	if (credential.type !== "mailbox" && credential.type !== "smtp")
		return INVALID_MAIL_AUTH;
	if (options.requireType && credential.type !== options.requireType)
		return refuse("protocol_disabled");
	const useRefusal = options.use
		? credentialUseRefusal(credential, options.use)
		: null;
	if (useRefusal) return refuse(useRefusal, "refused");
	if (
		credential.type === "mailbox" &&
		credential.accessMode !== "read" &&
		credential.accessMode !== "read_write"
	) {
		return INVALID_MAIL_AUTH;
	}
	if (
		credential.sendingMode !== "identity" &&
		credential.sendingMode !== "scoped_domains"
	) {
		return INVALID_MAIL_AUTH;
	}

	const banExpires = credential.banExpires
		? new Date(credential.banExpires)
		: null;
	if (
		credential.banned &&
		(!banExpires || banExpires.getTime() >= Date.now())
	) {
		return refuse("banned");
	}

	const normalizedLogin = normalizeEmailAddress(credential.loginAddress);
	if (!normalizedLogin) return INVALID_MAIL_AUTH;
	const loginDomain = normalizedLogin.slice(
		normalizedLogin.lastIndexOf("@") + 1,
	);
	const [verifiedLoginDomain] = await db
		.select({ id: emailDomains.id })
		.from(emailDomains)
		.where(
			and(
				eq(emailDomains.userId, credential.userId),
				eq(emailDomains.domain, loginDomain),
				eq(emailDomains.status, "verified"),
			),
		)
		.limit(1);
	if (!verifiedLoginDomain) return refuse("domain_unverified");

	const verifiedScopes = (
		await loadCredentialScopes(credential.userId, [credential.id], true)
	).filter((scope) => scope.credentialId === credential.id);
	if (verifiedScopes.length === 0) return refuse("domain_unverified");

	let sendingAddress: string | null = null;
	let allowedDomains: string[] = [];
	if (credential.sendingMode === "identity") {
		sendingAddress = credential.sendingAddress
			? normalizeEmailAddress(credential.sendingAddress)
			: null;
		if (!sendingAddress) return refuse("domain_unverified");
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
			return refuse("domain_unverified");
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
		status: "authenticated",
		credential: {
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
			protocols: resolveProtocols(credential.protocols),
			allowedIps: credential.allowedIps ?? [],
			storageQuotaBytes: credential.storageQuotaBytes,
			dailySendLimit: credential.dailySendLimit,
			selfService: resolveSelfService(credential.selfService),
			spamLevel: credential.spamLevel,
			spamAllow: credential.spamAllow,
			spamBlock: credential.spamBlock,
		},
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
		protocols: resolveProtocols(credential.protocols),
		allowedIps: credential.allowedIps ?? [],
		storageQuotaBytes: credential.storageQuotaBytes,
		dailySendLimit: credential.dailySendLimit,
		selfService: resolveSelfService(credential.selfService),
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
