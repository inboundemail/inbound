import type { InboundctlConfig, Mailbox } from "./config";

export type MailboxScope = {
	name: string;
	from?: string;
	selectors: string[];
	addresses: string[];
	domains: string[];
};

const ADDRESS_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DOMAIN_PATTERN =
	/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;

export function normalizeSelector(selector: string): string {
	const normalized = selector.trim().toLowerCase();
	if (normalized.startsWith("*@")) {
		if (!DOMAIN_PATTERN.test(normalized.slice(2))) {
			throw new Error(`Invalid mailbox selector '${selector}'`);
		}
		return normalized;
	}

	if (normalized.includes("*") || !ADDRESS_PATTERN.test(normalized)) {
		throw new Error(`Invalid mailbox selector '${selector}'`);
	}
	return normalized;
}

export function createMailbox(
	from: string | undefined,
	selectors: string[],
): Mailbox {
	const normalized = [...new Set(selectors.map(normalizeSelector))];
	if (normalized.length === 0) {
		throw new Error("A mailbox requires at least one selector");
	}
	if (from && !ADDRESS_PATTERN.test(from.trim())) {
		throw new Error(`Invalid sender address '${from}'`);
	}
	return {
		from: from?.trim().toLowerCase(),
		selectors: normalized,
	};
}

export function resolveMailbox(
	config: InboundctlConfig,
	selected?: string,
): MailboxScope {
	const name = selected || config.defaultMailbox;
	if (!name) {
		throw new Error(
			"No mailbox selected. Add one with 'inboundctl mailbox add <name> <selector>'.",
		);
	}
	const mailbox = config.mailboxes[name];
	if (!mailbox) throw new Error(`Unknown mailbox '${name}'`);
	const selectors = [...new Set(mailbox.selectors.map(normalizeSelector))];
	return {
		name,
		from: mailbox.from,
		selectors,
		addresses: selectors.filter((value) => !value.startsWith("*@")),
		domains: selectors
			.filter((value) => value.startsWith("*@"))
			.map((value) => value.slice(2)),
	};
}

export function mailboxQueries(scope: MailboxScope) {
	return [
		...scope.addresses.map((address) => ({ address })),
		...scope.domains.map((domain) => ({ domain })),
	];
}
