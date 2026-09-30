"use client";

import { Check, Copy } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { sonare } from "sonare";
import { useRealtime } from "@/lib/realtime-client";

const INBOX_STORAGE_KEY = "inbound-demo-inbox";
const EXAMPLE_INTERVAL_MS = 5200;
const VISIBLE_ROWS = 3;

type InboxItem = {
	key: string;
	from: string;
	subject: string;
	preview?: string;
	route?: string;
	latency?: string;
	reply?: string;
	live: boolean;
};

type Example = Omit<InboxItem, "key" | "live">;

const EXAMPLES: Example[] = [
	{
		from: "maya@acme.com",
		subject: "can you move my demo to friday?",
		route: "/api/support-agent",
		latency: "84ms",
		reply: "Done — moved to Fri 2:00pm. A new invite is on its way.",
	},
	{
		from: "jon@northwind.io",
		subject: "Invoice #2291 has the wrong VAT number",
		route: "/api/billing",
		latency: "112ms",
		reply: "Fixed — a corrected invoice is attached to this thread.",
	},
	{
		from: "priya@lumen.dev",
		subject: "Is there an API for bulk exports?",
		route: "/api/support-agent",
		latency: "96ms",
		reply: "Yes — POST /v1/exports takes up to 10k rows. I linked the guide.",
	},
	{
		from: "alex@hey.com",
		subject: "Applying for the design engineer role",
		route: "/api/ats",
		latency: "71ms",
		reply: "Thanks Alex — your application is in. We reply within 3 days.",
	},
];

export function useDemoInboxAddress() {
	const [address, setAddress] = useState("");

	useEffect(() => {
		const stored = localStorage.getItem(INBOX_STORAGE_KEY);
		if (stored) {
			setAddress(stored);
			return;
		}
		const next = `${sonare({ minLength: 6, maxLength: 10 })}@inbox.inbound.new`;
		localStorage.setItem(INBOX_STORAGE_KEY, next);
		setAddress(next);
	}, []);

	return address;
}

function exampleItem(index: number): InboxItem {
	const example = EXAMPLES[index % EXAMPLES.length];
	return { ...example, key: `example-${index}`, live: false };
}

export function LiveInbox() {
	const address = useDemoInboxAddress();
	const reduceMotion = useReducedMotion();
	const [copied, setCopied] = useState(false);
	const [items, setItems] = useState<InboxItem[]>(() =>
		[2, 1, 0].map(exampleItem),
	);
	const [hasLive, setHasLive] = useState(false);
	const nextExample = useRef(VISIBLE_ROWS);

	const inboxId = address ? address.split("@")[0] : null;

	useRealtime({
		channels: inboxId ? [`inbox-${inboxId}`] : [],
		events: ["inbox.emailReceived"],
		onData({ data }) {
			const email = data as {
				from: string;
				subject: string;
				preview: string;
				timestamp: string;
				emailId?: string;
			};
			setHasLive(true);
			setItems((prev) =>
				[
					{
						key: email.emailId ?? `live-${email.timestamp}`,
						from: email.from,
						subject: email.subject,
						preview: email.preview,
						live: true,
					},
					...prev,
				].slice(0, VISIBLE_ROWS),
			);
		},
	});

	useEffect(() => {
		if (hasLive) return;
		const timer = setInterval(() => {
			const item = exampleItem(nextExample.current);
			nextExample.current += 1;
			setItems((prev) => [item, ...prev].slice(0, VISIBLE_ROWS));
		}, EXAMPLE_INTERVAL_MS);
		return () => clearInterval(timer);
	}, [hasLive]);

	const copyAddress = async () => {
		if (!address) return;
		await navigator.clipboard.writeText(address);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	};

	const latest = items[0];
	const ease = [0.2, 0, 0, 1] as const;
	const rowTransition = reduceMotion
		? { duration: 0 }
		: { duration: 0.45, ease };

	return (
		<div className="flex w-full flex-col overflow-hidden rounded-2xl border border-[#e7e5e4] bg-white shadow-[0_24px_48px_-24px_rgba(28,25,23,0.18)]">
			<div className="flex items-center justify-between gap-4 border-b border-[#e7e5e4] px-[18px] py-3.5">
				<button
					type="button"
					onClick={copyAddress}
					className="group flex min-w-0 items-center gap-2 text-left"
					aria-label="Copy inbox address"
				>
					<span className="relative flex size-2 shrink-0">
						<span className="absolute inline-flex size-full animate-ping rounded-full bg-[#16a34a] opacity-60 motion-reduce:animate-none" />
						<span className="relative inline-flex size-2 rounded-full bg-[#16a34a]" />
					</span>
					<span className="truncate font-mono text-[13px] tracking-normal text-[#1c1917]">
						{address || "\u00a0"}
					</span>
					{copied ? (
						<Check className="size-3.5 shrink-0 text-[#8161FF]" />
					) : (
						<Copy className="size-3.5 shrink-0 text-[#a8a29e] transition-colors group-hover:text-[#1c1917]" />
					)}
				</button>
				<span className="hidden shrink-0 font-mono text-[11px] tracking-[0.08em] text-[#78716c] sm:inline">
					LIVE · SEND IT SOMETHING
				</span>
			</div>

			<ul className="relative h-[204px] overflow-hidden">
				<AnimatePresence initial={false} mode="popLayout">
					{items.map((item, index) => {
						const isLatest = index === 0;
						return (
							<motion.li
								key={item.key}
								layout
								initial={{ opacity: 0, y: -24 }}
								animate={{ opacity: 1, y: 0 }}
								exit={{ opacity: 0 }}
								transition={rowTransition}
								className={`flex h-[68px] items-start gap-3 border-b border-[#f0efee] px-[18px] py-3.5 transition-colors duration-500 ${
									isLatest ? "bg-[#f6f3ff]" : "bg-white"
								}`}
							>
								<span
									className={`mt-1.5 size-2 shrink-0 rounded-full transition-colors duration-500 ${
										isLatest ? "bg-[#8161FF]" : "bg-transparent"
									}`}
								/>
								<div className="flex min-w-0 flex-1 flex-col gap-0.5">
									<div className="flex items-center justify-between gap-3">
										<span
											className={`truncate text-sm tracking-[-0.01em] text-[#1c1917] ${
												isLatest ? "font-semibold" : "font-medium"
											}`}
										>
											{item.from}
										</span>
										<span className="shrink-0 text-xs text-[#a8a29e]">
											{item.live ? "just now" : "example"}
										</span>
									</div>
									<span className="truncate text-sm tracking-[-0.01em] text-[#52525b]">
										{item.subject}
									</span>
								</div>
							</motion.li>
						);
					})}
				</AnimatePresence>
			</ul>

			<div className="relative h-[148px] overflow-hidden px-[18px] py-[18px]">
				<AnimatePresence mode="wait" initial={false}>
					<motion.div
						key={latest.key}
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						transition={reduceMotion ? { duration: 0 } : { duration: 0.2 }}
						className="flex flex-col gap-2.5"
					>
						{latest.live ? (
							<LiveDetail item={latest} reduceMotion={!!reduceMotion} />
						) : (
							<ExampleDetail item={latest} reduceMotion={!!reduceMotion} />
						)}
					</motion.div>
				</AnimatePresence>
			</div>
		</div>
	);
}

