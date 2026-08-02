import { NextRequest, NextResponse } from "next/server";
import { inboundApiFetch, inboundSessionFromRequest } from "@/lib/inbound-api";
import { canSendFromAddress } from "@/lib/mailbox-config-store";
import type { SendMessageInput } from "@/lib/mail-types";

export async function POST(request: NextRequest) {
	const raw = await request.json().catch(() => null) as Record<string, unknown> | null;
	const body: SendMessageInput | null = raw && typeof raw === "object" && !Array.isArray(raw)
		? {
			from: typeof raw.from === "string" ? raw.from : "",
			to: Array.isArray(raw.to) ? raw.to.filter((value): value is string => typeof value === "string") : [],
			cc: Array.isArray(raw.cc) ? raw.cc.filter((value): value is string => typeof value === "string") : [],
			bcc: Array.isArray(raw.bcc) ? raw.bcc.filter((value): value is string => typeof value === "string") : [],
			subject: typeof raw.subject === "string" ? raw.subject : "",
			html: typeof raw.html === "string" ? raw.html : "",
			text: typeof raw.text === "string" ? raw.text : "",
			replyToThreadId: typeof raw.replyToThreadId === "string" ? raw.replyToThreadId : undefined,
		}
		: null;
	if (!body?.from || body.to.length === 0 || !body.subject || !body.text) {
		return NextResponse.json(
			{ error: "From, recipient, subject, and message are required" },
			{ status: 400 },
		);
	}
	const session = await inboundSessionFromRequest(request);
	if (!session) {
		return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
	}
	if (!await canSendFromAddress(session, body.from)) {
		return NextResponse.json(
			{ error: "That From address is not configured for Inbound Mail" },
			{ status: 403 },
		);
	}

	const path = body.replyToThreadId
		? `/api/e2/emails/${encodeURIComponent(body.replyToThreadId)}/reply`
		: "/api/e2/emails";
	const response = await inboundApiFetch(request, path, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"Idempotency-Key": crypto.randomUUID(),
		},
		body: JSON.stringify({
			from: body.from,
			to: body.to,
			cc: body.cc.length ? body.cc : undefined,
			bcc: body.bcc.length ? body.bcc : undefined,
			subject: body.subject,
			html: body.html,
			text: body.text,
		}),
	}, session);

	if (!response) {
		return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
	}
	const payload = await response.json();
	return NextResponse.json(payload, { status: response.status });
}
