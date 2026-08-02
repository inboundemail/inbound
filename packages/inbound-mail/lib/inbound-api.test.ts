import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { NextRequest } from "next/server";
import type { StoredInboundSession } from "@/lib/inbound-session";
import { SESSION_COOKIE, sealInboundSession } from "@/lib/inbound-session";

const persistedSessionValues: string[] = [];

mock.module("next/headers", () => ({
	cookies: async () => ({
		set: (_name: string, value: string) => {
			persistedSessionValues.push(value);
		},
	}),
}));

const { inboundApiFetch, inboundSessionFromRequest } = await import(
	"@/lib/inbound-api"
);

const originalFetch = globalThis.fetch;

function session(
	overrides: Partial<StoredInboundSession> = {},
): StoredInboundSession {
	return {
		accessToken: "old.jwt.token",
		refreshToken: "refresh-token",
		expiresAt: Date.now() + 60 * 60 * 1000,
		user: {
			id: "user-1",
			name: "Ryan Vogel",
			email: "ryan@inbound.new",
		},
		domainScope: {
			mode: "selected",
			domains: [{ id: "domain-1", domain: "inbound.new" }],
		},
		...overrides,
	};
}

beforeEach(() => {
	persistedSessionValues.length = 0;
	process.env.NEXT_PUBLIC_INBOUND_MAIL_MODE = "live";
	process.env.INBOUND_API_BASE_URL = "https://inbound.new";
	process.env.INBOUND_OAUTH_ISSUER = "https://inbound.new/api/auth";
	process.env.INBOUND_OAUTH_CLIENT_ID = "client-id";
	process.env.INBOUND_OAUTH_CLIENT_SECRET = "client-secret";
	process.env.INBOUND_MAIL_SESSION_SECRET =
		"test-session-secret-with-at-least-32-characters";
});

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe("Inbound API OAuth sessions", () => {
	it("upgrades an existing opaque access token with the API resource", async () => {
		let tokenBody: URLSearchParams | undefined;
		globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
			tokenBody = init?.body as URLSearchParams;
			return Response.json({
				access_token: "new.jwt.token",
				refresh_token: "rotated-refresh-token",
				expires_in: 3600,
			});
		}) as typeof fetch;

		const sealed = await sealInboundSession(session({ accessToken: "opaque-token" }));
		const refreshed = await inboundSessionFromRequest(
			new NextRequest("http://localhost:3010/api/auth/session", {
				headers: { cookie: `${SESSION_COOKIE}=${sealed}` },
			}),
		);
		const { unsealInboundSession } = await import("@/lib/inbound-session");
		const persistedSession = await unsealInboundSession(
			persistedSessionValues.at(-1),
		);

		expect(tokenBody?.get("grant_type")).toBe("refresh_token");
		expect(tokenBody?.get("resource")).toBe("https://inbound.new/api");
		expect(refreshed?.accessToken).toBe("new.jwt.token");
		expect(refreshed?.refreshToken).toBe("rotated-refresh-token");
		expect(persistedSession?.accessToken).toBe("new.jwt.token");
	});

	it("refreshes and retries an upstream request once after a 401", async () => {
		const requests: Array<{
			url: string;
			authorization: string | null;
			body?: BodyInit | null;
		}> = [];
		globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
			const headers = new Headers(init?.headers);
			const url = String(input);
			requests.push({
				url,
				authorization: headers.get("Authorization"),
				body: init?.body,
			});
			if (url.endsWith("/oauth2/token")) {
				return Response.json({
					access_token: "new.jwt.token",
					refresh_token: "rotated-refresh-token",
					expires_in: 3600,
				});
			}
			if (requests.filter((request) => request.url.includes("/api/e2/")).length === 1) {
				return Response.json({ error: "Unauthorized" }, { status: 401 });
			}
			return Response.json({ threads: [] });
		}) as typeof fetch;

		const response = await inboundApiFetch(
			new NextRequest("http://localhost:3010/api/mail/sync"),
			"/api/e2/mail/threads",
			undefined,
			session(),
		);

		expect(response?.status).toBe(200);
		expect(requests.map(({ url }) => url)).toEqual([
			"https://inbound.new/api/e2/mail/threads",
			"https://inbound.new/api/auth/oauth2/token",
			"https://inbound.new/api/e2/mail/threads",
		]);
		expect(requests[0]?.authorization).toBe("Bearer old.jwt.token");
		expect(requests[2]?.authorization).toBe("Bearer new.jwt.token");
		expect((requests[1]?.body as URLSearchParams).get("resource")).toBe(
			"https://inbound.new/api",
		);
	});
});
