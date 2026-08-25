"use client";

import { Check, Copy, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { sonare } from "sonare";
import { useRealtime } from "@/lib/realtime-client";

interface InboxEmail {
	from: string;
	subject: string;
	preview: string;
	timestamp: Date;
	emailId?: string;
}

const INBOX_STORAGE_KEY = "inbound-demo-inbox";

export function DemoInbox() {
	const [email, setEmail] = useState("");
	const [copied, setCopied] = useState(false);
	const [emails, setEmails] = useState<InboxEmail[]>([]);

	const inboxId = useMemo(() => {
		if (!email) return null;
		return email.split("@")[0];
	}, [email]);

	const channel = useMemo(() => {
		return inboxId ? `inbox-${inboxId}` : null;
	}, [inboxId]);

	useRealtime({
		channels: channel ? [channel] : [],
		events: ["inbox.emailReceived"],
		onData({ data }) {
			const emailData = data as {
				from: string;
				subject: string;
				preview: string;
				timestamp: string;
				emailId?: string;
			};
			const newEmail: InboxEmail = {
				from: emailData.from,
				subject: emailData.subject,
				preview: emailData.preview,
				timestamp: new Date(emailData.timestamp),
				emailId: emailData.emailId,
			};
			setEmails((prev) => [newEmail, ...prev]);
		},
	});

	useEffect(() => {
		const stored = localStorage.getItem(INBOX_STORAGE_KEY);
		if (stored) {
			setEmail(stored);
			return;
		}

		const word = sonare({ minLength: 6, maxLength: 10 });
		const newEmail = `${word}@inbox.inbound.new`;
		setEmail(newEmail);
		localStorage.setItem(INBOX_STORAGE_KEY, newEmail);
	}, []);

	const copyToClipboard = async () => {
		await navigator.clipboard.writeText(email);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	};

	const dismissEmail = (index: number) => {
		setEmails((prev) => prev.filter((_, i) => i !== index));
	};

	return (
		<div className="mt-12">
			<div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
				<div className="flex-1 bg-white border border-[#e7e5e4] rounded-lg px-3 py-2 flex items-center gap-3 min-w-0">
					<span className="font-mono text-sm text-[#3f3f46] truncate">
						{email}
					</span>
					<button
						type="button"
						onClick={copyToClipboard}
						aria-label={copied ? "Email address copied" : "Copy email address"}
						className="ml-auto text-[#52525b] hover:text-[#1c1917] transition-colors flex-shrink-0"
					>
						{copied ? (
							<Check className="w-4 h-4 text-[#8161FF]" />
						) : (
							<Copy className="w-4 h-4" />
						)}
					</button>
				</div>
			</div>
			<p className="mt-3 text-sm text-[#52525b]">
				This is a real inbox. Send an email to this address and watch it appear
				in real-time.
			</p>

			{emails.length > 0 && (
				<div className="mt-4 space-y-2">
					{emails.map((mail, i) => (
						<div
							key={
								mail.emailId ||
								`${mail.from}-${mail.timestamp.getTime()}-${mail.subject}`
							}
							className="bg-white border border-[#e7e5e4] rounded-xl p-4 animate-in slide-in-from-top-2 fade-in duration-300 relative group"
						>
							<button
								type="button"
								onClick={() => dismissEmail(i)}
								aria-label="Dismiss email"
								className="absolute top-3 right-3 text-[#a8a29e] hover:text-[#1c1917] transition-colors opacity-0 group-hover:opacity-100"
							>
								<X className="w-4 h-4" />
							</button>
							<div className="flex items-center gap-2 mb-1">
								<span className="text-sm font-medium text-[#1c1917]">
									{mail.from}
								</span>
								<span className="text-xs text-[#a8a29e]">just now</span>
							</div>
							<p className="text-sm text-[#3f3f46]">{mail.subject}</p>
							<p className="text-xs text-[#78716c] mt-1 line-clamp-1">
								{mail.preview}
							</p>
						</div>
					))}
				</div>
			)}
		</div>
	);
}
