import { eq, sql } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { campaignLinks } from "@/lib/db/schema";

const HOME_URL = "https://inbound.new";
const DEFAULT_PLAN_ID = "inbound_default_test";

/**
 * GET /r/[token]?to=home|checkout
 *
 * Tokenized campaign redirect with click tracking.
 * - to=home (default): logs the click, redirects to the homepage with UTM params.
 * - to=checkout: logs the click, generates a fresh Autumn checkout for the
 *   recipient's customer id and redirects straight into Stripe checkout.
 *
 * Unknown tokens redirect to the homepage without logging.
 */
export async function GET(
	request: NextRequest,
	{ params }: { params: Promise<{ token: string }> },
) {
	const { token } = await params;
	const to =
		request.nextUrl.searchParams.get("to") === "checkout" ? "checkout" : "home";

	const [link] = await db
		.select()
		.from(campaignLinks)
		.where(eq(campaignLinks.token, token))
		.limit(1);

	if (!link) {
		return NextResponse.redirect(HOME_URL, 302);
	}

	const now = new Date();
	await db
		.update(campaignLinks)
		.set({
			homeClicks:
				to === "home"
					? sql`${campaignLinks.homeClicks} + 1`
					: campaignLinks.homeClicks,
			checkoutClicks:
				to === "checkout"
					? sql`${campaignLinks.checkoutClicks} + 1`
					: campaignLinks.checkoutClicks,
			firstClickedAt: sql`COALESCE(${campaignLinks.firstClickedAt}, ${now})`,
			lastClickedAt: now,
		})
		.where(eq(campaignLinks.token, token));

	const utm = new URLSearchParams({
		utm_source: "email",
		utm_medium: "outreach",
		utm_campaign: link.campaign,
		utm_content: link.variant,
	});

	if (to === "checkout") {
		try {
			const { Autumn } = await import("autumn-js");
			const { data } = await Autumn.checkout({
				customer_id: link.customerId,
				product_id: DEFAULT_PLAN_ID,
			});
			if (data?.url) {
				return NextResponse.redirect(data.url, 302);
			}
		} catch (error) {
			console.error("campaign checkout generation failed", {
				token,
				customerId: link.customerId,
				error,
			});
		}
		// Fallback: send them to the site if checkout could not be generated
		// (e.g. already on the plan).
		return NextResponse.redirect(`${HOME_URL}/?${utm}`, 302);
	}

	return NextResponse.redirect(`${HOME_URL}/?${utm}`, 302);
}
