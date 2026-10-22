import { afterEach, describe, expect, it, mock } from "bun:test";
import { ApiAuth, type AuthenticatedMailbox } from "./auth.ts";
import type { ImapConfig } from "./config.ts";
import { sanitizeLogValue } from "./log.ts";
import {
	type RevalidatedSession,
	type SessionCallback,
	SessionRevalidator,
} from "./sessions.ts";

const originalFetch = globalThis.fetch;

const config: ImapConfig = {
	hostname: "imap.example.com",
	port: 143,
	securePort: 993,
	tlsKeyPath: null,
	tlsCertPath: null,
	allowPlaintext: true,
	databaseUrl: "postgres://localhost/inbound",
	apiBaseUrl: "https://example.com/api/e2",
	gatewayAuthSecret: null,
	maxConnections: 200,
	maxConnectionsPerIp: 20,
	tlsHandshakeTimeoutMs: 5_000,
	authTimeoutMs: 30_000,
	authFailureLimit: 10,
	authFailureWindowMs: 900_000,
	authFailureRecords: 100_000,
	fetchMemoryBudgetBytes: 256 * 1024 * 1024,
	fetchBudgetWaitMs: 10_000,
	sessionRevalidateMs: 300_000,
	sessionMaxAgeMs: 86_400_000,
	apiTimeoutMs: 20,
	maxMessageBytes: 1024 * 1024,
	appendMaxBytesPerUser: 250 * 1024 * 1024,
	appendMaxMessagesPerUser: 5000,
};

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe("ApiAuth", () => {
	it("passes an expiring abort signal and refuses redirects", async () => {
		let signal: AbortSignal | null | undefined;
		let redirect: RequestInit["redirect"];
		globalThis.fetch = mock(
			async (_input: Parameters<typeof fetch>[0], init?: RequestInit) => {
				signal = init?.signal;
				redirect = init?.redirect;
				return new Response(null, { status: 401 });
			},
		) as unknown as typeof fetch;

		const result = await new ApiAuth(config).authenticate(
			"user@example.com",
			"password",
			"203.0.113.7",
		);

		expect(result).toBeNull();
		expect(signal).toBeInstanceOf(AbortSignal);
		expect(redirect).toBe("error");
	});

	it("omits the gateway secret header when not configured", async () => {
		let headers: Record<string, string> | undefined;
		globalThis.fetch = mock(
			async (_input: Parameters<typeof fetch>[0], init?: RequestInit) => {
				headers = init?.headers as Record<string, string> | undefined;
				return new Response(null, { status: 401 });
			},
		) as unknown as typeof fetch;

		await new ApiAuth(config).authenticate("user@example.com", "password", "203.0.113.7");

		expect(headers?.["x-inbound-gateway-secret"]).toBeUndefined();
		expect(headers?.["x-inbound-client-ip"]).toBeUndefined();
	});

	it("sends the shared gateway secret when configured", async () => {
		let headers: Record<string, string> | undefined;
		globalThis.fetch = mock(
			async (_input: Parameters<typeof fetch>[0], init?: RequestInit) => {
				headers = init?.headers as Record<string, string> | undefined;
				return new Response(null, { status: 401 });
			},
		) as unknown as typeof fetch;

		await new ApiAuth({
			...config,
			gatewayAuthSecret: "gateway-secret",
		}).authenticate("user@example.com", "password", "203.0.113.7");

		expect(headers?.["x-inbound-gateway-secret"]).toBe("gateway-secret");
		expect(headers?.["x-inbound-client-ip"]).toBe("203.0.113.7");
	});

	it("aborts an authentication request that exceeds its configured timeout", async () => {
		globalThis.fetch = mock(
			(_input: Parameters<typeof fetch>[0], init?: RequestInit) =>
				new Promise<Response>((_resolve, reject) => {
					init?.signal?.addEventListener("abort", () => {
						reject(init.signal?.reason);
					});
				}),
		) as unknown as typeof fetch;

		await expect(
			new ApiAuth(config).authenticate("user@example.com", "password", "203.0.113.7"),
		).rejects.toThrow();
	});
});

const grant: AuthenticatedMailbox = {
	userId: "user",
	credentialId: "credential",
	loginAddress: "user@example.com",
	accessMode: "read_write",
	scopes: [
		{
			id: "scope",
			type: "domain",
			domainId: "domain",
			domain: "example.com",
			address: null,
		},
	],
};

