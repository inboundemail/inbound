import postgres from "postgres";
import type { MailStore } from "./db.ts";

interface SessionLike {
	user?: { address?: string };
}

type ListenerCallback = (message?: unknown) => void;
type Callback = (err: Error | null, ...rest: unknown[]) => void;

const POLL_INTERVAL_MS = 60_000;

export class PgNotifier {
	private sql: postgres.Sql;
	private store: MailStore;
	private listeners = new Map<SessionLike, ListenerCallback>();
	private pollTimer: ReturnType<typeof setInterval> | null = null;

	constructor(directUrl: string, store: MailStore) {
		this.sql = postgres(directUrl, { max: 1 });
		this.store = store;
	}

	async start(): Promise<void> {
		await this.sql.listen("imap_changed", (payload) => {
			this.handleChange(payload).catch((err: Error) => {
				console.error("[notifier] change handling failed", err.message);
			});
		});
		this.pollTimer = setInterval(() => {
			this.pollAll().catch((err: Error) => {
				console.error("[notifier] poll failed", err.message);
			});
		}, POLL_INTERVAL_MS);
		console.log("[notifier] LISTEN imap_changed active (direct connection)");
	}

	async stop(): Promise<void> {
		if (this.pollTimer) clearInterval(this.pollTimer);
		await this.sql.end({ timeout: 2 }).catch(() => undefined);
	}

	private sessionsFor(address: string): ListenerCallback[] {
		const callbacks: ListenerCallback[] = [];
		for (const [session, callback] of this.listeners) {
			if (session.user?.address === address) callbacks.push(callback);
		}
		return callbacks;
	}

	private async handleChange(address: string): Promise<void> {
		const callbacks = this.sessionsFor(address);
		console.log(
			`[notifier] change for ${address}: ${callbacks.length} session(s)`,
		);
		if (callbacks.length === 0) return;
		const mailbox = await this.store.getMailboxByPath(address, "INBOX");
		if (mailbox) {
			await this.store.syncMailbox(mailbox).catch(() => undefined);
		}
		for (const callback of callbacks) callback();
	}

	private async pollAll(): Promise<void> {
		const addresses = new Set<string>();
		for (const [session] of this.listeners) {
			if (session.user?.address) addresses.add(session.user.address);
		}
		for (const address of addresses) {
			await this.handleChange(address);
		}
	}

	addListener(session: SessionLike, callback: ListenerCallback): void {
		this.listeners.set(session, callback);
		console.log(
			`[notifier] listener added (user=${session.user?.address ?? "pre-auth"}, total=${this.listeners.size})`,
		);
	}

	removeListener(session: SessionLike, _callback: ListenerCallback): void {
		this.listeners.delete(session);
	}

	releaseConnection(_data: unknown, done?: Callback): void {
		done?.(null, true);
	}

	getUpdates(
		mailbox: unknown,
		modifyIndex: number,
		callback: Callback,
	): void {
		const mailboxId =
			typeof mailbox === "string"
				? mailbox
				: ((mailbox as { _id?: string })?._id ?? "");
		this.store
			.getUpdatesSince(mailboxId, modifyIndex || 0)
			.then((updates) => callback(null, updates))
			.catch((err: Error) => callback(err));
	}
}
