import { BookOpen, Workflow } from "lucide-react";
import { headers } from "next/headers";
import Link from "next/link";
import EnvelopeSparkle from "@/components/icons/envelope-sparkle";
import { GetStartedTabs } from "@/components/marketing/get-started-tabs";
import { DemoInbox } from "@/components/marketing/demo-inbox";
import { HeroSignupButton } from "@/components/marketing/hero-signup-button";
import { MarketingFooter, MarketingNav } from "@/components/marketing-nav";
import { PricingTable } from "@/components/pricing-table";
import { auth } from "@/lib/auth/auth";

export default async function Page() {
	const session = await auth.api
		.getSession({
			headers: await headers(),
		})
		.catch(() => null);

	const isLoggedIn = !!session?.user;

	return (
		<div className="min-h-screen bg-[#fafaf9] text-[#1c1917] selection:bg-[#8161FF] selection:text-white">
			{/* Top announcement banner */}
			<div className="bg-[#8161FF] text-white text-center py-2 px-4">
				<p className="text-sm">
					<span className="font-medium">Extra domains now just $3.50/mo</span>
					<span className="opacity-80 ml-1.5">— add as many as you need</span>
				</p>
			</div>

			<div className="max-w-2xl mx-auto px-6">
				<MarketingNav isLoggedIn={isLoggedIn} />

				{/* Hero */}
				<section className="pt-20 pb-16">
					<h1 className="max-w-2xl font-heading text-[32px] leading-[1.2] tracking-tight text-[#1B1917]">
						email infrastructure built for{" "}
						<span className="whitespace-nowrap text-[#8161FF]">
							<EnvelopeSparkle className="inline-block size-8 align-middle" />{" "}
							agent inboxes,
						</span>{" "}
						webhooks, and{" "}
						<span className="whitespace-nowrap text-[#8161FF]">
							<Workflow className="inline-block size-7 align-middle" />{" "}
							automated workflows.
						</span>
					</h1>
					<p className="mt-3 max-w-xl text-base leading-relaxed text-[#52525b]">
						send, receive, and reply in thread through one simple api & cli.
					</p>

					{!isLoggedIn && <HeroSignupButton />}

					{/* Email Generator - Client Component */}
					<DemoInbox />
				</section>

				{/* Get started */}
				<section className="py-12 border-t border-[#e7e5e4]">
					<GetStartedTabs />
					<p className="mt-4 text-sm text-[#52525b] flex items-center gap-4">
						<Link
							href="/docs"
							className="text-[#1c1917] hover:underline flex items-center gap-1.5"
						>
							<BookOpen className="w-4 h-4" />
							Read the docs
						</Link>
						<span className="text-[#a8a29e]">or</span>
						<a
							href="https://github.com/inbound-org"
							target="_blank"
							rel="noopener noreferrer"
							className="text-[#1c1917] hover:underline flex items-center gap-1.5"
						>
							<svg className="w-4 h-4" viewBox="0 0 24 24" fill="#000337">
								<path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
							</svg>
							view on GitHub
						</a>
					</p>
				</section>

				<section className="py-10 border-t border-[#e7e5e4]">
					<p className="text-xs text-[#78716c] uppercase tracking-wide mb-6">
						Trusted by
					</p>
					<div className="flex items-center gap-10">
						<img
							src="/images/agentuity.png"
							alt="Agentuity"
							className="h-5 object-contain opacity-70 grayscale hover:opacity-100 hover:grayscale-0 transition-all"
						/>
						<img
							src="/images/mandarin-3d.png"
							alt="Mandarin 3D"
							className="h-5 object-contain opacity-70 grayscale hover:opacity-100 hover:grayscale-0 transition-all"
						/>
						<img
							src="/images/teslanav.png"
							alt="TeslaNav"
							className="h-5 object-contain opacity-70 grayscale hover:opacity-100 hover:grayscale-0 transition-all"
						/>
					</div>

					<div className="mt-8 bg-[#fafaf9] rounded-lg">
						<div className="flex items-start gap-3">
							<div className="flex-shrink-0 w-10 h-10 bg-[#18181b] rounded-lg flex items-center justify-center">
								<img
									src="/images/linkdr.svg"
									alt="LinkDR"
									className="h-5 w-5"
								/>
							</div>
							<div>
								<a
									href="https://linkdr.com"
									target="_blank"
									rel="noopener noreferrer"
									className="font-medium text-[#18181b] hover:underline"
								>
									LinkDR
								</a>
								<p className="text-sm text-[#52525b] leading-relaxed">
									LinkDR uses Inbound to power their internal order management
									system for backlink management, processing thousands of
									automated emails daily.
								</p>
							</div>
						</div>
					</div>
				</section>

				{/* What it does */}
				<section className="py-12 border-t border-[#e7e5e4]">
					<h2 className="font-heading text-xl font-semibold tracking-tight mb-6">
						What is Inbound?
					</h2>
					<div className="space-y-4 text-[#3f3f46] leading-relaxed">
						<p>
							Inbound lets you send and receive emails programmatically. Add
							your domain, configure your MX records, and you're ready to go.
							Unlimited mailboxes on that domain, no setup required for each
							address.
						</p>
						<p>
							Send from any address on your domain. Receive at any address.
							Route specific addresses to dedicated endpoints, or set up a
							catch-all that forwards everything to a single webhook. Perfect
							for support domains that route all incoming mail to an AI agent.
						</p>
						<p>
							Every email preserves threading automatically. Reply
							programmatically and we handle all the headers so your responses
							show up in the right thread. It just works.
						</p>
					</div>

					<div className="mt-8 space-y-2">
						<p className="text-xs text-[#78716c] uppercase tracking-wide mb-3">
							Example routes
						</p>
						<div className="font-mono text-sm space-y-1.5">
							<div className="flex items-center gap-3">
								<span className="text-[#52525b]">support@acme.com</span>
								<span className="text-[#a8a29e]">&rarr;</span>
								<span className="text-[#3f3f46]">/api/support-agent</span>
							</div>
							<div className="flex items-center gap-3">
								<span className="text-[#52525b]">billing@acme.com</span>
								<span className="text-[#a8a29e]">&rarr;</span>
								<span className="text-[#3f3f46]">/api/billing</span>
							</div>
							<div className="flex items-center gap-3">
								<span className="text-[#52525b]">*@acme.com</span>
								<span className="text-[#a8a29e]">&rarr;</span>
								<span className="text-[#3f3f46]">/api/catch-all</span>
							</div>
						</div>
					</div>
				</section>

				<PricingTable />

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
					</div>
				</section>

				<MarketingFooter />
			</div>
		</div>
	);
}
