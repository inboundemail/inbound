export const AUTH_BASE_PATH = "/api/auth";

export function oauthJwksUrl(baseUrl: string | undefined): string {
	if (!baseUrl) throw new Error("OAuth base URL is required");
	return `${baseUrl.replace(/\/$/u, "")}${AUTH_BASE_PATH}/jwks`;
}
