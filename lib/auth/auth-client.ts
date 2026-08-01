import { apiKeyClient } from "@better-auth/api-key/client";
import { passkeyClient } from "@better-auth/passkey/client";
import {
	adminClient,
	deviceAuthorizationClient,
	magicLinkClient,
} from "better-auth/client/plugins";
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
		deviceAuthorizationClient(),
		magicLinkClient(),
		passkeyClient(),
	],
});

export const { signIn, signUp, signOut, useSession } = authClient;
