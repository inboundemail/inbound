export const OAUTH_STATE_COOKIE = "inbound_mail_oauth_state";
export const OAUTH_VERIFIER_COOKIE = "inbound_mail_oauth_verifier";
export const OAUTH_MOCK_SELECTION_COOKIE = "inbound_mail_mock_domains";

export function oauthIssuer(): string {
	return (process.env.INBOUND_OAUTH_ISSUER || "https://inbound.new/api/auth").replace(
		/\/$/,
		"",
	);
}

export function oauthResource(): string {
	const apiBaseUrl = (process.env.INBOUND_API_BASE_URL || "https://inbound.new").replace(
		/\/$/,
		"",
	);
	return `${apiBaseUrl}/api`;
}

export function appBaseUrl(requestUrl?: string): string {
	if (process.env.NEXT_PUBLIC_APP_URL) {
		return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
	}
	if (requestUrl) return new URL(requestUrl).origin;
	return "http://localhost:3010";
}

export function callbackUrl(requestUrl?: string): string {
	return `${appBaseUrl(requestUrl)}/api/auth/callback/inbound`;
}

export function temporaryCookieOptions() {
	return {
		httpOnly: true,
		secure: process.env.NODE_ENV === "production",
		sameSite: "lax" as const,
		path: "/",
		maxAge: 60 * 10,
	};
}

export function base64Url(bytes: Uint8Array): string {
	return Buffer.from(bytes)
		.toString("base64")
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/g, "");
}

export function randomUrlSafe(byteLength = 32): string {
	return base64Url(crypto.getRandomValues(new Uint8Array(byteLength)));
}

export async function pkceChallenge(verifier: string): Promise<string> {
	const digest = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(verifier),
	);
	return base64Url(new Uint8Array(digest));
}
