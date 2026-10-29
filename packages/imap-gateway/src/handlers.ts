import { createRequire } from "node:module";
import { isUtf8 } from "node:buffer";
import type { ApiAuth, AuthenticatedMailbox } from "./auth.ts";
import type { FlagAction, MailStore } from "./db.ts";
import { AppendQuotaError } from "./db.ts";
import {
	isProtectedMailboxPath,
	isScopeMailboxPath,
	normalizeMailboxPath,
	SPECIAL_USE,
} from "./mailbox-rules.ts";
import { ContentBudget, type ConnectionLimits } from "./limits.ts";
import { formatLogLine, sanitizeLogValue } from "./log.ts";
import type { SessionRevalidator } from "./sessions.ts";

const require = createRequire(import.meta.url);
const { imapHandler } = require("../vendor/imap-core/index.js");
const { isRawContentQuery } =
	require("../vendor/imap-core/lib/imap-tools.js") as {
		isRawContentQuery: (query: unknown) => boolean;
	};

// Approximate peak memory per stored byte: raw bytes plus the compiled literal,
// or a full MIME parse (tree, binary string copies, rebuilt output).
const RAW_FETCH_MEMORY_FACTOR = 3;
const PARSED_FETCH_MEMORY_FACTOR = 8;
const UNKNOWN_MESSAGE_SIZE = 16 * 1024 * 1024;
const DRAIN_TIMEOUT_MS = 60_000;

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
	socket?: {
		writableNeedDrain?: boolean;
		destroyed?: boolean;
		on(event: "drain", listener: () => void): unknown;
		once(event: "drain" | "close", listener: () => void): unknown;
		removeListener(event: "drain" | "close", listener: () => void): unknown;
		destroy(): void;
	};
	selected?:
		| {
				mailbox?: string;
				path?: string;
				readOnly?: boolean;
				notifications?: unknown[];
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
	info: (...args: unknown[]) => console.log("[imap]", formatLogLine(args)),
	error: (...args: unknown[]) => console.error("[imap]", formatLogLine(args)),
};

const TRANSIENT_ERROR_CODES = new Set([
	"40001",
	"40P01",
	"55P03",
	"57014",
	"57P01",
	"57P02",
	"57P03",
	"ECONNRESET",
	"ECONNREFUSED",
	"ETIMEDOUT",
	"CONNECTION_CLOSED",
	"CONNECTION_ENDED",
	"CONNECTION_DESTROYED",
	"CONNECT_TIMEOUT",
]);

/**
 * Turns backend failures into a generic error so raw Postgres codes and
 * messages never reach clients. imap-core reads `code` for some commands.
 */
export function toImapError(err: unknown): Error {
	if (err instanceof Error && "imapCode" in err) return err;
	const original = err as { code?: unknown; message?: unknown } | null;
	const code = typeof original?.code === "string" ? original.code : "";
	if (
		((code === "P0001" || !code) &&
			original?.message === "Invalid mailbox path") ||
		(code === "P0001" &&
			[
				"Invalid destination path",
				"Special mailboxes are managed",
				"Scope mailboxes are managed",
			].includes(String(original?.message)))
	) {
		return Object.assign(new Error("Mailbox operation is not permitted"), {
			code: "CANNOT",
		});
	}
	const transient =
		TRANSIENT_ERROR_CODES.has(code) ||
		code.startsWith("08") ||
		code.startsWith("53");
	console.error(
		"[imap] backend error",
		sanitizeLogValue(code || "-"),
		sanitizeLogValue(original?.message ?? "unknown"),
	);
	const safe = new Error(
		transient ? "Temporary server failure" : "Internal server error",
	);
	(safe as Error & { code: string }).code = transient
		? "TEMPFAIL"
		: "SERVERBUG";
	return safe;
}

function toFolderError(err: Error): Error {
	if ("code" in err && err.code === "23505") {
		return Object.assign(new Error("Mailbox already exists"), {
			code: "ALREADYEXISTS",
		});
	}
	return toImapError(err);
}

function waitForDrain(
	socket: ImapSession["socket"],
	timeoutMs: number,
): Promise<void> {
	if (!socket?.writableNeedDrain || socket.destroyed) return Promise.resolve();
	return new Promise((resolve, reject) => {
		const done = (err?: Error) => {
			clearTimeout(timer);
			socket.removeListener("drain", onDrain);
			socket.removeListener("close", onClose);
			if (err) reject(err);
			else resolve();
		};
		const onDrain = () => done();
		const onClose = () => done(new Error("Connection closed during FETCH"));
		const timer = setTimeout(() => {
			socket.destroy();
			done(new Error("Client stopped reading FETCH response"));
		}, timeoutMs);
		socket.once("drain", onDrain);
		socket.once("close", onClose);
	});
}

