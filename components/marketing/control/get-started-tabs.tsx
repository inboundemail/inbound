"use client";

import { Check, Copy, Sparkles } from "lucide-react";
import { useState } from "react";

const AGENT_PROMPT =
	"Set up Inbound (https://inbound.new) email for this project. There are two ways to use it — ask me which one fits, then proceed. 1) Agent-controlled email: you operate a mailbox yourself. Install the inboundctl CLI and the inboundctl skill from the inboundemail/inbound repo (npx skills add inboundemail/inbound), run `inboundctl login` to start the browser device flow, and after I authenticate help me create a mailbox scope so you can read, triage, send, and reply. 2) Product integration: email built into our own system. Install the inboundemail SDK (bun add inboundemail), use an API key from the inbound.new dashboard, wire up sending, and route incoming email to a webhook endpoint in our app. Full docs: https://inbound.new/docs.";

const INSTALL_COMMAND = "bun add inboundemail";

type Mode = "agent" | "human";

export function GetStartedTabs() {
	const [mode, setMode] = useState<Mode>("agent");
	const [copied, setCopied] = useState(false);

	const selectMode = (next: Mode) => {
		setMode(next);
		setCopied(false);
	};

	const copyContent = async () => {
		await navigator.clipboard.writeText(
			mode === "agent" ? AGENT_PROMPT : INSTALL_COMMAND,
		);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	};

	return (
		<div>
			<div className="flex items-center justify-between gap-4">
				<h2 className="font-heading text-lg font-semibold tracking-tight text-[#1c1917]">
					get started
				</h2>
				<div
					className="flex rounded-lg bg-[#f0efee] p-0.5"
					role="tablist"
					aria-label="setup path"
				>
					<button
						type="button"
						role="tab"
						aria-selected={mode === "agent"}
						onClick={() => selectMode("agent")}
						className={`rounded-[6px] px-3.5 py-2 text-sm transition-[background-color,color,box-shadow] ${
							mode === "agent"
								? "bg-white text-[#1c1917] shadow-sm"
								: "text-[#78716c] hover:text-[#1c1917]"
						}`}
					>
						agent led
					</button>
					<button
						type="button"
						role="tab"
						aria-selected={mode === "human"}
						onClick={() => selectMode("human")}
						className={`rounded-[6px] px-3.5 py-2 text-sm transition-[background-color,color,box-shadow] ${
							mode === "human"
								? "bg-white text-[#1c1917] shadow-sm"
								: "text-[#78716c] hover:text-[#1c1917]"
						}`}
					>
						human led
					</button>
				</div>
			</div>

			{mode === "agent" ? (
				<>
					<button
						type="button"
						onClick={copyContent}
						className="group mt-4 flex min-h-14 w-full items-center justify-between gap-4 rounded-xl bg-[#8161FF] px-5 text-left text-white transition-[background-color,transform] duration-200 ease-[cubic-bezier(0.2,0,0,1)] will-change-transform hover:bg-[#6b4fd9] active:scale-[0.99]"
					>
						<span className="flex items-center gap-2.5 font-medium">
							<Sparkles className="size-4" />
							start with your agent
						</span>
						<span className="flex min-w-[7.5rem] items-center justify-end gap-2 text-sm text-white/70 transition-colors group-hover:text-white">
							{copied ? "prompt copied" : "copy prompt"}
							{copied ? (
								<Check className="size-4" />
							) : (
								<Copy className="size-4" />
							)}
						</span>
					</button>
					<p className="mt-3 text-sm text-[#78716c]">
						paste it into opencode, claude code, cursor, or any coding agent.
					</p>
				</>
			) : (
				<>
					<button
						type="button"
						onClick={copyContent}
						className="group mt-4 flex min-h-14 w-full items-center justify-between gap-4 rounded-xl bg-[#1c1917] px-5 text-left font-mono text-sm text-[#fafaf9] transition-[background-color,transform] duration-200 ease-[cubic-bezier(0.2,0,0,1)] will-change-transform hover:bg-[#292524] active:scale-[0.99]"
					>
						<span>
							<span className="text-[#a8a29e]">$ </span>
							{INSTALL_COMMAND}
						</span>
						<span className="flex min-w-[4.5rem] items-center justify-end gap-2 text-[#a8a29e] transition-colors group-hover:text-white">
							{copied ? "copied" : "copy"}
							{copied ? (
								<Check className="size-4" />
							) : (
								<Copy className="size-4" />
							)}
						</span>
					</button>
					<p className="mt-3 text-sm text-[#78716c]">
						install the sdk, then send your first email in five lines of code.
					</p>
				</>
			)}
		</div>
	);
}
