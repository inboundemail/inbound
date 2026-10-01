import { eq } from "drizzle-orm";
import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth/auth";
import { db } from "@/lib/db";
import { oauthClient } from "@/lib/db/schema";

const handlers = toNextJsHandler(auth);

const LOOPBACK_IP_HOSTS = new Set(["127.0.0.1", "[::1]"]);

/**
 * NextRequest.url rewrites the first 127.x.x.x or [::1] anywhere in the URL to
 * "localhost" (next/dist/server/web/next-url.js), including query values. MCP
 * clients register redirect URIs like http://127.0.0.1:<port>/callback, so the
 * authorize request arrives with http://localhost:<port>/callback and the
 * provider's exact match fails. When the client registered the same callback
 * on a loopback IP, put that host back before better-auth sees the request.
 */
async function restoreLoopbackRedirect(request: Request): Promise<Request> {
	const url = new URL(request.url);
	if (!url.pathname.endsWith("/oauth2/authorize")) return request;
	const clientId = url.searchParams.get("client_id");
	const redirectUri = url.searchParams.get("redirect_uri");
	if (!clientId || !redirectUri) return request;

	let requested: URL;
	try {
		requested = new URL(redirectUri);
	} catch {
		return request;
	}
	if (requested.hostname !== "localhost") return request;

	const [client] = await db
		.select({ redirectUris: oauthClient.redirectUris })
		.from(oauthClient)
		.where(eq(oauthClient.clientId, clientId))
		.limit(1);
	const registered = client?.redirectUris ?? [];
	if (registered.includes(redirectUri)) return request;

	for (const candidate of registered) {
		let parsed: URL;
		try {
			parsed = new URL(candidate);
		} catch {
			continue;
		}
		if (
			LOOPBACK_IP_HOSTS.has(parsed.hostname) &&
			parsed.protocol === requested.protocol &&
			parsed.pathname === requested.pathname &&
			parsed.search === requested.search
		) {
			const restored = new URL(requested);
			restored.hostname = parsed.hostname;
			url.searchParams.set("redirect_uri", restored.toString());
			return new Request(url, { method: request.method, headers: request.headers });
		}
	}
	return request;
}

export const GET = async (request: Request) =>
	handlers.GET(await restoreLoopbackRedirect(request));
export const POST = handlers.POST;
