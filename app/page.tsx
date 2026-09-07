import {
	ArrowDownRight,
	ArrowRight,
	ArrowUpRight,
	AtSign,
	Check,
	Code2,
	GitBranch,
	Inbox,
	MessageSquareReply,
	ShieldCheck,
	Webhook,
} from "lucide-react";
import { cookies, headers } from "next/headers";
import Image from "next/image";
import Link from "next/link";
import { DemoInbox } from "@/components/marketing/demo-inbox";
import { GetStartedTabs } from "@/components/marketing/get-started-tabs";
import { HeroSignupButton } from "@/components/marketing/hero-signup-button";
import { HomepageControl } from "@/components/marketing/homepage-control";
import { HomepageExperimentTracker } from "@/components/marketing/homepage-experiment-tracker";
import { MarketingFooter, MarketingNav } from "@/components/marketing-nav";
import { PricingTable } from "@/components/pricing-table";
import { auth } from "@/lib/auth/auth";
import {
	HOMEPAGE_EXPERIMENT_COOKIE,
	isHomepageVariant,
} from "@/lib/homepage-experiment";

const capabilities = [
	{
		icon: Inbox,
		title: "Receive",
		description: "Unlimited mailboxes on your domain.",
	},
	{
		icon: Webhook,
		title: "Route",
		description: "Deliver messages to any webhook in under 100ms.",
	},
	{
		icon: MessageSquareReply,
		title: "Reply",
		description: "Send from any address with automatic threading.",
	},
];

const routes = [
	{ address: "support@acme.com", endpoint: "/api/support-agent" },
	{ address: "billing@acme.com", endpoint: "/api/billing" },
	{ address: "*@acme.com", endpoint: "/api/catch-all" },
];

const questions = [
	{
		question: "Can I use my own domain?",
		answer: "Yes. Point your MX records to Inbound.",
	},
	{
		question: "How fast are webhooks delivered?",
		answer: "Typically under 100ms, with automatic retries.",
	},
	{
		question: "What about spam filtering?",
		answer: "Reject, flag, or accept spam in your mailbox settings.",
	},
];

