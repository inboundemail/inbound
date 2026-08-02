export const INBOUND_DOMAIN_SCOPE = "inbound:domains";
export const INBOUND_SESSION_CLAIM = "https://inbound.new/session";
export const OAUTH_GRANT_SELECTION_MAX_AGE_MS = 10 * 60 * 1000;

export type InboundDomainScopeMode = "all" | "selected";

export interface InboundSessionDomain {
	id: string;
	domain: string;
}

export interface InboundOAuthSession {
	userId: string;
	grantId: string;
	domainScope: {
		mode: InboundDomainScopeMode;
		domains: InboundSessionDomain[];
	};
}

export interface InboundOAuthSessionReference {
	userId: string;
	grantId: string;
}

interface InboundGrantShape {
	id: string;
	userId: string;
	mode: string;
	domainIds: string[];
}

export function parseInboundOAuthSessionReference(
	value: unknown,
): InboundOAuthSessionReference | null {
	if (!value || typeof value !== "object" || Array.isArray(value)) return null;

	const claim = value as Record<string, unknown>;
	if (
		typeof claim.userId !== "string" ||
		claim.userId.length === 0 ||
		typeof claim.grantId !== "string" ||
		claim.grantId.length === 0
	) {
		return null;
	}

	return { userId: claim.userId, grantId: claim.grantId };
}

export function inboundOAuthSessionAllowsDomain(
	session: InboundOAuthSession,
	identifier: string | null | undefined,
): boolean {
	if (!identifier) return false;

	const normalizedIdentifier = identifier.trim().toLowerCase();
	if (!normalizedIdentifier) return false;

	const angleBracketAddress = normalizedIdentifier.match(/<([^<>]+)>/u)?.[1];
	const addressOrDomain = angleBracketAddress ?? normalizedIdentifier;
	const atIndex = addressOrDomain.lastIndexOf("@");
	const domain = (
		atIndex >= 0 ? addressOrDomain.slice(atIndex + 1) : addressOrDomain
	)
		.replace(/^@/u, "")
		.replace(/[>\s]+$/u, "");

	return session.domainScope.domains.some(
		(allowedDomain) =>
			allowedDomain.id.toLowerCase() === normalizedIdentifier ||
			allowedDomain.domain.toLowerCase() === domain,
	);
}

export function inboundOAuthNeedsDomainSelection(
	scopes: readonly string[],
	validGrantId: string | null,
): boolean {
	return scopes.includes(INBOUND_DOMAIN_SCOPE) && validGrantId === null;
}

export function buildInboundOAuthSession(
	grant: InboundGrantShape,
	ownedDomains: InboundSessionDomain[],
): InboundOAuthSession | null {
	if (grant.mode !== "all" && grant.mode !== "selected") return null;

	const sortedDomains = [...ownedDomains].sort((left, right) =>
		left.domain.localeCompare(right.domain),
	);
	if (grant.mode === "all") {
		return {
			userId: grant.userId,
			grantId: grant.id,
			domainScope: { mode: "all", domains: sortedDomains },
		};
	}

	const selectedIds = new Set(grant.domainIds);
	const selectedDomains = sortedDomains.filter((domain) =>
		selectedIds.has(domain.id),
	);
	if (selectedDomains.length !== selectedIds.size) {
		return null;
	}

	return {
		userId: grant.userId,
		grantId: grant.id,
		domainScope: { mode: "selected", domains: selectedDomains },
	};
}
