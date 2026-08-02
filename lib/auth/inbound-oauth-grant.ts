import { z } from "zod";

import type { InboundDomainScopeMode } from "@/lib/auth/inbound-oauth-session";

export interface InboundOAuthGrantSelection {
	clientId: string;
	mode: InboundDomainScopeMode;
	domainIds: string[];
}

const domainIdSchema = z.string().min(1).max(255);

const grantSelectionSchema = z.discriminatedUnion("mode", [
	z.object({
		mode: z.literal("all"),
		clientId: z.string().min(1).max(255),
		domainIds: z.array(domainIdSchema).max(250).optional(),
	}),
	z.object({
		mode: z.literal("selected"),
		clientId: z.string().min(1).max(255),
		domainIds: z.array(domainIdSchema).max(250),
	}),
]);

export function parseInboundOAuthGrantSelection(
	value: unknown,
): InboundOAuthGrantSelection | null {
	const parsed = grantSelectionSchema.safeParse(value);
	if (!parsed.success) return null;

	return {
		clientId: parsed.data.clientId,
		mode: parsed.data.mode,
		domainIds:
			parsed.data.mode === "selected"
				? [...new Set(parsed.data.domainIds)]
				: [],
	};
}
