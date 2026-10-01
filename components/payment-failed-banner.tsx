"use client";

import { useCustomer } from "autumn-js/react";
import { useState } from "react";

/**
 * Shown across the dashboard while a subscription payment is failing
 * (Autumn status "past_due"). Before this, customers only found out when
 * Stripe gave up and canceled the plan, which also caps inbound receiving.
 */
export function PaymentFailedBanner() {
	const { customer, openBillingPortal } = useCustomer();
	const [opening, setOpening] = useState(false);

	const pastDue = customer?.products?.some(
		(product: { status: string }) => product.status === "past_due",
	);
	if (!pastDue) return null;

	const updateCard = async () => {
		setOpening(true);
		try {
			await openBillingPortal({ returnUrl: window.location.href });
		} finally {
			setOpening(false);
		}
	};

	return (
		<div className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
			<span>
				<strong className="font-semibold">Your last payment failed.</strong> Update your payment method so your plan and email
				receiving keep running.
			</span>
			<button
				type="button"
				data-track="billing: update payment method"
				onClick={updateCard}
				disabled={opening}
				className="rounded-md bg-amber-900 px-3 py-1.5 font-medium text-amber-50 transition-colors hover:bg-amber-800 disabled:opacity-60"
			>
				{opening ? "Opening…" : "Update payment method"}
			</button>
		</div>
	);
}
