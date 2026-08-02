"use client";

import {
	EmailEditor,
	type EmailEditorRef,
} from "@react-email/editor";
import { Maximize2, Minimize2, Send, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ComposerDraft, SendMessageInput } from "@/lib/mail-types";

interface ComposeWindowProps {
	draft: ComposerDraft;
	fromOptions: string[];
	onChange: (draft: ComposerDraft) => void;
	onClose: () => void;
	onDiscard: () => void;
	onSend: (message: SendMessageInput) => Promise<void>;
}

function splitAddresses(value: string): string[] {
	return value
		.split(/[;,]/)
		.map((address) => address.trim())
		.filter(Boolean);
}

function validAddress(value: string): boolean {
	const bracketed = value.match(/<([^<>]+)>/u)?.[1];
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(bracketed ?? value);
}

function editorContent(content: string): string | object {
	if (!content) return "<p></p>";
	try {
		return JSON.parse(content) as object;
	} catch {
		return content;
	}
}

export function ComposeWindow({
	draft,
	fromOptions,
	onChange,
	onClose,
	onDiscard,
	onSend,
}: ComposeWindowProps) {
	const editorRef = useRef<EmailEditorRef>(null);
	const [showDetails, setShowDetails] = useState(Boolean(draft.cc || draft.bcc));
	const [expanded, setExpanded] = useState(false);
	const [sending, setSending] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const content = useMemo(() => editorContent(draft.content), [draft.content]);

	const update = useCallback(
		(patch: Partial<ComposerDraft>) => {
			onChange({ ...draft, ...patch, updatedAt: new Date().toISOString() });
		},
		[draft, onChange],
	);

	const saveEditorState = useCallback(
		(ref: EmailEditorRef) => {
			update({ content: JSON.stringify(ref.getJSON()) });
		},
		[update],
	);

	const send = useCallback(async () => {
		if (sending || !editorRef.current) return;
		const to = splitAddresses(draft.to);
		const cc = splitAddresses(draft.cc);
		const bcc = splitAddresses(draft.bcc);
		if (!draft.from || !validAddress(draft.from)) {
			setError("Choose a valid sending address.");
			return;
		}
		if (!to.length || !draft.subject.trim()) {
			setError("Add a recipient and subject before sending.");
			return;
		}
		const invalidRecipient = [...to, ...cc, ...bcc].find(
			(address) => !validAddress(address),
		);
		if (invalidRecipient) {
			setError(`Check the address “${invalidRecipient}”.`);
			return;
		}

		setSending(true);
		setError(null);
		try {
			const email = await editorRef.current.getEmail();
			if (!email.text.trim()) {
				setError("Write a message before sending.");
				setSending(false);
				return;
			}
			await onSend({
				from: draft.from,
				to,
				cc,
				bcc,
				subject: draft.subject.trim(),
				html: email.html,
				text: email.text,
				replyToThreadId: draft.replyToThreadId,
			});
		} catch (sendError) {
			setError(sendError instanceof Error ? sendError.message : "Unable to send message.");
			setSending(false);
		}
	}, [draft, onSend, sending]);

	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
				event.preventDefault();
				void send();
			}
			if (event.key === "Escape" && !event.metaKey && !event.ctrlKey) onClose();
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [onClose, send]);

	return (
		<div className={`compose-window ${expanded ? "compose-window-expanded" : ""}`}>
			<header className="compose-header">
				<div>
					<strong>{draft.replyToThreadId ? "Reply" : "New message"}</strong>
					<span>Saved locally</span>
				</div>
				<div className="compose-header-actions">
					<button
						aria-label={expanded ? "Restore composer" : "Expand composer"}
						className="icon-button icon-button-compact"
						onClick={() => setExpanded((value) => !value)}
						type="button"
					>
						{expanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
					</button>
					<button
						aria-label="Close composer"
						className="icon-button icon-button-compact"
						onClick={onClose}
						type="button"
					>
						<X size={16} />
					</button>
				</div>
			</header>

			<div className="compose-fields">
				<label>
					<span>From</span>
					<select
						aria-label="From address"
						className="compose-from"
						disabled={fromOptions.length < 2}
						onChange={(event) => update({ from: event.target.value })}
						value={draft.from}
					>
						{fromOptions.length ? fromOptions.map((address) => (
							<option key={address} value={address}>{address}</option>
						)) : <option value="">No authorized sending address</option>}
					</select>
				</label>
				<label>
					<span>To</span>
					<input
						aria-label="To"
						autoFocus
						value={draft.to}
						onChange={(event) => update({ to: event.target.value })}
						placeholder="name@example.com"
					/>
					{!showDetails ? (
						<button className="compose-details-toggle" onClick={() => setShowDetails(true)} type="button">
							Cc Bcc
						</button>
					) : null}
				</label>
				{showDetails ? (
					<>
						<label>
							<span>Cc</span>
							<input aria-label="Cc" value={draft.cc} onChange={(event) => update({ cc: event.target.value })} />
						</label>
						<label>
							<span>Bcc</span>
							<input aria-label="Bcc" value={draft.bcc} onChange={(event) => update({ bcc: event.target.value })} />
						</label>
					</>
				) : null}
				<label>
					<span>Subject</span>
					<input
						value={draft.subject}
						onChange={(event) => update({ subject: event.target.value })}
						placeholder="What’s this about?"
					/>
				</label>
			</div>

			<div className="compose-editor inbound-email-editor">
				<EmailEditor
					ref={editorRef}
					content={content}
					theme="basic"
					placeholder="Write your message…"
					onReady={(ref) => {
						ref.editor?.view.dom.setAttribute("aria-label", "Message body");
					}}
					onUpdate={saveEditorState}
				/>
			</div>

			<footer className="compose-footer">
				<div>
					<button className="send-button" disabled={sending} onClick={() => void send()} type="button">
						<Send size={15} />
						{sending ? "Sending…" : "Send"}
					</button>
					<span className="shortcut-hint">⌘↵</span>
				</div>
				<div>
					{error ? <span className="compose-error" role="alert">{error}</span> : null}
					<button className="text-button danger-text" onClick={onDiscard} type="button">
						Discard
					</button>
				</div>
			</footer>
		</div>
	);
}
