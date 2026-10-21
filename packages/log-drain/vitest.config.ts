import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
	plugins: [
		cloudflareTest({
			wrangler: { configPath: "./wrangler.jsonc", environment: "local" },
			miniflare: {
				bindings: {
					VERCEL_DRAIN_SECRET: "test-drain-secret",
					VERCEL_VERIFY_TOKEN: "test-verify-token",
					QUERY_TOKEN: "test-query-token-0123456789abcdef0123",
					EMAIL_HASH_KEY: "test-email-hash-key",
				},
			},
		}),
	],
});
