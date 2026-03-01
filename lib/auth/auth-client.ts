import { apiKeyClient } from "@better-auth/api-key/client";
import { sentinelClient } from "@better-auth/infra/client";
import { passkeyClient } from "@better-auth/passkey/client";
import { adminClient, magicLinkClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
	baseURL:
		typeof window !== "undefined"
			? window.location.origin
			: process.env.NODE_ENV === "development"
				? "http://localhost:3000"
				: "https://inbound.new",
	plugins: [
		adminClient(),
		apiKeyClient(),
		magicLinkClient(),
		passkeyClient(),
		sentinelClient(),
	],
});

export const { signIn, signUp, signOut, useSession } = authClient;
