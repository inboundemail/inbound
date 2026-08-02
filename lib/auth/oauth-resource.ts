export const AUTH_BASE_PATH = "/api/auth";

export function oauthIssuerUrl(baseUrl: string | undefined): string {
	if (!baseUrl) throw new Error("OAuth base URL is required");
	return `${baseUrl.replace(/\/$/u, "")}${AUTH_BASE_PATH}`;
}

export function oauthJwksUrl(baseUrl: string | undefined): string {
	return `${oauthIssuerUrl(baseUrl)}/jwks`;
}
