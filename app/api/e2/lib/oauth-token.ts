import { verifyJwsAccessToken } from "better-auth/oauth2";
import type { JSONWebKeySet } from "jose";
import { auth, authBaseURL } from "@/lib/auth/auth";
import {
	INBOUND_ACCOUNT_SCOPE,
	MCP_RESOURCE_URL,
} from "@/lib/auth/inbound-oauth-session";

const JWKS_CACHE_KEY = {};
const JWT_SHAPE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

export function looksLikeJwt(token: string): boolean {
	return JWT_SHAPE.test(token);
}

/**
 * Verifies an OAuth access token issued by Inbound's own authorization
 * server for the MCP resource with the inbound:account scope, and returns the
 * user it acts for. Returns null for anything else (wrong audience, issuer,
 * scope, signature or an expired token).
 */
export async function verifyAccountAccessToken(
	token: string,
): Promise<string | null> {
	if (!looksLikeJwt(token)) return null;
	try {
		const payload = await verifyJwsAccessToken(token, {
			jwksFetch: async () =>
				(await auth.api.getJwks()) as unknown as JSONWebKeySet,
			jwksCacheKey: JWKS_CACHE_KEY,
			verifyOptions: {
				issuer: [`${authBaseURL}/api/auth`, `${authBaseURL}`],
				audience: [MCP_RESOURCE_URL],
			},
		});
		const scopes =
			typeof payload.scope === "string" ? payload.scope.split(" ") : [];
		if (!scopes.includes(INBOUND_ACCOUNT_SCOPE)) return null;
		return typeof payload.sub === "string" && payload.sub ? payload.sub : null;
	} catch {
		return null;
	}
}
