import { Autumn as autumn } from "autumn-js";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/auth";
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

	const [domainResult, paid, price] = await Promise.all([
		ensureManagedDomain(session.user.id).then(
			(domain) => ({ domain: domain.domain, error: null }),
			(error: unknown) => {
				console.error("welcome: managed domain provisioning failed", error);
				return { domain: null, error: "We couldn't set up your inbox. Refresh to try again." };
			},
		),
		hasPaidPlan(session.user.id),
		planPrice(),
	]);

	return (
		<WelcomeFlow
			domain={domainResult.domain}
			setupError={domainResult.error}
			accountEmail={session.user.email}
			firstName={session.user.name?.trim().split(/\s+/)[0] || null}
			paid={paid}
			price={price}
			planId={PLAN_ID}
		/>
	);
}
