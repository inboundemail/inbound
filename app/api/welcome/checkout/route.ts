import { headers } from "next/headers";
import { auth } from "@/lib/auth/auth";
import { createEntryPlanCheckout } from "@/lib/billing/entry-plan";

/** Starts Stripe checkout for the entry plan (returning customers keep their old price). */
export async function POST(request: Request) {
	const session = await auth.api.getSession({ headers: await headers() });
	if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

	const origin = new URL(request.url).origin;
	try {
		const url = await createEntryPlanCheckout({
			customerId: session.user.id,
			successUrl: `${origin}/welcome?subscribed=1`,
		});
		return Response.json({ url });
	} catch (error) {
		console.error("welcome checkout failed", error);
		return Response.json({ error: "Couldn't start checkout. Try again in a moment." }, { status: 502 });
	}
}
