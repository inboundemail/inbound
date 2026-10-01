"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";

const plans = [
	{
		name: "Default",
		price: 9,
		description: "5,000 emails/mo · Basic support",
		autumn_id: "inbound_default_test",
	},
	{
		name: "Pro",
		price: 15,
		description: "50,000 emails/mo · 50 domains",
		autumn_id: "pro",
	},
	{
		name: "Growth",
		price: 39,
		description: "100,000 emails/mo · 300 domains",
		autumn_id: "growth",
	},
	{
		name: "Scale",
		price: 79,
		description: "200,000 emails/mo · unlimited domains",
		autumn_id: "scale",
	},
];

interface PricingTableProps {
	showHeader?: boolean;
	onPlanSelect?: (plan: (typeof plans)[0]) => void;
	isLoading?: string | null;
	currentPlan?: string | null;
}

export function PricingTable({
	showHeader = true,
	onPlanSelect,
	isLoading = null,
	currentPlan = null,
}: PricingTableProps) {
	const isInteractive = !!onPlanSelect;
	const [pendingPlan, setPendingPlan] = useState<(typeof plans)[0] | null>(
		null,
	);

	const handlePlanClick = (plan: (typeof plans)[0]) => {
		setPendingPlan(plan);
	};

	const handleConfirm = () => {
		if (pendingPlan && onPlanSelect) {
			onPlanSelect(pendingPlan);
		}
		setPendingPlan(null);
	};

	const handleCancel = () => {
		setPendingPlan(null);
	};

	const isDowngrade = (plan: (typeof plans)[0]) => {
		if (!currentPlan) return false;
		const currentIndex = plans.findIndex((p) => p.autumn_id === currentPlan);
		const targetIndex = plans.findIndex((p) => p.autumn_id === plan.autumn_id);
		return currentIndex > targetIndex;
	};

	return (
		<>
			<section className="py-12 border-t border-[#e7e5e4]">
				{showHeader && (
					<>
						<h2 className="font-heading text-xl font-semibold tracking-tight mb-2">
							Pricing
						</h2>
						<p className="text-[#52525b] mb-6">
							Simple, predictable pricing that scales with you.
						</p>
					</>
				)}
				<div className="space-y-2 text-sm">
					{plans.map((plan) =>
						isInteractive ? (
							<button
								key={plan.name}
								onClick={() => handlePlanClick(plan)}
								disabled={
									isLoading === plan.autumn_id || currentPlan === plan.autumn_id
								}
								className="group w-full flex justify-between items-center py-3 border-b border-[#e7e5e4] text-left hover:bg-white/50 transition-colors disabled:opacity-50"
							>
								<div>
									<div className="flex items-center gap-2">
										<span className="text-[#1c1917] font-medium">
											{plan.name}
										</span>
										{currentPlan === plan.autumn_id && (
											<span className="text-xs text-[#78716c]">· Current</span>
										)}
									</div>
									<p className="text-[#52525b] text-xs mt-0.5">
										{plan.description}
									</p>
								</div>
								<div className="flex items-center gap-4">
									{isLoading === plan.autumn_id ? (
										<div className="w-4 h-4 border-2 border-[#8161FF] border-t-transparent rounded-full animate-spin" />
									) : (
										<span className="text-[#1c1917] font-medium">
											${plan.price}/mo
										</span>
									)}
								</div>
							</button>
						) : (
							<div
								key={plan.name}
								className="group flex justify-between items-center py-3 border-b border-[#e7e5e4]"
							>
								<div>
									<span className="text-[#1c1917] font-medium">
										{plan.name}
									</span>
									<p className="text-[#52525b] text-xs mt-0.5">
										{plan.description}
									</p>
								</div>
								<div className="relative flex items-center justify-end min-w-[180px]">
									<span className="text-[#1c1917] font-medium transition-all duration-200 group-hover:opacity-0">
										${plan.price}/mo
									</span>
									<Link
										href="/login"
										className="absolute bg-[#8161FF] hover:bg-[#6b4fd9] text-white text-xs font-medium px-3 py-1.5 rounded-lg whitespace-nowrap opacity-0 transition-all duration-200 group-hover:opacity-100"
									>
										Get started for ${plan.price}/mo
									</Link>
								</div>
							</div>
						),
					)}
					<div className="flex justify-between py-3 border-b border-[#e7e5e4]">
						<span className="text-[#3f3f46]">Additional domains</span>
						<span className="text-[#1c1917]">$3.50/domain/mo</span>
					</div>
					<div className="flex justify-between py-3">
						<span className="text-[#3f3f46]">Additional email capacity</span>
						<span className="text-[#1c1917]">$16/50k received + 50k sent/mo</span>
					</div>
				</div>
			</section>

			{isInteractive && (
				<Dialog
					open={!!pendingPlan}
					onOpenChange={(open) => {
						if (!open) handleCancel();
					}}
				>
					<DialogContent className="max-w-sm">
						<DialogHeader>
							<DialogTitle>
								{pendingPlan && isDowngrade(pendingPlan)
									? `Downgrade to ${pendingPlan?.name}?`
									: `Upgrade to ${pendingPlan?.name}?`}
							</DialogTitle>
							<DialogDescription>
								{pendingPlan && isDowngrade(pendingPlan) ? (
									<>
										Your plan will change to{" "}
										<strong>{pendingPlan?.name}</strong> at{" "}
										<strong>${pendingPlan?.price}/mo</strong>. Your limits will
										be adjusted at the end of your current billing period.
									</>
								) : (
									<>
										You'll be {currentPlan ? "switched" : "subscribed"} to the{" "}
										<strong>{pendingPlan?.name}</strong> plan at{" "}
										<strong>${pendingPlan?.price}/mo</strong>.{" "}
										{pendingPlan?.description}
									</>
								)}
							</DialogDescription>
						</DialogHeader>
						<DialogFooter className="gap-2 sm:gap-0">
							<Button variant="secondary" onClick={handleCancel}>
								Cancel
							</Button>
							<Button onClick={handleConfirm}>
								{pendingPlan && isDowngrade(pendingPlan)
									? "Confirm downgrade"
									: "Confirm"}
							</Button>
						</DialogFooter>
					</DialogContent>
				</Dialog>
			)}
		</>
	);
}

export { plans };