function revalidationHarness(
	authenticate: (
		address: string,
		password: string,
		ip: string,
	) => Promise<AuthenticatedMailbox | null>,
) {
	let now = 1_000_000;
	const listeners = new Map<RevalidatedSession, SessionCallback>();
	const logouts = new Map<RevalidatedSession, string>();
	const calls: Array<[string, string, string]> = [];
	const revalidator = new SessionRevalidator({
		authenticate: async (address, password, ip) => {
			calls.push([address, password, ip]);
			return authenticate(address, password, ip);
		},
		sessions: () => listeners.entries(),
		intervalMs: 300_000,
		maxAgeMs: 86_400_000,
		now: () => now,
	});
	function login(password = "secret", user = grant): RevalidatedSession {
		const session: RevalidatedSession = {
			user: { ...user, address: user.loginAddress },
			remoteAddress: "203.0.113.9",
		};
		revalidator.remember(session, password);
		listeners.set(session, (message) => {
			const reason = (message as { command?: string; reason?: string })
				?.reason;
			if ((message as { command?: string })?.command === "LOGOUT") {
				logouts.set(session, reason ?? "");
				listeners.delete(session);
			}
		});
		return session;
	}
	return {
		revalidator,
		login,
		logouts,
		calls,
		advance: (ms: number) => {
			now += ms;
		},
	};
}

describe("SessionRevalidator", () => {
	it("re-checks sessions through the login API once per credential when due", async () => {
		const harness = revalidationHarness(async () => grant);
		const first = harness.login();
		const second = harness.login();

		await harness.revalidator.run();
		expect(harness.calls).toHaveLength(0);

		harness.advance(300_000);
		await harness.revalidator.run();
		expect(harness.calls).toEqual([
			["user@example.com", "secret", "203.0.113.9"],
		]);
		expect(harness.logouts.size).toBe(0);

		await harness.revalidator.run();
		expect(harness.calls).toHaveLength(1);
		expect([first, second].every((s) => !harness.logouts.has(s))).toBe(true);
	});

	it("closes sessions whose credential is no longer accepted (ban, unverified domain, disabled key)", async () => {
		let valid = true;
		const harness = revalidationHarness(async () => (valid ? grant : null));
		const session = harness.login();
		valid = false;
		harness.advance(300_000);
		await harness.revalidator.run();
		expect(harness.logouts.get(session)).toBe(
			"Mailbox credentials are no longer valid",
		);
	});

	it("closes sessions whose grant changed", async () => {
		const harness = revalidationHarness(async () => ({
			...grant,
			accessMode: "read" as const,
		}));
		const session = harness.login();
		harness.advance(300_000);
		await harness.revalidator.run();
		expect(harness.logouts.get(session)).toBe(
			"Mailbox credentials or scopes changed",
		);
	});

	it("keeps sessions when the login API is temporarily unavailable", async () => {
		const harness = revalidationHarness(async () => {
			throw new Error("Authentication backend returned 503");
		});
		const session = harness.login();
		harness.advance(300_000);
		await harness.revalidator.run();
		expect(harness.logouts.has(session)).toBe(false);
		expect(harness.calls).toHaveLength(1);
		await harness.revalidator.run();
		expect(harness.calls).toHaveLength(2);
	});

	it("caps session age without calling the API", async () => {
		const harness = revalidationHarness(async () => grant);
		const session = harness.login();
		harness.advance(86_400_000);
		await harness.revalidator.run();
		expect(harness.logouts.get(session)).toBe(
			"Session expired, please log in again",
		);
		expect(harness.calls).toHaveLength(0);
	});

	it("re-checks every session at once after a LISTEN reconnect", async () => {
		const harness = revalidationHarness(async (_address, password) =>
			password === "rotated" ? grant : null,
		);
		const stale = harness.login("old");
		const current = harness.login("rotated");
		harness.advance(1_000);
		await harness.revalidator.run(true);
		expect(harness.calls).toHaveLength(2);
		expect(harness.logouts.has(stale)).toBe(true);
		expect(harness.logouts.has(current)).toBe(false);
	});

	it("logs out sessions it has no credential for", async () => {
		const harness = revalidationHarness(async () => grant);
		const session = harness.login();
		harness.revalidator.forget(session);
		await harness.revalidator.run();
		expect(harness.logouts.has(session)).toBe(true);
	});
});

describe("log sanitizing", () => {
	it("strips CR/LF and control characters from client-supplied values", () => {
		expect(sanitizeLogValue("user\r\n[imap] forged\u0000\u001b[31m")).toBe(
			"user  [imap] forged??[31m",
		);
		expect(sanitizeLogValue("x".repeat(5000)).length).toBeLessThan(2100);
	});
});
