import { and, asc, eq, inArray, notInArray } from "drizzle-orm";
import type { StoredInboundSession } from "@/lib/inbound-session";
import {
	mailAccounts,
	mailboxAddresses,
	mailboxConfigs,
} from "@/lib/db/schema";
import { getMailDatabase } from "@/lib/db";
import {
	defaultMailboxConfiguration,
	normalizeAddress,
	normalizeMailboxConfigurationInput,
} from "@/lib/mailbox-config-model";
import type {
	MailboxConfigurationInput,
	MailboxConfigurationState,
} from "@/lib/mail-types";

export async function readMailboxConfiguration(
	session: StoredInboundSession,
): Promise<MailboxConfigurationState> {
	const database = getMailDatabase();
	const [account] = await database
		.select()
		.from(mailAccounts)
		.where(eq(mailAccounts.inboundUserId, session.user.id))
		.limit(1);

	if (!account) {
		return {
			onboarded: false,
			mailboxes: session.domainScope.domains.map((domain) =>
				defaultMailboxConfiguration(domain, session.user.email),
			),
		};
	}

	const authorizedIds = session.domainScope.domains.map((domain) => domain.id);
	const configs = authorizedIds.length
		? await database
			.select()
			.from(mailboxConfigs)
			.where(and(
				eq(mailboxConfigs.accountId, account.id),
				inArray(mailboxConfigs.inboundDomainId, authorizedIds),
			))
		: [];
	const configIds = configs.map((config) => config.id);
	const addresses = configIds.length
		? await database
			.select()
			.from(mailboxAddresses)
			.where(inArray(mailboxAddresses.mailboxConfigId, configIds))
			.orderBy(asc(mailboxAddresses.address))
		: [];
	const configByDomainId = new Map(configs.map((config) => [config.inboundDomainId, config]));
	const addressesByConfigId = new Map<string, string[]>();
	for (const address of addresses) {
		const current = addressesByConfigId.get(address.mailboxConfigId) ?? [];
		current.push(address.address);
		addressesByConfigId.set(address.mailboxConfigId, current);
	}

	return {
		onboarded: account.onboardingVersion >= 1 && authorizedIds.every((id) => configByDomainId.has(id)),
		mailboxes: session.domainScope.domains.map((domain) => {
			const config = configByDomainId.get(domain.id);
			if (!config) return defaultMailboxConfiguration(domain, session.user.email);
			return {
				domainId: domain.id,
				domain: domain.domain.toLowerCase(),
				enabled: config.enabled,
				selectionMode: config.selectionMode,
				addresses: addressesByConfigId.get(config.id) ?? [],
				defaultFromAddress: config.defaultFromAddress,
			};
		}),
	};
}

export async function saveMailboxConfiguration(
	session: StoredInboundSession,
	input: unknown,
): Promise<MailboxConfigurationState> {
	const normalized: MailboxConfigurationInput = normalizeMailboxConfigurationInput(
		input,
		session.domainScope.domains,
		session.user.email,
	);
	const database = getMailDatabase();
	const now = new Date();
	const [account] = await database
		.insert(mailAccounts)
		.values({ inboundUserId: session.user.id, updatedAt: now })
		.onConflictDoUpdate({
			target: mailAccounts.inboundUserId,
			set: { updatedAt: now },
		})
		.returning({ id: mailAccounts.id });

	for (const mailbox of normalized.mailboxes) {
		const [config] = await database
			.insert(mailboxConfigs)
			.values({
				accountId: account.id,
				inboundDomainId: mailbox.domainId,
				domain: mailbox.domain,
				enabled: mailbox.enabled,
				selectionMode: mailbox.selectionMode,
				defaultFromAddress: mailbox.defaultFromAddress,
				updatedAt: now,
			})
			.onConflictDoUpdate({
				target: [mailboxConfigs.accountId, mailboxConfigs.inboundDomainId],
				set: {
					domain: mailbox.domain,
					enabled: mailbox.enabled,
					selectionMode: mailbox.selectionMode,
					defaultFromAddress: mailbox.defaultFromAddress,
					updatedAt: now,
				},
			})
			.returning({ id: mailboxConfigs.id });

		const deleteAddresses = database
			.delete(mailboxAddresses)
			.where(eq(mailboxAddresses.mailboxConfigId, config.id));
		if (mailbox.enabled && mailbox.selectionMode === "selected") {
			await database.batch([
				deleteAddresses,
				database.insert(mailboxAddresses).values(mailbox.addresses.map((address) => ({
					mailboxConfigId: config.id,
					address,
					updatedAt: now,
				}))),
			]);
		} else {
			await deleteAddresses;
		}
	}

	const authorizedIds = session.domainScope.domains.map((domain) => domain.id);
	if (authorizedIds.length) {
		await database
			.update(mailboxConfigs)
			.set({ enabled: false, defaultFromAddress: null, updatedAt: now })
			.where(and(
				eq(mailboxConfigs.accountId, account.id),
				notInArray(mailboxConfigs.inboundDomainId, authorizedIds),
			));
	} else {
		await database
			.update(mailboxConfigs)
			.set({ enabled: false, defaultFromAddress: null, updatedAt: now })
			.where(eq(mailboxConfigs.accountId, account.id));
	}

	await database
		.update(mailAccounts)
		.set({ onboardingVersion: 1, onboardedAt: now, updatedAt: now })
		.where(eq(mailAccounts.id, account.id));

	return readMailboxConfiguration(session);
}

export async function canSendFromAddress(
	session: StoredInboundSession,
	from: string,
) {
	const normalizedFrom = normalizeAddress(from);
	const configuration = await readMailboxConfiguration(session);
	if (!configuration.onboarded) return false;
	return configuration.mailboxes.some((mailbox) => {
		if (!mailbox.enabled) return false;
		if (normalizedFrom.split("@")[1] !== mailbox.domain) return false;
		return mailbox.selectionMode === "all" || mailbox.addresses.includes(normalizedFrom);
	});
}
