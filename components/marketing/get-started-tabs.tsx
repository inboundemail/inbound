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
			<div className="flex items-center">
				<div
					className="flex rounded-lg bg-background p-1"
					role="tablist"
					aria-label="setup path"
				>
					<button
						type="button"
						role="tab"
						aria-selected={mode === "agent"}
						onClick={() => selectMode("agent")}
						className={`rounded-md px-3.5 py-2 text-sm transition-[background-color,color,box-shadow] ${
							mode === "agent"
								? "bg-card text-[var(--text-primary)] shadow-sm"
								: "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
						}`}
					>
						agent led
					</button>
					<button
						type="button"
						role="tab"
						aria-selected={mode === "human"}
						onClick={() => selectMode("human")}
						className={`rounded-md px-3.5 py-2 text-sm transition-[background-color,color,box-shadow] ${
							mode === "human"
								? "bg-card text-[var(--text-primary)] shadow-sm"
								: "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
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
						className="group mt-5 flex min-h-14 w-full items-center justify-between gap-4 rounded-xl bg-[var(--button-primary-bg)] px-5 text-left text-white transition-[opacity,transform] duration-200 hover:opacity-90 active:scale-[0.99] motion-reduce:transform-none"
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
					<p className="mt-3 text-sm tracking-normal text-[var(--text-muted)]">
						Paste into your coding agent.
					</p>
				</>
			) : (
				<>
					<button
						type="button"
						onClick={copyContent}
						className="group mt-5 flex min-h-14 w-full items-center justify-between gap-4 rounded-xl bg-sidebar px-5 text-left font-mono text-sm tracking-normal text-white transition-[opacity,transform] duration-200 hover:opacity-90 active:scale-[0.99] motion-reduce:transform-none"
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
				</>
			)}
		</div>
	);
}
