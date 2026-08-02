import type { NextRequest } from "next/server";
import { inboundSessionFromRequest } from "@/lib/inbound-api";
import type { StoredInboundSession } from "@/lib/inbound-session";
import { inboundMailMode } from "@/lib/mail-mode";

export function mockInboundSession(): StoredInboundSession {
	return {
		accessToken: "mock-access-token",
		refreshToken: "mock-refresh-token",
		expiresAt: Date.now() + 60 * 60 * 1000,
		user: {
			id: "mock-user",
			name: "Ryan Vogel",
			email: "ryan@inbound.new",
		},
		domainScope: {
			mode: "all",
			domains: [
				{ id: "mock-domain-inbound", domain: "inbound.new" },
				{ id: "mock-domain-northstar", domain: "northstar.studio" },
			],
		},
	};
}

export async function mailSessionFromRequest(request: NextRequest) {
	if (inboundMailMode() === "mock") return mockInboundSession();
	return inboundSessionFromRequest(request);
}
