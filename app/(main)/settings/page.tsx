"use client";

import { measureSubscriptionCreated } from "@/lib/analytics/openai-ads";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCustomer } from "autumn-js/react";
import {
	Check,
	ChevronRight,
	ExternalLink,
	Fingerprint,
	KeyRound,
	Loader2,
	LogOut,
	Minus,
	Plus,
	Trash2,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { updateUserProfile } from "@/app/actions/primary";
import { PricingTable, plans } from "@/components/pricing-table";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	useBillingPortalMutation,
	useCustomerQuery,
	useDomainStatsQuery,
	useReputationMetricsQuery,
	useWarmupStatusQuery,
} from "@/features/settings/hooks";
import { authClient, signOut, useSession } from "@/lib/auth/auth-client";

// Passkey type from better-auth
interface Passkey {
	id: string;
	name: string | null;
	createdAt: Date;
	deviceType: string;
}

export default function SettingsPage() {
	const { data: session, isPending } = useSession();
	const { attach } = useCustomer();
	const [isLoading, setIsLoading] = useState(false);
	const [isAddingAddons, setIsAddingAddons] = useState(false);
	const [isUpgradeDialogOpen, setIsUpgradeDialogOpen] = useState(false);
	const [isUpgradeSuccessOpen, setIsUpgradeSuccessOpen] = useState(false);
	const [isUpgradingPlan, setIsUpgradingPlan] = useState<string | null>(null);

	// Add-on quantities
	const [extraDomains, setExtraDomains] = useState(0);
	const [extraEmailPacks, setExtraEmailPacks] = useState(0);

	// Profile editing state
	const [editingProfile, setEditingProfile] = useState(false);
	const [nameValue, setNameValue] = useState("");

	// Passkey state
	const [isAddingPasskey, setIsAddingPasskey] = useState(false);
	const [passkeySupported, setPasskeySupported] = useState(false);
	const queryClient = useQueryClient();

	const {
		data: customerData,
		isLoading: isLoadingCustomer,
		error: customerError,
		refetch: refetchCustomer,
	} = useCustomerQuery();

	const { data: domainStats, isLoading: isLoadingDomainStats } =
		useDomainStatsQuery();

	const { data: reputationMetrics, isLoading: isLoadingReputation } =
		useReputationMetricsQuery();

	const { data: warmupStatus } = useWarmupStatusQuery();

	const billingPortalMutation = useBillingPortalMutation();

	// Passkey queries and mutations
	const {
		data: passkeys,
		isLoading: isLoadingPasskeys,
		refetch: refetchPasskeys,
	} = useQuery({
		queryKey: ["passkeys"],
		queryFn: async () => {
			const { data, error } = await authClient.passkey.listUserPasskeys();
			if (error) throw new Error(error.message);
			return data as Passkey[];
		},
		enabled: !!session,
	});

	const deletePasskeyMutation = useMutation({
		mutationFn: async (passkeyId: string) => {
			const { data, error } = await authClient.passkey.deletePasskey({
				id: passkeyId,
			});
			if (error) throw new Error(error.message);
			return data;
		},
		onSuccess: () => {
			toast.success("Passkey removed");
			queryClient.invalidateQueries({ queryKey: ["passkeys"] });
		},
		onError: (error) => {
			toast.error(
				error instanceof Error ? error.message : "Failed to remove passkey",
			);
		},
	});

	const router = useRouter();
	const searchParams = useSearchParams();

	useEffect(() => {
		if (session?.user?.name) {
			setNameValue(session.user.name);
		}
	}, [session?.user?.name]);

	// Check passkey support
	useEffect(() => {
		if (typeof window !== "undefined" && window.PublicKeyCredential) {
			PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable?.()
				.then(setPasskeySupported)
				.catch(() => setPasskeySupported(false));
		}
	}, []);

	// Extract existing add-on quantities from customer data
	// Cast to any to access items property which exists at runtime but not in SDK types
	const existingExtraDomainsProduct = customerData?.products?.find(
		(p: any) =>
			p.id === "extra_domains" &&
			(p.status === "active" || p.status === "trialing"),
	) as any;
	const existingEmailPacksProduct = customerData?.products?.find(
		(p: any) =>
			p.id === "50k_email_blocks" &&
			(p.status === "active" || p.status === "trialing"),
	) as any;

	// Get quantities from existing products
	// For domains, quantity is the actual number of domains (billing_units: 1)
	const existingDomainsQuantity =
		existingExtraDomainsProduct?.items?.find(
			(item: any) => item.feature_id === "domains",
		)?.quantity || 0;

	// For email packs, Autumn stores the raw email count (e.g., 50000)
	// We need to divide by 50000 to get the number of packs
	const rawEmailPacksQuantity =
		existingEmailPacksProduct?.items?.find(
			(item: any) => item.feature_id === "inbound_triggers",
		)?.quantity || 0;
	const existingEmailPacksQuantity = Math.floor(rawEmailPacksQuantity / 50000);

	// Initialize add-on quantities from customer data when it loads
	useEffect(() => {
		if (customerData && !isLoadingCustomer) {
			setExtraDomains(existingDomainsQuantity);
			setExtraEmailPacks(existingEmailPacksQuantity);
		}
	}, [
		customerData,
		isLoadingCustomer,
		existingDomainsQuantity,
		existingEmailPacksQuantity,
	]);

	const handleSignOut = async () => {
		try {
			await signOut();
		} catch (error) {
			toast.error("Failed to sign out");
		}
	};

	const handleUpdateProfile = async () => {
		setIsLoading(true);
		try {
			const formData = new FormData();
			formData.append("name", nameValue);
			const result = await updateUserProfile(formData);

			if (result.error) {
				toast.error(result.error);
			} else if (result.success) {
				toast.success(result.message || "Profile updated!");
				setEditingProfile(false);
				window.location.reload();
			}
		} catch (error) {
			toast.error("Failed to update profile");
		} finally {
			setIsLoading(false);
		}
	};

	const handleAddPasskey = async () => {
		setIsAddingPasskey(true);
		try {
			const { data, error } = await authClient.passkey.addPasskey({
				name: `${session?.user?.name || "User"}'s Passkey`,
			});

			if (error) {
				throw new Error(error.message);
			}

			toast.success(
				"Passkey added successfully! You can now use it to sign in.",
			);
			refetchPasskeys();
		} catch (error) {
			console.error("Failed to add passkey:", error);
			// Don't show error if user cancelled
			if (
				error instanceof Error &&
				!error.message.includes("cancelled") &&
				!error.message.includes("aborted")
			) {
				toast.error(
					error instanceof Error ? error.message : "Failed to add passkey",
				);
			}
		} finally {
			setIsAddingPasskey(false);
		}
	};

	const handleDeletePasskey = async (passkeyId: string) => {
		if (
			!confirm(
				"Are you sure you want to remove this passkey? You will no longer be able to use it to sign in.",
			)
		) {
			return;
		}
		deletePasskeyMutation.mutate(passkeyId);
	};

	const handleManageBilling = async () => {
		try {
			const url = await billingPortalMutation.mutateAsync();
			window.open(url, "_blank");
		} catch (error) {
			console.error("Error creating billing portal session:", error);
			toast.error(
				error instanceof Error
					? error.message
					: "Failed to open billing portal",
			);
		}
	};

	const handlePlanUpgrade = async (plan: {
		name: string;
		autumn_id: string;
		price: number;
	}) => {
		setIsUpgradingPlan(plan.autumn_id);
		try {
			const result = (await attach({
				productId: plan.autumn_id,
				successUrl: `${window.location.origin}/settings?upgrade=true&product=${plan.autumn_id}`,
			})) as any;

			// If attach returns a checkoutUrl, redirect manually
			if (result?.checkoutUrl) {
				window.location.href = result.checkoutUrl;
				return;
			}
			if (result?.data?.checkoutUrl) {
				window.location.href = result.data.checkoutUrl;
				return;
			}

			// If no redirect needed (e.g., already has payment method), close dialog and refresh
			toast.success(`Successfully upgraded to ${plan.name} plan!`);
			setIsUpgradeDialogOpen(false);
			refetchCustomer();
		} catch (error) {
			console.error("Plan upgrade error:", error);
			toast.error("Failed to process plan upgrade. Please try again.");
		} finally {
			setIsUpgradingPlan(null);
		}
	};

	// Check if quantities have changed from existing values
	const domainsChanged = extraDomains !== existingDomainsQuantity;
	const emailPacksChanged = extraEmailPacks !== existingEmailPacksQuantity;
	const hasChanges = domainsChanged || emailPacksChanged;
	const hasAnyAddons = extraDomains > 0 || extraEmailPacks > 0;

	const handleAddAddons = async () => {
		if (!hasChanges) return;

		setIsAddingAddons(true);
		let didRedirect = false;

		try {
			// Handle reducing to 0 - user should manage via billing portal
			if (
				(domainsChanged && extraDomains === 0) ||
				(emailPacksChanged && extraEmailPacks === 0)
			) {
				toast.info("To remove add-ons, please use the billing portal.");
				handleManageBilling();
				return;
			}

			// Update extra domains add-on if changed
			if (domainsChanged && extraDomains > 0) {
				const result = (await attach({
					productId: "extra_domains",
					options: [{ featureId: "domains", quantity: extraDomains }],
					successUrl: `${window.location.origin}/settings?addon=extra_domains&quantity=${extraDomains}`,
				})) as any;
				// If attach returns a checkoutUrl, user will be redirected
				if (result?.checkoutUrl || result?.data?.checkoutUrl) {
					didRedirect = true;
				}
			}

			// Update email capacity add-on if changed
			// Note: quantity must be the raw email count (pack count × 50,000), not the pack count
			if (emailPacksChanged && extraEmailPacks > 0 && !didRedirect) {
				const rawEmailQuantity = extraEmailPacks * 50000;
				const result = (await attach({
					productId: "50k_email_blocks",
					options: [
						{ featureId: "inbound_triggers", quantity: rawEmailQuantity },
						{ featureId: "emails_sent", quantity: rawEmailQuantity },
					],
					successUrl: `${window.location.origin}/settings?addon=50k_email_blocks&quantity=${extraEmailPacks}`,
				})) as any;
				if (result?.checkoutUrl || result?.data?.checkoutUrl) {
					didRedirect = true;
				}
			}

			// Only refetch and show success if no redirect happened (payment method on file)
			if (!didRedirect) {
				toast.success("Add-ons updated successfully!");
				refetchCustomer();
			}
		} catch (error) {
			console.error("Error updating add-ons:", error);
			toast.error("Failed to update add-ons. Please try again.");
		} finally {
			setIsAddingAddons(false);
		}
	};

	// Check for upgrade/addon success parameter
	useEffect(() => {
		const upgradeParam = searchParams.get("upgrade");
		const addonParam = searchParams.get("addon");
		const quantityParam = searchParams.get("quantity");

		if (upgradeParam === "true") {
			setIsUpgradeSuccessOpen(true);
			measureSubscriptionCreated();

			const newUrl = new URL(window.location.href);
			newUrl.searchParams.delete("upgrade");
			newUrl.searchParams.delete("product");
			router.replace(newUrl.pathname + newUrl.search);
		}

		// Handle addon purchase success
		if (addonParam) {
			const addonName =
				addonParam === "extra_domains"
					? "Extra domains"
					: "Email capacity pack";
			toast.success(`Successfully added ${quantityParam || 1}x ${addonName}!`);
			refetchCustomer();

			const newUrl = new URL(window.location.href);
			newUrl.searchParams.delete("addon");
			newUrl.searchParams.delete("quantity");
			router.replace(newUrl.pathname + newUrl.search);
		}
	}, [searchParams, router, session?.user?.email, refetchCustomer]);

	if (isPending) {
		return (
			<div className="min-h-screen bg-[#fafaf9] flex items-center justify-center">
				<div className="text-[#78716c]">Loading…</div>
			</div>
		);
	}

	if (!session) {
		router.push("/login");
		return null;
	}

	const activeProduct = customerData?.products?.find(
		(p) => p.status === "active" || p.status === "trialing",
	);
	const domainsFeature = customerData?.features?.["domains"];
	const inboundTriggersFeature = customerData?.features?.["inbound_triggers"];
	const emailsSentFeature = customerData?.features?.["emails_sent"];
	const emailRetentionFeature = customerData?.features?.["email_retention"];

	const currentDomainCount = domainStats?.totalDomains || 0;

	const showUpgradeButton =
		!activeProduct || !activeProduct.name?.toLowerCase().includes("scale");

	return (
		<div className="min-h-screen bg-[#fafaf9] text-[#1c1917] selection:bg-[#8161FF]/20 p-4">
			<div className="max-w-5xl mx-auto px-2">
				{/* Header */}
				<header className="mb-6 pt-2">
					<h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
					<p className="text-[#52525b] text-sm mt-1">
						Manage your account, plan, and add-ons.
					</p>
				</header>

				{/* Current Plan */}
				<section className="py-8 border-t border-[#e7e5e4]">
					<div className="flex items-start justify-between">
						<div>
							<p className="text-xs text-[#78716c] uppercase tracking-wide mb-2">
								Current plan
							</p>
							{isLoadingCustomer ? (
								<div className="h-7 w-24 bg-[#e7e5e4] rounded animate-pulse" />
							) : (
								<div className="flex items-center gap-3">
									<h2 className="text-2xl font-semibold capitalize">
										{activeProduct?.name || "Starter"}
									</h2>
									<span
										className={`text-xs px-2 py-0.5 rounded-full ${
											activeProduct?.status === "active"
												? "bg-[#dcfce7] text-[#166534]"
												: activeProduct?.status === "trialing"
													? "bg-[#fef3c7] text-[#92400e]"
													: "bg-[#f3f4f6] text-[#6b7280]"
										}`}
									>
										{activeProduct?.status === "active"
											? "Active"
											: activeProduct?.status === "trialing"
												? "Trial"
												: "Inactive"}
									</span>
								</div>
							)}
						</div>
						<div className="flex items-center gap-2">
							<button
								onClick={handleManageBilling}
								disabled={billingPortalMutation.isPending}
								className="text-sm text-[#52525b] hover:text-[#1c1917] transition-colors flex items-center gap-1"
							>
								{billingPortalMutation.isPending ? (
									<Loader2 className="w-3.5 h-3.5 animate-spin" />
								) : (
									<ExternalLink className="w-3.5 h-3.5" />
								)}
								Billing
							</button>
							{showUpgradeButton && (
								<button
									onClick={() => setIsUpgradeDialogOpen(true)}
									className="bg-[#8161FF] hover:bg-[#6b4fd9] text-white text-sm px-3 py-1.5 rounded-lg transition-colors"
								>
									Upgrade
								</button>
							)}
						</div>
					</div>

					{/* Usage and Reputation Grid */}
					{!isLoadingCustomer && customerData && (
						<div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-8">
							{/* Left: Usage metrics */}
							<div className="space-y-4">
								<p className="text-xs text-[#78716c] uppercase tracking-wide mb-3">
									Usage
								</p>

								{domainsFeature &&
									(() => {
										const usage = currentDomainCount;
										const remaining = domainsFeature.balance || 0;
										const total = (domainsFeature.usage || 0) + remaining;
										return (
											<div>
												<div className="flex items-center justify-between mb-1.5">
													<span className="text-sm text-[#3f3f46]">
														Domains
													</span>
													<span className="text-xs text-[#78716c] font-mono">
														{domainsFeature.unlimited
															? "∞"
															: `${usage} / ${total}`}
													</span>
												</div>
												{!domainsFeature.unlimited && total > 0 && (
													<div className="h-1.5 w-full rounded-full bg-[#e7e5e4] overflow-hidden">
														<div
															className="h-1.5 rounded-full bg-[#8161FF] transition-all"
															style={{
																width: `${Math.min((usage / total) * 100, 100)}%`,
															}}
														/>
													</div>
												)}
											</div>
										);
									})()}

								{inboundTriggersFeature &&
									(() => {
										const usage = inboundTriggersFeature.usage || 0;
										const remaining = inboundTriggersFeature.balance || 0;
										const total = usage + remaining;
										return (
											<div>
												<div className="flex items-center justify-between mb-1.5">
													<span className="text-sm text-[#3f3f46]">
														Emails received
													</span>
													<span className="text-xs text-[#78716c] font-mono">
														{inboundTriggersFeature.unlimited
															? "∞"
															: `${usage.toLocaleString()} / ${total.toLocaleString()}`}
													</span>
												</div>
												{!inboundTriggersFeature.unlimited && total > 0 && (
													<div className="h-1.5 w-full rounded-full bg-[#e7e5e4] overflow-hidden">
														<div
															className="h-1.5 rounded-full bg-[#22c55e] transition-all"
															style={{
																width: `${Math.min((usage / total) * 100, 100)}%`,
															}}
														/>
													</div>
												)}
											</div>
										);
									})()}

								{emailsSentFeature &&
									(() => {
										const usage = emailsSentFeature.usage || 0;
										const remaining = emailsSentFeature.balance || 0;
										const total = usage + remaining;
										return (
											<div>
												<div className="flex items-center justify-between mb-1.5">
													<div className="flex items-center gap-2">
														<span className="text-sm text-[#3f3f46]">
															Emails sent
														</span>
														{warmupStatus?.isInWarmup && (
															<span className="text-[10px] px-1.5 py-0.5 rounded bg-[#fef3c7] text-[#92400e]">
																{warmupStatus.daysRemaining}d warmup
															</span>
														)}
													</div>
													<span className="text-xs text-[#78716c] font-mono">
														{emailsSentFeature.unlimited
															? "∞"
															: `${usage.toLocaleString()} / ${total.toLocaleString()}`}
													</span>
												</div>
												{!emailsSentFeature.unlimited && total > 0 && (
													<div className="relative h-1.5 w-full rounded-full bg-[#e7e5e4] overflow-hidden">
														{/* Usage bar */}
														<div
															className="h-1.5 rounded-full bg-[#a855f7] transition-all"
															style={{
																width: `${Math.min((usage / total) * 100, 100)}%`,
															}}
														/>
														{/* Warmup cap overlay - shows limited area on the right */}
														{warmupStatus?.isInWarmup &&
															warmupStatus.dailyLimit < total && (
																<div
																	className="absolute top-0 bottom-0 right-0 bg-gradient-to-r from-transparent via-[#fbbf24]/40 to-[#f59e0b]/60 rounded-r-full"
																	style={{
																		width: `${100 - (warmupStatus.dailyLimit / total) * 100}%`,
																	}}
																/>
															)}
													</div>
												)}
												{/* Warmup daily limit info */}
												{warmupStatus?.isInWarmup && (
													<div className="flex items-center justify-between mt-1.5">
														<span className="text-[10px] text-[#92400e]">
															Daily limit: {warmupStatus.emailsSentToday}/
															{warmupStatus.dailyLimit}
														</span>
														<span className="text-[10px] text-[#a8a29e]">
															Resets midnight UTC
														</span>
													</div>
												)}
											</div>
										);
									})()}

								{emailRetentionFeature && (
									<div className="flex items-center justify-between">
										<span className="text-sm text-[#3f3f46]">
											Email retention
										</span>
										<span className="text-xs text-[#78716c] font-mono">
											{emailRetentionFeature.unlimited
												? "∞"
												: `${emailRetentionFeature.balance} days`}
										</span>
									</div>
								)}
							</div>

							{/* Right: Reputation metrics */}
							<div className="space-y-4">
								<p className="text-xs text-[#78716c] uppercase tracking-wide mb-3">
									Reputation (24h)
								</p>

								{isLoadingReputation ? (
									<div className="space-y-4">
										<div className="h-16 bg-[#e7e5e4] rounded animate-pulse" />
										<div className="h-16 bg-[#e7e5e4] rounded animate-pulse" />
										<div className="h-6 bg-[#e7e5e4] rounded animate-pulse" />
									</div>
								) : (
									<>
										{/* Bounce Rate - Scale 0-15% */}
										{(() => {
											const bounceRate = reputationMetrics?.bounceRate ?? 0;
											const bounceBarWidth = Math.min(
												(bounceRate / 15) * 100,
												100,
											);
											const bounceColor =
												bounceRate >= 10
													? "#dc2626"
													: bounceRate >= 5
														? "#ca8a04"
														: "#22c55e";
											return (
												<div>
													<div className="flex items-center justify-between mb-1.5">
														<span className="text-sm text-[#3f3f46]">
															Bounce rate
														</span>
														<span
															className="text-xs font-mono"
															style={{ color: bounceColor }}
														>
															{bounceRate.toFixed(2)}%
														</span>
													</div>
													<div className="relative h-1.5 w-full rounded-full bg-[#e7e5e4] overflow-hidden">
														{/* Warning threshold at 5% (5/15 = 33.3%) */}
														<div
															className="absolute top-0 bottom-0 w-px bg-[#ca8a04]"
															style={{ left: "33.3%" }}
														/>
														{/* At risk threshold at 10% (10/15 = 66.6%) */}
														<div
															className="absolute top-0 bottom-0 w-px bg-[#dc2626]"
															style={{ left: "66.6%" }}
														/>
														{/* Current value bar */}
														<div
															className="h-1.5 rounded-full transition-all"
															style={{
																width: `${bounceBarWidth}%`,
																backgroundColor: bounceColor,
															}}
														/>
													</div>
													<div className="flex items-center justify-between mt-1">
														<div className="flex items-center gap-3 text-[10px] text-[#a8a29e]">
															<span className="flex items-center gap-1">
																<span className="w-1.5 h-1.5 rounded-full bg-[#ca8a04]" />
																5%
															</span>
															<span className="flex items-center gap-1">
																<span className="w-1.5 h-1.5 rounded-full bg-[#dc2626]" />
																10%
															</span>
														</div>
														<span className="text-[10px] text-[#a8a29e]">
															15%
														</span>
													</div>
												</div>
											);
										})()}

										{/* Complaint Rate - Scale 0-1% */}
										{(() => {
											const complaintRate =
												reputationMetrics?.complaintRate ?? 0;
											const complaintBarWidth = Math.min(
												(complaintRate / 1) * 100,
												100,
											);
											const complaintColor =
												complaintRate >= 0.5
													? "#dc2626"
													: complaintRate >= 0.1
														? "#ca8a04"
														: "#22c55e";
											return (
												<div>
													<div className="flex items-center justify-between mb-1.5">
														<span className="text-sm text-[#3f3f46]">
															Complaint rate
														</span>
														<span
															className="text-xs font-mono"
															style={{ color: complaintColor }}
														>
															{complaintRate.toFixed(2)}%
														</span>
													</div>
													<div className="relative h-1.5 w-full rounded-full bg-[#e7e5e4] overflow-hidden">
														{/* Warning threshold at 0.1% (0.1/1 = 10%) */}
														<div
															className="absolute top-0 bottom-0 w-px bg-[#ca8a04]"
															style={{ left: "10%" }}
														/>
														{/* At risk threshold at 0.5% (0.5/1 = 50%) */}
														<div
															className="absolute top-0 bottom-0 w-px bg-[#dc2626]"
															style={{ left: "50%" }}
														/>
														{/* Current value bar */}
														<div
															className="h-1.5 rounded-full transition-all"
															style={{
																width: `${complaintBarWidth}%`,
																backgroundColor: complaintColor,
															}}
														/>
													</div>
													<div className="flex items-center justify-between mt-1">
														<div className="flex items-center gap-3 text-[10px] text-[#a8a29e]">
															<span className="flex items-center gap-1">
																<span className="w-1.5 h-1.5 rounded-full bg-[#ca8a04]" />
																0.1%
															</span>
															<span className="flex items-center gap-1">
																<span className="w-1.5 h-1.5 rounded-full bg-[#dc2626]" />
																0.5%
															</span>
														</div>
														<span className="text-[10px] text-[#a8a29e]">
															1%
														</span>
													</div>
												</div>
											);
										})()}

										{/* Delivery Rate */}
										{(() => {
											const deliveryRate =
												reputationMetrics?.deliveryRate ?? 100;
											const deliveryColor =
												deliveryRate >= 95
													? "#22c55e"
													: deliveryRate >= 90
														? "#ca8a04"
														: "#dc2626";
											return (
												<div className="flex items-center justify-between pt-2 border-t border-[#e7e5e4]">
													<span className="text-sm text-[#3f3f46]">
														Delivery rate
													</span>
													<span
														className="text-xs font-mono"
														style={{ color: deliveryColor }}
													>
														{deliveryRate.toFixed(1)}%
													</span>
												</div>
											);
										})()}
									</>
								)}
							</div>
						</div>
					)}

					{customerError && (
						<div className="mt-6 p-4 bg-[#fef2f2] border border-[#fecaca] rounded-lg">
							<p className="text-sm text-[#b91c1c]">
								Unable to load subscription data
							</p>
							<button
								onClick={() => refetchCustomer()}
								className="mt-2 text-xs text-[#8161FF] hover:underline"
							>
								Try again
							</button>
						</div>
					)}
				</section>

				{/* Add-ons */}
				<section className="py-8 border-t border-[#e7e5e4]">
					<h2 className="font-heading text-lg font-semibold tracking-tight mb-1">
						Add-ons
					</h2>
					<p className="text-sm text-[#52525b] mb-6">
						Scale beyond your plan limits.
					</p>

					<div className="space-y-3">
						{/* Extra domains */}
						<div className="flex items-center justify-between py-3 border-b border-[#e7e5e4]">
							<div>
								<div className="flex items-center gap-2">
									<p className="font-medium text-[#1c1917]">Extra domains</p>
									{existingDomainsQuantity > 0 && (
										<span className="text-xs px-1.5 py-0.5 rounded bg-[#dcfce7] text-[#166534]">
											{existingDomainsQuantity} active
										</span>
									)}
								</div>
								<p className="text-sm text-[#52525b] mt-0.5">
									$3.50/domain per month
								</p>
							</div>
							<div className="flex items-center gap-2 bg-[#f5f5f4] rounded-lg p-1">
								<button
									onClick={() => setExtraDomains(Math.max(0, extraDomains - 1))}
									disabled={extraDomains === 0}
									className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-white transition-colors disabled:opacity-40"
								>
									<Minus className="w-4 h-4" />
								</button>
								<span
									className={`w-8 text-center font-mono text-sm ${domainsChanged ? "text-[#8161FF] font-semibold" : ""}`}
								>
									{extraDomains}
								</span>
								<button
									onClick={() => setExtraDomains(extraDomains + 1)}
									className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-white transition-colors"
								>
									<Plus className="w-4 h-4" />
								</button>
							</div>
						</div>

						{/* Extra email capacity */}
						<div className="flex items-center justify-between py-3 border-b border-[#e7e5e4]">
							<div>
								<div className="flex items-center gap-2">
									<p className="font-medium text-[#1c1917]">
										Extra email capacity
									</p>
									{existingEmailPacksQuantity > 0 && (
										<span className="text-xs px-1.5 py-0.5 rounded bg-[#dcfce7] text-[#166534]">
											{existingEmailPacksQuantity} active
										</span>
									)}
								</div>
								<p className="text-sm text-[#52525b] mt-0.5">
									$16/pack per month · +50,000 emails
								</p>
							</div>
							<div className="flex items-center gap-2 bg-[#f5f5f4] rounded-lg p-1">
								<button
									onClick={() =>
										setExtraEmailPacks(Math.max(0, extraEmailPacks - 1))
									}
									disabled={extraEmailPacks === 0}
									className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-white transition-colors disabled:opacity-40"
								>
									<Minus className="w-4 h-4" />
								</button>
								<span
									className={`w-8 text-center font-mono text-sm ${emailPacksChanged ? "text-[#8161FF] font-semibold" : ""}`}
								>
									{extraEmailPacks}
								</span>
								<button
									onClick={() => setExtraEmailPacks(extraEmailPacks + 1)}
									className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-white transition-colors"
								>
									<Plus className="w-4 h-4" />
								</button>
							</div>
						</div>
					</div>

					<div className="mt-6 flex justify-end">
						<button
							onClick={handleAddAddons}
							disabled={!hasChanges || isAddingAddons}
							className="bg-[#8161FF] hover:bg-[#6b4fd9] disabled:bg-[#e7e5e4] disabled:text-[#a8a29e] text-white text-sm px-4 py-2 rounded-lg transition-colors font-medium flex items-center gap-2"
						>
							{isAddingAddons ? (
								<>
									<Loader2 className="w-4 h-4 animate-spin" />
									Processing…
								</>
							) : !hasChanges ? (
								hasAnyAddons ? (
									"No changes"
								) : (
									"Select add-ons above"
								)
							) : existingDomainsQuantity > 0 ||
								existingEmailPacksQuantity > 0 ? (
								`Update subscription · $${extraDomains * 3.5 + extraEmailPacks * 16}/mo`
							) : (
								`Add to subscription · $${extraDomains * 3.5 + extraEmailPacks * 16}/mo`
							)}
						</button>
					</div>
				</section>

				{/* Profile */}
				<section className="py-8 border-t border-[#e7e5e4]">
					<h2 className="font-heading text-lg font-semibold tracking-tight mb-6">
						Profile
					</h2>

					<div className="space-y-4">
						<div className="flex items-center justify-between py-3 border-b border-[#e7e5e4]">
							<div>
								<p className="text-sm text-[#78716c]">Name</p>
								{editingProfile ? (
									<input
										type="text"
										value={nameValue}
										onChange={(e) => setNameValue(e.target.value)}
										className="mt-1 w-full max-w-xs px-3 py-1.5 text-sm bg-white border border-[#e7e5e4] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#8161FF]/20 focus:border-[#8161FF]"
										autoFocus
									/>
								) : (
									<p className="text-[#1c1917]">{session.user.name || "—"}</p>
								)}
							</div>
							{editingProfile ? (
								<div className="flex items-center gap-2">
									<button
										onClick={() => {
											setEditingProfile(false);
											setNameValue(session.user.name || "");
										}}
										className="text-sm text-[#52525b] hover:text-[#1c1917] transition-colors"
									>
										Cancel
									</button>
									<button
										onClick={handleUpdateProfile}
										disabled={isLoading || !nameValue.trim()}
										className="bg-[#8161FF] hover:bg-[#6b4fd9] disabled:opacity-50 text-white text-sm px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5"
									>
										{isLoading ? (
											<Loader2 className="w-3.5 h-3.5 animate-spin" />
										) : (
											<Check className="w-3.5 h-3.5" />
										)}
										Save
									</button>
								</div>
							) : (
								<button
									onClick={() => setEditingProfile(true)}
									className="text-sm text-[#8161FF] hover:underline"
								>
									Edit
								</button>
							)}
						</div>

						<div className="flex items-center justify-between py-3 border-b border-[#e7e5e4]">
							<div>
								<p className="text-sm text-[#78716c]">Email</p>
								<p className="text-[#1c1917]">{session.user.email}</p>
							</div>
							<span
								className={`text-xs px-2 py-0.5 rounded-full ${
									session.user.emailVerified
										? "bg-[#dcfce7] text-[#166534]"
										: "bg-[#fef3c7] text-[#92400e]"
								}`}
							>
								{session.user.emailVerified ? "Verified" : "Unverified"}
							</span>
						</div>

						<div className="flex items-center justify-between py-3 border-b border-[#e7e5e4]">
							<div>
								<p className="text-sm text-[#78716c]">Member since</p>
								<p className="text-[#1c1917]">
									{new Date(session.user.createdAt).toLocaleDateString(
										"en-US",
										{
											month: "long",
											year: "numeric",
										},
									)}
								</p>
							</div>
						</div>
					</div>
				</section>

				{/* Passkeys / Security */}
				<section className="py-8 border-t border-[#e7e5e4]">
					<div className="flex items-start justify-between mb-6">
						<div>
							<h2 className="font-heading text-lg font-semibold tracking-tight flex items-center gap-2">
								<KeyRound className="w-5 h-5" />
								Passkeys
							</h2>
							<p className="text-sm text-[#52525b] mt-1">
								Sign in securely with fingerprint, face, or device PIN.
							</p>
						</div>
						{passkeySupported && (
							<button
								onClick={handleAddPasskey}
								disabled={isAddingPasskey}
								className="bg-[#8161FF] hover:bg-[#6b4fd9] disabled:opacity-50 text-white text-sm px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5"
							>
								{isAddingPasskey ? (
									<>
										<Loader2 className="w-3.5 h-3.5 animate-spin" />
										Adding…
									</>
								) : (
									<>
										<Plus className="w-3.5 h-3.5" />
										Add passkey
									</>
								)}
							</button>
						)}
					</div>

					{!passkeySupported ? (
						<div className="p-4 bg-[#fef3c7] border border-[#fde68a] rounded-lg">
							<p className="text-sm text-[#92400e]">
								Passkeys are not supported on this device or browser. Try using
								a modern browser like Chrome, Safari, or Edge.
							</p>
						</div>
					) : isLoadingPasskeys ? (
						<div className="space-y-3">
							<div className="h-16 bg-[#e7e5e4] rounded-lg animate-pulse" />
							<div className="h-16 bg-[#e7e5e4] rounded-lg animate-pulse" />
						</div>
					) : passkeys && passkeys.length > 0 ? (
						<div className="space-y-2">
							{passkeys.map((passkey) => (
								<div
									key={passkey.id}
									className="flex items-center justify-between py-3 px-4 bg-[#f5f5f4] rounded-lg"
								>
									<div className="flex items-center gap-3">
										<div className="w-10 h-10 bg-[#e7e5e4] rounded-full flex items-center justify-center">
											<Fingerprint className="w-5 h-5 text-[#52525b]" />
										</div>
										<div>
											<p className="font-medium text-[#1c1917]">
												{passkey.name || "Passkey"}
											</p>
											<p className="text-xs text-[#78716c]">
												Added{" "}
												{new Date(passkey.createdAt).toLocaleDateString(
													"en-US",
													{
														month: "short",
														day: "numeric",
														year: "numeric",
													},
												)}
												{passkey.deviceType && ` · ${passkey.deviceType}`}
											</p>
										</div>
									</div>
									<button
										onClick={() => handleDeletePasskey(passkey.id)}
										disabled={deletePasskeyMutation.isPending}
										className="text-[#78716c] hover:text-[#dc2626] transition-colors p-2 rounded-lg hover:bg-[#fef2f2]"
										title="Remove passkey"
									>
										{deletePasskeyMutation.isPending ? (
											<Loader2 className="w-4 h-4 animate-spin" />
										) : (
											<Trash2 className="w-4 h-4" />
										)}
									</button>
								</div>
							))}
						</div>
					) : (
						<div className="text-center py-8 px-4 bg-[#f5f5f4] rounded-lg">
							<Fingerprint className="w-10 h-10 text-[#a8a29e] mx-auto mb-3" />
							<p className="text-[#52525b] mb-1">No passkeys yet</p>
							<p className="text-sm text-[#78716c]">
								Add a passkey to sign in faster and more securely using your
								device's biometrics.
							</p>
						</div>
					)}
				</section>

				{/* Sign out */}
				<section className="py-8 border-t border-[#e7e5e4]">
					<button
						onClick={handleSignOut}
						className="text-[#52525b] hover:text-[#1c1917] transition-colors flex items-center gap-2 text-sm"
					>
						<LogOut className="w-4 h-4" />
						Sign out
					</button>
				</section>
			</div>

			{/* Upgrade Dialog */}
			<Dialog open={isUpgradeDialogOpen} onOpenChange={setIsUpgradeDialogOpen}>
				<DialogContent className="max-w-2xl bg-[#fafaf9] border-[#e7e5e4]">
					<DialogHeader>
						<DialogTitle className="font-heading text-xl">
							Choose a plan
						</DialogTitle>
						<DialogDescription className="text-[#52525b]">
							Upgrade to unlock more features and higher limits.
						</DialogDescription>
					</DialogHeader>
					<div className="mt-2">
						<PricingTable
							showHeader={false}
							onPlanSelect={handlePlanUpgrade}
							isLoading={isUpgradingPlan}
							currentPlan={activeProduct?.id || "starter"}
						/>
					</div>
				</DialogContent>
			</Dialog>

			{/* Upgrade Success Dialog */}
			<Dialog
				open={isUpgradeSuccessOpen}
				onOpenChange={setIsUpgradeSuccessOpen}
			>
				<DialogContent className="max-w-md bg-[#fafaf9] border-[#e7e5e4]">
					<div className="text-center py-4">
						<div className="w-12 h-12 bg-[#dcfce7] rounded-full flex items-center justify-center mx-auto mb-4">
							<Check className="w-6 h-6 text-[#166534]" />
						</div>
						<DialogTitle className="font-heading text-xl mb-2">
							Upgrade successful!
						</DialogTitle>
						<DialogDescription className="text-[#52525b]">
							Your new plan is now active. Thank you for upgrading!
						</DialogDescription>
						<button
							onClick={() => {
								setIsUpgradeSuccessOpen(false);
								refetchCustomer();
							}}
							className="mt-6 w-full bg-[#8161FF] hover:bg-[#6b4fd9] text-white py-2.5 rounded-lg transition-colors font-medium"
						>
							Continue
						</button>
					</div>
				</DialogContent>
			</Dialog>
		</div>
	);
}
