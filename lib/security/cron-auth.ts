import { NextResponse } from "next/server";
import { secretsEqual } from "@/lib/security/secret-compare";

export function assertCronAuthorized(
	request: Request,
	routeName: string,
): NextResponse | null {
	const cronSecret = process.env.CRON_SECRET;
	if (!cronSecret) {
		console.error(
			`[${routeName}] CRON_SECRET is not configured; refusing to run public cron endpoint`,
		);
		return NextResponse.json(
			{ error: "Cron endpoint is not configured" },
			{ status: 500 },
		);
	}

	const authHeader = request.headers.get("authorization") || "";
	if (!secretsEqual(`Bearer ${cronSecret}`, authHeader)) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	return null;
}
