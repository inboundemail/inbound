"use client";

import { useCustomer } from "autumn-js/react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

const FREE_TIER_PRODUCT_ID = "free_tier";
// Billing and account settings stay reachable without a plan.
const EXCLUDED_PATHS = ["/settings"];

/**
 * There is no free plan, so accounts without an active paid plan are sent to
 * /welcome, which shows their instant inbnd.dev inbox and the subscribe step.
 * Replaces the old "We've retired the free plan" modal.
 */
export function UnpaidWelcomeRedirect() {
	const pathname = usePathname();
	const router = useRouter();
	const { customer, isLoading } = useCustomer();

	const active = (status: string) => status === "active" || status === "trialing";
	const isFreeTier = customer?.products?.some(
		(product: { id: string; status: string }) => product.id === FREE_TIER_PRODUCT_ID && active(product.status),
	);
	const hasPaidPlan = customer?.products?.some(
		(product: { id: string; status: string }) => product.id !== FREE_TIER_PRODUCT_ID && active(product.status),
	);
	const excluded = EXCLUDED_PATHS.some((path) => pathname?.startsWith(path));
	const shouldRedirect = !isLoading && isFreeTier && !hasPaidPlan && !excluded;

	useEffect(() => {
		if (shouldRedirect) router.replace("/welcome");
	}, [shouldRedirect, router]);

	return null;
}
