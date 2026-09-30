import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { auth } from "@/lib/auth/auth";
import { db } from "@/lib/db";
import {
	emailAddresses,
	emailDomains,
	endpoints,
	sesTenants,
	structuredEmails,
	user,
	userOnboarding,
} from "@/lib/db/schema";
import { isLocalDatabaseUrl } from "@/scripts/local-dev/env";

if (process.env.INBOUND_LOCAL_DEV !== "true" || !isLocalDatabaseUrl(process.env.DATABASE_URL)) {
	throw new Error("Seeding only runs against the local development database");
}

async function ensureUser(email: string, name: string) {
	const [existing] = await db.select({ id: user.id }).from(user).where(eq(user.email, email)).limit(1);
	if (existing) return existing.id;

	const id = `usr_${nanoid()}`;
	await db.insert(user).values({ id, email, name, emailVerified: true });
	await db
		.insert(userOnboarding)
		.values({ id: nanoid(), userId: id, isCompleted: true, defaultEndpointCreated: false })
		.onConflictDoNothing();
	return id;
}

async function ensureSendingTenant(userId: string) {
	const [existing] = await db.select({ id: sesTenants.id }).from(sesTenants).where(eq(sesTenants.userId, userId)).limit(1);
	if (existing) return existing.id;

	const id = `tnt_${nanoid()}`;
	await db.insert(sesTenants).values({
		id,
		userId,
		awsTenantId: `local-${id}`,
		tenantName: `local-${userId}`,
		status: "active",
	});
	return id;
}

async function ensureVerifiedDomain(userId: string, domain: string) {
	const tenantId = await ensureSendingTenant(userId);
	const [existing] = await db
		.select({ id: emailDomains.id })
		.from(emailDomains)
		.where(and(eq(emailDomains.userId, userId), eq(emailDomains.domain, domain)))
		.limit(1);
	if (existing) return existing.id;

	const id = `dom_${nanoid()}`;
	await db.insert(emailDomains).values({
		id,
		domain,
		status: "verified",
		userId,
		tenantId,
		canReceiveEmails: true,
		hasMxRecords: true,
	});
	return id;
}

async function createApiKey(userId: string, name: string) {
	const created = await auth.api.createApiKey({ body: { userId, name } });
	return created.key;
}

async function seedDemo(email: string) {
	const [owner] = await db.select({ id: user.id }).from(user).where(eq(user.email, email)).limit(1);
	if (!owner) {
		throw new Error(
			`No local user with email ${email}. Sign in once at /login (the magic link is printed in the dev server output), then seed again.`,
		);
	}

	const domain = "demo.localtest.me";
	const domainId = await ensureVerifiedDomain(owner.id, domain);
	const endpointId = `end_${nanoid()}`;
	await db.insert(endpoints).values({
		id: endpointId,
		name: "Local webhook",
		type: "webhook",
		config: JSON.stringify({ url: "http://hooks.localtest.me:9999/webhook", timeout: 30, retryAttempts: 3 }),
		userId: owner.id,
		isActive: true,
	});
	await db
		.insert(emailAddresses)
		.values({ id: `addr_${nanoid()}`, address: `hello@${domain}`, domainId, userId: owner.id, endpointId, isActive: true })
		.onConflictDoNothing();

	const samples = [
		["Ada Lovelace", "ada@example.com", "Welcome to the local inbox", "This is seeded local data."],
		["Billing Bot", "billing@example.com", "Your invoice is ready", "Invoice #1234 is attached."],
		["Suspicious Sender", "promo@spam.example", "You won a prize!!!", "Click here to claim."],
	];
	for (const [index, [name, address, subject, body]] of samples.entries()) {
		const createdAt = new Date(Date.now() - index * 60 * 60 * 1000);
		await db.insert(structuredEmails).values({
			id: `inbnd_${nanoid()}`,
			emailId: `eml_${nanoid()}`,
			sesEventId: `ses_${nanoid()}`,
			userId: owner.id,
			messageId: `<seed-${nanoid()}@example.com>`,
			subject,
			recipient: `hello@${domain}`,
			fromData: JSON.stringify({ text: `${name} <${address}>`, addresses: [{ name, address }] }),
			toData: JSON.stringify({ text: `hello@${domain}`, addresses: [{ name: null, address: `hello@${domain}` }] }),
			textBody: body,
			htmlBody: `<p>${body}</p>`,
			date: createdAt,
			createdAt,
			updatedAt: createdAt,
		});
	}

	return { domain, address: `hello@${domain}`, emails: samples.length };
}

async function seedApiKey(email: string) {
	const userId = await ensureUser(email, email.split("@")[0] ?? "Local Developer");
	const domainId = await ensureVerifiedDomain(userId, "demo.localtest.me");
	return { userId, domainId, domain: "demo.localtest.me", apiKey: await createApiKey(userId, "local-dev") };
}

async function seedE2E() {
	const domain = "e2e.inbound.test";
	const primaryUserId = await ensureUser("e2e-primary@inbound.test", "E2E Primary");
	const secondaryUserId = await ensureUser("e2e-secondary@inbound.test", "E2E Secondary");
	const domainId = await ensureVerifiedDomain(primaryUserId, domain);
	await ensureVerifiedDomain(secondaryUserId, "e2e-secondary.inbound.test");

	return {
		domain,
		domainId,
		primary: { userId: primaryUserId, apiKey: await createApiKey(primaryUserId, "e2e-primary") },
		secondary: { userId: secondaryUserId, apiKey: await createApiKey(secondaryUserId, "e2e-secondary") },
	};
}

const [command, arg] = process.argv.slice(2);
const commands: Record<string, () => Promise<unknown>> = {
	demo: () => seedDemo(arg ?? ""),
	"api-key": () => seedApiKey(arg ?? ""),
	e2e: () => seedE2E(),
};

const handler = command ? commands[command] : undefined;
if (!handler) {
	throw new Error(`Unknown seed command: ${command}. Use one of: ${Object.keys(commands).join(", ")}`);
}

console.log(`__SEED_RESULT__${JSON.stringify(await handler())}`);
process.exit(0);
