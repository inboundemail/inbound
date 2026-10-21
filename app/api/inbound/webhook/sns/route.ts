import { NextResponse } from "next/server";

export async function POST() {
	return NextResponse.json({ error: "Gone" }, { status: 410 });
}
