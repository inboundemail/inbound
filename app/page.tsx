import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { CopyPromptButton } from "@/components/marketing/copy-prompt-button";
import { HomeCta } from "@/components/marketing/home-cta";
import { LiveInbox } from "@/components/marketing/live-inbox";
import { Mark } from "@/components/marketing/mark";
import { footerGroups } from "@/components/marketing-nav";
import { auth } from "@/lib/auth/auth";

export const metadata: Metadata = {
	alternates: { canonical: "/" },
};

const plans = [
	{ name: "Default", price: 4, description: "5,000 emails/mo · Basic support" },
	{ name: "Pro", price: 15, description: "50,000 emails/mo · 50 domains" },
	{ name: "Growth", price: 39, description: "100,000 emails/mo · 300 domains" },
	{ name: "Scale", price: 79, description: "200,000 emails/mo · unlimited domains" },
];

const steps = [
	{
		label: "RECEIVE",
		title: "Add your domain, get JSON",
		description:
			"Every address on your domain receives mail once DNS verifies. No per-mailbox setup.",
		code: [
			["#a8a29e", "// email.received webhook"],
			["#1c1917", "{ email: {"],
			["#1c1917", '    from: { text: "maya@acme.com" },'],
			["#1c1917", '    subject: "move my demo?",'],
			["#1c1917", '    threadId: "V1StGXR8_Z5j" } }'],
		],
	},
	{
		label: "ROUTE",
		title: "Any address, any endpoint",
		description:
			"Point specific addresses at their own endpoint, or turn on catch-all for the rest. From the dashboard or the API.",
		code: [
			["#52525b", "support@  →  /api/agent"],
			["#52525b", "billing@  →  /api/billing"],
			["#52525b", "*@        →  /api/catch-all"],
		],
	},
	{
		label: "REPLY",
		title: "Answer in the same thread",
		description:
			"We set In-Reply-To and References, so the answer lands in the customer's existing thread.",
		code: [
			["#6b4fd9", "await inbound.emails.reply(threadId, {"],
			["#1c1917", '  from: "support@acme.com",'],
			["#1c1917", '  text: "Moved to Friday."'],
			["#6b4fd9", "})"],
		],
	},
];

const logos = [
	{ src: "/images/agentuity.png", alt: "Agentuity" },
	{ src: "/images/mandarin-3d.png", alt: "Mandarin 3D" },
	{ src: "/images/teslanav.png", alt: "TeslaNav" },
];

