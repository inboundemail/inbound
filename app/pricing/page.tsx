import { headers } from "next/headers";
import { PricingInteractive } from "@/components/marketing/pricing-interactive";
import { MarketingFooter, MarketingNav } from "@/components/marketing-nav";
import { auth } from "@/lib/auth/auth";

export default async function PricingPage() {
	const session = await auth.api
		.getSession({
			headers: await headers(),
		})
		.catch(() => null);

	const isLoggedIn = !!session?.user;

	return (
		<div className="min-h-screen bg-[#fafaf9] text-[#1c1917] selection:bg-[#8161FF]/20">
			<div className="max-w-2xl mx-auto px-6">
				<MarketingNav isLoggedIn={isLoggedIn} />

				{/* Hero */}
				<section className="pt-20 pb-12">
					<h1 className="font-heading text-[32px] leading-[1.2] tracking-tight mb-2">
						Pricing
					</h1>
					<p className="text-[#52525b] leading-relaxed">
						Simple, predictable pricing that scales with you.
					</p>
				</section>

				{/* Interactive Pricing Table - Client Component */}
				<PricingInteractive />

				{/* FAQ */}
				<section className="py-12 border-t border-[#e7e5e4]">
					<h2 className="font-heading text-xl font-semibold tracking-tight mb-6">
						FAQ
					</h2>
					<div className="space-y-6">
						<div>
							<p className="text-[#1c1917]">Can I use my own domain?</p>
							<p className="text-sm text-[#52525b] mt-1">
								Yes. Configure your MX records to point to our servers and you
								can receive email at any address on your domain.
							</p>
						</div>
						<div>
							<p className="text-[#1c1917]">How fast are webhooks delivered?</p>
							<p className="text-sm text-[#52525b] mt-1">
								Typically under 100ms from when we receive the email. We retry
								failed webhooks with exponential backoff.
							</p>
						</div>
						<div>
							<p className="text-[#1c1917]">What about spam filtering?</p>
							<p className="text-sm text-[#52525b] mt-1">
								We run incoming email through spam detection. You can choose to
								reject, flag, or accept spam in your mailbox settings.
							</p>
						</div>
						<div>
							<p className="text-[#1c1917]">
								Can I upgrade or downgrade my plan?
							</p>
							<p className="text-sm text-[#52525b] mt-1">
								Yes, you can change your plan at any time. Upgrades take effect
								immediately, and downgrades apply at the start of your next
								billing cycle.
							</p>
						</div>
						<div>
							<p className="text-[#1c1917]">
								What happens if I exceed my plan limits?
							</p>
							<p className="text-sm text-[#52525b] mt-1">
								We'll notify you when you're approaching your limit. You can
								upgrade your plan to continue receiving emails without
								interruption.
							</p>
						</div>
						<div>
							<p className="text-[#1c1917]">Do you offer annual billing?</p>
							<p className="text-sm text-[#52525b] mt-1">
								Yes, annual billing is available with a discount. Contact us for
								enterprise pricing and custom solutions.
							</p>
						</div>
						<div>
							<p className="text-[#1c1917]">Is there a free trial?</p>
							<p className="text-sm text-[#52525b] mt-1">
								Yes, our free tier allows you to test the service with no credit
								card required. You can upgrade when you're ready to scale.
							</p>
						</div>
						<div>
							<p className="text-[#1c1917]">
								What payment methods do you accept?
							</p>
							<p className="text-sm text-[#52525b] mt-1">
								We accept all major credit cards through Stripe. Enterprise
								customers can request invoicing.
							</p>
						</div>
						<div>
							<p className="text-[#1c1917]">How do I cancel my subscription?</p>
							<p className="text-sm text-[#52525b] mt-1">
								You can cancel anytime from your billing settings. Your service
								will continue until the end of your current billing period.
							</p>
						</div>
						<div>
							<p className="text-[#1c1917]">Do you provide SLA guarantees?</p>
							<p className="text-sm text-[#52525b] mt-1">
								Yes, our paid plans include a 99.9% uptime SLA. Enterprise plans
								can include custom SLA terms and dedicated support.
							</p>
						</div>
					</div>
				</section>

				<MarketingFooter />
			</div>
		</div>
	);
}
