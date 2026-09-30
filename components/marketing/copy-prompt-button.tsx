"use client";

import { Check } from "lucide-react";
import { useState } from "react";
import { AGENT_PROMPT } from "@/components/marketing/agent-prompt";

export function CopyPromptButton() {
	const [copied, setCopied] = useState(false);

	const copy = async () => {
		await navigator.clipboard.writeText(AGENT_PROMPT);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	};

	return (
		<button
			type="button"
			onClick={copy}
			className="inline-flex items-center gap-2 rounded-xl border border-[#e7e5e4] bg-white px-[22px] py-[13px] text-base font-medium text-[#1c1917] transition-[background-color,transform] duration-200 ease-[cubic-bezier(0.2,0,0,1)] hover:bg-[#f5f5f4] active:scale-[0.99]"
		>
			{copied && <Check className="size-4 text-[#8161FF]" />}
			{copied ? "Prompt copied" : "Copy agent prompt"}
		</button>
	);
}
