import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import {
	SESSION_COOKIE,
	sealInboundSession,
	sessionCookieOptions,
	type StoredInboundSession,
	unsealInboundSession,
} from "@/lib/inbound-session";
import { oauthIssuer } from "@/lib/oauth";

export function inboundApiBaseUrl(): string {
	return (process.env.INBOUND_API_BASE_URL || "https://inbound.new").replace(
		/\/$/,
		"",
	);
}

interface RefreshTokenResponse {
	access_token: string;
	refresh_token?: string;
	expires_in?: number;
	inbound_session?: {
		domainScope: StoredInboundSession["domainScope"];
	};
}

async function refreshInboundSession(
	session: StoredInboundSession,
): Promise<StoredInboundSession | null> {
	const clientId = process.env.INBOUND_OAUTH_CLIENT_ID;
	const clientSecret = process.env.INBOUND_OAUTH_CLIENT_SECRET;
	if (!session.refreshToken || !clientId || !clientSecret) return null;

	try {
		const response = await fetch(`${oauthIssuer()}/oauth2/token`, {
			method: "POST",
			headers: {
				Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
				"Content-Type": "application/x-www-form-urlencoded",
			},
			body: new URLSearchParams({
				grant_type: "refresh_token",
				refresh_token: session.refreshToken,
			}),
			cache: "no-store",
		});
		if (!response.ok) return null;

		const tokens = (await response.json()) as RefreshTokenResponse;
		if (!tokens.access_token) return null;
		const refreshedSession: StoredInboundSession = {
			...session,
			accessToken: tokens.access_token,
			refreshToken: tokens.refresh_token ?? session.refreshToken,
			expiresAt: Date.now() + (tokens.expires_in ?? 3600) * 1000,
			domainScope:
				tokens.inbound_session?.domainScope ?? session.domainScope,
		};
		const cookieStore = await cookies();
		cookieStore.set(
			SESSION_COOKIE,
			await sealInboundSession(refreshedSession),
			sessionCookieOptions(),
		);
		return refreshedSession;
	} catch {
		return null;
	}
}

export async function inboundSessionFromRequest(request: NextRequest) {
	const session = await unsealInboundSession(
		request.cookies.get(SESSION_COOKIE)?.value,
	);
	if (!session) return null;

	// Refresh a little early so a request never races an expiring access token.
	if (session.expiresAt > Date.now() + 30_000) return session;
	return refreshInboundSession(session);
}

export async function inboundApiFetch(
	request: NextRequest,
	path: string,
	init?: RequestInit,
	resolvedSession?: StoredInboundSession,
) {
	const session = resolvedSession ?? await inboundSessionFromRequest(request);
	if (!session) return null;

	const headers = new Headers(init?.headers);
	headers.set("Authorization", `Bearer ${session.accessToken}`);
	headers.set("Accept", "application/json");
	return fetch(`${inboundApiBaseUrl()}${path}`, {
		...init,
		headers,
		cache: "no-store",
	});
}