export default async function Page() {
	const session = await auth.api
		.getSession({
			headers: await headers(),
		})
		.catch(() => null);

	const isLoggedIn = !!session?.user;
	const assignedVariant = (await cookies()).get(
		HOMEPAGE_EXPERIMENT_COOKIE,
	)?.value;
	const variant = isHomepageVariant(assignedVariant)
		? assignedVariant
		: "control";

	if (variant === "control") {
		return (
			<>
				<HomepageExperimentTracker variant={variant} />
				<HomepageControl isLoggedIn={isLoggedIn} />
			</>
		);
	}

	return (
		<div className="min-h-screen overflow-hidden bg-background text-[var(--text-primary)] selection:bg-[var(--button-primary-bg)] selection:text-white">
			<HomepageExperimentTracker variant={variant} />
			<div className="mx-auto min-h-screen max-w-6xl border-x border-border bg-card px-5 sm:px-8 [&>footer]:mt-0 [&>footer]:py-7">
				<div className="-mx-5 border-b border-border px-5 sm:-mx-8 sm:px-8">
					<MarketingNav isLoggedIn={isLoggedIn} />
				</div>

				<main>
					<section className="grid gap-8 py-12 sm:py-14 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-12 lg:py-16">
						<div>
							<h1 className="max-w-xl font-outfit text-6xl font-medium leading-[0.98] tracking-tight sm:text-7xl xl:text-8xl">
								The inbox
								<br />
								<span className="text-primary">is an API.</span>
							</h1>

							<p className="mt-7 max-w-md text-lg leading-relaxed tracking-normal text-[var(--text-secondary)] sm:text-xl">
								Email for agents, apps, and workflows.
							</p>

							<div className="mt-9 flex flex-wrap items-center gap-3">
								{isLoggedIn ? (
									<Link
										href="/logs"
										className="inline-flex min-h-12 items-center gap-2 rounded-lg bg-[var(--button-primary-bg)] px-5 text-sm font-medium text-white transition-opacity hover:opacity-90"
									>
										Open dashboard <ArrowRight className="size-4" />
									</Link>
								) : (
									<HeroSignupButton />
								)}
								<Link
									href="/docs"
									className="inline-flex min-h-12 items-center gap-2 rounded-lg border border-border bg-card px-5 text-sm font-medium text-[var(--text-primary)] transition-colors hover:bg-muted"
								>
									Read the docs <ArrowUpRight className="size-4" />
								</Link>
							</div>

							<div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs tracking-normal text-[var(--text-muted)]">
								<span className="inline-flex items-center gap-1.5">
									<Check className="size-3.5 text-primary" /> Unlimited
									mailboxes
								</span>
								<span className="inline-flex items-center gap-1.5">
									<Check className="size-3.5 text-primary" /> Starts at $4/mo
								</span>
							</div>
						</div>

						<div className="border-t border-border pt-7 lg:border-l lg:border-t-0 lg:pl-10 lg:pt-0">
							<div className="flex items-center justify-between border-b border-border pb-5">
								<div className="flex items-center gap-2.5">
									<Inbox className="size-4 text-primary" />
									<span className="text-sm font-medium">Live inbox</span>
								</div>
								<span className="inline-flex items-center gap-1.5 font-mono text-xs tracking-normal text-[var(--text-muted)]">
									<span className="size-1.5 rounded-full bg-emerald-500" /> live
								</span>
							</div>

							<div className="border-b border-border py-7">
								<div className="flex items-center justify-between font-mono text-xs tracking-normal text-[var(--text-muted)]">
									<span>RECEIVED</span>
									<ArrowDownRight className="size-4" />
								</div>
								<div className="mt-7 flex items-start gap-3">
									<AtSign className="mt-0.5 size-5 shrink-0 text-primary" />
									<div className="min-w-0">
										<p className="truncate font-mono text-sm tracking-normal">
											agent@yourcompany.com
										</p>
									</div>
								</div>
								<div className="mt-6 flex items-center gap-2 font-mono text-xs tracking-normal text-[var(--text-secondary)]">
									<Webhook className="size-3.5 text-primary" />
									POST /api/agent
									<span className="ml-auto text-emerald-600">200 OK</span>
								</div>
							</div>

							<div className="pt-7">
								<DemoInbox />
							</div>
						</div>
					</section>

					<section className="-mx-5 grid gap-5 border-y border-border bg-background px-5 py-5 sm:-mx-8 sm:grid-cols-[auto_1fr] sm:items-center sm:gap-10 sm:px-8 sm:py-6">
						<p className="font-mono text-xs tracking-normal text-[var(--text-muted)]">
							TRUSTED BY
						</p>
						<div className="flex flex-wrap items-center gap-x-10 gap-y-6 sm:justify-end sm:gap-x-14">
							<Image
								src="/images/agentuity.png"
								alt="Agentuity"
								width={118}
								height={28}
								className="h-5 w-auto object-contain opacity-60 grayscale transition-opacity hover:opacity-100"
							/>
							<Image
								src="/images/mandarin-3d.png"
								alt="Mandarin 3D"
								width={118}
								height={28}
								className="h-5 w-auto object-contain opacity-60 grayscale transition-opacity hover:opacity-100"
							/>
							<Image
								src="/images/teslanav.png"
								alt="TeslaNav"
								width={118}
								height={28}
								className="h-5 w-auto object-contain opacity-60 grayscale transition-opacity hover:opacity-100"
							/>
						</div>
					</section>

					<section className="grid gap-7 py-9 sm:py-11 lg:grid-cols-[0.6fr_1fr] lg:items-center lg:gap-10">
						<div>
							<h2 className="max-w-md font-outfit text-3xl font-medium leading-tight tracking-tight sm:text-4xl">
								Get started.
							</h2>
						</div>

						<div className="border-t border-border pt-7 lg:border-l lg:border-t-0 lg:pl-10 lg:pt-0">
							<GetStartedTabs />
							<div className="mt-7 border-t border-border pt-5 text-sm">
								<a
									href="https://github.com/inbound-org"
									target="_blank"
									rel="noopener noreferrer"
									className="inline-flex items-center gap-1.5 text-[var(--text-secondary)] transition-colors hover:text-primary"
								>
									<Code2 className="size-4" /> GitHub
								</a>
							</div>
						</div>
					</section>

					<section className="border-t border-border py-9 sm:py-11">
						<div className="max-w-2xl">
							<h2 className="font-outfit text-3xl font-medium leading-tight tracking-tight sm:text-4xl">
								Send, receive, and reply.
							</h2>
						</div>

						<div className="mt-8 grid gap-7 md:grid-cols-3 md:gap-0">
							{capabilities.map(({ icon: Icon, title, description }) => (
								<div
									key={title}
									className="border-t border-border pt-6 md:border-l md:border-t-0 md:px-8 md:pt-0 md:first:border-l-0 md:first:pl-0 md:last:pr-0"
								>
									<Icon className="size-5 text-primary" />
									<h3 className="mt-5 font-outfit text-xl font-medium tracking-tight">
										{title}
									</h3>
									<p className="mt-3 text-sm leading-relaxed tracking-normal text-[var(--text-secondary)]">
										{description}
									</p>
								</div>
							))}
						</div>

						<div className="mt-8 grid gap-7 border-t border-border pt-7 lg:grid-cols-[1.3fr_0.7fr] lg:gap-10">
							<div>
								<div className="flex items-center justify-between">
									<div className="inline-flex items-center gap-2 text-sm text-[var(--text-secondary)]">
										<GitBranch className="size-4 text-primary" /> Routes
									</div>
									<span className="font-mono text-xs tracking-normal text-[var(--text-muted)]">
										acme.com
									</span>
								</div>
								<div className="mt-7 space-y-4 font-mono text-xs tracking-normal sm:text-sm">
									{routes.map(({ address, endpoint }) => (
										<div
											key={address}
											className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-4"
										>
											<span className="text-[var(--text-primary)] sm:min-w-44">
												{address}
											</span>
											<ArrowRight className="hidden size-3.5 text-[var(--text-muted)] sm:block" />
											<span className="text-primary">{endpoint}</span>
										</div>
									))}
								</div>
							</div>

							<div className="border-t border-border pt-7 lg:border-l lg:border-t-0 lg:pl-10 lg:pt-0">
								<ShieldCheck className="size-5 text-primary" />
								<div className="mt-6">
									<p className="font-outfit text-xl font-medium tracking-tight">
										Included
									</p>
									<p className="mt-2 text-sm leading-relaxed tracking-normal text-[var(--text-secondary)]">
										Spam filtering, retries, and threading.
									</p>
								</div>
							</div>
						</div>
					</section>

					<section className="grid gap-9 border-t border-border py-9 sm:py-11 lg:grid-cols-2 lg:gap-0">
						<div className="lg:pr-9">
							<h2 className="font-outfit text-3xl font-medium leading-tight tracking-tight sm:text-4xl">
								Pricing
							</h2>
							<div className="mt-7 [&>section]:border-t-0 [&>section]:py-0">
								<PricingTable showHeader={false} />
							</div>
						</div>

						<div className="border-t border-border pt-8 lg:border-l lg:border-t-0 lg:pl-9 lg:pt-0">
							<h2 className="font-outfit text-3xl font-medium leading-tight tracking-tight sm:text-4xl">
								FAQ
							</h2>
							<div className="mt-7 divide-y divide-border">
								{questions.map(({ question, answer }) => (
									<div key={question} className="py-5 first:pt-0 last:pb-0">
										<h3 className="font-medium">{question}</h3>
										<p className="mt-2 text-sm leading-relaxed tracking-normal text-[var(--text-secondary)]">
											{answer}
										</p>
									</div>
								))}
							</div>
						</div>
					</section>
				</main>

				<MarketingFooter />
			</div>
		</div>
	);
}
