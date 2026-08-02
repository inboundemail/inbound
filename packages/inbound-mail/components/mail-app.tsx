"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import dynamic from "next/dynamic";
import {
	Archive,
	ArrowLeft,
	Check,
	ChevronDown,
	Clock3,
	Command,
	FileArchive,
	FileImage,
	FileText,
	Inbox,
	LoaderCircle,
	LogOut,
	Mail,
	MailOpen,
	Menu,
	Paperclip,
	PenLine,
	RefreshCw,
	Reply,
	Search,
	Send,
	Settings2,
	ShieldAlert,
	Sparkles,
	Star,
	Trash2,
	Undo2,
	X,
} from "lucide-react";
import {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { BrandMark } from "@/components/brand-mark";
import { EmailHtml } from "@/components/email-html";
import { LoginScreen } from "@/components/login-screen";
import { MailboxOnboarding } from "@/components/mailbox-onboarding";
import { clearMailCache, readMailCache, writeMailCache } from "@/lib/local-cache";
import { contactsForThread } from "@/lib/mail-format";
import { inboundMailMode, usesMockMailData } from "@/lib/mail-mode";
import {
	configuredFromAddresses,
	replyAddressForThread,
} from "@/lib/mailbox-config-model";
import type {
	ComposerDraft,
	InboundSession,
	MailFolder,
	MailboxConfigurationState,
	MailThread,
	SendMessageInput,
} from "@/lib/mail-types";
import { freshMockThreads } from "@/lib/mock-mail";

const ComposeWindow = dynamic(
	() => import("@/components/compose-window").then((module) => module.ComposeWindow),
	{ ssr: false },
);

const MAIL_MODE = inboundMailMode();
const USE_MOCK_DATA = usesMockMailData(MAIL_MODE);

const NAV_ITEMS: Array<{
	id: MailFolder;
	label: string;
	icon: typeof Inbox;
}> = [
	{ id: "inbox", label: "Inbox", icon: Inbox },
	{ id: "starred", label: "Starred", icon: Star },
	{ id: "snoozed", label: "Snoozed", icon: Clock3 },
	{ id: "sent", label: "Sent", icon: Send },
	{ id: "drafts", label: "Drafts", icon: FileText },
	{ id: "archive", label: "Archive", icon: Archive },
];

function formatMailboxDate(value: string) {
	const date = new Date(value);
	const now = new Date();
	if (date.toDateString() === now.toDateString()) {
		return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
	}
	return date.toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		year: date.getFullYear() === now.getFullYear() ? undefined : "numeric",
	});
}

function formatMessageDate(value: string) {
	return new Date(value).toLocaleString("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
		hour: "numeric",
		minute: "2-digit",
	});
}

function initials(name: string) {
	return name
		.split(/\s+/)
		.map((part) => part[0])
		.join("")
		.slice(0, 2)
		.toUpperCase();
}

