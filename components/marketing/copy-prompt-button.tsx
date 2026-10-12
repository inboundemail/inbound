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
			className="inline-flex items-center gap-2.5 border border-[#3a3532] bg-[#1c1917] px-5 py-[13px] text-sm text-[#fafaf9] transition-colors duration-200 hover:border-[#57534e] hover:bg-[#232020]"
		>
			{copied ? <Check className="size-4 text-[#8161FF]" /> : <span className="text-[#8161FF]">$</span>}
			{copied ? "prompt copied" : "copy agent prompt"}
		</button>
	);
}
