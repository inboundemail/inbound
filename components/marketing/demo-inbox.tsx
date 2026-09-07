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
		<div>
			<div className="flex min-h-11 min-w-0 items-center gap-3 border-b border-border">
				<span className="truncate font-mono text-xs tracking-normal text-[var(--text-primary)] sm:text-sm">
					{email || "Generating your address..."}
				</span>
				<button
					type="button"
					onClick={copyToClipboard}
					aria-label={copied ? "Email address copied" : "Copy email address"}
					className="ml-auto shrink-0 text-[var(--text-muted)] transition-colors hover:text-primary"
				>
					{copied ? (
						<Check className="size-4 text-primary" />
					) : (
						<Copy className="size-4" />
					)}
				</button>
			</div>
			<p className="mt-3 text-xs leading-relaxed tracking-normal text-[var(--text-secondary)]">
				Send an email to see it here.
			</p>

			{emails.length > 0 && (
				<div className="mt-4 space-y-2">
					{emails.map((mail, i) => (
						<div
							key={
								mail.emailId ||
								`${mail.from}-${mail.timestamp.getTime()}-${mail.subject}`
							}
							className="group relative animate-in border-t border-border py-4 duration-300 fade-in slide-in-from-top-2 motion-reduce:animate-none"
						>
							<button
								type="button"
								onClick={() => dismissEmail(i)}
								aria-label="Dismiss email"
								className="absolute right-3 top-3 text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)] focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
							>
								<X className="w-4 h-4" />
							</button>
							<div className="flex items-center gap-2 mb-1">
								<span className="text-sm font-medium text-[var(--text-primary)]">
									{mail.from}
								</span>
								<span className="text-xs text-[var(--text-muted)]">
									just now
								</span>
							</div>
							<p className="text-sm text-[var(--text-secondary)]">
								{mail.subject}
							</p>
							<p className="mt-1 line-clamp-1 text-xs text-[var(--text-muted)]">
								{mail.preview}
							</p>
						</div>
					))}
				</div>
			)}
		</div>
	);
}