function formatSyncStatus(lastSyncedAt: string | null, online: boolean) {
	if (!online) return "Offline · changes saved";
	if (!lastSyncedAt) return "Local cache ready";
	const elapsed = Date.now() - new Date(lastSyncedAt).getTime();
	if (elapsed < 60_000) return "Synced just now";
	if (elapsed < 60 * 60_000) return `Synced ${Math.max(1, Math.floor(elapsed / 60_000))}m ago`;
	return `Synced ${new Date(lastSyncedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
}

function makeDraft(from: string, thread?: MailThread): ComposerDraft {
	const recipient = thread?.participants[0];
	return {
		id: crypto.randomUUID(),
		from,
		to: recipient ? `${recipient.name} <${recipient.email}>` : "",
		cc: "",
		bcc: "",
		subject: thread ? `Re: ${thread.subject.replace(/^Re:\s*/i, "")}` : "",
		content: thread
			? `<p></p><p>On ${formatMessageDate(thread.lastMessageAt)}, ${recipient?.name ?? "they"} wrote:</p><blockquote>${thread.snippet}</blockquote>`
			: "<p></p>",
		replyToThreadId: thread?.id,
		updatedAt: new Date().toISOString(),
	};
}

interface SidebarProps {
	folder: MailFolder;
	threads: MailThread[];
	open: boolean;
	session: InboundSession;
	selectedLabel: string | null;
	usesMockData: boolean;
	canCompose: boolean;
	onClose: () => void;
	onCompose: () => void;
	onFolder: (folder: MailFolder) => void;
	onLabel: (label: string) => void;
	onManageMailboxes: () => void;
	onReset: () => void;
}

function Sidebar({
	folder,
	threads,
	open,
	session,
	selectedLabel,
	usesMockData,
	canCompose,
	onClose,
	onCompose,
	onFolder,
	onLabel,
	onManageMailboxes,
	onReset,
}: SidebarProps) {
	const [accountOpen, setAccountOpen] = useState(false);
	const unread = threads.filter((thread) => thread.folder === "inbox" && thread.unread).length;
	const drafts = threads.filter((thread) => thread.folder === "drafts").length;
	const domains = session.domainScope?.domains ?? [];
	const domain = domains[0]?.domain ?? "No domains";
	const labels = [...new Set(threads.flatMap((thread) => thread.labels))]
		.map((label) => ({
			label,
			count: threads.filter((thread) => thread.labels.includes(label)).length,
		}))
		.slice(0, 5);

	return (
		<aside className={`mail-sidebar ${open ? "mail-sidebar-open" : ""}`}>
			<div className="sidebar-brand">
				<div className="sidebar-brand-lockup">
					<BrandMark className="sidebar-mark" />
					<span>Inbound Mail</span>
				</div>
				<button aria-label="Close navigation" className="sidebar-close" onClick={onClose} type="button">
					<X size={18} />
				</button>
			</div>

			<button className="compose-button" disabled={!canCompose} onClick={onCompose} type="button">
				<PenLine size={16} />
				<span>Compose</span>
				<kbd>C</kbd>
			</button>

			<nav className="mail-navigation" aria-label="Mailboxes">
				{NAV_ITEMS.map((item) => {
					const Icon = item.icon;
					const count = item.id === "inbox" ? unread : item.id === "drafts" ? drafts : 0;
					return (
						<button
							className={folder === item.id ? "nav-item nav-item-active" : "nav-item"}
							key={item.id}
							onClick={() => {
								onFolder(item.id);
								onClose();
							}}
							type="button"
						>
							<Icon size={16} strokeWidth={1.8} />
							<span>{item.label}</span>
							{count ? <strong>{count}</strong> : null}
						</button>
					);
				})}
			</nav>

			{labels.length ? (
				<>
					<div className="sidebar-section-label">Labels</div>
					<div className="sidebar-labels">
						{labels.map(({ label, count }, index) => (
							<button
								aria-pressed={selectedLabel === label}
								className={selectedLabel === label ? "sidebar-label-active" : ""}
								key={label}
								onClick={() => { onLabel(label); onClose(); }}
								type="button"
							>
								<span className={`label-dot label-dot-${index % 3}`} />
								<span>{label}</span>
								<strong>{count}</strong>
							</button>
						))}
					</div>
				</>
			) : null}

			<div className="sidebar-spacer" />
			{usesMockData ? (
				<button className="mock-control" onClick={onReset} type="button">
					<Sparkles size={14} />
					<span><strong>Mock inbox</strong><small>Reset local data</small></span>
				</button>
			) : null}
			<div
				className="account-area"
				onBlur={(event) => {
					if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
						setAccountOpen(false);
					}
				}}
			>
				{accountOpen ? (
					<div className="account-menu">
						<div className="account-menu-identity">
							<strong>{session.user?.name ?? "Inbound user"}</strong>
							<span>{session.user?.email || "Local development"}</span>
						</div>
						<div className="account-domain-list">
							<small>Authorized domains</small>
							{domains.map((item) => <span key={item.id}>{item.domain}</span>)}
						</div>
						<button className="account-menu-action" onClick={() => { setAccountOpen(false); onManageMailboxes(); }} type="button">
							<Settings2 size={14} /> Manage mailboxes
						</button>
						{session.mode === "mock" ? (
							<p>Automatic mock session</p>
						) : (
							<form action="/api/auth/signout" method="post">
								<button type="submit"><LogOut size={14} /> Sign out</button>
							</form>
						)}
					</div>
				) : null}
				<button
					aria-expanded={accountOpen}
					className="account-control"
					onClick={() => setAccountOpen((value) => !value)}
					type="button"
				>
					<div className="account-avatar">{initials(session.user?.name ?? "Inbound User")}</div>
					<div>
						<strong>{session.user?.name ?? "Inbound user"}</strong>
						<span>{domains.length > 1 ? `${domain} +${domains.length - 1}` : domain}</span>
					</div>
					<ChevronDown className={accountOpen ? "account-chevron-open" : ""} size={14} />
				</button>
			</div>
		</aside>
	);
}

interface ThreadListProps {
	threads: MailThread[];
	selectedId: string | null;
	emptyTitle: string;
	emptyDescription: string;
	onOpen: (id: string) => void;
	onStar: (id: string) => void;
}

function ThreadList({ threads, selectedId, emptyTitle, emptyDescription, onOpen, onStar }: ThreadListProps) {
	const parentRef = useRef<HTMLDivElement>(null);
	// TanStack Virtual intentionally exposes imperative functions tied to scroll state.
	// eslint-disable-next-line react-hooks/incompatible-library
	const virtualizer = useVirtualizer({
		count: threads.length,
		getScrollElement: () => parentRef.current,
		estimateSize: () => 86,
		overscan: 12,
	});

	if (!threads.length) {
		return (
			<div className="empty-mailbox">
				<MailOpen size={24} />
				<strong>{emptyTitle}</strong>
				<span>{emptyDescription}</span>
			</div>
		);
	}

	return (
		<div className="thread-list" ref={parentRef}>
			<div className="thread-list-inner" style={{ height: virtualizer.getTotalSize() }}>
				{virtualizer.getVirtualItems().map((virtualItem) => {
					const thread = threads[virtualItem.index];
					const sender = thread.participants[0];
					return (
						<div
							aria-current={selectedId === thread.id ? "true" : undefined}
							className={`thread-row ${thread.unread ? "thread-row-unread" : ""} ${selectedId === thread.id ? "thread-row-selected" : ""}`}
							key={thread.id}
							style={{ transform: `translateY(${virtualItem.start}px)` }}
						>
							<button className="thread-open" onClick={() => onOpen(thread.id)} type="button">
								<div className="thread-avatar" data-category={thread.category}>{initials(sender.name)}</div>
								<div className="thread-copy">
								<div className="thread-line thread-line-top">
									<strong title={sender.name}>
										{sender.name}
									</strong>
									{thread.messageCount > 1 ? <span className="message-count">{thread.messageCount}</span> : null}
									<time>{formatMailboxDate(thread.lastMessageAt)}</time>
								</div>
								<div className="thread-line thread-subject">
									<span>{thread.subject}</span>
									{thread.messages.some((message) => message.attachments?.length) ? <Paperclip size={12} /> : null}
								</div>
								<div className="thread-line thread-snippet">
									<span>{thread.snippet}</span>
									{thread.labels[0] ? <em>{thread.labels[0]}</em> : null}
								</div>
								</div>
							</button>
							<button
								aria-label={thread.starred ? "Unstar thread" : "Star thread"}
								className={`thread-star ${thread.starred ? "thread-star-active" : ""}`}
								onClick={(event) => {
									event.stopPropagation();
									onStar(thread.id);
								}}
								type="button"
							>
								<Star size={14} fill={thread.starred ? "currentColor" : "none"} />
							</button>
						</div>
					);
				})}
			</div>
		</div>
	);
}

function AttachmentIcon({ type }: { type: "pdf" | "image" | "document" | "archive" }) {
	if (type === "image") return <FileImage size={18} />;
	if (type === "archive") return <FileArchive size={18} />;
	return <FileText size={18} />;
}

interface ReadingPaneProps {
	thread: MailThread | null;
	onArchive: () => void;
	onBack: () => void;
	onDelete: () => void;
	onReply: () => void;
	onSnooze: () => void;
	onSpam: () => void;
	onStar: () => void;
	onUnread: () => void;
}

function ReadingPane({
	thread,
	onArchive,
	onBack,
	onDelete,
	onReply,
	onSnooze,
	onSpam,
	onStar,
	onUnread,
}: ReadingPaneProps) {
	if (!thread) {
		return (
			<section className="reading-pane reading-empty">
				<div className="reading-empty-icon"><Mail size={22} /></div>
				<strong>Select a conversation</strong>
				<span>Use J and K to move through your inbox.</span>
			</section>
		);
	}

	return (
		<section className="reading-pane">
			<header className="reading-toolbar">
				<button aria-label="Back to inbox" className="icon-button reading-back" onClick={onBack} type="button"><ArrowLeft size={17} /></button>
				<div className="toolbar-group">
					<button aria-label="Archive" className="icon-button" onClick={onArchive} title="Archive (E)" type="button"><Archive size={17} /></button>
					<button aria-label="Report spam" className="icon-button" onClick={onSpam} title="Report spam" type="button"><ShieldAlert size={17} /></button>
					<button aria-label="Delete" className="icon-button" onClick={onDelete} title="Delete" type="button"><Trash2 size={17} /></button>
				</div>
				<div className="toolbar-separator" />
				<div className="toolbar-group">
					<button aria-label="Mark unread" className="icon-button" onClick={onUnread} title="Mark unread (U)" type="button"><Mail size={17} /></button>
					<button aria-label="Snooze" className="icon-button" onClick={onSnooze} title="Snooze until tomorrow" type="button"><Clock3 size={17} /></button>
				</div>
				<span className="toolbar-spacer" />
				<span className="thread-position">{thread.messageCount} message{thread.messageCount === 1 ? "" : "s"}</span>
			</header>

			<div className="reading-scroll">
				<div className="thread-heading">
					<div>
						<div className="thread-heading-labels">
							{thread.important ? <span>Important</span> : null}
							{thread.labels.map((label) => <span key={label}>{label}</span>)}
						</div>
						<h1>{thread.subject}</h1>
						<p>{thread.participants.map((participant) => participant.email).join(", ")}</p>
					</div>
					<button
						aria-label={thread.starred ? "Unstar thread" : "Star thread"}
						className={`icon-button ${thread.starred ? "star-active" : ""}`}
						onClick={onStar}
						type="button"
					>
						<Star size={18} fill={thread.starred ? "currentColor" : "none"} />
					</button>
				</div>

				<div className="message-stack">
					{thread.messages.map((message, index) => (
						<details
							className="message-card"
							key={message.id}
							open={index === thread.messages.length - 1 || thread.messages.length <= 2}
						>
							<summary>
								<div className="message-avatar" data-direction={message.direction}>{initials(message.from.name)}</div>
								<div className="message-summary-copy">
									<strong>{message.from.name}</strong>
									<span>to {message.to.map((recipient) => recipient.name || recipient.email).join(", ")}</span>
								</div>
								<time>{formatMessageDate(message.sentAt)}</time>
								<ChevronDown className="message-chevron" size={15} />
							</summary>
							<div className={`message-content ${message.bodyHtml ? "message-content-html" : ""}`}>
								{message.bodyHtml ? (
									<EmailHtml html={message.bodyHtml} messageId={message.id} />
								) : message.bodyText.split("\n").map((line, lineIndex) =>
									line ? <p key={`${message.id}-${lineIndex}`}>{line}</p> : <br key={`${message.id}-${lineIndex}`} />,
								)}
								{message.attachments?.length ? (
									<div className="attachment-list">
										{message.attachments.map((attachment) => (
											<div className="attachment-card" key={attachment.id}>
												<AttachmentIcon type={attachment.type} />
												<span><strong>{attachment.name}</strong><small>{attachment.size}</small></span>
											</div>
										))}
									</div>
								) : null}
							</div>
						</details>
					))}
				</div>

				<div className="quick-reply">
					<button className="reply-button" onClick={onReply} type="button"><Reply size={15} /> Reply <kbd>R</kbd></button>
				</div>
			</div>
		</section>
	);
}

interface CommandMenuProps {
	open: boolean;
	onClose: () => void;
	commands: Array<{ label: string; hint?: string; icon: typeof Search; action: () => void }>;
}

function CommandMenu({ open, onClose, commands }: CommandMenuProps) {
	const [query, setQuery] = useState("");
	if (!open) return null;
	const filtered = commands.filter((command) => command.label.toLowerCase().includes(query.toLowerCase()));
	return (
		<div className="dialog-backdrop" onMouseDown={onClose} role="presentation">
			<section aria-label="Command menu" aria-modal="true" className="command-menu" onMouseDown={(event) => event.stopPropagation()} role="dialog">
				<label className="command-search"><Search size={17} /><input autoFocus onChange={(event) => setQuery(event.target.value)} placeholder="Type a command or search…" value={query} /><kbd>Esc</kbd></label>
				<div className="command-results">
					<span className="command-section-label">Actions</span>
					{filtered.map((command) => {
						const Icon = command.icon;
						return <button key={command.label} onClick={() => { command.action(); setQuery(""); onClose(); }} type="button"><Icon size={16} /><span>{command.label}</span>{command.hint ? <kbd>{command.hint}</kbd> : null}</button>;
					})}
					{!filtered.length ? <p className="no-command">No matching command</p> : null}
				</div>
			</section>
		</div>
	);
}

function ShortcutSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
	if (!open) return null;
	const shortcuts = [
		["Compose", "C"], ["Next conversation", "J"], ["Previous conversation", "K"],
		["Archive", "E"], ["Star", "S"], ["Mark unread", "U"],
		["Reply", "R"], ["Search", "/"], ["Command menu", "⌘ K"],
	];
	return (
		<div className="dialog-backdrop" onMouseDown={onClose} role="presentation">
			<section aria-label="Keyboard shortcuts" aria-modal="true" className="shortcut-sheet" onMouseDown={(event) => event.stopPropagation()} role="dialog">
				<header><div><Command size={17} /><strong>Keyboard shortcuts</strong></div><button aria-label="Close shortcuts" className="icon-button" onClick={onClose} type="button"><X size={16} /></button></header>
				<div>{shortcuts.map(([label, key]) => <p key={label}><span>{label}</span><kbd>{key}</kbd></p>)}</div>
			</section>
		</div>
	);
}

function mapLiveThreads(payload: { threads?: Array<Record<string, unknown>> }): MailThread[] {
	return (payload.threads ?? []).map((raw) => {
		const latest = (raw.latest_message ?? {}) as Record<string, unknown>;
		const names = Array.isArray(raw.participant_names) ? raw.participant_names.map(String) : [];
		const emails = Array.isArray(raw.participant_emails) ? raw.participant_emails.map(String) : [];
		const participants = contactsForThread(names, emails, latest.from_text);
		const id = String(raw.id);
		const body = String(latest.text_preview ?? "Open this conversation to load its messages.");
		return {
			id,
			subject: String(raw.normalized_subject ?? "No subject"),
			snippet: body,
			participants,
			lastMessageAt: String(raw.last_message_at ?? new Date().toISOString()),
			messageCount: Number(raw.message_count ?? 1),
			unread: Boolean(raw.has_unread),
			starred: false,
			important: false,
			folder: raw.is_archived ? "archive" : "inbox",
			category: "important",
			labels: [],
			messages: [{
				id: String(latest.id ?? `${id}-latest`),
				threadId: id,
				direction: latest.type === "outbound" ? "outbound" : "inbound",
				from: participants[0],
				to: [],
				sentAt: String(latest.date ?? raw.last_message_at ?? new Date().toISOString()),
				bodyText: body,
			}],
		};
	});
}

function liveContact(email: unknown, name?: unknown) {
	const address = String(email ?? "");
	return {
		name: String(name ?? "") || address.split("@")[0] || "Unknown",
		email: address,
	};
}

function formatAttachmentSize(value: unknown) {
	const bytes = Number(value ?? 0);
	if (!Number.isFinite(bytes) || bytes <= 0) return "Attachment";
	if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function mapLiveMessage(raw: Record<string, unknown>, threadId: string) {
	const to = Array.isArray(raw.to) ? raw.to : [];
	const cc = Array.isArray(raw.cc) ? raw.cc : [];
	const attachments = Array.isArray(raw.attachments) ? raw.attachments : [];
	const fromAddress = String(raw.from_address ?? "");
	return {
		id: String(raw.id),
		threadId,
		direction: raw.type === "outbound" ? ("outbound" as const) : ("inbound" as const),
		from: liveContact(fromAddress, raw.from_name ?? raw.from),
		to: to.map((email) => liveContact(email)),
		cc: cc.map((email) => liveContact(email)),
		sentAt: String(raw.date ?? raw.sent_at ?? raw.received_at ?? new Date().toISOString()),
		bodyText: String(raw.text_body ?? "This message only contains HTML content."),
		bodyHtml: typeof raw.html_body === "string" ? raw.html_body : undefined,
		attachments: attachments.map((value, index) => {
			const attachment = value as Record<string, unknown>;
			const name = String(attachment.filename ?? `Attachment ${index + 1}`);
			const contentType = String(attachment.contentType ?? attachment.content_type ?? "");
			return {
				id: `${String(raw.id)}-${index}`,
				name,
				size: formatAttachmentSize(attachment.size),
				type: contentType.startsWith("image/")
					? ("image" as const)
					: name.toLowerCase().endsWith(".pdf")
						? ("pdf" as const)
						: /\.(zip|tar|gz)$/i.test(name)
							? ("archive" as const)
							: ("document" as const),
			};
		}),
	};
}

export function MailApp() {
	const [session, setSession] = useState<InboundSession | null>(null);
	const [authLoading, setAuthLoading] = useState(true);
	const [authError, setAuthError] = useState<string | null>(null);
	const [mailboxConfiguration, setMailboxConfiguration] = useState<MailboxConfigurationState | null>(null);
	const [configurationLoading, setConfigurationLoading] = useState(true);
	const [configurationError, setConfigurationError] = useState<string | null>(null);
	const [configurationRevision, setConfigurationRevision] = useState(0);
	const [mailboxSetupOpen, setMailboxSetupOpen] = useState(false);
	const [threads, setThreads] = useState<MailThread[]>(() => (USE_MOCK_DATA ? freshMockThreads() : []));
	const [folder, setFolder] = useState<MailFolder>("inbox");
	const [selectedId, setSelectedId] = useState<string | null>(() => (USE_MOCK_DATA ? freshMockThreads()[0]?.id ?? null : null));
	const [selectedLabel, setSelectedLabel] = useState<string | null>(null);
	const [mailFilter, setMailFilter] = useState<"all" | "unread">("all");
	const [query, setQuery] = useState("");
	const [draft, setDraft] = useState<ComposerDraft | null>(null);
	const [hydratedCacheKey, setHydratedCacheKey] = useState<string | null>(null);
	const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
	const [syncing, setSyncing] = useState(false);
	const [commandOpen, setCommandOpen] = useState(false);
	const [shortcutsOpen, setShortcutsOpen] = useState(false);
	const [sidebarOpen, setSidebarOpen] = useState(false);
	const [mobileReading, setMobileReading] = useState(false);
	const [online, setOnline] = useState(() =>
		typeof navigator === "undefined" ? true : navigator.onLine,
	);
	const [toast, setToast] = useState<{ message: string; undo?: () => void } | null>(null);
	const searchRef = useRef<HTMLInputElement>(null);
	const toastTimeoutRef = useRef<number | null>(null);
	const fromAddresses = useMemo(
		() => configuredFromAddresses(mailboxConfiguration),
		[mailboxConfiguration],
	);
	const cacheKey = useMemo(() => {
		if (MAIL_MODE === "mock") return "mock";
		return session?.authenticated && session.user?.id
			? `user:${session.user.id}`
			: null;
	}, [session]);
	const hydrated = cacheKey !== null && hydratedCacheKey === cacheKey;
	const currentTitle = selectedLabel
		? selectedLabel
		: NAV_ITEMS.find((item) => item.id === folder)?.label ?? "Inbox";

	const filteredThreads = useMemo(() => {
		const normalizedQuery = query.trim().toLowerCase();
		return threads.filter((thread) => {
			const inFolder = selectedLabel
				? thread.labels.includes(selectedLabel) && thread.folder !== "trash"
				: folder === "starred"
					? thread.starred && thread.folder !== "trash"
					: thread.folder === folder;
			if (!inFolder) return false;
			if (mailFilter === "unread" && !thread.unread) return false;
			if (!normalizedQuery) return true;
			return [
				thread.subject,
				thread.snippet,
				...thread.participants.flatMap((participant) => [participant.name, participant.email]),
				...thread.labels,
			].some((value) => value.toLowerCase().includes(normalizedQuery));
		});
	}, [folder, mailFilter, query, selectedLabel, threads]);
	const selectedThread = threads.find((thread) => thread.id === selectedId) ?? null;

	const showToast = useCallback((message: string, undo?: () => void) => {
		if (toastTimeoutRef.current !== null) window.clearTimeout(toastTimeoutRef.current);
		setToast({ message, undo });
		toastTimeoutRef.current = window.setTimeout(() => {
			setToast(null);
			toastTimeoutRef.current = null;
		}, 4200);
	}, []);

	useEffect(() => () => {
		if (toastTimeoutRef.current !== null) window.clearTimeout(toastTimeoutRef.current);
	}, []);

	useEffect(() => {
		const handleOnline = () => setOnline(true);
		const handleOffline = () => setOnline(false);
		window.addEventListener("online", handleOnline);
		window.addEventListener("offline", handleOffline);
		return () => {
			window.removeEventListener("online", handleOnline);
			window.removeEventListener("offline", handleOffline);
		};
	}, []);

	useEffect(() => {
		if (!session?.authenticated) return;
		let cancelled = false;
		fetch("/api/config/mailboxes", { cache: "no-store" })
			.then(async (response) => {
				const payload = await response.json() as MailboxConfigurationState & { error?: string };
				if (!response.ok) throw new Error(payload.error || "Mailbox configuration is unavailable.");
				if (!cancelled) setMailboxConfiguration(payload);
			})
			.catch((error) => {
				if (!cancelled) {
					setConfigurationError(error instanceof Error ? error.message : "Mailbox configuration is unavailable.");
				}
			})
			.finally(() => {
				if (!cancelled) setConfigurationLoading(false);
			});
		return () => { cancelled = true; };
	}, [configurationRevision, session?.authenticated, session?.user?.id]);

	useEffect(() => {
		const params = new URLSearchParams(window.location.search);
		const nextAuthError = params.get("auth_error");
		fetch("/api/auth/session", { cache: "no-store" })
			.then(async (response) => {
				const payload = (await response.json()) as InboundSession;
				setAuthError(nextAuthError);
				setSession(payload);
			})
			.catch(() => setSession({ authenticated: MAIL_MODE === "mock", mode: MAIL_MODE }))
			.finally(() => setAuthLoading(false));
	}, []);

	useEffect(() => {
		if (!cacheKey) return;
		let cancelled = false;
		void readMailCache(cacheKey).then((snapshot) => {
			if (cancelled) return;
			if (snapshot) {
				setThreads(snapshot.threads);
				setDraft(snapshot.draft);
				setLastSyncedAt(snapshot.lastSyncedAt);
				if (snapshot.mailboxConfiguration) setMailboxConfiguration(snapshot.mailboxConfiguration);
				setSelectedId(snapshot.threads.find((thread) => thread.folder === "inbox")?.id ?? null);
			} else if (USE_MOCK_DATA) {
				const initialThreads = freshMockThreads();
				setThreads(initialThreads);
				setSelectedId(initialThreads.find((thread) => thread.folder === "inbox")?.id ?? null);
			}
			setHydratedCacheKey(cacheKey);
		});
		return () => { cancelled = true; };
	}, [cacheKey]);

	useEffect(() => {
		if (!hydrated || !cacheKey) return;
		const timeout = window.setTimeout(() => {
			void writeMailCache(cacheKey, {
				version: 2,
				threads,
				draft,
				lastSyncedAt,
				mailboxConfiguration: mailboxConfiguration ?? undefined,
			});
		}, 120);
		return () => window.clearTimeout(timeout);
	}, [cacheKey, draft, hydrated, lastSyncedAt, mailboxConfiguration, threads]);

	const sync = useCallback(async (silent = false) => {
		if (!online) {
			if (!silent) showToast("Offline · using the local cache");
			return;
		}
		if (USE_MOCK_DATA) {
			setSyncing(true);
			window.setTimeout(() => {
				setLastSyncedAt(new Date().toISOString());
				setSyncing(false);
				if (!silent) showToast("Mock inbox synced");
			}, 450);
			return;
		}
		setSyncing(true);
		try {
			const response = await fetch("/api/mail/sync", { cache: "no-store" });
			if (!response.ok) throw new Error("Sync unavailable");
			const payload = (await response.json()) as { threads?: Array<Record<string, unknown>>; syncedAt?: string };
			const liveThreads = mapLiveThreads(payload);
			setThreads((current) => {
				const localById = new Map(current.map((thread) => [thread.id, thread]));
				const remoteIds = new Set(liveThreads.map((thread) => thread.id));
				const merged = liveThreads.map((thread) => {
					const local = localById.get(thread.id);
					if (!local) return thread;
					return {
						...thread,
						unread: new Date(thread.lastMessageAt).getTime() > new Date(local.lastMessageAt).getTime()
							? thread.unread
							: local.unread,
						starred: local.starred,
						labels: local.labels,
						folder: local.folder === "inbox" ? thread.folder : local.folder,
						messages: local.messages.length > 1 ? local.messages : thread.messages,
					};
				});
				return [...merged, ...current.filter((thread) => !remoteIds.has(thread.id))];
			});
			setSelectedId((current) => current ?? liveThreads[0]?.id ?? null);
			setLastSyncedAt(payload.syncedAt ?? new Date().toISOString());
		} catch {
			if (!silent) showToast("Sync unavailable · local cache is still ready");
		} finally {
			setSyncing(false);
		}
	}, [online, showToast]);

	useEffect(() => {
		if (!session?.authenticated || !hydrated || !mailboxConfiguration?.onboarded) return;
		const timeout = window.setTimeout(() => void sync(true), 0);
		return () => window.clearTimeout(timeout);
	}, [hydrated, mailboxConfiguration?.onboarded, session?.authenticated, sync]);

	useEffect(() => {
		if (USE_MOCK_DATA || !session?.authenticated || !hydrated || !mailboxConfiguration?.onboarded) return;
		const syncWhenVisible = () => {
			if (document.visibilityState === "visible") void sync(true);
		};
		const interval = window.setInterval(() => void sync(true), 60_000);
		document.addEventListener("visibilitychange", syncWhenVisible);
		return () => {
			window.clearInterval(interval);
			document.removeEventListener("visibilitychange", syncWhenVisible);
		};
	}, [hydrated, mailboxConfiguration?.onboarded, session?.authenticated, sync]);

	const patchThread = useCallback((id: string, patch: Partial<MailThread>) => {
		setThreads((current) => current.map((thread) => thread.id === id ? { ...thread, ...patch } : thread));
	}, []);

	const hydrateLiveThread = useCallback(async (id: string) => {
		if (USE_MOCK_DATA) return;
		try {
			const response = await fetch(`/api/mail/threads/${encodeURIComponent(id)}`, {
				cache: "no-store",
			});
			if (!response.ok) return;
			const payload = (await response.json()) as {
				messages?: Array<Record<string, unknown>>;
				thread?: Record<string, unknown>;
			};
			const messages = (payload.messages ?? []).map((message) =>
				mapLiveMessage(message, id),
			);
			if (!messages.length) return;
			const latest = messages[messages.length - 1];
			patchThread(id, {
				messages,
				messageCount: Number(payload.thread?.message_count ?? messages.length),
				snippet: latest.bodyText.slice(0, 180),
			});
		} catch {
			// Keep showing the locally cached preview when the network is unavailable.
		}
	}, [patchThread]);

	const openThread = useCallback((id: string) => {
		setSelectedId(id);
		setMobileReading(true);
		patchThread(id, { unread: false });
		void hydrateLiveThread(id);
	}, [hydrateLiveThread, patchThread]);

	const toggleStar = useCallback((id = selectedId) => {
		if (!id) return;
		const thread = threads.find((item) => item.id === id);
		if (!thread) return;
		patchThread(id, { starred: !thread.starred });
	}, [patchThread, selectedId, threads]);

	const moveSelected = useCallback((destination: MailThread["folder"], confirmation: string) => {
		if (!selectedThread) return;
		const originalFolder = selectedThread.folder;
		const id = selectedThread.id;
		const currentIndex = filteredThreads.findIndex((thread) => thread.id === id);
		const next = filteredThreads[currentIndex + 1] ?? filteredThreads[currentIndex - 1] ?? null;
		patchThread(id, { folder: destination });
		setSelectedId(next?.id ?? null);
		setMobileReading(Boolean(next));
		showToast(confirmation, () => {
			patchThread(id, { folder: originalFolder });
			setSelectedId(id);
		});
	}, [filteredThreads, patchThread, selectedThread, showToast]);

	const markUnread = useCallback(() => {
		if (!selectedThread) return;
		patchThread(selectedThread.id, { unread: true });
		showToast("Marked unread");
	}, [patchThread, selectedThread, showToast]);

	const snooze = useCallback(() => {
		if (!selectedThread) return;
		const tomorrow = new Date();
		tomorrow.setDate(tomorrow.getDate() + 1);
		tomorrow.setHours(9, 0, 0, 0);
		moveSelected("snoozed", "Snoozed until tomorrow");
		patchThread(selectedThread.id, { snoozedUntil: tomorrow.toISOString() });
	}, [moveSelected, patchThread, selectedThread]);

	const startCompose = useCallback((thread?: MailThread) => {
		const fallback = fromAddresses[0] ?? "";
		if (!fallback) {
			showToast("Configure a sending mailbox first");
			return;
		}
		const from = thread
			? replyAddressForThread(thread, mailboxConfiguration, fallback)
			: fallback;
		setDraft(makeDraft(from, thread));
	}, [fromAddresses, mailboxConfiguration, showToast]);

	const sendMessage = useCallback(async (message: SendMessageInput) => {
		if (!USE_MOCK_DATA) {
			const response = await fetch("/api/mail/send", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(message),
			});
			if (!response.ok) {
				const payload = (await response.json()) as { error?: string };
				throw new Error(payload.error || "Unable to send message");
			}
		}

		if (message.replyToThreadId) {
			setThreads((current) => current.map((thread) => thread.id === message.replyToThreadId ? {
				...thread,
				folder: thread.folder === "drafts" ? "sent" : thread.folder,
				messageCount: thread.messageCount + 1,
				lastMessageAt: new Date().toISOString(),
				snippet: message.text.slice(0, 160),
				messages: [...thread.messages, {
					id: crypto.randomUUID(), threadId: thread.id, direction: "outbound",
					from: { name: session?.user?.name ?? "Ryan Vogel", email: message.from },
					to: message.to.map((email) => ({ name: email.split("@")[0], email })),
					sentAt: new Date().toISOString(), bodyText: message.text, bodyHtml: message.html,
				}],
			} : thread));
		} else {
			const id = crypto.randomUUID();
			setThreads((current) => [{
				id,
				subject: message.subject,
				snippet: message.text.slice(0, 160),
				participants: message.to.map((email) => ({ name: email.split("@")[0], email })),
				lastMessageAt: new Date().toISOString(),
				messageCount: 1,
				unread: false,
				starred: false,
				important: false,
				folder: "sent",
				category: "team",
				labels: [],
				messages: [{
					id: crypto.randomUUID(), threadId: id, direction: "outbound",
					from: { name: session?.user?.name ?? "Ryan Vogel", email: message.from },
					to: message.to.map((email) => ({ name: email.split("@")[0], email })),
					sentAt: new Date().toISOString(), bodyText: message.text, bodyHtml: message.html,
				}],
			}, ...current]);
		}
		setDraft(null);
		showToast(USE_MOCK_DATA ? "Sent in mock mode" : "Message sent");
	}, [session?.user?.name, showToast]);

	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			const target = event.target as HTMLElement;
			const editing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target.isContentEditable;
			if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
				event.preventDefault();
				setCommandOpen(true);
				return;
			}
			if (event.key === "Escape") {
				setCommandOpen(false);
				setShortcutsOpen(false);
				return;
			}
			if (editing || draft) return;
			if (event.metaKey || event.ctrlKey || event.altKey) return;
			const key = event.key.toLowerCase();
			if (key === "/") { event.preventDefault(); searchRef.current?.focus(); }
			else if (key === "c") startCompose();
			else if (key === "e") moveSelected("archive", "Archived");
			else if (key === "s") toggleStar();
			else if (key === "u") markUnread();
			else if (key === "r" && selectedThread) startCompose(selectedThread);
			else if (key === "?") setShortcutsOpen(true);
			else if (key === "j" || key === "k") {
				event.preventDefault();
				const currentIndex = filteredThreads.findIndex((thread) => thread.id === selectedId);
				const nextIndex = key === "j" ? Math.min(currentIndex + 1, filteredThreads.length - 1) : Math.max(currentIndex - 1, 0);
				const next = filteredThreads[nextIndex];
				if (next) openThread(next.id);
			}
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [draft, filteredThreads, markUnread, moveSelected, openThread, selectedId, selectedThread, startCompose, toggleStar]);

	const resetMock = useCallback(() => {
		if (cacheKey) void clearMailCache(cacheKey);
		const reset = freshMockThreads();
		setThreads(reset);
		setDraft(null);
		setFolder("inbox");
		setSelectedLabel(null);
		setMailFilter("all");
		setSelectedId(reset[0]?.id ?? null);
		showToast("Mock inbox reset");
	}, [cacheKey, showToast]);

	const commands = [
		...(fromAddresses.length ? [{ label: "Compose a new message", hint: "C", icon: PenLine, action: () => startCompose() }] : []),
		{ label: "Search mail", hint: "/", icon: Search, action: () => searchRef.current?.focus() },
		...(selectedThread ? [
			{ label: "Archive conversation", hint: "E", icon: Archive, action: () => moveSelected("archive", "Archived") },
			{ label: "Mark conversation unread", hint: "U", icon: Mail, action: markUnread },
		] : []),
		{ label: "Show keyboard shortcuts", hint: "?", icon: Command, action: () => setShortcutsOpen(true) },
	];

	if (authLoading) {
		return <main className="app-loading"><BrandMark /><LoaderCircle className="loading-spinner" size={18} /><span>Opening your local inbox…</span></main>;
	}
	if (!session?.authenticated && MAIL_MODE !== "mock") return <LoginScreen error={authError} />;
	const safeSession = session ?? { authenticated: true, mode: MAIL_MODE };
	if (!mailboxConfiguration && configurationLoading) {
		return <main className="app-loading"><BrandMark /><LoaderCircle className="loading-spinner" size={18} /><span>Loading mailbox settings…</span></main>;
	}
	if (!mailboxConfiguration && configurationError) {
		return (
			<main className="configuration-error-screen">
				<section><BrandMark /><strong>Mailbox settings are unavailable</strong><span>{configurationError}</span><button onClick={() => { setConfigurationLoading(true); setConfigurationError(null); setConfigurationRevision((value) => value + 1); }} type="button">Try again</button></section>
			</main>
		);
	}
	if (mailboxConfiguration && (!mailboxConfiguration.onboarded || mailboxSetupOpen)) {
		return (
			<MailboxOnboarding
				editing={mailboxConfiguration.onboarded}
				initial={mailboxConfiguration}
				session={safeSession}
				onCancel={() => setMailboxSetupOpen(false)}
				onComplete={(configuration) => {
					setMailboxConfiguration(configuration);
					setMailboxSetupOpen(false);
				}}
			/>
		);
	}

	return (
		<main className={`mail-shell ${mobileReading ? "mail-shell-reading" : ""}`}>
		{sidebarOpen ? <button aria-label="Close navigation" className="sidebar-scrim" onClick={() => setSidebarOpen(false)} type="button" /> : null}
		<Sidebar
			folder={folder}
			threads={threads}
			open={sidebarOpen}
			session={safeSession}
			selectedLabel={selectedLabel}
			usesMockData={USE_MOCK_DATA}
			canCompose={fromAddresses.length > 0}
			onClose={() => setSidebarOpen(false)}
			onCompose={() => startCompose()}
			onFolder={(next) => {
				setFolder(next);
				setSelectedLabel(null);
				setMailFilter("all");
				setSelectedId(threads.find((thread) => next === "starred" ? thread.starred : thread.folder === next)?.id ?? null);
				setMobileReading(false);
			}}
			onLabel={(label) => {
				const nextLabel = selectedLabel === label ? null : label;
				setSelectedLabel(nextLabel);
				setMailFilter("all");
				setSelectedId(threads.find((thread) => nextLabel
					? thread.labels.includes(nextLabel)
					: thread.folder === folder)?.id ?? null);
				setMobileReading(false);
			}}
			onManageMailboxes={() => setMailboxSetupOpen(true)}
			onReset={resetMock}
		/>

		<section className="mailbox-pane">
			<header className="mailbox-toolbar">
				<button aria-label="Open navigation" className="icon-button mobile-menu" onClick={() => setSidebarOpen(true)} type="button"><Menu size={18} /></button>
				<label className="mail-search"><Search size={16} /><input aria-label="Search mail" ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search mail" /><kbd>／</kbd></label>
				<button aria-label="Open command menu" className="command-trigger" onClick={() => setCommandOpen(true)} type="button"><Command size={15} /><span>K</span></button>
			</header>
			<div className="mailbox-heading">
				<div><h2>{currentTitle}</h2><span>{filteredThreads.length} conversation{filteredThreads.length === 1 ? "" : "s"}</span></div>
				<div className="mailbox-actions">
					<button aria-label="Refresh" className="icon-button" disabled={syncing} onClick={() => void sync()} type="button"><RefreshCw className={syncing ? "spin" : ""} size={16} /></button>
				</div>
			</div>
			<div className="mailbox-filter-row">
				<button aria-pressed={mailFilter === "all"} className={mailFilter === "all" ? "filter-active" : ""} onClick={() => setMailFilter("all")} type="button">All</button>
				<button aria-pressed={mailFilter === "unread"} className={mailFilter === "unread" ? "filter-active" : ""} onClick={() => setMailFilter("unread")} type="button">Unread</button>
				<span />
				<small aria-live="polite">{syncing ? "Syncing…" : formatSyncStatus(lastSyncedAt, online)}</small>
			</div>
			<ThreadList
				threads={filteredThreads}
				selectedId={selectedId}
				emptyTitle={mailFilter === "unread" ? "You’re all caught up" : query ? "No matching mail" : "Nothing here"}
				emptyDescription={mailFilter === "unread" ? "No unread conversations in this view." : query ? "Try a sender, subject, or label." : "This mailbox is clear."}
				onOpen={openThread}
				onStar={(id) => toggleStar(id)}
			/>
		</section>

		<ReadingPane thread={selectedThread} onArchive={() => moveSelected("archive", "Archived")} onBack={() => setMobileReading(false)} onDelete={() => moveSelected("trash", "Moved to trash")} onReply={() => selectedThread && startCompose(selectedThread)} onSnooze={snooze} onSpam={() => moveSelected("spam", "Reported as spam")} onStar={() => toggleStar()} onUnread={markUnread} />

		{draft ? <ComposeWindow draft={draft} fromOptions={fromAddresses} onChange={setDraft} onClose={() => setDraft(null)} onDiscard={() => { setDraft(null); showToast("Draft discarded"); }} onSend={sendMessage} /> : null}
		<CommandMenu commands={commands} key={commandOpen ? "open" : "closed"} open={commandOpen} onClose={() => setCommandOpen(false)} />
		<ShortcutSheet open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
		{toast ? <div aria-live="polite" className="mail-toast" role="status"><Check size={15} /><span>{toast.message}</span>{toast.undo ? <button onClick={() => { toast.undo?.(); setToast(null); }} type="button"><Undo2 size={14} /> Undo</button> : null}</div> : null}
	</main>
	);
}
