import { NextRequest, NextResponse } from "next/server";
import {
	appBaseUrl,
	callbackUrl,
	oauthIssuer,
	OAUTH_STATE_COOKIE,
	OAUTH_VERIFIER_COOKIE,
	pkceChallenge,
	randomUrlSafe,
	temporaryCookieOptions,
} from "@/lib/oauth";
import { inboundMailMode } from "@/lib/mail-mode";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
	const mode = inboundMailMode();
	const clientId = process.env.INBOUND_OAUTH_CLIENT_ID;
	if (mode !== "auth-mock" && !clientId) {
		return NextResponse.redirect(new URL("/?auth_error=oauth_not_configured", request.url));
	}

	const state = randomUrlSafe();
	const verifier = randomUrlSafe(64);
	const authorizeUrl =
		mode === "auth-mock"
			? new URL("/oauth/mock", appBaseUrl(request.url))
			: new URL(`${oauthIssuer()}/oauth2/authorize`);
	if (clientId) authorizeUrl.searchParams.set("client_id", clientId);
	authorizeUrl.searchParams.set("redirect_uri", callbackUrl(request.url));
	authorizeUrl.searchParams.set("response_type", "code");
	authorizeUrl.searchParams.set(
		"scope",
		"openid profile email offline_access inbound:domains",
	);
	authorizeUrl.searchParams.set("state", state);
	authorizeUrl.searchParams.set("code_challenge", await pkceChallenge(verifier));
	authorizeUrl.searchParams.set("code_challenge_method", "S256");

	const response = NextResponse.redirect(authorizeUrl);
	response.cookies.set(OAUTH_STATE_COOKIE, state, temporaryCookieOptions());
	response.cookies.set(OAUTH_VERIFIER_COOKIE, verifier, temporaryCookieOptions());
	return response;
}
