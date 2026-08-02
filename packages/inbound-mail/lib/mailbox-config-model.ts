import type {
	MailboxConfiguration,
	MailboxConfigurationInput,
	MailboxConfigurationState,
	MailboxSelectionMode,
	MailThread,
} from "@/lib/mail-types";

interface AuthorizedDomain {
	id: string;
	domain: string;
}

export class MailboxConfigurationError extends Error {}

function normalizeDomain(value: string) {
	return value.trim().toLowerCase().replace(/^@/u, "");
}

export function normalizeAddress(value: string) {
	return value.trim().toLowerCase();
}

function addressDomain(value: string) {
	return normalizeAddress(value).split("@")[1] ?? "";
}

export function isEmailAddress(value: string) {
	return value.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value);
}

function defaultAddressForDomain(domain: string, userEmail?: string) {
	const normalizedDomain = normalizeDomain(domain);
	const normalizedUserEmail = normalizeAddress(userEmail ?? "");
	return addressDomain(normalizedUserEmail) === normalizedDomain
		? normalizedUserEmail
		: `mail@${normalizedDomain}`;
}

export function defaultMailboxConfiguration(
	domain: AuthorizedDomain,
	userEmail?: string,
): MailboxConfiguration {
	return {
		domainId: domain.id,
		domain: normalizeDomain(domain.domain),
		enabled: true,
		selectionMode: "all",
		addresses: [],
		defaultFromAddress: defaultAddressForDomain(domain.domain, userEmail),
	};
}

export function normalizeMailboxConfigurationInput(
	input: unknown,
	authorizedDomains: AuthorizedDomain[],
	userEmail?: string,
): MailboxConfigurationInput {
	if (!input || typeof input !== "object" || Array.isArray(input)) {
		throw new MailboxConfigurationError("Mailbox configuration is required.");
	}
	const rawMailboxes = (input as Record<string, unknown>).mailboxes;
	if (!Array.isArray(rawMailboxes)) {
		throw new MailboxConfigurationError("Mailboxes must be a list.");
	}

	const authorizedById = new Map(authorizedDomains.map((domain) => [domain.id, domain]));
	const requestedById = new Map<string, Record<string, unknown>>();
	for (const raw of rawMailboxes) {
		if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
			throw new MailboxConfigurationError("Each mailbox must be an object.");
		}
		const record = raw as Record<string, unknown>;
		const domainId = typeof record.domainId === "string" ? record.domainId : "";
		if (!authorizedById.has(domainId)) {
			throw new MailboxConfigurationError("A mailbox is outside the authorized domain scope.");
		}
		if (requestedById.has(domainId)) {
			throw new MailboxConfigurationError("Each authorized domain can only be configured once.");
		}
		requestedById.set(domainId, record);
	}

	const mailboxes = authorizedDomains.map((authorizedDomain) => {
		const raw = requestedById.get(authorizedDomain.id);
		if (!raw || raw.enabled !== true) {
			return {
				domainId: authorizedDomain.id,
				domain: normalizeDomain(authorizedDomain.domain),
				enabled: false,
				selectionMode: "all" as const,
				addresses: [],
				defaultFromAddress: null,
			};
		}

		const domain = normalizeDomain(authorizedDomain.domain);
		const selectionMode: MailboxSelectionMode = raw.selectionMode === "selected"
			? "selected"
			: "all";
		const rawAddresses = Array.isArray(raw.addresses)
			? raw.addresses.filter((value): value is string => typeof value === "string")
			: [];
		const addresses = [...new Set(rawAddresses.map(normalizeAddress).filter(Boolean))];
		if (addresses.length > 100) {
			throw new MailboxConfigurationError("A domain can have at most 100 selected addresses.");
		}
		for (const address of addresses) {
			if (!isEmailAddress(address) || addressDomain(address) !== domain) {
				throw new MailboxConfigurationError(`${address} is not a mailbox on ${domain}.`);
			}
		}

		if (selectionMode === "selected" && addresses.length === 0) {
			throw new MailboxConfigurationError(`Add at least one mailbox for ${domain}.`);
		}

		const requestedDefault = typeof raw.defaultFromAddress === "string"
			? normalizeAddress(raw.defaultFromAddress)
			: "";
		const defaultFromAddress = requestedDefault || (
			selectionMode === "selected"
				? addresses[0]
				: defaultAddressForDomain(domain, userEmail)
		);
		if (!isEmailAddress(defaultFromAddress) || addressDomain(defaultFromAddress) !== domain) {
			throw new MailboxConfigurationError(`Choose a valid default address on ${domain}.`);
		}
		if (selectionMode === "selected" && !addresses.includes(defaultFromAddress)) {
			throw new MailboxConfigurationError(`The default address must be one of the selected ${domain} mailboxes.`);
		}

		return {
			domainId: authorizedDomain.id,
			domain,
			enabled: true,
			selectionMode,
			addresses: selectionMode === "selected" ? addresses : [],
			defaultFromAddress,
		};
	});

	return { mailboxes };
}

export function configuredFromAddresses(
	configuration: MailboxConfigurationState | null,
) {
	if (!configuration) return [];
	return [...new Set(configuration.mailboxes.flatMap((mailbox) => {
		if (!mailbox.enabled) return [];
		if (mailbox.selectionMode === "selected") return mailbox.addresses;
		return mailbox.defaultFromAddress ? [mailbox.defaultFromAddress] : [];
	}))];
}

function mailboxAllowsAddress(mailbox: MailboxConfiguration, address: string) {
	if (!mailbox.enabled || !isEmailAddress(address)) return false;
	if (addressDomain(address) !== normalizeDomain(mailbox.domain)) return false;
	return mailbox.selectionMode === "all" || mailbox.addresses.includes(address);
}

export function replyAddressForThread(
	thread: MailThread,
	configuration: MailboxConfigurationState | null,
	fallback: string,
) {
	const mailboxes = configuration?.mailboxes ?? [];
	for (const message of [...thread.messages].reverse()) {
		if (message.direction !== "inbound") continue;
		for (const recipient of [...message.to, ...(message.cc ?? [])]) {
			const address = normalizeAddress(recipient.email);
			if (mailboxes.some((mailbox) => mailboxAllowsAddress(mailbox, address))) {
				return address;
			}
		}
	}
	return fallback;
}
