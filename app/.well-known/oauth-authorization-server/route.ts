import { oauthProviderAuthServerMetadata } from "@better-auth/oauth-provider";

import { auth } from "@/lib/auth/auth";

// Root alias of /.well-known/oauth-authorization-server/api/auth for MCP
// clients that look for authorization server metadata at the MCP origin.
const metadataHandler = oauthProviderAuthServerMetadata(auth);

export const GET = metadataHandler;
export const HEAD = metadataHandler;