// The response is fully handed over once the compiled stream has been piped into the socket. A
// client that stops reading stalls that pipe (no "drain" for stallTimeoutMs) while the message
// holds its share of the content budget, so it is disconnected.
function writeResponse(
	session: ImapSession,
	stream: NodeJS.EventEmitter,
	stallTimeoutMs: number,
): Promise<void> {
	const socket = session.socket;
	if (socket?.destroyed) {
		return Promise.reject(new Error("Connection closed during FETCH"));
	}
	return new Promise((resolve, reject) => {
		let timer: ReturnType<typeof setTimeout> | undefined;
		const done = (err?: Error) => {
			clearTimeout(timer);
			socket?.removeListener("close", onClose);
			socket?.removeListener("drain", arm);
			if (err) reject(err);
			else resolve();
		};
		const onClose = () => done(new Error("Connection closed during FETCH"));
		const arm = () => {
			clearTimeout(timer);
			timer = setTimeout(() => {
				socket?.destroy();
				done(new Error("Client stopped reading FETCH response"));
			}, stallTimeoutMs);
		};
		if (socket) {
			arm();
			socket.on("drain", arm);
			socket.once("close", onClose);
		}
		stream.once("error", (err: Error) => done(err));
		session.writeStream.write(stream, () => done());
	});
}

export interface HandlerOptions {
	contentBudget?: ContentBudget;
	sessions?: SessionRevalidator;
	/** How long a FETCH response may make no progress before the client is disconnected. */
	stallTimeoutMs?: number;
}

