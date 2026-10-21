const EXAMPLES = [
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
	},
	{
		from: "priya@lumen.dev",
		subject: "Is there an API for bulk exports?",
	},
];

export function ExampleInbox() {
	const latest = EXAMPLES[0];

	return (
		<div className="flex w-full flex-col overflow-hidden border border-[#3a3532] bg-[#1c1917] shadow-[0_32px_80px_-32px_rgba(129,97,255,0.45)]">
			<div className="flex items-center justify-between gap-4 border-b border-[#2e2a27] bg-[#211e1c] px-[18px] py-3.5">
				<div className="flex min-w-0 items-center gap-2">
					<span className="size-2 shrink-0 bg-[#8161FF]" />
					<span className="truncate text-[13px] text-[#fafaf9]">
						support@yourapp.com
					</span>
				</div>
				<span className="hidden shrink-0 text-xs text-[#a8a29e] sm:inline">
					example
				</span>
			</div>

			<ul className="relative h-[204px] overflow-hidden">
				{EXAMPLES.map((item, index) => {
					const isLatest = index === 0;
					return (
						<li
							key={item.from}
							className={`flex h-[68px] items-start gap-3 border-b border-[#2e2a27] px-[18px] py-3.5 ${
								isLatest ? "bg-[#221d33]" : "bg-[#1c1917]"
							}`}
						>
							<span
								className={`mt-1.5 size-2 shrink-0 ${
									isLatest ? "bg-[#8161FF]" : "bg-transparent"
								}`}
							/>
							<div className="flex min-w-0 flex-1 flex-col gap-0.5">
								<span
									className={`truncate text-sm ${isLatest ? "text-[#fafaf9]" : "text-[#d6d3d1]"}`}
								>
									{item.from}
								</span>
								<span className="truncate text-sm text-[#a8a29e]">
									{item.subject}
								</span>
							</div>
						</li>
					);
				})}
			</ul>

			<div className="relative flex h-[148px] flex-col gap-2.5 overflow-hidden px-[18px] py-[18px]">
				<div className="flex items-center gap-2 text-xs">
					<span className="text-[#78716c]">POST</span>
					<span className="text-[#a594ff]">{latest.route}</span>
					<span className="text-[#a8a29e]">200 · {latest.latency}</span>
				</div>
				<div className="flex min-w-0 max-w-[min(400px,100%)] flex-col gap-1.5 self-end bg-[#8161FF] px-3.5 py-3">
					<span className="text-sm leading-5 text-white">{latest.reply}</span>
					<span className="truncate text-[11px] text-[#e4dcff]">
						↳ replied in thread · Re: {latest.subject}
					</span>
				</div>
			</div>
		</div>
	);
}
