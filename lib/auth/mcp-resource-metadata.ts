import { authBaseURL } from "@/lib/auth/auth";
import {
	INBOUND_ACCOUNT_SCOPE,
	MCP_RESOURCE_URL,
} from "@/lib/auth/inbound-oauth-session";

const CORS = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Methods": "GET, OPTIONS",
	"Access-Control-Allow-Headers": "Content-Type, mcp-protocol-version",
};

/** RFC 9728 protected resource metadata for the MCP endpoint. */
export function mcpResourceMetadataResponse(): Response {
	return Response.json(
		{
			resource: MCP_RESOURCE_URL,
			authorization_servers: [`${authBaseURL}/api/auth`],
			scopes_supported: [
				INBOUND_ACCOUNT_SCOPE,
				"offline_access",
				"openid",
				"profile",
				"email",
			],
			bearer_methods_supported: ["header"],
			resource_name: "Inbound",
			resource_documentation: "https://inbound.new/docs/integrations/mcp",
		},
		{ headers: { ...CORS, "Cache-Control": "public, max-age=3600" } },
	);
}

export function corsPreflight(): Response {
	return new Response(null, { status: 204, headers: CORS });
}
