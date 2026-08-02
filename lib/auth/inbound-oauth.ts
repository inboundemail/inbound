import { getOAuthProviderState } from "@better-auth/oauth-provider";
import { and, desc, eq, gte, isNull } from "drizzle-orm";
import type { InboundOAuthSession } from "@/lib/auth/inbound-oauth-session";
import {
	buildInboundOAuthSession,
	OAUTH_GRANT_SELECTION_MAX_AGE_MS,
} from "@/lib/auth/inbound-oauth-session";
import { db } from "@/lib/db";
import { emailDomains, inboundOAuthGrants } from "@/lib/db/schema";

export type { InboundDomainScopeMode } from "@/lib/auth/inbound-oauth-session";
export {
	INBOUND_DOMAIN_SCOPE,
	INBOUND_SESSION_CLAIM,
} from "@/lib/auth/inbound-oauth-session";

export async function getInboundOAuthSession(
	referenceId: string,
	userId: string,
): Promise<InboundOAuthSession | null> {
	const [grant] = await db
		.select({
			id: inboundOAuthGrants.id,
			userId: inboundOAuthGrants.userId,
			mode: inboundOAuthGrants.mode,
			domainIds: inboundOAuthGrants.domainIds,
		})
		.from(inboundOAuthGrants)
		.where(
			and(
				eq(inboundOAuthGrants.id, referenceId),
				eq(inboundOAuthGrants.userId, userId),
				isNull(inboundOAuthGrants.revokedAt),
			),
		)
		.limit(1);
	if (!grant) return null;

	const domains = await db
		.select({ id: emailDomains.id, domain: emailDomains.domain })
		.from(emailDomains)
		.where(eq(emailDomains.userId, userId));

	return buildInboundOAuthSession(grant, domains);
}

export async function getRecentInboundOAuthGrantId({
	userId,
	sessionId,
	clientId,
}: {
	userId: string;
	sessionId: string;
	clientId: string;
}): Promise<string | null> {
	const selectedAfter = new Date(Date.now() - OAUTH_GRANT_SELECTION_MAX_AGE_MS);
	const [grant] = await db
		.select({ id: inboundOAuthGrants.id })
		.from(inboundOAuthGrants)
		.where(
			and(
				eq(inboundOAuthGrants.userId, userId),
				eq(inboundOAuthGrants.sessionId, sessionId),
				eq(inboundOAuthGrants.clientId, clientId),
				gte(inboundOAuthGrants.createdAt, selectedAfter),
				isNull(inboundOAuthGrants.revokedAt),
			),
		)
		.orderBy(desc(inboundOAuthGrants.createdAt))
		.limit(1);

	return grant?.id ?? null;
}

export async function getValidRecentInboundOAuthGrantId({
	userId,
	sessionId,
	clientId,
}: {
	userId: string;
	sessionId: string;
	clientId: string;
}): Promise<string | null> {
	const grantId = await getRecentInboundOAuthGrantId({
		userId,
		sessionId,
		clientId,
	});
	if (!grantId) return null;

	return (await getInboundOAuthSession(grantId, userId)) ? grantId : null;
}

export async function getCurrentOAuthClientId(): Promise<string | null> {
	const state = await getOAuthProviderState();
	if (!state?.query) return null;
	return new URLSearchParams(state.query).get("client_id");
}
