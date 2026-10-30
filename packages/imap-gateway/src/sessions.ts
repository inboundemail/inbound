import { createHash } from "node:crypto";
import type { AuthenticatedMailbox } from "./auth.ts";
import { logEvent, sanitizeLogValue } from "./log.ts";

export interface RevalidatedSession {
	user?: AuthenticatedMailbox & { address?: string };
	remoteAddress?: string;
	/** Why the gateway ended the session, for the mailbox activity log. */
	endReason?: "revalidation" | "max_age";
}

export type SessionCallback = (message?: unknown) => void;

export type Authenticate = (
	address: string,
	password: string,
	clientIp: string,
) => Promise<AuthenticatedMailbox | null>;

interface SessionState {
	password: string;
	authenticatedAt: number;
	lastCheckedAt: number;
}

export interface SessionRevalidatorOptions {
	authenticate: Authenticate;
	sessions: () => Iterable<[RevalidatedSession, SessionCallback]>;
	intervalMs: number;
	maxAgeMs: number;
	concurrency?: number;
	now?: () => number;
}

function scopeKey(principal: AuthenticatedMailbox): string {
	return principal.scopes
		.map(
			(scope) =>
				`${scope.id}:${scope.type}:${scope.domainId}:${scope.address ?? ""}`,
		)
		.sort()
		.join("|");
}

export function sameGrant(
	current: AuthenticatedMailbox,
	fresh: AuthenticatedMailbox,
): boolean {
	return (
		current.userId === fresh.userId &&
		current.credentialId === fresh.credentialId &&
		current.accessMode === fresh.accessMode &&
		current.loginAddress.toLowerCase() === fresh.loginAddress.toLowerCase() &&
		scopeKey(current) === scopeKey(fresh)
	);
}

/**
 * Re-runs the login check for authenticated sessions so a ban, an unverified
 * domain or a disabled API key ends the session, and caps session age.
 * The password is kept in memory (never logged or persisted) because the
 * login API is the only place those checks live.
 */
export class SessionRevalidator {
	private states = new WeakMap<RevalidatedSession, SessionState>();
	private options: Required<Omit<SessionRevalidatorOptions, "now">> & {
		now: () => number;
	};
	private running: Promise<void> | null = null;
	private forceNext = false;

	constructor(options: SessionRevalidatorOptions) {
		this.options = {
			concurrency: 8,
			now: Date.now,
			...options,
		};
	}

	remember(session: RevalidatedSession, password: string): void {
		const now = this.options.now();
		this.states.set(session, {
			password,
			authenticatedAt: now,
			lastCheckedAt: now,
		});
	}

	forget(session: RevalidatedSession): void {
		this.states.delete(session);
	}

	async run(force = false): Promise<void> {
		if (this.running) {
			if (force) this.forceNext = true;
			return this.running;
		}
		this.running = this.check([...this.options.sessions()], force).finally(
			() => {
				this.running = null;
			},
		);
		await this.running;
		if (this.forceNext) {
			this.forceNext = false;
			await this.run(true);
		}
	}

	private async check(
		sessions: Array<[RevalidatedSession, SessionCallback]>,
		force: boolean,
	): Promise<void> {
		const now = this.options.now();
		const groups = new Map<
			string,
			{
				user: AuthenticatedMailbox & { address?: string };
				password: string;
				ip: string;
				members: Array<[RevalidatedSession, SessionCallback, SessionState]>;
			}
		>();

		for (const [session, callback] of sessions) {
			const user = session.user;
			if (!user) continue;
			const state = this.states.get(session);
			if (!state) {
				logEvent("session_dropped", { reason: "unverifiable" });
				session.endReason = "revalidation";
				callback({
					command: "LOGOUT",
					reason: "Session can no longer be verified, please log in again",
				});
				continue;
			}
			if (now - state.authenticatedAt >= this.options.maxAgeMs) {
				this.forget(session);
				logEvent("session_dropped", { reason: "expired" });
				session.endReason = "max_age";
				callback({
					command: "LOGOUT",
					reason: "Session expired, please log in again",
				});
				continue;
			}
			if (!force && now - state.lastCheckedAt < this.options.intervalMs) {
				continue;
			}
			const key = `${user.credentialId}\0${createHash("sha256").update(state.password).digest("hex")}`;
			const group = groups.get(key) ?? {
				user,
				password: state.password,
				ip: session.remoteAddress ?? "unknown",
				members: [],
			};
			group.members.push([session, callback, state]);
			groups.set(key, group);
		}

		const queue = [...groups.values()];
		const worker = async () => {
			for (let group = queue.shift(); group; group = queue.shift()) {
				let fresh: AuthenticatedMailbox | null;
				try {
					fresh = await this.options.authenticate(
						group.user.loginAddress.toLowerCase(),
						group.password,
						group.ip,
					);
				} catch (err) {
					console.error(
						"[sessions] revalidation unavailable, keeping sessions",
						sanitizeLogValue((err as Error).message),
					);
					continue;
				}
				const checkedAt = this.options.now();
				for (const [session, callback, state] of group.members) {
					if (fresh && session.user && sameGrant(session.user, fresh)) {
						state.lastCheckedAt = checkedAt;
						continue;
					}
					this.forget(session);
					logEvent("session_dropped", {
						reason: fresh ? "changed" : "invalid",
					});
					session.endReason = "revalidation";
					callback({
						command: "LOGOUT",
						reason: fresh
							? "Mailbox credentials or scopes changed"
							: "Mailbox credentials are no longer valid",
					});
				}
			}
		};
		await Promise.all(
			Array.from(
				{ length: Math.min(this.options.concurrency, queue.length) },
				worker,
			),
		);
	}
}
