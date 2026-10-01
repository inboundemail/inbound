import {
	corsPreflight,
	mcpResourceMetadataResponse,
} from "@/lib/auth/mcp-resource-metadata";

export const GET = () => mcpResourceMetadataResponse();
export const OPTIONS = () => corsPreflight();
