"use client";

import { useCustomer } from "autumn-js/react";
import { Check, Copy, Loader2 } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Mark } from "@/components/marketing/mark";
import { useCreateApiKeyMutation } from "@/features/settings/hooks";
import { signOut } from "@/lib/auth/auth-client";

type InboxEmail = {
	id: string;
	from: string;
	fromAddress: string | null;
	to: string | null;
	subject: string;
	text: string;
	attachmentCount: number;
	receivedAt: string | null;
};

type Props = {
	domain: string | null;
	setupError: string | null;
	accountEmail: string;
	firstName: string | null;
	paid: boolean;
	price: number | null;
	planId: string;
};

const POLL_MS = 2500;
const ease = [0.2, 0, 0, 1] as const;

function useCopy() {
	const [copied, setCopied] = useState<string | null>(null);
	const copy = useCallback(async (key: string, value: string) => {
		await navigator.clipboard.writeText(value);
		setCopied(key);
		setTimeout(() => setCopied((current) => (current === key ? null : current)), 2000);
	}, []);
	return { copied, copy };
}

function useInbox(enabled: boolean) {
	const [emails, setEmails] = useState<InboxEmail[]>([]);
	const [loaded, setLoaded] = useState(false);

	useEffect(() => {
		if (!enabled) return;
		let cancelled = false;
		let timer: ReturnType<typeof setTimeout> | undefined;

		const poll = async () => {
			try {
				if (document.visibilityState === "visible") {
					const response = await fetch("/api/welcome/inbox", { cache: "no-store" });
					if (response.ok) {
						const data = (await response.json()) as { emails: InboxEmail[] };
						if (!cancelled) {
							setEmails(data.emails);
							setLoaded(true);
						}
					}
				}
			} catch {
				// network blips just wait for the next poll
			}
			if (!cancelled) timer = setTimeout(poll, POLL_MS);
		};

		poll();
		return () => {
			cancelled = true;
			if (timer) clearTimeout(timer);
		};
	}, [enabled]);

	return { emails, loaded };
}

