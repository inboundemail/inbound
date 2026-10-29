import postgres from "postgres";
import type { AuthenticatedMailbox } from "./auth.ts";
import {
	MailboxResyncError,
	MESSAGE_BATCH_SIZE,
	type MailStore,
} from "./db.ts";
import { scopeMailboxPath } from "./mailbox-rules.ts";
import { sanitizeLogValue } from "./log.ts";

interface SessionLike {
	user?: AuthenticatedMailbox & { address?: string };
	remoteAddress?: string;
	endReason?: "revalidation" | "max_age";
	selected?: { mailbox?: string; modifyIndex?: number } | false | null;
}

type ListenerCallback = (message?: unknown) => void;
type Callback = (err: Error | null, ...rest: unknown[]) => void;

const POLL_INTERVAL_MS = 60_000;
const RECEIVED_VIEWS = ["INBOX", "Junk"] as const;

export class PgNotifier {
	private sql: postgres.Sql;
	private store: MailStore;
	private listeners = new Map<SessionLike, ListenerCallback>();
	private pollTimer: ReturnType<typeof setInterval> | null = null;
	private pending = new Map<
		string,
		{ dirty: boolean; paths: Set<string>; running: Promise<void> }
	>();
	private updates = new WeakMap<SessionLike, Promise<void>>();
	private listenCount = 0;
	onReconnect: (() => void) | null = null;

	constructor(directUrl: string, store: MailStore) {
		this.sql = postgres(directUrl, { max: 1 });
		this.store = store;
	}

	async start(): Promise<void> {
		for (const channel of ["imap_state_changed", "imap_received_changed"]) {
			await this.sql.listen(channel, (payload) => {
				this.handleChange(channel, payload).catch((err: Error) => {
					console.error(
						"[notifier] change handling failed",
						sanitizeLogValue(err.message),
					);
				});
			});
		}
		await this.sql.listen(
			"imap_credential_changed",
			(credentialId) => {
				for (const [session, callback] of this.listeners) {
					if (session.user?.credentialId === credentialId) {
						session.endReason = "revalidation";
						callback({
							command: "LOGOUT",
							reason: "Mailbox credentials or scopes changed",
						});
					}
				}
			},
			() => {
				this.listenCount++;
				if (this.listenCount === 1) return;
				console.log("[notifier] LISTEN reconnected, catching up sessions");
				this.onReconnect?.();
				this.pollAll().catch((err: Error) => {
					console.error(
						"[notifier] catch-up poll failed",
						sanitizeLogValue(err.message),
					);
				});
			},
		);
		this.pollTimer = setInterval(() => {
			this.pollAll().catch((err: Error) => {
				console.error("[notifier] poll failed", sanitizeLogValue(err.message));
			});
		}, POLL_INTERVAL_MS);
		console.log(
			"[notifier] LISTEN imap_state_changed + imap_received_changed + imap_credential_changed active",
		);
	}

	async stop(): Promise<void> {
		if (this.pollTimer) clearInterval(this.pollTimer);
		await Promise.allSettled(
			[...this.pending.values()].map((item) => item.running),
		);
		await this.sql.end({ timeout: 2 }).catch(() => undefined);
	}

	sessions(): Iterable<[SessionLike, ListenerCallback]> {
		return this.listeners.entries();
	}

