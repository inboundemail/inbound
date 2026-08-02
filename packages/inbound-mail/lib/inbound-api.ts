import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import {
	SESSION_COOKIE,
	sealInboundSession,
	sessionCookieOptions,
	type StoredInboundSession,
	unsealInboundSession,
} from "@/lib/inbound-session";
import { inboundMailMode } from "@/lib/mail-mode";
import { oauthIssuer, oauthResource } from "@/lib/oauth";

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

const refreshes = new Map<string, Promise<StoredInboundSession | null>>();

function isJwtAccessToken(accessToken: string): boolean {
	return accessToken.split(".").length === 3;
}

async function persistInboundSession(session: StoredInboundSession) {
	const cookieStore = await cookies();
	cookieStore.set(
		SESSION_COOKIE,
		await sealInboundSession(session),
		sessionCookieOptions(),
	);
}

async function refreshInboundSession(
	session: StoredInboundSession,
): Promise<StoredInboundSession | null> {
	const clientId = process.env.INBOUND_OAUTH_CLIENT_ID;
	const clientSecret = process.env.INBOUND_OAUTH_CLIENT_SECRET;
	if (!session.refreshToken || !clientId || !clientSecret) return null;
	const refreshToken = session.refreshToken;
	const inFlight = refreshes.get(refreshToken);
	if (inFlight) return inFlight;

	const refresh = (async () => {
		try {
			const response = await fetch(`${oauthIssuer()}/oauth2/token`, {
				method: "POST",
				headers: {
					Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
					"Content-Type": "application/x-www-form-urlencoded",
				},
				body: new URLSearchParams({
					grant_type: "refresh_token",
					refresh_token: refreshToken,
					resource: oauthResource(),
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
			await persistInboundSession(refreshedSession);
			return refreshedSession;
		} catch {
			return null;
		}
	})();

	refreshes.set(refreshToken, refresh);
	try {
		return await refresh;
	} finally {
		if (refreshes.get(refreshToken) === refresh) refreshes.delete(refreshToken);
	}
}

export async function inboundSessionFromRequest(request: NextRequest) {
	const session = await unsealInboundSession(
		request.cookies.get(SESSION_COOKIE)?.value,
	);
	if (!session) return null;

	const hasUsableLifetime = session.expiresAt > Date.now() + 30_000;
	const needsJwtUpgrade =
		inboundMailMode() === "live" && !isJwtAccessToken(session.accessToken);
	if (hasUsableLifetime && !needsJwtUpgrade) return session;
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
	const url = `${inboundApiBaseUrl()}${path}`;
	const response = await fetch(url, {
		...init,
		headers,
		cache: "no-store",
	});
	if (response.status !== 401) return response;

	const refreshedSession = await refreshInboundSession(session);
	if (!refreshedSession) return response;
	headers.set("Authorization", `Bearer ${refreshedSession.accessToken}`);
	return fetch(url, {
		...init,
		headers,
		cache: "no-store",
	});
}
