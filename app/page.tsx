import type { Metadata } from "next";
import { headers } from "next/headers";
import Image from "next/image";
import Link from "next/link";
import { CopyPromptButton } from "@/components/marketing/copy-prompt-button";
import { Dither } from "@/components/marketing/dither";
import { Mark } from "@/components/marketing/mark";
import { footerGroups } from "@/components/marketing-nav";
import { auth } from "@/lib/auth/auth";

export const metadata: Metadata = {
	alternates: { canonical: "/" },
};

const steps = [
	{
		title: "Add your domain, get JSON.",
		code: '{ from: "maya@acme.com",\n  subject: "move my demo?",\n  threadId: "V1StGXR8_Z5j" }',
		level: 0.3,
	},
	{
		title: "Route any address anywhere.",
		code: "support@  →  /api/agent\nbilling@  →  /api/billing\n*@        →  /api/catch-all",
		level: 0.6,
	},
	{
		title: "Reply in the same thread.",
		code: 'inbound.emails.reply(threadId, {\n  text: "Moved to Friday."\n})',
		level: 0.95,
	},
];

const plans = [
	{ name: "default", volume: "5,000", price: 9, featured: false },
	{ name: "pro", volume: "50,000", price: 15, featured: true },
	{ name: "growth", volume: "100,000", price: 39, featured: false },
	{ name: "scale", volume: "200,000", price: 79, featured: false },
];

const debrisClass = "pointer-events-none absolute hidden h-24 w-40 xl:block";

