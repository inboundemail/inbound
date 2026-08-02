import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { NextRequest } from "next/server";
import { GET as finishAuthorization } from "@/app/api/auth/callback/inbound/route";
import { GET as startAuthorization } from "@/app/api/auth/inbound/start/route";
import { POST as authorizeMockSession } from "@/app/api/auth/mock/authorize/route";
import {
	SESSION_COOKIE,
	unsealInboundSession,
} from "@/lib/inbound-session";
import {
	OAUTH_MOCK_SELECTION_COOKIE,
	OAUTH_STATE_COOKIE,
	OAUTH_VERIFIER_COOKIE,
} from "@/lib/oauth";

const APP_URL = "http://localhost:3010";
const SESSION_SECRET = "test-session-secret-with-at-least-32-characters";
const originalFetch = globalThis.fetch;

function cookieHeader(values: Record<string, string>) {
	return Object.entries(values)
		.map(([name, value]) => `${name}=${value}`)
		.join("; ");
}

beforeEach(() => {
	process.env.NEXT_PUBLIC_APP_URL = APP_URL;
	process.env.NEXT_PUBLIC_INBOUND_MAIL_MODE = "auth-mock";
	process.env.INBOUND_MAIL_SESSION_SECRET = SESSION_SECRET;
	delete process.env.INBOUND_OAUTH_CLIENT_ID;
	delete process.env.INBOUND_OAUTH_CLIENT_SECRET;
	delete process.env.INBOUND_OAUTH_ISSUER;
});

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe("Sign in with Inbound", () => {
	it("runs the deterministic local consent flow with a selected domain", async () => {
		const startResponse = await startAuthorization(
			new NextRequest(`${APP_URL}/api/auth/inbound/start`),
		);
		const state = startResponse.cookies.get(OAUTH_STATE_COOKIE)?.value;
		const verifier = startResponse.cookies.get(OAUTH_VERIFIER_COOKIE)?.value;

		expect(state).toBeTruthy();
		expect(verifier).toBeTruthy();
		const consentUrl = new URL(startResponse.headers.get("location") ?? "");
		expect(consentUrl.pathname).toBe("/oauth/mock");
		expect(consentUrl.searchParams.get("state")).toBe(state ?? null);
		expect(consentUrl.searchParams.get("code_challenge_method")).toBe("S256");

		const form = new FormData();
		form.set("state", state ?? "");
		form.set("decision", "allow");
		form.append("domain", "inbound.new");
		const authorizeResponse = await authorizeMockSession(
			new NextRequest(`${APP_URL}/api/auth/mock/authorize`, {
				method: "POST",
				body: form,
				headers: {
					cookie: cookieHeader({ [OAUTH_STATE_COOKIE]: state ?? "" }),
				},
			}),
		);
		const selectedDomains = authorizeResponse.cookies.get(
			OAUTH_MOCK_SELECTION_COOKIE,
		)?.value;
		expect(JSON.parse(selectedDomains ?? "[]")).toEqual(["inbound.new"]);

		const callbackResponse = await finishAuthorization(
			new NextRequest(
				`${APP_URL}/api/auth/callback/inbound?code=mock-local&state=${state}`,
				{
					headers: {
						cookie: cookieHeader({
							[OAUTH_STATE_COOKIE]: state ?? "",
							[OAUTH_VERIFIER_COOKIE]: verifier ?? "",
							[OAUTH_MOCK_SELECTION_COOKIE]: selectedDomains ?? "",
						}),
					},
				},
			),
		);
		const sessionCookie = callbackResponse.cookies.get(SESSION_COOKIE)?.value;
		const session = await unsealInboundSession(sessionCookie);

		expect(callbackResponse.headers.get("location")).toBe(`${APP_URL}/`);
		expect(session?.user.email).toBe("ryan@inbound.new");
		expect(session?.domainScope).toEqual({
			mode: "selected",
			domains: [{ id: "mock-domain-1", domain: "inbound.new" }],
		});
	});

	it("rejects a callback whose state does not match", async () => {
		const response = await finishAuthorization(
			new NextRequest(
				`${APP_URL}/api/auth/callback/inbound?code=mock-local&state=returned`,
				{
					headers: {
						cookie: cookieHeader({
							[OAUTH_STATE_COOKIE]: "expected",
							[OAUTH_VERIFIER_COOKIE]: "verifier",
						}),
					},
				},
			),
		);

		expect(response.cookies.get(SESSION_COOKIE)).toBeUndefined();
		expect(response.headers.get("location")).toBe(
			`${APP_URL}/?auth_error=invalid_oauth_state`,
		);
	});

	it("exchanges a production authorization code and seals the scoped session", async () => {
		process.env.NEXT_PUBLIC_INBOUND_MAIL_MODE = "live";
		process.env.INBOUND_OAUTH_CLIENT_ID = "client-id";
		process.env.INBOUND_OAUTH_CLIENT_SECRET = "client-secret";
		process.env.INBOUND_OAUTH_ISSUER = "https://inbound.example/api/auth";
		const requests: Array<{ url: string; init?: RequestInit }> = [];
		globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
			const url = String(input);
			requests.push({ url, init });
			if (url.endsWith("/oauth2/token")) {
				return Response.json({
					access_token: "access-token",
					refresh_token: "refresh-token",
					expires_in: 1800,
					inbound_session: {
						userId: "user-1",
						grantId: "grant-1",
						domainScope: {
							mode: "selected",
							domains: [{ id: "domain-1", domain: "inbound.new" }],
						},
					},
				});
			}
			return Response.json({
				sub: "user-1",
				name: "Ryan Vogel",
				email: "ryan@inbound.new",
			});
		}) as typeof fetch;

		const response = await finishAuthorization(
			new NextRequest(
				`${APP_URL}/api/auth/callback/inbound?code=authorization-code&state=state`,
				{
					headers: {
						cookie: cookieHeader({
							[OAUTH_STATE_COOKIE]: "state",
							[OAUTH_VERIFIER_COOKIE]: "verifier",
						}),
					},
				},
			),
		);
		const session = await unsealInboundSession(
			response.cookies.get(SESSION_COOKIE)?.value,
		);
		const tokenBody = requests[0]?.init?.body;

		expect(requests.map(({ url }) => url)).toEqual([
			"https://inbound.example/api/auth/oauth2/token",
			"https://inbound.example/api/auth/oauth2/userinfo",
		]);
		expect(requests[0]?.init?.headers).toMatchObject({
			Authorization: `Basic ${Buffer.from("client-id:client-secret").toString("base64")}`,
		});
		expect(tokenBody).toBeInstanceOf(URLSearchParams);
		expect((tokenBody as URLSearchParams).get("code_verifier")).toBe("verifier");
		expect((tokenBody as URLSearchParams).get("resource")).toBe(
			"https://inbound.new/api",
		);
		expect(session?.accessToken).toBe("access-token");
		expect(session?.refreshToken).toBe("refresh-token");
		expect(session?.domainScope.domains).toEqual([
			{ id: "domain-1", domain: "inbound.new" },
		]);
	});

	it("does not create a session when the token exchange fails", async () => {
		process.env.NEXT_PUBLIC_INBOUND_MAIL_MODE = "live";
		process.env.INBOUND_OAUTH_CLIENT_ID = "client-id";
		process.env.INBOUND_OAUTH_CLIENT_SECRET = "client-secret";
		globalThis.fetch = (async () => new Response(null, { status: 401 })) as unknown as typeof fetch;

		const response = await finishAuthorization(
			new NextRequest(
				`${APP_URL}/api/auth/callback/inbound?code=bad-code&state=state`,
				{
					headers: {
						cookie: cookieHeader({
							[OAUTH_STATE_COOKIE]: "state",
							[OAUTH_VERIFIER_COOKIE]: "verifier",
						}),
					},
				},
			),
		);

		expect(response.cookies.get(SESSION_COOKIE)).toBeUndefined();
		expect(response.headers.get("location")).toBe(
			`${APP_URL}/?auth_error=token_exchange_failed`,
		);
	});
});