export default async function Page() {
	const session = await auth.api
		.getSession({
			headers: await headers(),
		})
		.catch(() => null);

	const isLoggedIn = !!session?.user;
	const startHref = isLoggedIn ? "/logs" : "/login";

	return (
		<div className="min-h-screen bg-[#fafaf9] tracking-[-0.02em] text-[#1c1917] selection:bg-[#8161FF] selection:text-white">
			<div className="bg-[#8161FF] px-4 py-2 text-center text-white">
				<p className="text-sm">
					<span className="font-medium">Extra domains now just $3.50/mo</span>
					<span className="ml-1.5 opacity-80">— add as many as you need</span>
				</p>
			</div>

			<div className="mx-auto max-w-[1200px] px-6 sm:px-10">
				<header className="flex items-center justify-between py-6">
					<div className="flex items-center gap-10">
						<Link href="/" className="flex items-center gap-2.5">
							<Mark size={24} fill="#8161FF" />
							<span className="font-outfit text-[22px] font-semibold tracking-normal">
								inbound
							</span>
						</Link>
						<nav className="hidden items-center gap-7 text-[15px] text-[#52525b] sm:flex">
							<Link href="/docs" className="transition-colors hover:text-[#1c1917]">
								docs
							</Link>
							<Link href="/pricing" className="transition-colors hover:text-[#1c1917]">
								pricing
							</Link>
							<Link href="/blog" className="transition-colors hover:text-[#1c1917]">
								blog
							</Link>
						</nav>
					</div>
					<div className="flex items-center gap-2 text-[15px]">
						{isLoggedIn ? (
							<Link
								href="/logs"
								className="rounded-xl bg-[#1c1917] px-4 py-[9px] font-medium text-[#fafaf9] transition-colors hover:bg-[#292524]"
							>
								Dashboard
							</Link>
						) : (
							<>
								<Link
									href="/login"
									className="rounded-xl px-4 py-[9px] transition-colors hover:bg-[#f0efee]"
								>
									Log in
								</Link>
								<Link
									href="/login"
									className="rounded-xl bg-[#1c1917] px-4 py-[9px] font-medium text-[#fafaf9] transition-colors hover:bg-[#292524]"
								>
									Get started
								</Link>
							</>
						)}
					</div>
				</header>

				<section className="flex flex-col gap-14 pb-[88px] pt-12 lg:flex-row lg:items-center lg:gap-16 lg:pt-[72px]">
					<div className="flex flex-col lg:w-[500px] lg:shrink-0">
						<a
							href="https://github.com/inboundemail/inbound"
							target="_blank"
							rel="noopener noreferrer"
							className="flex items-center gap-2 self-start rounded-full border border-[#e7e5e4] bg-white py-[5px] pl-1.5 pr-3 transition-colors hover:border-[#d6d3d1]"
						>
							<span className="rounded-full bg-[#ede8fe] px-2 py-0.5 text-xs font-medium text-[#5236b8]">
								new
							</span>
							<span className="text-[13px] tracking-[-0.01em] text-[#3f3f46]">
								inboundctl — let your agent run its own mailbox →
							</span>
						</a>
						<h1 className="mt-7 font-heading text-[48px] font-semibold leading-[0.97] tracking-[-0.05em] sm:text-[64px]">
							give every agent
							<br />
							<span className="text-[#8161FF]">a real inbox.</span>
						</h1>
						<p className="mt-6 text-[19px] leading-[29px] text-[#52525b]">
							Receive, parse, and reply in thread through one API &amp; CLI.
							Unlimited mailboxes on your domain — from $4/mo.
						</p>
						<div className="mt-9 flex flex-wrap items-center gap-2.5">
							<Link
								href={startHref}
								className="rounded-xl bg-[#8161FF] px-[22px] py-[13px] text-base font-medium text-white transition-[background-color,transform] duration-200 ease-[cubic-bezier(0.2,0,0,1)] hover:bg-[#6b4fd9] active:scale-[0.99]"
							>
								{isLoggedIn ? "Go to dashboard" : "Start for $4/mo"}
							</Link>
							<CopyPromptButton />
						</div>
					</div>
					<div className="min-w-0 flex-1">
						<LiveInbox />
					</div>
				</section>

				<section className="flex flex-col gap-6 border-y border-[#e7e5e4] py-7 sm:flex-row sm:items-center sm:justify-between">
					<p className="text-sm tracking-[-0.01em] text-[#78716c]">Trusted by</p>
					<div className="flex flex-wrap items-center gap-10 sm:gap-14">
						{logos.map((logo) => (
							<img
								key={logo.src}
								src={logo.src}
								alt={logo.alt}
								className="h-[22px] w-auto object-contain opacity-60 grayscale"
							/>
						))}
					</div>
				</section>

				<section className="flex flex-col gap-12 pb-24 pt-28">
					<div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
						<h2 className="max-w-[560px] font-heading text-[36px] font-semibold leading-[1.05] tracking-[-0.045em] sm:text-[44px]">
							one api for the whole conversation.
						</h2>
						<p className="max-w-[400px] text-[17px] leading-[26px] text-[#52525b]">
							Most providers stop at sending. Inbound receives, routes, and keeps
							the thread intact — so your agent can actually talk back.
						</p>
					</div>
					<div className="grid gap-6 md:grid-cols-3">
						{steps.map((step) => (
							<div key={step.label} className="flex flex-col gap-4">
								<div className="flex h-[180px] flex-col justify-center gap-[3px] rounded-[14px] border border-[#e7e5e4] bg-white p-5">
									{step.code.map(([color, line]) => (
										<span
											key={line}
											className="whitespace-pre font-mono text-[13px] leading-[19px] tracking-normal"
											style={{ color }}
										>
											{line}
										</span>
									))}
								</div>
								<div className="flex flex-col gap-1.5">
									<span className="font-mono text-xs tracking-[0.08em] text-[#8161FF]">
										{step.label}
									</span>
									<h3 className="font-heading text-[22px] font-semibold leading-7 tracking-[-0.03em]">
										{step.title}
									</h3>
									<p className="text-[15px] leading-[23px] tracking-[-0.01em] text-[#52525b]">
										{step.description}
									</p>
								</div>
							</div>
						))}
					</div>
				</section>
			</div>

			<section className="border-y border-[#e7e5e4] bg-white px-6 py-24">
				<div className="mx-auto flex max-w-[860px] flex-col items-center gap-6 text-center">
					<p className="text-[26px] font-medium leading-[34px] tracking-[-0.035em] sm:text-[34px] sm:leading-[42px]">
						LinkDR runs its entire backlink order system on inbound — thousands of
						automated emails, every single day.
					</p>
					<a
						href="https://linkdr.com"
						target="_blank"
						rel="noopener noreferrer"
						className="flex items-center gap-3"
					>
						<span className="flex size-9 items-center justify-center rounded-lg bg-[#18181b]">
							<img src="/images/linkdr.svg" alt="" className="size-[18px]" />
						</span>
						<span className="text-[15px] font-semibold tracking-[-0.01em]">LinkDR</span>
					</a>
				</div>
			</section>

			<div className="mx-auto max-w-[1200px] px-6 sm:px-10">
				<section className="flex flex-col gap-10 pb-14 pt-28">
					<div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
						<h2 className="font-heading text-[36px] font-semibold leading-[1.05] tracking-[-0.045em] sm:text-[44px]">
							unlimited mailboxes on every plan.
						</h2>
						<p className="text-[15px] tracking-[-0.01em] text-[#78716c]">
							Extra domains $3.50/mo · +50k received and sent $16/mo
						</p>
					</div>
					<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
						{plans.map((plan) => (
							<div
								key={plan.name}
								className="flex flex-col gap-5 rounded-[14px] border border-[#e7e5e4] bg-white p-6"
							>
								<span className="text-base font-semibold">{plan.name}</span>
								<div className="flex items-baseline gap-1">
									<span className="font-heading text-[44px] font-semibold leading-[44px] tracking-[-0.05em]">
										${plan.price}
									</span>
									<span className="text-[15px] text-[#78716c]">/mo</span>
								</div>
								<p className="flex-1 text-sm leading-[21px] tracking-[-0.01em] text-[#52525b]">
									{plan.description}
								</p>
								<Link
									href={startHref}
									className="rounded-xl bg-[#f0efee] py-2.5 text-center text-sm font-medium transition-colors hover:bg-[#e7e5e4]"
								>
									Choose {plan.name}
								</Link>
							</div>
						))}
					</div>
				</section>

				<HomeCta />

				<footer className="flex flex-col gap-10 border-t border-[#e7e5e4] pb-16 pt-12 md:flex-row md:justify-between">
					<div className="flex flex-col gap-3">
						<Link href="/" className="flex items-center gap-2.5">
							<Mark size={22} fill="#8161FF" />
							<span className="font-outfit text-xl font-semibold tracking-normal">
								inbound
							</span>
						</Link>
						<div className="flex items-center gap-3 text-sm tracking-[-0.01em] text-[#78716c]">
							<span>© {new Date().getFullYear()} Inbound</span>
							<Link href="/terms" className="hover:text-[#1c1917]">
								Terms
							</Link>
							<Link href="/privacy" className="hover:text-[#1c1917]">
								Privacy
							</Link>
							<a
								href="https://status.inbound.new"
								target="_blank"
								rel="noopener noreferrer"
								className="hover:text-[#1c1917]"
							>
								Status
							</a>
						</div>
					</div>
					<div className="grid grid-cols-2 gap-8 text-sm tracking-[-0.01em] sm:grid-cols-3 md:gap-6">
						{footerGroups.map((group) => (
							<div key={group.heading} className="flex flex-col gap-2.5 md:w-[180px]">
								<p className="font-semibold">{group.heading}</p>
								{group.links.map(([label, href]) => (
									<Link key={href} href={href} className="text-[#52525b] hover:text-[#1c1917]">
										{label}
									</Link>
								))}
							</div>
						))}
					</div>
				</footer>
			</div>
		</div>
	);
}