export default async function Page() {
	const session = await auth.api
		.getSession({
			headers: await headers(),
		})
		.catch(() => null);

	const isLoggedIn = !!session?.user;
	const startHref = isLoggedIn ? "/logs" : "/login";

	return (
		<div
			className="min-h-screen overflow-x-hidden bg-[#1c1917] text-[#fafaf9] selection:bg-[#8161FF] selection:text-white"
			style={{ fontFamily: "var(--font-geist-mono), ui-monospace, monospace" }}
		>
			<div className="mx-auto max-w-3xl px-6">
				<header className="flex items-center justify-between pt-8">
					<Link href="/" className="flex items-center gap-2.5">
						<Mark size={18} fill="#8161FF" />
						<span className="text-[15px]">inbound</span>
					</Link>
					<nav className="flex items-center gap-7 text-sm">
						<Link href="/docs" className="text-[#a8a29e] transition-colors hover:text-[#fafaf9]">
							docs
						</Link>
						<Link href="/pricing" className="text-[#a8a29e] transition-colors hover:text-[#fafaf9]">
							pricing
						</Link>
						<Link href={startHref} className="transition-colors hover:text-[#8161FF]">
							{isLoggedIn ? "dashboard" : "log in"}
						</Link>
					</nav>
				</header>

				<section className="relative pb-20 pt-24 sm:pb-24 sm:pt-36">
					<Dither scene="debris" seed={1} className={`${debrisClass} right-0 top-20 md:block`} />
					<Dither scene="debris" seed={7} className={`${debrisClass} right-full top-[300px] mr-16`} />
					<h1 className="[font-family:inherit] text-[34px] font-normal leading-[40px] tracking-[-0.04em] sm:text-[56px] sm:leading-[62px]">
						give every agent
						<br />a real inbox.
					</h1>
					<p className="mt-6 max-w-[520px] text-base leading-[26px] text-[#a8a29e]">
						Receive, parse, and reply in thread through one API &amp; CLI.
					</p>
					<div className="mt-10 flex flex-wrap items-center gap-3">
						<Link
							href={startHref}
							className="bg-[#8161FF] px-[22px] py-[13px] text-sm text-white transition-colors duration-200 hover:bg-[#6b4fd9]"
						>
							{isLoggedIn ? "go to dashboard" : "start for $9/mo"}
						</Link>
						<CopyPromptButton />
					</div>
				</section>
			</div>

			<Dither scene="horizon" className="block h-[260px] w-full sm:h-[400px]" />

			<div className="mx-auto max-w-3xl px-6">
				<section className="relative pt-24">
					<Dither scene="debris" seed={3} className={`${debrisClass} left-full top-10 ml-12`} />
					<h2 className="pb-10 [font-family:inherit] text-2xl font-normal leading-8 tracking-[-0.03em] sm:text-[28px] sm:leading-9">
						one api for the whole conversation.
					</h2>
					<ol>
						{steps.map((item, index) => (
							<li
								key={item.title}
								className="flex flex-col gap-5 border-t border-[#2e2a27] py-7 sm:flex-row sm:items-center sm:gap-8"
							>
								<div className="flex items-center gap-5 sm:w-[288px] sm:shrink-0 sm:gap-8">
									<Dither scene="step" seed={index} level={item.level} className="size-12 shrink-0" />
									<h3 className="[font-family:inherit] text-[17px] font-normal leading-6">{item.title}</h3>
								</div>
								<pre className="min-w-0 flex-1 overflow-x-auto border border-[#2e2a27] bg-[#151312] px-5 py-[18px] text-xs leading-5 text-[#d6d3d1]">
									{item.code}
								</pre>
							</li>
						))}
					</ol>
				</section>

				<section className="relative pt-28">
					<Dither scene="tear" seed={5} className="absolute inset-x-6 top-14 block h-4" />
					<Image
						src="/images/home/quote-dither.png"
						alt=""
						width={120}
						height={100}
						unoptimized
						style={{ imageRendering: "pixelated" }}
					/>
					<blockquote className="mt-7 text-xl leading-8 tracking-[-0.025em] sm:text-2xl sm:leading-9">
						LinkDR runs its entire backlink order system on inbound — thousands of automated
						emails, every single day.
					</blockquote>
					<a
						href="https://linkdr.com"
						target="_blank"
						rel="noopener noreferrer"
						className="mt-7 inline-block text-[13px] text-[#a8a29e] transition-colors hover:text-[#fafaf9]"
					>
						LinkDR
					</a>
				</section>

				<section className="relative pt-32">
					<Dither scene="debris" seed={11} className={`${debrisClass} right-full top-52 mr-16`} />
					<h2 className="pb-8 [font-family:inherit] text-2xl font-normal leading-8 tracking-[-0.03em] sm:text-[28px] sm:leading-9">
						unlimited mailboxes, every plan.
					</h2>
					<ul className="border-b border-[#2e2a27]">
						{plans.map((plan) => (
							<li key={plan.name}>
								<Link
									href={startHref}
									className="relative flex h-[72px] items-center gap-4 border-t border-[#2e2a27] px-4 transition-colors hover:bg-[#232020] sm:gap-6 sm:px-5"
								>
									{plan.featured && (
										<Dither scene="rowfill" className="pointer-events-none absolute inset-0 block h-full w-full" />
									)}
									<span
										className={`relative w-20 shrink-0 text-base sm:w-40 ${plan.featured ? "text-[#8161FF]" : ""}`}
									>
										{plan.name}
									</span>
									<span className="relative flex-1 whitespace-nowrap text-[13px] text-[#a8a29e] sm:text-sm">
										{plan.volume} emails/mo
									</span>
									<span
										className={`relative text-[22px] tracking-[-0.03em] ${plan.featured ? "bg-[#1c1917] px-2 py-1" : ""}`}
									>
										${plan.price}
									</span>
								</Link>
							</li>
						))}
					</ul>
				</section>
			</div>

			<Dither scene="horizon" apex={0.6} radius={0.57} className="mt-24 block h-[200px] w-full sm:h-[300px]" />

			<footer className="mx-auto max-w-3xl px-6 pb-14 pt-8">
				<div className="grid grid-cols-2 gap-8 text-[13px] sm:grid-cols-3">
					{footerGroups.map((group) => (
						<div key={group.heading} className="flex flex-col gap-2.5">
							<p>{group.heading}</p>
							{group.links.map(([label, href]) => (
								<Link key={href} href={href} className="text-[#a8a29e] transition-colors hover:text-[#fafaf9]">
									{label}
								</Link>
							))}
						</div>
					))}
				</div>
				<div className="mt-14 flex flex-wrap items-center justify-between gap-4 text-[13px] text-[#a8a29e]">
					<div className="flex items-center gap-2.5">
						<Mark size={12} fill="#8161FF" />
						<span>inbound © {new Date().getFullYear()}</span>
					</div>
					<div className="flex items-center gap-6">
						<Link href="/blog" className="transition-colors hover:text-[#fafaf9]">
							blog
						</Link>
						<Link href="/terms" className="transition-colors hover:text-[#fafaf9]">
							terms
						</Link>
						<Link href="/privacy" className="transition-colors hover:text-[#fafaf9]">
							privacy
						</Link>
						<a
							href="https://status.inbound.new"
							target="_blank"
							rel="noopener noreferrer"
							className="transition-colors hover:text-[#fafaf9]"
						>
							status
						</a>
					</div>
				</div>
			</footer>
		</div>
	);
}
