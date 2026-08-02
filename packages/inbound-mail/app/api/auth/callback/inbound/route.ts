import { NextRequest, NextResponse } from "next/server";
import {
	SESSION_COOKIE,
	sealInboundSession,
	sessionCookieOptions,
	type StoredInboundSession,
} from "@/lib/inbound-session";
import {
	appBaseUrl,
	callbackUrl,
	oauthIssuer,
	oauthResource,
	OAUTH_MOCK_SELECTION_COOKIE,
	OAUTH_STATE_COOKIE,
	OAUTH_VERIFIER_COOKIE,
} from "@/lib/oauth";
import { inboundMailMode } from "@/lib/mail-mode";

export const runtime = "nodejs";

interface TokenResponse {
	access_token: string;
	refresh_token?: string;
	expires_in?: number;
	inbound_session?: {
		userId: string;
		grantId: string;
		domainScope: StoredInboundSession["domainScope"];
	};
}

interface UserInfoResponse {
	sub: string;
	name?: string;
	email?: string;
	picture?: string;
}

function failure(request: NextRequest, reason: string) {
	const url = new URL("/", appBaseUrl(request.url));
	url.searchParams.set("auth_error", reason);
	const response = NextResponse.redirect(url);
	response.cookies.delete(OAUTH_STATE_COOKIE);
	response.cookies.delete(OAUTH_VERIFIER_COOKIE);
	response.cookies.delete(OAUTH_MOCK_SELECTION_COOKIE);
	return response;
}

async function completeMockSignIn(request: NextRequest) {
	const selectedValue = request.cookies.get(OAUTH_MOCK_SELECTION_COOKIE)?.value;
	let selectedDomains = ["inbound.new", "northstar.studio"];
	if (selectedValue) {
		try {
			const parsed = JSON.parse(selectedValue) as unknown;
			if (Array.isArray(parsed) && parsed.every((value) => typeof value === "string")) {
				selectedDomains = parsed;
			}
		} catch {
			return failure(request, "invalid_mock_domain_selection");
		}
	}

	const session: StoredInboundSession = {
		accessToken: "mock-access-token",
		refreshToken: "mock-refresh-token",
		expiresAt: Date.now() + 60 * 60 * 1000,
		user: {
			id: "mock-oauth-user",
			name: "Ryan Vogel",
			email: "ryan@inbound.new",
		},
		domainScope: {
			mode: selectedDomains.length === 2 ? "all" : "selected",
			domains: selectedDomains.map((domain, index) => ({
				id: `mock-domain-${index + 1}`,
				domain,
			})),
		},
	};
	const response = NextResponse.redirect(new URL("/", appBaseUrl(request.url)));
	response.cookies.set(
		SESSION_COOKIE,
		await sealInboundSession(session),
		sessionCookieOptions(),
	);
	response.cookies.delete(OAUTH_STATE_COOKIE);
	response.cookies.delete(OAUTH_VERIFIER_COOKIE);
	response.cookies.delete(OAUTH_MOCK_SELECTION_COOKIE);
	return response;
}

export async function GET(request: NextRequest) {
	const mode = inboundMailMode();
	const code = request.nextUrl.searchParams.get("code");
	const oauthError = request.nextUrl.searchParams.get("error");
	const returnedState = request.nextUrl.searchParams.get("state");
	const expectedState = request.cookies.get(OAUTH_STATE_COOKIE)?.value;
	const verifier = request.cookies.get(OAUTH_VERIFIER_COOKIE)?.value;
	const clientId = process.env.INBOUND_OAUTH_CLIENT_ID;
	const clientSecret = process.env.INBOUND_OAUTH_CLIENT_SECRET;

	if (
		!returnedState ||
		!expectedState ||
		returnedState !== expectedState ||
		!verifier
	) {
		return failure(request, "invalid_oauth_state");
	}
	if (oauthError) return failure(request, oauthError);
	if (!code) return failure(request, "missing_authorization_code");
	if (mode === "auth-mock" && code === "mock-local") {
		return completeMockSignIn(request);
	}
	if (!clientId || !clientSecret) return failure(request, "oauth_not_configured");

	try {
		const tokenResponse = await fetch(`${oauthIssuer()}/oauth2/token`, {
			method: "POST",
			headers: {
				Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
				"Content-Type": "application/x-www-form-urlencoded",
			},
			body: new URLSearchParams({
				grant_type: "authorization_code",
				code,
				redirect_uri: callbackUrl(request.url),
				code_verifier: verifier,
				resource: oauthResource(),
			}),
			cache: "no-store",
		});
		if (!tokenResponse.ok) return failure(request, "token_exchange_failed");

		const tokens = (await tokenResponse.json()) as TokenResponse;
		if (!tokens.access_token) return failure(request, "token_exchange_failed");
		const userInfoResponse = await fetch(`${oauthIssuer()}/oauth2/userinfo`, {
			headers: { Authorization: `Bearer ${tokens.access_token}` },
			cache: "no-store",
		});
		if (!userInfoResponse.ok) return failure(request, "userinfo_failed");

		const userInfo = (await userInfoResponse.json()) as UserInfoResponse;
		const domainScope = tokens.inbound_session?.domainScope ?? {
			mode: "selected" as const,
			domains: [],
		};
		const session: StoredInboundSession = {
			accessToken: tokens.access_token,
			refreshToken: tokens.refresh_token,
			expiresAt: Date.now() + (tokens.expires_in ?? 3600) * 1000,
			user: {
				id: userInfo.sub || tokens.inbound_session?.userId || "unknown",
				name: userInfo.name || userInfo.email || "Inbound user",
				email: userInfo.email || "",
				image: userInfo.picture,
			},
			domainScope,
		};

		const response = NextResponse.redirect(new URL("/", appBaseUrl(request.url)));
		response.cookies.set(
			SESSION_COOKIE,
			await sealInboundSession(session),
			sessionCookieOptions(),
		);
		response.cookies.delete(OAUTH_STATE_COOKIE);
		response.cookies.delete(OAUTH_VERIFIER_COOKIE);
		return response;
	} catch {
		return failure(request, "oauth_callback_failed");
	}
}
