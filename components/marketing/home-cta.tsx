"use client";

import { useState } from "react";
import { INSTALL_COMMAND } from "@/components/marketing/agent-prompt";
import { useDemoInboxAddress } from "@/components/marketing/live-inbox";

export function HomeCta() {
	const address = useDemoInboxAddress();
	const [copied, setCopied] = useState<"address" | "install" | null>(null);

	const copy = async (kind: "address" | "install", value: string) => {
		if (!value) return;
		await navigator.clipboard.writeText(value);
		setCopied(kind);
		setTimeout(() => setCopied(null), 2000);
	};

	return (
		<section className="my-14 mb-24 flex flex-col gap-10 rounded-3xl bg-[#8161FF] p-8 sm:p-14 lg:flex-row lg:items-center lg:justify-between lg:gap-12">
			<div className="flex max-w-[520px] flex-col gap-3">
				<h2 className="font-heading text-[36px] font-semibold leading-[1.05] tracking-[-0.045em] text-white sm:text-[44px]">
					your inbox is already live.
				</h2>
				<p className="text-[17px] leading-[26px] tracking-[-0.02em] text-[#ede8fe]">
					Send it an email from your phone. It shows up above in real time — then
					build on it.
				</p>
			</div>
			<div className="flex flex-1 flex-col gap-2.5 lg:max-w-[480px]">
				<button
					type="button"
					onClick={() => copy("address", address)}
					className="flex items-center justify-between gap-4 rounded-xl bg-white px-[18px] py-4 text-left"
				>
					<span className="truncate font-mono text-base tracking-normal text-[#1c1917]">
						{address || "\u00a0"}
					</span>
					<span className="shrink-0 text-sm font-medium text-[#6b4fd9]">
						{copied === "address" ? "copied" : "copy"}
					</span>
				</button>
				<button
					type="button"
					onClick={() => copy("install", INSTALL_COMMAND)}
					className="flex items-center justify-between gap-4 rounded-xl bg-[#1c1917] px-[18px] py-4 text-left transition-colors hover:bg-[#292524]"
				>
					<span className="font-mono text-[15px] tracking-normal text-[#fafaf9]">
						<span className="text-[#a8a29e]">$ </span>
						{INSTALL_COMMAND}
					</span>
					<span className="shrink-0 text-sm text-[#a8a29e]">
						{copied === "install" ? "copied" : "copy"}
					</span>
				</button>
			</div>
		</section>
	);
}
