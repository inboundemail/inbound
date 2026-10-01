import { and, eq, gte } from "drizzle-orm";
import { nanoid } from "nanoid";
import { Autumn as autumn } from "autumn-js";
import {
	associateIdentityWithUserTenant,
	getUserTenant,
} from "@/lib/aws-ses/aws-ses-tenants";
import { db } from "@/lib/db";
import { user } from "@/lib/db/auth-schema";
import { emailDomains, structuredEmails } from "@/lib/db/schema";

/**
 * Managed domains: every user can get `<slug>.inbnd.dev` instantly, with no DNS
 * work. Receiving works through the wildcard MX on *.inbnd.dev and the SES
 * receipt rule `managed-inbnd-dev` (recipient `.inbnd.dev`); the domain row
 * makes the normal recipient→user mapping pick it up. Sending uses the shared,
 * DKIM-signed `inbnd.dev` SES identity together with the user's own tenant and
 * configuration set, so bounces/complaints and pauses stay per user.
 */
export const MANAGED_DOMAIN_ROOT = "inbnd.dev";
export const MANAGED_DOMAIN_KIND = "managed";

/** How long a not-yet-paying user may reply to someone who emailed them. */
const UNPAID_REPLY_WINDOW_MS = 24 * 60 * 60 * 1000;

const RESERVED_SLUGS = new Set([
	"abuse", "account", "accounts", "admin", "administrator", "agent", "agents",
	"api", "app", "apple", "auth", "billing", "blog", "bounce", "bounces", "cdn",
	"dev", "dmarc", "docs", "email", "ftp", "google", "help", "hostmaster", "imap",
	"inbnd", "inbound", "inbox", "info", "login", "mail", "mailer", "microsoft",
	"news", "noreply", "no-reply", "ns1", "ns2", "official", "openai", "paypal",
	"pop", "pop3", "postmaster", "root", "security", "smtp", "staff", "status",
	"stripe", "support", "system", "team", "test", "verify", "webmaster", "www",
]);

export function isManagedDomainName(domain: string): boolean {
	const d = domain.toLowerCase();
	return d === MANAGED_DOMAIN_ROOT || d.endsWith(`.${MANAGED_DOMAIN_ROOT}`);
}

function slugify(value: string): string {
	return value
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 24)
		.replace(/-+$/g, "");
}

/** Base subdomain label from the user's first name, falling back to the email local part. */
export function baseSlugForUser(input: { name?: string | null; email: string }): string {
	const firstName = slugify((input.name ?? "").trim().split(/\s+/)[0] ?? "");
	const local = slugify(input.email.split("@")[0] ?? "");
	const candidate = firstName.length >= 3 ? firstName : local;
	if (candidate.length < 3 || RESERVED_SLUGS.has(candidate)) {
		return `${candidate || "inbox"}-${randomSuffix()}`.replace(/^-/, "");
	}
	return candidate;
}

