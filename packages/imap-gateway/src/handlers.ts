import { createRequire } from "node:module";
import type { ApiAuth, AuthenticatedMailbox } from "./auth.ts";
import type { FlagAction, MailStore } from "./db.ts";
import { AppendQuotaError, SPECIAL_USE } from "./db.ts";
import type { ConnectionLimits } from "./limits.ts";

const require = createRequire(import.meta.url);
const { imapHandler } = require("../vendor/imap-core/index.js");

const METADATA_ITEMS = new Set([
	"uid",
	"flags",
	"modseq",
	"internaldate",
	"rfc822.size",
]);

interface QueryItem {
	item: string;
}

function needsContent(query: unknown): boolean {
	if (!Array.isArray(query)) return true;
	return (query as QueryItem[]).some(
		(entry) => !METADATA_ITEMS.has(entry.item),
	);
}

type Callback = (err: Error | null, ...rest: unknown[]) => void;

interface ImapSession {
	user?: AuthenticatedMailbox & {
		id: string;
		username: string;
		address: string;
	};
	remoteAddress?: string;
	selected?:
		| {
				mailbox?: string;
				path?: string;
				readOnly?: boolean;
		  }
		| false;
	formatResponse: (command: string, uid: number, data: unknown) => unknown;
	getQueryResponse: (
		query: unknown,
		message: unknown,
		options: unknown,
	) => unknown;
	isUTF8Enabled: () => boolean;
	writeStream: {
		write: (chunk: unknown, done?: () => void) => void;
	};
}

interface AuthData {
	username: string;
	password: string;
}

interface FetchOptions {
	messages: number[];
	query: unknown;
	metadataOnly: boolean;
	markAsSeen: boolean;
	isUid: boolean;
}

interface StoreUpdate {
	value: string[];
	action: FlagAction;
	silent: boolean;
	messages: number[];
	unchangedSince: number;
}

const logger = {
	debug: () => undefined,
	info: (...args: unknown[]) => console.log("[imap]", ...args),
	error: (...args: unknown[]) => console.error("[imap]", ...args),
};

