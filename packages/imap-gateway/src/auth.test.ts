import { afterEach, describe, expect, it, mock } from "bun:test";
import { ApiAuth } from "./auth.ts";
import type { ImapConfig } from "./config.ts";

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
	maxConnections: 200,
	maxConnectionsPerIp: 20,
	authFailureLimit: 10,
	authFailureWindowMs: 900_000,
	apiTimeoutMs: 20,
	maxMessageBytes: 1024 * 1024,
	appendMaxBytesPerUser: 250 * 1024 * 1024,
	appendMaxMessagesPerUser: 5000,
};

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe("ApiAuth", () => {
	it("passes an expiring abort signal to the authentication backend", async () => {
		let signal: AbortSignal | null | undefined;
		globalThis.fetch = mock(
			async (_input: Parameters<typeof fetch>[0], init?: RequestInit) => {
				signal = init?.signal;
				return new Response(null, { status: 401 });
			},
		) as unknown as typeof fetch;

		const result = await new ApiAuth(config).authenticate(
			"user@example.com",
			"password",
		);

		expect(result).toBeNull();
		expect(signal).toBeInstanceOf(AbortSignal);
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
			new ApiAuth(config).authenticate("user@example.com", "password"),
		).rejects.toThrow();
	});
});
