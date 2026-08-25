import { type NextRequest, NextResponse } from "next/server";
import {
	HOMEPAGE_EXPERIMENT_COOKIE,
	type HomepageVariant,
	isHomepageVariant,
} from "@/lib/homepage-experiment";

export function proxy(request: NextRequest) {
	const override = request.nextUrl.searchParams.get("variant");
	const existing = request.cookies.get(HOMEPAGE_EXPERIMENT_COOKIE)?.value;
	const variant: HomepageVariant = isHomepageVariant(override)
		? override
		: isHomepageVariant(existing)
			? existing
			: Math.random() < 0.5
				? "control"
				: "redesign";

	if (variant !== existing) {
		request.cookies.set(HOMEPAGE_EXPERIMENT_COOKIE, variant);
	}

	const response = NextResponse.next({ request: { headers: request.headers } });

	if (variant !== existing) {
		response.cookies.set(HOMEPAGE_EXPERIMENT_COOKIE, variant, {
			maxAge: 90 * 24 * 60 * 60,
			path: "/",
			sameSite: "lax",
			secure: process.env.NODE_ENV === "production",
			httpOnly: false,
		});
	}

	return response;
}

export const config = { matcher: "/" };
