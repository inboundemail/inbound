import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/inbound-session";

export async function POST(request: NextRequest) {
	const response = NextResponse.redirect(new URL("/", request.url), 303);
	response.cookies.delete(SESSION_COOKIE);
	return response;
}
