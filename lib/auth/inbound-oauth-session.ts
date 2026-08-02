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

interface InboundGrantShape {
	id: string;
	userId: string;
	mode: string;
	domainIds: string[];
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
	if (selectedIds.size === 0 || selectedDomains.length !== selectedIds.size) {
		return null;
	}

	return {
		userId: grant.userId,
		grantId: grant.id,
		domainScope: { mode: "selected", domains: selectedDomains },
	};
}