export function buildHandlers(
	auth: ApiAuth,
	store: MailStore,
	limits: ConnectionLimits,
) {
	async function openMailbox(session: ImapSession, path: string) {
		const user = session.user;
		if (!user?.address) throw new Error("Not authenticated");
		await store.ensureDefaultMailboxes(user);
		await store.ensureScopeMailboxes(user);
		const mailbox = await store.getMailboxByPath(user, path);
		if (!mailbox) return null;
		await store.syncMailbox(mailbox, user);
		return mailbox;
	}

	function requireUser(session: ImapSession) {
		const user = session.user;
		if (!user?.address) throw new Error("Not authenticated");
		return user;
	}

	function sourceIsReadOnly(session: ImapSession, mailboxId: string): boolean {
		const selected = session.selected;
		return (
			!selected ||
			selected.mailbox !== mailboxId ||
			Boolean(selected.readOnly) ||
			Boolean(selected.path?.startsWith("Scopes/"))
		);
	}

	return {
		logger,

		onAuth(authData: AuthData, _session: ImapSession, callback: Callback) {
			const ip = _session.remoteAddress ?? "unknown";
			const address = authData.username.trim().toLowerCase();
			const limited = limits.assertAuthAllowed(ip, address);
			if (limited) return callback(null);
			if (!address.includes("@") || !authData.password) {
				limits.recordAuthFailure(ip, address);
				return callback(null);
			}
			auth
				.authenticate(address, authData.password)
				.then((result) => {
					if (!result) {
						limits.recordAuthFailure(ip, address);
						return callback(null);
					}
					limits.recordAuthSuccess(ip, address);
					callback(null, {
						user: {
							...result,
							id: result.userId,
							username: address,
							address,
						},
					});
				})
				.catch(() => callback(new Error("Authentication unavailable")));
		},

		onList(_query: string, session: ImapSession, callback: Callback) {
			(async () => {
				const user = requireUser(session);
				await store.ensureDefaultMailboxes(user);
				await store.ensureScopeMailboxes(user);
				const mailboxes = await store.listMailboxes(user);
				const folders: Array<{
					path: string;
					flags: string[];
					specialUse: string | false;
				}> = mailboxes.map((mailbox) => ({
					path: mailbox.path,
					flags: mailbox.scopeId ? ["\\NoInferiors"] : [],
					specialUse: SPECIAL_USE[mailbox.path] ?? false,
				}));
				if (user.credentialId && user.scopes.length > 0) {
					folders.push({
						path: "Scopes",
						flags: ["\\Noselect", "\\HasChildren"],
						specialUse: false,
					});
				}
				return folders;
			})()
				.then((folders) => callback(null, folders))
				.catch((err: Error) => callback(err));
		},

		onLsub(_query: string, session: ImapSession, callback: Callback) {
			(async () => {
				const user = requireUser(session);
				const mailboxes = await store.listMailboxes(user);
				const folders: Array<{ path: string; flags: string[] }> = mailboxes.map(
					(mailbox) => ({
						path: mailbox.path,
						flags: [],
					}),
				);
				if (user.credentialId && user.scopes.length > 0) {
					folders.push({ path: "Scopes", flags: ["\\Noselect"] });
				}
				return folders;
			})()
				.then((folders) => callback(null, folders))
				.catch((err: Error) => callback(err));
		},

		onSubscribe(_path: string, _session: ImapSession, callback: Callback) {
			callback(null, true);
		},

		onUnsubscribe(_path: string, _session: ImapSession, callback: Callback) {
			callback(null, true);
		},

		onOpen(path: string, session: ImapSession, callback: Callback) {
			openMailbox(session, path)
				.then(async (mailbox) => {
					if (!mailbox) return callback(null, "NONEXISTENT");
					const [uidList, fresh] = await Promise.all([
						store.listUids(mailbox.id),
						store.getMailboxByPath(requireUser(session), path),
					]);
					callback(null, {
						_id: mailbox.id,
						path,
						uidValidity: mailbox.uidValidity,
						uidNext: fresh?.uidNext ?? mailbox.uidNext,
						modifyIndex: fresh?.modseq ?? mailbox.modseq,
						uidList,
						flags: [],
						readOnly:
							Boolean(mailbox.scopeId) ||
							requireUser(session).accessMode !== "read_write",
					});
				})
				.catch((err: Error) => callback(err));
		},

		onStatus(path: string, session: ImapSession, callback: Callback) {
			openMailbox(session, path)
				.then(async (mailbox) => {
					if (!mailbox) return callback(null, "NONEXISTENT");
					const [messages, unseen, fresh] = await Promise.all([
						store.countMessages(mailbox.id),
						store.unseenCount(mailbox.id),
						store.getMailboxByPath(requireUser(session), path),
					]);
					callback(null, {
						messages,
						uidNext: fresh?.uidNext ?? mailbox.uidNext,
						uidValidity: mailbox.uidValidity,
						unseen,
						highestModseq: 0,
					});
				})
				.catch((err: Error) => callback(err));
		},

		onCreate(path: string, session: ImapSession, callback: Callback) {
			(async () => {
				const user = requireUser(session);
				if (user.accessMode !== "read_write" || path.startsWith("Scopes/")) {
					return "CANNOT";
				}
				await store.createMailbox(user, path);
				return true;
			})()
				.then((ok) => callback(null, ok))
				.catch((err: Error) => callback(err));
		},

		onRename(
			path: string,
			newPath: string,
			session: ImapSession,
			callback: Callback,
		) {
			(async () => {
				const user = requireUser(session);
				if (
					user.accessMode !== "read_write" ||
					path === "INBOX" ||
					path.startsWith("Scopes/") ||
					newPath.startsWith("Scopes/")
				)
					return "CANNOT";
				const ok = await store.renameMailbox(user, path, newPath);
				return ok ? true : "NONEXISTENT";
			})()
				.then((result) => callback(null, result))
				.catch((err: Error) => callback(err));
		},

		onDelete(path: string, session: ImapSession, callback: Callback) {
			(async () => {
				const user = requireUser(session);
				if (
					user.accessMode !== "read_write" ||
					path === "INBOX" ||
					SPECIAL_USE[path] ||
					path.startsWith("Scopes/")
				)
					return "CANNOT";
				const ok = await store.deleteMailbox(user, path);
				return ok ? true : "NONEXISTENT";
			})()
				.then((result) => callback(null, result))
				.catch((err: Error) => callback(err));
		},

		onAppend(
			path: string,
			flags: string[],
			internaldate: string | Date | undefined,
			raw: Buffer,
			session: ImapSession,
			callback: Callback,
		) {
			(async () => {
				const user = requireUser(session);
				if (user.accessMode !== "read_write" || path.startsWith("Scopes/")) {
					return { success: "READ-ONLY" as const, info: null };
				}
				await store.ensureDefaultMailboxes(user);
				const mailbox = await store.getMailboxByPath(user, path);
				if (!mailbox) return { success: "TRYCREATE" as const, info: null };
				if (mailbox.scopeId) {
					return { success: "READ-ONLY" as const, info: null };
				}
				const date = internaldate ? new Date(internaldate) : new Date();
				const info = await store.appendMessage(
					mailbox,
					user.id,
					raw.toString(),
					flags ?? [],
					Number.isNaN(date.getTime()) ? new Date() : date,
				);
				return { success: true as const, info };
			})()
				.then(({ success, info }) => callback(null, success, info))
				.catch((err: Error) => {
					if (err instanceof AppendQuotaError) {
						return callback(null, "OVERQUOTA", null);
					}
					callback(err);
				});
		},

		onCopy(
			_connection: unknown,
			mailboxId: string,
			update: { destination: string; messages: number[] },
			session: ImapSession,
			callback: Callback,
		) {
			(async () => {
				const user = requireUser(session);
				if (
					user.accessMode !== "read_write" ||
					update.destination.startsWith("Scopes/")
				)
					return { success: "READ-ONLY" as const, info: null };
				const destination = await store.getMailboxByPath(
					user,
					update.destination,
				);
				if (!destination) return { success: "TRYCREATE" as const, info: null };
				if (destination.scopeId) {
					return { success: "READ-ONLY" as const, info: null };
				}
				const info = await store.copyMessages(
					mailboxId,
					destination,
					update.messages,
				);
				return { success: true as const, info };
			})()
				.then(({ success, info }) => callback(null, success, info))
				.catch((err: Error) => callback(err));
		},

		onMove(
			mailboxId: string,
			update: { destination: string; messages: number[] },
			session: ImapSession,
			callback: Callback,
		) {
			(async () => {
				const user = requireUser(session);
				if (
					user.accessMode !== "read_write" ||
					sourceIsReadOnly(session, mailboxId) ||
					update.destination.startsWith("Scopes/")
				)
					return { success: "READ-ONLY" as const, info: null };
				const destination = await store.getMailboxByPath(
					user,
					update.destination,
				);
				if (!destination) return { success: "TRYCREATE" as const, info: null };
				if (destination.scopeId) {
					return { success: "READ-ONLY" as const, info: null };
				}
				const info = await store.copyMessages(
					mailboxId,
					destination,
					update.messages,
				);
				await store.deleteMessages(mailboxId, info.sourceUid);
				return { success: true as const, info };
			})()
				.then(({ success, info }) => callback(null, success, info))
				.catch((err: Error) => callback(err));
		},

		onFetch(
			mailboxId: string,
			options: FetchOptions,
			session: ImapSession,
			callback: Callback,
		) {
			(async () => {
				const rows = await store.listMessages(mailboxId, options.messages);
				const wantsContent = needsContent(options.query);
				let rowCount = 0;

				for (const row of rows) {
					let raw: string | null = null;
					if (wantsContent) {
						raw = await store.getRawContent(
							row.structuredEmailId,
							row.rawSource,
							requireUser(session),
						);
						if (!raw) continue;
					}

					const flags = [...row.flags];
					const markAsSeen =
						options.markAsSeen &&
						requireUser(session).accessMode === "read_write" &&
						!sourceIsReadOnly(session, mailboxId) &&
						!flags.includes("\\Seen");
					if (markAsSeen) flags.unshift("\\Seen");

					const messageData = {
						_id: row.structuredEmailId,
						uid: row.uid,
						flags,
						modseq: 0,
						idate: row.internalDate,
						...(row.size ? { size: row.size } : {}),
						...(raw ? { raw } : {}),
					};

					const response = session.formatResponse("FETCH", row.uid, {
						query: options.query,
						values: session.getQueryResponse(options.query, messageData, {
							logger,
							fetchOptions: {},
							acceptUTF8Enabled: session.isUTF8Enabled(),
						}),
					});

					const stream = imapHandler.compileStream(response);
					await new Promise<void>((resolve, reject) => {
						stream.once("error", reject);
						session.writeStream.write(stream, () => resolve());
					});
					rowCount++;

					if (markAsSeen) {
						await store.addFlag(mailboxId, row.uid, "\\Seen");
					}
				}

				callback(null, true, { rowCount });
			})().catch((err: Error) => callback(err));
		},

		onSearch(
			mailboxId: string,
			options: { query: unknown; terms: string[]; isUid: boolean },
			_session: ImapSession,
			callback: Callback,
		) {
			store
				.searchMessages(
					mailboxId,
					(options.query ?? []) as import("./search.ts").SearchNode[],
				)
				.then((uidList) => {
					callback(null, { uidList, highestModseq: 0 });
				})
				.catch((err: Error) => callback(err));
		},

		onStore(
			mailboxId: string,
			update: StoreUpdate,
			_session: ImapSession,
			callback: Callback,
		) {
			if (
				requireUser(_session).accessMode !== "read_write" ||
				sourceIsReadOnly(_session, mailboxId)
			) {
				return callback(null, "READ-ONLY", []);
			}
			store
				.updateFlags(mailboxId, update.messages, update.action, update.value)
				.then(() => callback(null, true, []))
				.catch((err: Error) => callback(err));
		},

		onExpunge(
			mailboxId: string,
			update: {
				isUid: boolean;
				messages?: number[];
				silent?: boolean;
				path?: string;
			},
			_session: ImapSession,
			callback: Callback,
		) {
			(async () => {
				const user = requireUser(_session);
				if (user.accessMode !== "read_write") return "READ-ONLY";
				if (sourceIsReadOnly(_session, mailboxId)) {
					if (_session.selected || update.silent !== true || !update.path) {
						return "READ-ONLY";
					}
					const mailbox = await store.getMailboxByPath(user, update.path);
					if (!mailbox || mailbox.id !== mailboxId || mailbox.scopeId) {
						return "READ-ONLY";
					}
				}
				await store.expunge(
					mailboxId,
					update.isUid ? (update.messages ?? []) : undefined,
				);
				return true;
			})()
				.then((result) => callback(null, result))
				.catch((err: Error) => callback(err));
		},
	};
}
