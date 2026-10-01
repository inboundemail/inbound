import { Autumn as autumn } from "autumn-js";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { nanoid } from "nanoid";
import { auth } from "@/lib/auth/auth";
import { getEntryPlanOffer } from "@/lib/billing/entry-plan";
import { db } from "@/lib/db";
import { userOnboarding } from "@/lib/db/schema";
import { ensureManagedDomain, hasPaidPlan } from "@/lib/domains-and-dns/managed-domain";
import { WelcomeFlow } from "./welcome-flow";

export const metadata: Metadata = {
	title: "Welcome to inbound",
	robots: { index: false },
};

export const dynamic = "force-dynamic";

const PLAN_ID = "inbound_default_test";

async function planPrice(): Promise<number | null> {
	const { data } = await autumn.products.get(PLAN_ID).catch(() => ({ data: null }));
	const item = data?.items?.find((entry) => entry.type === "price");
	return typeof item?.price === "number" ? item.price : null;
}

export default async function WelcomePage() {
	const session = await auth.api.getSession({ headers: await headers() }).catch(() => null);
	if (!session?.user) redirect("/login");

	const [domainResult, paid, listPrice, offer] = await Promise.all([
		ensureManagedDomain(session.user.id).then(
			(domain) => ({ domain: domain.domain, error: null }),
			(error: unknown) => {
				console.error("welcome: managed domain provisioning failed", error);
				return { domain: null, error: "We couldn't set up your inbox. Refresh to try again." };
			},
		),
		hasPaidPlan(session.user.id),
		planPrice(),
		getEntryPlanOffer(session.user.id),
	]);

	// Paying users are done onboarding; without this the sign-in hook keeps
	// sending them back here.
	if (paid) {
		const now = new Date();
		await db
			.insert(userOnboarding)
			.values({ id: nanoid(), userId: session.user.id, isCompleted: true, defaultEndpointCreated: false, completedAt: now, createdAt: now, updatedAt: now })
			.onConflictDoUpdate({ target: userOnboarding.userId, set: { isCompleted: true, completedAt: now, updatedAt: now } })
			.catch((error: unknown) => console.error("welcome: could not mark onboarding complete", error));
	}

	return (
		<WelcomeFlow
			domain={domainResult.domain}
			setupError={domainResult.error}
			accountEmail={session.user.email}
			firstName={session.user.name?.trim().split(/\s+/)[0] || null}
			paid={paid}
			price={offer.price ?? listPrice}
			returning={offer.returning}
		/>
	);
}