	private async handleChange(channel: string, payload: string): Promise<void> {
		const sync = channel === "imap_received_changed";
		const prefix = sync ? "user:" : "cred:";
		let id: string;
		let addresses: string[] | undefined;
		if (payload.startsWith(prefix)) {
			id = payload.slice(prefix.length);
		} else if (sync) {
			let change: { userId?: unknown; addresses?: unknown } | null;
			try {
				change = JSON.parse(payload);
			} catch {
				return;
			}
			if (!change || typeof change.userId !== "string") return;
			id = change.userId;
			if (
				Array.isArray(change.addresses) &&
				change.addresses.every((value) => typeof value === "string")
			) {
				addresses = change.addresses.map((value: string) =>
					value.toLowerCase(),
				);
			}
		} else {
			return;
		}
		const principals = new Map<string, AuthenticatedMailbox>();
		for (const [session] of this.listeners) {
			const user = session.user;
			if (user && (sync ? user.userId === id : user.credentialId === id)) {
				principals.set(`${user.userId}:${user.credentialId}`, user);
			}
		}
		const affectedAddresses = addresses;
		await Promise.all(
			[...principals.values()].map((user) => {
				if (!sync) return this.schedule(user);
				const scopes = affectedAddresses
					? user.scopes.filter((scope) =>
							affectedAddresses.some((address) =>
								scope.type === "address"
									? address === scope.address?.toLowerCase()
									: address.endsWith(`@${scope.domain.toLowerCase()}`),
							),
						)
					: user.scopes;
				if (affectedAddresses && !scopes.length) return;
				return this.schedule(user, [
					...RECEIVED_VIEWS,
					...scopes.map(scopeMailboxPath),
				]);
			}),
		);
	}

	private schedule(
		user: AuthenticatedMailbox,
		paths: readonly string[] = [],
	): Promise<void> {
		const key = `${user.userId}:${user.credentialId}`;
		const existing = this.pending.get(key);
		if (existing) {
			existing.dirty = true;
			for (const path of paths) existing.paths.add(path);
			return existing.running;
		}
		const state = {
			dirty: true,
			paths: new Set(paths),
			running: Promise.resolve(),
		};
		this.pending.set(key, state);
		state.running = Promise.resolve().then(async () => {
			try {
				do {
					state.dirty = false;
					for (const path of [...state.paths]) {
						state.paths.delete(path);
						try {
							const mailbox = await this.store.getMailboxByPath(user, path);
							if (mailbox) await this.store.syncMailbox(mailbox, user);
						} catch (err) {
							console.error(
								"[notifier] sync failed",
								sanitizeLogValue((err as Error).message),
							);
						}
					}
					for (const [session, callback] of this.listeners) {
						if (
							session.user?.userId === user.userId &&
							session.user.credentialId === user.credentialId
						)
							callback();
					}
				} while (state.dirty);
			} finally {
				this.pending.delete(key);
			}
		});
		return state.running;
	}

	private async pollAll(): Promise<void> {
		const users = new Map<string, AuthenticatedMailbox>();
		for (const [session] of this.listeners) {
			if (session.user)
				users.set(
					`${session.user.userId}:${session.user.credentialId}`,
					session.user,
				);
		}
		await Promise.all(
			[...users.values()].map((user) =>
				this.schedule(user, [
					...RECEIVED_VIEWS,
					...user.scopes.map(scopeMailboxPath),
				]),
			),
		);
	}

	addListener(session: SessionLike, callback: ListenerCallback): void {
		this.listeners.set(session, callback);
		console.log(
			`[notifier] listener added (credential=${sanitizeLogValue(session.user?.credentialId ?? "pre-auth")}, total=${this.listeners.size})`,
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
		session?: SessionLike,
	): void {
		const mailboxId =
			typeof mailbox === "string"
				? mailbox
				: ((mailbox as { _id?: string })?._id ?? "");
		const user = session?.user;
		if (!session || !user) {
			callback(null, []);
			return;
		}
		const previous = this.updates.get(session) ?? Promise.resolve();
		const pending = previous
			.catch(() => undefined)
			.then(async () => {
				const selected = session.selected;
				const since =
					selected && selected.mailbox === mailboxId
						? Math.max(modifyIndex || 0, selected.modifyIndex ?? 0)
						: modifyIndex || 0;
				try {
					const rows = await this.store.getUpdatesSince(user, mailboxId, since);
					callback(null, rows);
					if (
						rows.length >= MESSAGE_BATCH_SIZE &&
						session.selected &&
						session.selected.mailbox === mailboxId &&
						(session.selected.modifyIndex ?? 0) > since
					)
						this.listeners.get(session)?.();
				} catch (err) {
					if (err instanceof MailboxResyncError) {
						this.listeners.get(session)?.({
							command: "DROP",
							mailbox: mailboxId,
						});
						callback(null, []);
						return;
					}
					callback(err as Error);
				}
			});
		this.updates.set(session, pending);
	}
}
