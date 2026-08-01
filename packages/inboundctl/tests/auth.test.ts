import { describe, expect, it } from "bun:test";
import { loginWithDeviceFlow } from "../src/auth";

describe("device login", () => {
	it("polls, creates an API key, and revokes the bridge session", async () => {
		let tokenPolls = 0;
		let signedOut = false;
		const request = (async (input: string | URL | Request) => {
			const path = new URL(
				input instanceof Request ? input.url : input.toString(),
			).pathname;
			if (path.endsWith("/device/code")) {
				return json({
					device_code: "device-secret",
					user_code: "ABCD-EFGH",
					verification_uri: "https://inbound.new/device",
					expires_in: 600,
					interval: 1,
				});
			}
			if (path.endsWith("/device/token")) {
				tokenPolls += 1;
				if (tokenPolls === 1) {
					return json(
						{ error: "authorization_pending", error_description: "Pending" },
						400,
					);
				}
				return json({
					access_token: "session-token",
					token_type: "Bearer",
					expires_in: 604800,
					scope: "",
				});
			}
			if (path.endsWith("/api-key/create"))
				return json({ id: "key_123", key: "in_key" });
			if (path.endsWith("/get-session"))
				return json({ user: { id: "user_123", email: "ryan@example.com" } });
			if (path.endsWith("/sign-out")) {
				signedOut = true;
				return json({ success: true });
			}
			return json({ error: "not_found" }, 404);
		}) as typeof fetch;

		const credentials = await loginWithDeviceFlow({
			baseUrl: "https://inbound.new",
			request,
			sleep: async () => undefined,
		});

		expect(credentials.apiKey).toBe("in_key");
		expect(credentials.apiKeyId).toBe("key_123");
		expect(credentials.user?.email).toBe("ryan@example.com");
		expect(tokenPolls).toBe(2);
		expect(signedOut).toBe(true);
	});
});

function json(value: unknown, status = 200): Response {
	return new Response(JSON.stringify(value), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}
