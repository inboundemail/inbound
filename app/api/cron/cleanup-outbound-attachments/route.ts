import { NextResponse } from "next/server";
import { cleanupExpiredOutboundAttachments } from "@/app/api/e2/helper/outbound-attachment-storage";

export async function GET(request: Request) {
	const cronSecret = process.env.CRON_SECRET;
	if (!cronSecret) {
		return NextResponse.json(
			{ error: "Cron endpoint is not configured" },
			{ status: 500 },
		);
	}
	if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	try {
		const deleted = await cleanupExpiredOutboundAttachments();
		return NextResponse.json({ deleted });
	} catch (error) {
		console.error("Failed to clean up outbound attachments", error);
		return NextResponse.json({ error: "Cleanup failed" }, { status: 500 });
	}
}
