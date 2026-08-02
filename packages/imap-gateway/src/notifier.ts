import postgres from "postgres";
import type { AuthenticatedMailbox } from "./auth.ts";
import type { MailStore } from "./db.ts";
import { scopeMailboxPath } from "./db.ts";

interface SessionLike {
	user?: AuthenticatedMailbox & { address?: string };
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
		await this.sql.listen("imap_credential_changed", (credentialId) => {
			for (const [session, callback] of this.listeners) {
				if (session.user?.credentialId === credentialId) {
					callback({
						command: "LOGOUT",
						reason: "Mailbox credentials or scopes changed",
					});
				}
			}
		});
		this.pollTimer = setInterval(() => {
			this.pollAll().catch((err: Error) => {
				console.error("[notifier] poll failed", err.message);
			});
		}, POLL_INTERVAL_MS);
		console.log(
			"[notifier] LISTEN imap_changed + imap_credential_changed active",
		);
	}

	async stop(): Promise<void> {
		if (this.pollTimer) clearInterval(this.pollTimer);
		await this.sql.end({ timeout: 2 }).catch(() => undefined);
	}

	private sessionsFor(address: string): Array<[SessionLike, ListenerCallback]> {
		const callbacks: Array<[SessionLike, ListenerCallback]> = [];
		for (const [session, callback] of this.listeners) {
			const user = session.user;
			if (!user) continue;
			const matches =
				user.loginAddress === address ||
				user.scopes.some((scope) =>
					scope.type === "domain"
						? address.split("@")[1] === scope.domain
						: address === scope.address,
				);
			if (matches) callbacks.push([session, callback]);
		}
		return callbacks;
	}

	private async handleChange(address: string): Promise<void> {
		const callbacks = this.sessionsFor(address);
		console.log(
			`[notifier] change for ${address}: ${callbacks.length} session(s)`,
		);
		if (callbacks.length === 0) return;
		for (const [session] of callbacks) {
			if (!session.user) continue;
			const inbox = await this.store.getMailboxByPath(session.user, "INBOX");
			if (inbox) {
				await this.store
					.syncMailbox(inbox, session.user)
					.catch(() => undefined);
			}
			for (const scope of session.user.scopes) {
				const scopeMatches =
					scope.type === "domain"
						? address.split("@")[1] === scope.domain
						: address === scope.address;
				if (!scopeMatches) continue;
				const mailbox = await this.store.getMailboxByPath(
					session.user,
					scopeMailboxPath(scope),
				);
				if (mailbox) {
					await this.store
						.syncMailbox(mailbox, session.user)
						.catch(() => undefined);
				}
			}
		}
		for (const [, callback] of callbacks) callback();
	}

	private async pollAll(): Promise<void> {
		for (const [session, callback] of this.listeners) {
			if (!session.user) continue;
			const inbox = await this.store.getMailboxByPath(session.user, "INBOX");
			if (inbox) await this.store.syncMailbox(inbox, session.user);
			for (const scope of session.user.scopes) {
				const mailbox = await this.store.getMailboxByPath(
					session.user,
					scopeMailboxPath(scope),
				);
				if (mailbox) await this.store.syncMailbox(mailbox, session.user);
			}
			callback();
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

	getUpdates(mailbox: unknown, modifyIndex: number, callback: Callback): void {
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
