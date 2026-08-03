import { oauthProviderAuthServerMetadata } from "@better-auth/oauth-provider";

import { auth } from "@/lib/auth/auth";

const metadataHandler = oauthProviderAuthServerMetadata(auth);

export const GET = metadataHandler;
export const HEAD = metadataHandler;
