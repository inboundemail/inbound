import { NextRequest, NextResponse } from "next/server";
import {
	appBaseUrl,
	OAUTH_MOCK_SELECTION_COOKIE,
	OAUTH_STATE_COOKIE,
	OAUTH_VERIFIER_COOKIE,
} from "@/lib/oauth";

export async function POST(request: NextRequest) {
	const form = await request.formData();
	const state = String(form.get("state") ?? "");
	const expectedState = request.cookies.get(OAUTH_STATE_COOKIE)?.value;
	if (!state || !expectedState || state !== expectedState) {
		return NextResponse.redirect(
			new URL("/?auth_error=invalid_oauth_state", appBaseUrl(request.url)),
			303,
		);
	}

	if (form.get("decision") === "cancel") {
		const response = NextResponse.redirect(
			new URL("/?auth_error=access_denied", appBaseUrl(request.url)),
			303,
		);
		response.cookies.delete(OAUTH_STATE_COOKIE);
		response.cookies.delete(OAUTH_VERIFIER_COOKIE);
		response.cookies.delete(OAUTH_MOCK_SELECTION_COOKIE);
		return response;
	}

	const domains = form
		.getAll("domain")
		.map(String)
		.filter((domain) => domain === "inbound.new" || domain === "northstar.studio");
	if (!domains.length) {
		const url = new URL("/oauth/mock", appBaseUrl(request.url));
		url.searchParams.set("state", state);
		url.searchParams.set("error", "choose_at_least_one_domain");
		return NextResponse.redirect(url, 303);
	}

	const callback = new URL("/api/auth/callback/inbound", appBaseUrl(request.url));
	callback.searchParams.set("code", "mock-local");
	callback.searchParams.set("state", state);
	const response = NextResponse.redirect(callback, 303);
	response.cookies.set(OAUTH_MOCK_SELECTION_COOKIE, JSON.stringify(domains), {
		httpOnly: true,
		sameSite: "lax",
		secure: process.env.NODE_ENV === "production",
		path: "/",
		maxAge: 60 * 10,
	});
	return response;
}
