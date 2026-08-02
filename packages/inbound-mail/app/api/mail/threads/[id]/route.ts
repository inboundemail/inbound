import { NextRequest, NextResponse } from "next/server";
import { inboundApiFetch } from "@/lib/inbound-api";

export async function GET(
	request: NextRequest,
	context: { params: Promise<{ id: string }> },
) {
	const { id } = await context.params;
	const response = await inboundApiFetch(
		request,
		`/api/e2/mail/threads/${encodeURIComponent(id)}`,
	);
	if (!response) {
		return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
	}

	const payload = await response.json();
	return NextResponse.json(payload, { status: response.status });
}