function randomSuffix(): string {
	const alphabet = "abcdefghijkmnpqrstuvwxyz23456789";
	let out = "";
	for (let i = 0; i < 4; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
	return out;
}

export type ManagedDomain = typeof emailDomains.$inferSelect;

export async function getManagedDomain(userId: string): Promise<ManagedDomain | null> {
	const [row] = await db
		.select()
		.from(emailDomains)
		.where(and(eq(emailDomains.userId, userId), eq(emailDomains.kind, MANAGED_DOMAIN_KIND)))
		.limit(1);
	return row ?? null;
}

/**
 * Returns the user's managed domain, creating it (and their SES tenant, plus the
 * tenant's association with the shared inbnd.dev identity) on first call.
 * Idempotent and safe under concurrent calls: a partial unique index allows one
 * managed domain per user, and `domain` itself is unique.
 */
export async function ensureManagedDomain(userId: string): Promise<ManagedDomain> {
	const existing = await getManagedDomain(userId);
	if (existing) return existing;

	const [owner] = await db
		.select({ name: user.name, email: user.email })
		.from(user)
		.where(eq(user.id, userId))
		.limit(1);
	if (!owner) throw new Error(`User ${userId} not found`);

	const tenantResult = await getUserTenant(userId);
	if (!tenantResult.success || !tenantResult.tenant) {
		throw new Error(`Could not set up sending for this account: ${tenantResult.error ?? "unknown error"}`);
	}

	const association = await associateIdentityWithUserTenant(userId, MANAGED_DOMAIN_ROOT);
	if (!association.success && !/already|exists/i.test(association.error ?? "")) {
		throw new Error(`Could not link ${MANAGED_DOMAIN_ROOT} to this account: ${association.error}`);
	}

	const base = baseSlugForUser(owner);
	const candidates = [base, ...Array.from({ length: 6 }, () => `${base.slice(0, 19)}-${randomSuffix()}`)];

	for (const slug of candidates) {
		const domain = `${slug}.${MANAGED_DOMAIN_ROOT}`;
		const now = new Date();
		const inserted = await db
			.insert(emailDomains)
			.values({
				id: `indm_${nanoid()}`,
				domain,
				status: "verified",
				canReceiveEmails: true,
				hasMxRecords: true,
				domainProvider: "inbound",
				providerConfidence: "high",
				kind: MANAGED_DOMAIN_KIND,
				tenantId: tenantResult.tenant.id,
				userId,
				lastDnsCheck: now,
				lastSesCheck: now,
				createdAt: now,
				updatedAt: now,
			})
			.onConflictDoNothing()
			.returning();

		if (inserted[0]) return inserted[0];

		// Either the name is taken or a concurrent call already created this user's domain.
		const raced = await getManagedDomain(userId);
		if (raced) return raced;
	}

	throw new Error("Could not find a free inbnd.dev subdomain");
}

/** True when the user has any active plan other than the legacy free tier. */
export async function hasPaidPlan(userId: string): Promise<boolean> {
	const { data: customer, error } = await autumn.customers.get(userId);
	if (error || !customer) return false;
	return (customer.products ?? []).some(
		(product) =>
			product.id !== "free_tier" &&
			(product.status === "active" || product.status === "trialing"),
	);
}

function bareAddress(value: string): string {
	const match = value.match(/<([^>]+)>/);
	return (match ? match[1] : value).trim().toLowerCase();
}

/**
 * Before a user pays, a managed domain may only send to the account's own email
 * or reply to someone who emailed that domain in the last 24 hours. This keeps a
 * free, instantly-working sending domain from being useful for spam.
 */
export async function checkUnpaidManagedRecipients(params: {
	userId: string;
	userEmail: string;
	domain: string;
	recipients: string[];
}): Promise<{ allowed: true } | { allowed: false; blocked: string[] }> {
	const recipients = [...new Set(params.recipients.map(bareAddress).filter(Boolean))];
	if (recipients.length === 0) return { allowed: false, blocked: [] };

	const accountEmail = params.userEmail.toLowerCase();
	const pending = recipients.filter((address) => address !== accountEmail);
	if (pending.length === 0) return { allowed: true };

	const since = new Date(Date.now() - UNPAID_REPLY_WINDOW_MS);
	const recent = await db
		.select({ fromData: structuredEmails.fromData, recipient: structuredEmails.recipient })
		.from(structuredEmails)
		.where(and(eq(structuredEmails.userId, params.userId), gte(structuredEmails.createdAt, since)))
		.limit(500);

	const suffix = `@${params.domain.toLowerCase()}`;
	const senders = new Set<string>();
	for (const row of recent) {
		if (!row.recipient?.toLowerCase().endsWith(suffix)) continue;
		try {
			const parsed = JSON.parse(row.fromData ?? "null") as {
				addresses?: Array<{ address?: string | null }>;
			} | null;
			for (const entry of parsed?.addresses ?? []) {
				if (entry.address) senders.add(entry.address.toLowerCase());
			}
		} catch {
			// unparseable sender data never grants permission
		}
	}

	const blocked = pending.filter((address) => !senders.has(address));
	return blocked.length === 0 ? { allowed: true } : { allowed: false, blocked };
}
