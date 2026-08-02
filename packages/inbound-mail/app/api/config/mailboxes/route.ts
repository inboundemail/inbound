import { NextRequest, NextResponse } from "next/server";
import { mailSessionFromRequest } from "@/lib/mail-session";
import {
	readMailboxConfiguration,
	saveMailboxConfiguration,
} from "@/lib/mailbox-config-store";
import { MailboxConfigurationError } from "@/lib/mailbox-config-model";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
	const session = await mailSessionFromRequest(request);
	if (!session) {
		return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
	}
	try {
		return NextResponse.json(await readMailboxConfiguration(session));
	} catch {
		return NextResponse.json(
			{ error: "Mailbox configuration is temporarily unavailable" },
			{ status: 503 },
		);
	}
}

export async function PUT(request: NextRequest) {
	const origin = request.headers.get("origin");
	if (origin && new URL(origin).host !== request.nextUrl.host) {
		return NextResponse.json({ error: "Invalid request origin" }, { status: 403 });
	}
	const session = await mailSessionFromRequest(request);
	if (!session) {
		return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
	}
	const input = await request.json().catch(() => null);
	try {
		return NextResponse.json(await saveMailboxConfiguration(session, input));
	} catch (error) {
		if (error instanceof MailboxConfigurationError) {
			return NextResponse.json({ error: error.message }, { status: 400 });
		}
		return NextResponse.json(
			{ error: "Mailbox configuration could not be saved" },
			{ status: 503 },
		);
	}
}