function timeAgo(iso: string | null) {
	if (!iso) return "";
	const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
	if (seconds < 45) return "just now";
	const minutes = Math.round(seconds / 60);
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.round(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	return `${Math.round(hours / 24)}d ago`;
}

function agentPrompt(domain: string) {
	return [
		"Set up inbound (https://inbound.new) email for this project.",
		`- Inbox: any address @${domain} receives mail already (for example agent@${domain}). No DNS setup is needed.`,
		"- Auth: the API key is in the INBOUND_API_KEY environment variable. Never print or commit it.",
		"- SDK: `bun add inboundemail`, then `import Inbound from \"inboundemail\"; const inbound = new Inbound();` (reads INBOUND_API_KEY).",
		`- Read mail: \`inbound.emails.list({ type: "received", domain: "${domain}" })\`, or create a webhook endpoint so new mail is POSTed to our app.`,
		`- Reply in thread: \`inbound.emails.reply(emailId, { from: "agent@${domain}", text })\`.`,
		"- Docs: https://inbound.new/docs. Ask me which addresses you should use and what the agent should do with incoming mail.",
	].join("\n");
}

export function WelcomeFlow({ domain, setupError, accountEmail, firstName, paid, price, planId }: Props) {
	const reduceMotion = useReducedMotion();
	const { emails, loaded } = useInbox(!!domain);
	const { copied, copy } = useCopy();
	const { attach } = useCustomer();
	const createApiKey = useCreateApiKeyMutation();

	const [apiKey, setApiKey] = useState<string | null>(null);
	const [keyError, setKeyError] = useState<string | null>(null);
	const [testState, setTestState] = useState<"idle" | "sending" | "sent" | "error">("idle");
	const [testMessage, setTestMessage] = useState<string | null>(null);
	const [replyText, setReplyText] = useState("Got it — this reply was sent with the inbound API.");
	const [replyState, setReplyState] = useState<"idle" | "sending" | "sent" | "error">("idle");
	const [replyMessage, setReplyMessage] = useState<string | null>(null);
	const [promptCopied, setPromptCopied] = useState(false);
	const [skippedToPlan, setSkippedToPlan] = useState(false);
	const [subscribing, setSubscribing] = useState(false);
	const [subscribeError, setSubscribeError] = useState<string | null>(null);
	const [selectedId, setSelectedId] = useState<string | null>(null);

	const address = domain ? `hello@${domain}` : "";
	const latest = emails.find((email) => email.id === selectedId) ?? emails[0] ?? null;
	const inboxDone = emails.length > 0;
	const agentDone = replyState === "sent" || promptCopied || skippedToPlan;
	const activeStep = !inboxDone ? 1 : !agentDone ? 2 : 3;
	const priceLabel = price !== null ? `$${Number.isInteger(price) ? price : price.toFixed(2)}/mo` : "";

	const sendTestEmail = async () => {
		setTestState("sending");
		setTestMessage(null);
		const response = await fetch("/api/welcome/test-email", { method: "POST" }).catch(() => null);
		const data = (await response?.json().catch(() => null)) as { error?: string } | null;
		if (response?.ok) {
			setTestState("sent");
			setTestMessage("Sent. It should land here in a few seconds.");
		} else {
			setTestState("error");
			setTestMessage(data?.error ?? "Couldn't send the test email");
		}
	};

	const createKey = async () => {
		setKeyError(null);
		try {
			const result = await createApiKey.mutateAsync({ name: "Welcome key" });
			if (result?.key) setApiKey(result.key);
			else setKeyError("Couldn't create a key");
		} catch (error) {
			setKeyError(error instanceof Error ? error.message : "Couldn't create a key");
		}
	};

	const sendReply = async () => {
		if (!apiKey || !latest || !domain) return;
		setReplyState("sending");
		setReplyMessage(null);
		try {
			const response = await fetch(`/api/e2/emails/${latest.id}/reply`, {
				method: "POST",
				headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
				body: JSON.stringify({ from: address, text: replyText }),
			});
			const data = (await response.json().catch(() => null)) as { error?: string } | null;
			if (!response.ok) throw new Error(data?.error ?? `Request failed (${response.status})`);
			setReplyState("sent");
			setReplyMessage(`Sent to ${latest.fromAddress ?? latest.from}. Check that inbox.`);
		} catch (error) {
			setReplyState("error");
			setReplyMessage(error instanceof Error ? error.message : "Reply failed");
		}
	};

	const subscribe = async () => {
		setSubscribing(true);
		setSubscribeError(null);
		try {
			const result = (await attach({
				productId: planId,
				successUrl: `${window.location.origin}/welcome?subscribed=1`,
			})) as { checkoutUrl?: string; data?: { checkoutUrl?: string } } | undefined;
			const url = result?.checkoutUrl ?? result?.data?.checkoutUrl;
			if (url) {
				window.location.href = url;
				return;
			}
			window.location.reload();
		} catch (error) {
			setSubscribeError(error instanceof Error ? error.message : "Couldn't start checkout");
			setSubscribing(false);
		}
	};

	const replyCode = `await inbound.emails.reply("${latest?.id ?? "email_id"}", {
  from: "${address}",
  text: ${JSON.stringify(replyText)},
})`;

	return (
		<div className="min-h-screen bg-[#fafaf9] tracking-[-0.02em] text-[#1c1917] selection:bg-[#8161FF] selection:text-white">
			<div className="mx-auto flex max-w-[760px] flex-col px-6 pb-24 sm:px-10">
				<header className="flex items-center justify-between py-6">
					<Link href="/" className="flex items-center gap-2.5">
						<Mark size={22} fill="#8161FF" />
						<span className="font-outfit text-[20px] font-semibold tracking-normal">inbound</span>
					</Link>
					<div className="flex items-center gap-4 text-sm text-[#78716c]">
						<span className="hidden truncate sm:inline">{accountEmail}</span>
						<button
							type="button"
							onClick={() => signOut({ fetchOptions: { onSuccess: () => window.location.assign("/") } })}
							className="transition-colors hover:text-[#1c1917]"
						>
							Sign out
						</button>
					</div>
				</header>

				<div className="pt-8 pb-10">
					<h1 className="font-heading text-[36px] font-semibold leading-[1.05] tracking-[-0.04em] sm:text-[44px]">
						{firstName ? `${firstName}, your inbox is live.` : "Your inbox is live."}
					</h1>
					<p className="mt-4 max-w-[560px] text-[17px] leading-[27px] text-[#52525b]">
						Send it an email, then let your agent read and reply through the API. No DNS setup needed.
					</p>
				</div>

				{setupError || !domain ? (
					<div className="rounded-2xl border border-[#fecaca] bg-white px-6 py-5 text-[15px] text-[#b91c1c]">
						{setupError ?? "We couldn't set up your inbox."}
					</div>
				) : (
					<ol className="flex flex-col gap-4">
						{/* Step 1 */}
						<Step number={1} title="Send your inbox an email" state={inboxDone ? "done" : "active"}>
							<div className="flex flex-col gap-4">
								<div className="flex flex-col gap-3 rounded-xl border border-[#e7e5e4] bg-[#fafaf9] px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
									<button
										type="button"
										onClick={() => copy("address", address)}
										className="group flex min-w-0 items-center gap-2.5 text-left"
										aria-label="Copy inbox address"
									>
										<span className="relative flex size-2 shrink-0">
											<span className="absolute inline-flex size-full animate-ping rounded-full bg-[#16a34a] opacity-60 motion-reduce:animate-none" />
											<span className="relative inline-flex size-2 rounded-full bg-[#16a34a]" />
										</span>
										<span className="truncate font-mono text-[15px] tracking-normal">{address}</span>
										{copied === "address" ? (
											<Check className="size-4 shrink-0 text-[#8161FF]" />
										) : (
											<Copy className="size-4 shrink-0 text-[#a8a29e] transition-colors group-hover:text-[#1c1917]" />
										)}
									</button>
									<div className="flex shrink-0 items-center gap-2">
										<a
											href={`mailto:${address}?subject=${encodeURIComponent("Hello inbound")}&body=${encodeURIComponent("Testing my new inbox.")}`}
											className="rounded-lg bg-[#8161FF] px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-[#6b4fd9]"
										>
											Open email app
										</a>
										<button
											type="button"
											onClick={sendTestEmail}
											disabled={testState === "sending"}
											className="rounded-lg border border-[#e7e5e4] bg-white px-3.5 py-2 text-sm font-medium transition-colors hover:border-[#d6d3d1] disabled:opacity-60"
										>
											{testState === "sending" ? "Sending…" : "Send me a test"}
										</button>
									</div>
								</div>
								<p className="text-sm text-[#78716c]">
									Any address @{domain} works.
									{testMessage && (
										<span className={testState === "error" ? " text-[#b91c1c]" : " text-[#16a34a]"}> {testMessage}</span>
									)}
								</p>

								<div className="overflow-hidden rounded-xl border border-[#e7e5e4] bg-white">
									{!inboxDone ? (
										<div className="flex items-center gap-3 px-4 py-5 text-sm text-[#78716c]">
											<Loader2 className="size-4 animate-spin text-[#8161FF] motion-reduce:animate-none" />
											{loaded ? "Waiting for your first email…" : "Connecting to your inbox…"}
										</div>
									) : (
										<>
											<ul>
												<AnimatePresence initial={false}>
													{emails.map((email) => {
														const selected = latest?.id === email.id;
														return (
															<motion.li
																key={email.id}
																layout
																initial={reduceMotion ? false : { opacity: 0, y: -12 }}
																animate={{ opacity: 1, y: 0 }}
																transition={{ duration: reduceMotion ? 0 : 0.35, ease }}
																className="border-b border-[#f0efee] last:border-b-0"
															>
																<button
																	type="button"
																	onClick={() => setSelectedId(email.id)}
																	className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors ${selected ? "bg-[#f6f3ff]" : "hover:bg-[#fafaf9]"}`}
																>
																	<span className={`mt-1.5 size-2 shrink-0 rounded-full ${selected ? "bg-[#8161FF]" : "bg-transparent"}`} />
																	<span className="flex min-w-0 flex-1 flex-col gap-0.5">
																		<span className="flex items-center justify-between gap-3">
																			<span className="truncate text-sm font-medium">{email.from}</span>
																			<span className="shrink-0 text-xs text-[#a8a29e]">{timeAgo(email.receivedAt)}</span>
																		</span>
																		<span className="truncate text-sm text-[#52525b]">{email.subject}</span>
																	</span>
																</button>
															</motion.li>
														);
													})}
												</AnimatePresence>
											</ul>
											{latest && (
												<div className="border-t border-[#e7e5e4] bg-[#fafaf9] px-4 py-3.5">
													<p className="mb-2 font-mono text-xs tracking-normal text-[#16a34a]">parsed · what your agent receives</p>
													<pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono text-xs leading-5 tracking-normal text-[#1c1917]">
														{JSON.stringify(
															{
																id: latest.id,
																from: latest.from,
																to: latest.to,
																subject: latest.subject,
																text: latest.text.length > 280 ? `${latest.text.slice(0, 280)}…` : latest.text,
																attachments: latest.attachmentCount,
															},
															null,
															2,
														)}
													</pre>
												</div>
											)}
										</>
									)}
								</div>
							</div>
						</Step>

						{/* Step 2 */}
						<Step
							number={2}
							title="Connect your agent"
							state={activeStep === 2 ? "active" : agentDone ? "done" : "upcoming"}
						>
							<div className="flex flex-col gap-5">
								<div className="flex flex-col gap-2.5">
									<p className="text-[15px] text-[#52525b]">
										Create an API key. It's shown once, so store it as <code className="font-mono text-[13px] text-[#1c1917]">INBOUND_API_KEY</code>.
									</p>
									{apiKey ? (
										<button
											type="button"
											onClick={() => copy("key", apiKey)}
											className="group flex items-center justify-between gap-3 rounded-lg border border-[#e7e5e4] bg-[#fafaf9] px-3.5 py-2.5 text-left"
										>
											<span className="truncate font-mono text-[13px] tracking-normal">{apiKey}</span>
											{copied === "key" ? (
												<Check className="size-4 shrink-0 text-[#8161FF]" />
											) : (
												<Copy className="size-4 shrink-0 text-[#a8a29e] group-hover:text-[#1c1917]" />
											)}
										</button>
									) : (
										<button
											type="button"
											onClick={createKey}
											disabled={createApiKey.isPending}
											className="self-start rounded-lg bg-[#1c1917] px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-[#3f3f46] disabled:opacity-60"
										>
											{createApiKey.isPending ? "Creating…" : "Create API key"}
										</button>
									)}
									{keyError && <p className="text-sm text-[#b91c1c]">{keyError}</p>}
								</div>

								<div className="flex flex-col gap-2.5">
									<p className="text-[15px] text-[#52525b]">
										Reply to your email with the API. It lands in your real inbox, in the same thread.
									</p>
									<input
										value={replyText}
										onChange={(event) => setReplyText(event.target.value)}
										maxLength={500}
										className="rounded-lg border border-[#e7e5e4] bg-white px-3.5 py-2.5 text-sm outline-none transition-colors focus:border-[#8161FF]"
										aria-label="Reply text"
									/>
									<div className="relative rounded-lg bg-[#1c1917] px-4 py-3.5">
										<pre className="overflow-x-auto font-mono text-xs leading-5 tracking-normal text-[#e7e5e4]">{replyCode}</pre>
									</div>
									<div className="flex flex-wrap items-center gap-3">
										<button
											type="button"
											onClick={sendReply}
											disabled={!apiKey || !latest || replyState === "sending"}
											className="rounded-lg bg-[#8161FF] px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-[#6b4fd9] disabled:cursor-not-allowed disabled:opacity-50"
										>
											{replyState === "sending" ? "Sending…" : "Run it"}
										</button>
										{!apiKey && <span className="text-sm text-[#a8a29e]">Create a key first.</span>}
										{replyMessage && (
											<span className={`text-sm ${replyState === "error" ? "text-[#b91c1c]" : "text-[#16a34a]"}`}>{replyMessage}</span>
										)}
									</div>
								</div>

								<div className="flex flex-col gap-2.5 border-t border-[#f0efee] pt-5">
									<p className="text-[15px] text-[#52525b]">Or hand it to your coding agent (Claude Code, Cursor, Codex):</p>
									<div className="flex flex-wrap items-center gap-3">
										<button
											type="button"
											onClick={async () => {
												await copy("prompt", agentPrompt(domain));
												setPromptCopied(true);
											}}
											className="rounded-lg border border-[#e7e5e4] bg-white px-3.5 py-2 text-sm font-medium transition-colors hover:border-[#d6d3d1]"
										>
											{copied === "prompt" ? "Copied" : "Copy setup prompt"}
										</button>
										{activeStep === 2 && (
											<button
												type="button"
												onClick={() => setSkippedToPlan(true)}
												className="text-sm text-[#78716c] transition-colors hover:text-[#1c1917]"
											>
												Do this later
											</button>
										)}
									</div>
								</div>
							</div>
						</Step>

						{/* Step 3 */}
						<Step
							number={3}
							title={paid ? "You're subscribed" : "Keep your inbox"}
							state={paid ? "done" : activeStep === 3 ? "active" : "upcoming"}
						>
							{paid ? (
								<div className="flex flex-wrap items-center justify-between gap-4">
									<p className="text-[15px] text-[#52525b]">{domain} is yours. Add your own domain whenever you're ready.</p>
									<Link
										href="/logs"
										className="rounded-lg bg-[#8161FF] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#6b4fd9]"
									>
										Go to dashboard
									</Link>
								</div>
							) : (
								<div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
									<ul className="flex flex-col gap-2 text-[15px] text-[#3f3f46]">
										{[
											`${domain} stays yours`,
											"5,000 emails received + 5,000 sent each month",
											"Send to anyone, not just replies",
											"Add your own domain anytime",
										].map((line) => (
											<li key={line} className="flex items-center gap-2.5">
												<Check className="size-4 shrink-0 text-[#16a34a]" />
												{line}
											</li>
										))}
									</ul>
									<div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
										<button
											type="button"
											onClick={subscribe}
											disabled={subscribing}
											className="rounded-xl bg-[#8161FF] px-5 py-3 text-base font-medium text-white transition-[background-color,transform] duration-200 ease-[cubic-bezier(0.2,0,0,1)] hover:bg-[#6b4fd9] active:scale-[0.99] disabled:opacity-60"
										>
											{subscribing ? "Opening checkout…" : `Subscribe${priceLabel ? ` · ${priceLabel}` : ""}`}
										</button>
										<span className="text-xs text-[#a8a29e]">Cancel anytime.</span>
										{subscribeError && <span className="text-sm text-[#b91c1c]">{subscribeError}</span>}
									</div>
								</div>
							)}
						</Step>
					</ol>
				)}
			</div>
		</div>
	);
}

function Step({
	number,
	title,
	state,
	children,
}: {
	number: number;
	title: string;
	state: "active" | "done" | "upcoming";
	children: React.ReactNode;
}) {
	return (
		<li
			className={`rounded-2xl border bg-white px-5 py-5 transition-[opacity,border-color,box-shadow] duration-300 sm:px-6 ${
				state === "active"
					? "border-[#d9d0fd] shadow-[0_24px_48px_-28px_rgba(129,97,255,0.35)]"
					: "border-[#e7e5e4]"
			} ${state === "upcoming" ? "opacity-55" : "opacity-100"}`}
		>
			<div className="mb-4 flex items-center gap-3">
				<span
					className={`flex size-6 shrink-0 items-center justify-center rounded-full font-mono text-xs tracking-normal ${
						state === "done"
							? "bg-[#16a34a] text-white"
							: state === "active"
								? "bg-[#8161FF] text-white"
								: "bg-[#f0efee] text-[#78716c]"
					}`}
				>
					{state === "done" ? <Check className="size-3.5" /> : number}
				</span>
				<h2 className="text-[17px] font-semibold tracking-[-0.02em]">{title}</h2>
			</div>
			{children}
		</li>
	);
}
