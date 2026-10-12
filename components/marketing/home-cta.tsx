"use client";

import { Check } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { INSTALL_COMMAND } from "@/components/marketing/agent-prompt";

export function HomeCta({
	startHref,
	isLoggedIn,
}: {
	startHref: string;
	isLoggedIn: boolean;
}) {
	const [copied, setCopied] = useState(false);

	const copy = async () => {
		await navigator.clipboard.writeText(INSTALL_COMMAND);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	};

	return (
		<section className="flex flex-col gap-10 pt-40">
			<h2 className="[font-family:inherit] text-[34px] font-normal leading-[40px] tracking-[-0.04em] sm:text-[48px] sm:leading-[54px]">
				your agent's inbox is <br className="hidden sm:inline" />
				one command away.
			</h2>
			<div className="flex flex-wrap items-center gap-x-6 gap-y-3">
				<button
					type="button"
					onClick={copy}
					className="group flex items-center gap-6 border border-[#8161FF] bg-[#1c1917] px-5 py-[13px] text-sm transition-colors hover:bg-[#221d33]"
				>
					<span>
						<span className="text-[#8161FF]">$ </span>
						{INSTALL_COMMAND}
					</span>
					{copied ? (
						<Check className="size-4 text-[#8161FF]" />
					) : (
						<span className="text-[#78716c] transition-colors group-hover:text-[#fafaf9]">
							copy
						</span>
					)}
				</button>
				<Link
					href={startHref}
					className="text-sm text-[#a8a29e] transition-colors hover:text-[#fafaf9]"
				>
					{isLoggedIn ? "go to dashboard →" : "or start for $9/mo →"}
				</Link>
			</div>
		</section>
	);
}