export function buildHandlers(
	auth: ApiAuth,
	store: MailStore,
	limits: ConnectionLimits,
	options: HandlerOptions = {},
) {
	const contentBudget =
		options.contentBudget ?? new ContentBudget(256 * 1024 * 1024, 10_000);
	const sessions = options.sessions;
	const stallTimeoutMs = options.stallTimeoutMs ?? DRAIN_TIMEOUT_MS;

	async function openMailbox(session: ImapSession, path: string) {
		const user = session.user;
		if (!user?.address) throw new Error("Not authenticated");
		await store.ensureAllMailboxes(user);
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
			isScopeMailboxPath(selected.path ?? "")
		);
	}

	function notifySelected(
		session: ImapSession,
		mailboxId: string,
		updates: unknown[],
	): void {
		const selected = session.selected;
		if (selected && selected.mailbox === mailboxId) {
			selected.notifications?.push(...updates);
		}
	}

	return {
		logger,

		onAuth(authData: AuthData, _session: ImapSession, callback: Callback) {
			const ip = _session.remoteAddress ?? "unknown";
			const address = authData.username.trim().toLowerCase();
			const limited = limits.assertAuthAllowed(ip, address);
			if (limited) return callback(null);
			if (
				!address.includes("@") ||
				address.length > 255 ||
				!authData.password ||
				authData.password.length > 1024
			) {
				limits.recordMalformedAuth(ip);
				return callback(null);
			}
			auth
				.authenticate(address, authData.password, ip)
				.then((result) => {
					if (!result) {
						limits.recordAuthFailure(ip, address);
						return callback(null);
					}
					limits.recordAuthSuccess(ip, address);
					sessions?.remember(_session, authData.password);
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
				const mailboxes = await store.ensureAllMailboxes(user);
				const folders: Array<{
					path: string;
					flags: string[];
					specialUse: string | false;
				}> = mailboxes.map((mailbox) => ({
					path: mailbox.path,
					flags: mailbox.scopeId ? ["\\NoInferiors"] : [],
					specialUse: SPECIAL_USE[mailbox.path] ?? false,
				}));
				if (user.scopes.length > 0) {
					folders.push({
						path: "Scopes",
						flags: ["\\Noselect", "\\HasChildren"],
						specialUse: false,
					});
				}
				return folders;
			})()
				.then((folders) => callback(null, folders))
				.catch((err: Error) => callback(toImapError(err)));
		},

		onLsub(_query: string, session: ImapSession, callback: Callback) {
			(async () => {
				const user = requireUser(session);
				const mailboxes = await store.listMailboxes(user);
				const folders: Array<{ path: string; flags: string[] }> = mailboxes
					.filter((mailbox) => mailbox.subscribed)
					.map((mailbox) => ({
						path: mailbox.path,
						flags: [],
					}));
				if (folders.some((folder) => folder.path.startsWith("Scopes/"))) {
					folders.push({ path: "Scopes", flags: ["\\Noselect"] });
				}
				return folders;
			})()
				.then((folders) => callback(null, folders))
				.catch((err: Error) => callback(toImapError(err)));
		},

		onSubscribe(path: string, session: ImapSession, callback: Callback) {
			if (requireUser(session).accessMode !== "read_write")
				return callback(null, "READ-ONLY");
			Promise.resolve()
				.then(() => store.subscribeMailbox(requireUser(session), path, true))
				.then((ok) => callback(null, ok ? true : "NONEXISTENT"))
				.catch((err: Error) => callback(toImapError(err)));
		},

		onUnsubscribe(path: string, session: ImapSession, callback: Callback) {
			if (requireUser(session).accessMode !== "read_write")
				return callback(null, "READ-ONLY");
			Promise.resolve()
				.then(() => store.subscribeMailbox(requireUser(session), path, false))
				.then((ok) => callback(null, ok ? true : "NONEXISTENT"))
				.catch((err: Error) => callback(toImapError(err)));
		},

		onOpen(path: string, session: ImapSession, callback: Callback) {
			openMailbox(session, path)
				.then(async (mailbox) => {
					if (!mailbox) return callback(null, "NONEXISTENT");
					const fresh =
						(await store.getMailboxByPath(requireUser(session), path)) ??
						mailbox;
					const uidList = (
						await store.listUids(requireUser(session), mailbox.id)
					).filter((uid) => uid < fresh.uidNext);
					callback(null, {
						_id: mailbox.id,
						path,
						uidValidity: mailbox.uidValidity,
						uidNext: fresh.uidNext,
						modifyIndex: fresh.modseq,
						uidList,
						flags: [],
						readOnly:
							requireUser(session).accessMode !== "read_write" ||
							mailbox.scopeId !== null ||
							isScopeMailboxPath(mailbox.path),
					});
				})
				.catch((err: Error) => callback(toImapError(err)));
		},

		onStatus(path: string, session: ImapSession, callback: Callback) {
			openMailbox(session, path)
				.then(async (mailbox) => {
					if (!mailbox) return callback(null, "NONEXISTENT");
					const [messages, unseen, fresh] = await Promise.all([
						store.countMessages(requireUser(session), mailbox.id),
						store.unseenCount(requireUser(session), mailbox.id),
						store.getMailboxByPath(requireUser(session), path),
					]);
					callback(null, {
						messages,
						uidNext: fresh?.uidNext ?? mailbox.uidNext,
						uidValidity: mailbox.uidValidity,
						unseen,
					});
				})
				.catch((err: Error) => callback(toImapError(err)));
		},

		onCreate(path: string, session: ImapSession, callback: Callback) {
			(async () => {
				const user = requireUser(session);
				path = normalizeMailboxPath(path);
				if (user.accessMode !== "read_write" || isProtectedMailboxPath(path)) {
					return "CANNOT";
				}
				return (await store.createMailbox(user, path)) ? true : "ALREADYEXISTS";
			})()
				.then((ok) => callback(null, ok))
				.catch((err: Error) => callback(toFolderError(err)));
		},

		onRename(
			path: string,
			newPath: string,
			session: ImapSession,
			callback: Callback,
		) {
			(async () => {
				const user = requireUser(session);
				path = normalizeMailboxPath(path);
				newPath = normalizeMailboxPath(newPath);
				if (
					user.accessMode !== "read_write" ||
					isProtectedMailboxPath(path) ||
					isScopeMailboxPath(newPath)
				)
					return "CANNOT";
				if (await store.getMailboxByPath(user, newPath)) {
					return "ALREADYEXISTS";
				}
				const ok = await store.renameMailbox(user, path, newPath);
				return ok ? true : "NONEXISTENT";
			})()
				.then((result) => callback(null, result))
				.catch((err: Error) => callback(toFolderError(err)));
		},

		onDelete(path: string, session: ImapSession, callback: Callback) {
			(async () => {
				const user = requireUser(session);
				path = normalizeMailboxPath(path);
				if (user.accessMode !== "read_write" || isProtectedMailboxPath(path))
					return "CANNOT";
				const ok = await store.deleteMailbox(user, path);
				return ok ? true : "NONEXISTENT";
			})()
				.then((result) => callback(null, result))
				.catch((err: Error) => callback(toImapError(err)));
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
				if (!isUtf8(raw) || raw.includes(0)) {
					throw Object.assign(
						new Error(
							"APPEND requires UTF-8 content without NUL bytes; use MIME transfer encoding for binary content",
						),
						{
							imapCode: "CANNOT",
							responseMessage:
								"APPEND requires UTF-8 content without NUL bytes; use MIME transfer encoding for binary content",
						},
					);
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
					user,
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
					callback(toImapError(err));
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
					user,
					mailboxId,
					destination,
					update.messages,
				);
				return { success: true as const, info };
			})()
				.then(({ success, info }) => callback(null, success, info))
				.catch((err: Error) => callback(toImapError(err)));
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
				if (destination.id === mailboxId) {
					return { success: "CANNOT" as const, info: null };
				}
				const { expunged, ...info } = await store.moveMessages(
					user,
					mailboxId,
					destination,
					update.messages,
				);
				notifySelected(
					session,
					mailboxId,
					expunged.map((uid) => ({ command: "EXPUNGE", uid })),
				);
				return { success: true as const, info };
			})()
				.then(({ success, info }) => callback(null, success, info))
				.catch((err: Error) => callback(toImapError(err)));
		},

		onFetch(
			mailboxId: string,
			options: FetchOptions,
			session: ImapSession,
			callback: Callback,
		) {
			(async () => {
				const user = requireUser(session);
				const wantsContent = needsContent(options.query);
				const memoryFactor = isRawContentQuery(options.query)
					? RAW_FETCH_MEMORY_FACTOR
					: PARSED_FETCH_MEMORY_FACTOR;
				let rowCount = 0;

				for await (const rows of store.listMessagesInBatches(
					user,
					mailboxId,
					options.messages,
				)) {
					for (const row of rows) {
						let raw: Buffer | null = null;
						let release: (() => void) | null = null;
						try {
							if (wantsContent) {
								release = await contentBudget.acquire(
									(row.size ?? UNKNOWN_MESSAGE_SIZE) * memoryFactor,
									user.credentialId,
								);
								raw = await store.getRawContent(
									row.structuredEmailId,
									row.rawSource,
									user,
								);
								if (!raw) continue;
							}

							const flags = [...row.flags];
							const markAsSeen =
								options.markAsSeen &&
								user.accessMode === "read_write" &&
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
							raw = null;

							const stream = imapHandler.compileStream(response);
							await writeResponse(session, stream, stallTimeoutMs);
							if (release) await waitForDrain(session.socket, stallTimeoutMs);
							rowCount++;

							if (markAsSeen) {
								await store.addFlag(user, mailboxId, row.uid, "\\Seen");
							}
						} finally {
							release?.();
						}
					}
				}

				callback(null, true, { rowCount });
			})().catch((err: Error) => callback(toImapError(err)));
		},

		onSearch(
			mailboxId: string,
			options: { query: unknown; terms: string[]; isUid: boolean },
			_session: ImapSession,
			callback: Callback,
		) {
			Promise.resolve()
				.then(() =>
					store.searchMessages(
						requireUser(_session),
						mailboxId,
						(options.query ?? []) as import("./search.ts").SearchNode[],
					),
				)
				.then((uidList) => {
					callback(null, { uidList });
				})
				.catch((err: Error) => callback(toImapError(err)));
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
				.updateFlags(
					requireUser(_session),
					mailboxId,
					update.messages,
					update.action,
					update.value,
				)
				.then((updated) => {
					if (!update.silent) {
						for (const { uid, flags } of updated) {
							const response = _session.formatResponse("FETCH", uid, {
								uid,
								flags,
							});
							if (response) _session.writeStream.write(response);
						}
					}
					callback(null, true, []);
				})
				.catch((err: Error) => callback(toImapError(err)));
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
					if (
						!mailbox ||
						mailbox.id !== mailboxId ||
						mailbox.scopeId !== null ||
						isScopeMailboxPath(mailbox.path)
					) {
						return "READ-ONLY";
					}
				}
				const expunged = await store.expunge(
					user,
					mailboxId,
					update.isUid ? (update.messages ?? []) : undefined,
				);
				if (!update.silent) {
					notifySelected(
						_session,
						mailboxId,
						expunged.map((uid) => ({ command: "EXPUNGE", uid })),
					);
				}
				return true;
			})()
				.then((result) => callback(null, result))
				.catch((err: Error) => callback(toImapError(err)));
		},
	};
}
