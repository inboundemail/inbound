import { describe, expect, it } from "bun:test";
import {
	AUTH_BASE_PATH,
	oauthIssuerUrl,
	oauthJwksUrl,
} from "@/lib/auth/oauth-resource";

describe("OAuth resource verification", () => {
	it("uses the Better Auth base path for the signing key endpoint", () => {
		expect(AUTH_BASE_PATH).toBe("/api/auth");
		expect(oauthIssuerUrl("https://inbound.new")).toBe(
			"https://inbound.new/api/auth",
		);
		expect(oauthJwksUrl("https://inbound.new")).toBe(
			"https://inbound.new/api/auth/jwks",
		);
		expect(() => oauthIssuerUrl(undefined)).toThrow(
			"OAuth base URL is required",
		);
	});
});
