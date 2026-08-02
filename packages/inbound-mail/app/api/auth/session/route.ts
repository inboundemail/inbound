import { NextRequest, NextResponse } from "next/server";
import { inboundSessionFromRequest } from "@/lib/inbound-api";
import { inboundMailMode } from "@/lib/mail-mode";
import { mockInboundSession } from "@/lib/mail-session";

export async function GET(request: NextRequest) {
	const mode = inboundMailMode();
	if (mode === "mock") {
		const session = mockInboundSession();
		return NextResponse.json({
			authenticated: true,
			mode: "mock",
			user: session.user,
			domainScope: session.domainScope,
		});
	}

	const session = await inboundSessionFromRequest(request);
	if (!session) {
		return NextResponse.json({ authenticated: false, mode }, { status: 401 });
	}
	return NextResponse.json({
		authenticated: true,
		mode,
		user: session.user,
		domainScope: session.domainScope,
	});
}