function ExampleDetail({
	item,
	reduceMotion,
}: {
	item: InboxItem;
	reduceMotion: boolean;
}) {
	const ease = [0.2, 0, 0, 1] as const;
	return (
		<>
			<motion.div
				initial={reduceMotion ? false : { opacity: 0, y: 4 }}
				animate={{ opacity: 1, y: 0 }}
				transition={{ delay: reduceMotion ? 0 : 0.6, duration: 0.3, ease }}
				className="flex items-center gap-2 font-mono text-xs tracking-normal"
			>
				<span className="text-[#78716c]">POST</span>
				<span className="text-[#6b4fd9]">{item.route}</span>
				<span className="text-[#16a34a]">200 · {item.latency}</span>
			</motion.div>
			<motion.div
				initial={reduceMotion ? false : { opacity: 0, y: 8, scale: 0.98 }}
				animate={{ opacity: 1, y: 0, scale: 1 }}
				transition={{ delay: reduceMotion ? 0 : 1.4, duration: 0.35, ease }}
				className="flex max-w-[380px] flex-col gap-1.5 self-end rounded-xl rounded-br-[4px] bg-[#8161FF] px-3.5 py-3"
			>
				<span className="text-sm leading-5 tracking-[-0.01em] text-white">
					{item.reply}
				</span>
				<span className="truncate font-mono text-[11px] tracking-normal text-[#dcd2ff]">
					↳ replied in thread · Re: {item.subject}
				</span>
			</motion.div>
		</>
	);
}

function LiveDetail({
	item,
	reduceMotion,
}: {
	item: InboxItem;
	reduceMotion: boolean;
}) {
	return (
		<motion.div
			initial={reduceMotion ? false : { opacity: 0, y: 4 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.3 }}
			className="flex flex-col gap-2"
		>
			<span className="font-mono text-xs tracking-normal text-[#16a34a]">
				parsed · ready for your webhook
			</span>
			<div className="flex flex-col rounded-lg bg-[#fafaf9] px-3 py-2.5 font-mono text-xs leading-5 tracking-normal text-[#1c1917]">
				<span className="truncate">from: "{item.from}"</span>
				<span className="truncate">subject: "{item.subject}"</span>
				{item.preview && (
					<span className="truncate text-[#78716c]">
						text: "{item.preview}"
					</span>
				)}
			</div>
		</motion.div>
	);
}
