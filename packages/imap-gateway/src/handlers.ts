import { createRequire } from "node:module";
import type { ImapConfig } from "./config.ts";
import type { MailStore } from "./db.ts";

const require = createRequire(import.meta.url);
const { imapHandler } = require("../vendor/imap-core/index.js");
const Indexer = require("../vendor/imap-core/lib/indexer/indexer.js");

const UIDVALIDITY = 1;

type Callback = (err: Error | null, ...rest: unknown[]) => void;

interface ImapSession {
	user?: { id: string; username: string; address: string };
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

const logger = {
	debug: () => undefined,
	info: (...args: unknown[]) => console.log("[imap]", ...args),
	error: (...args: unknown[]) => console.error("[imap]", ...args),
};

export function buildHandlers(config: ImapConfig, store: MailStore) {
	const indexer = new Indexer({ logger });

	return {
		logger,

		notifier: {
			addListener: () => undefined,
			removeListener: () => undefined,
			releaseConnection: (_data: unknown, done?: Callback) =>
				done?.(null, true),
		},

		onAuth(auth: AuthData, _session: ImapSession, callback: Callback) {
			const address = auth.username.trim().toLowerCase();
			const expected = config.devCredentials.get(address);
			if (!expected || expected !== auth.password) {
				return callback(new Error("Invalid credentials"));
			}
			callback(null, {
				user: { id: address, username: address, address },
			});
		},

		onList(_query: string, _session: ImapSession, callback: Callback) {
			callback(null, [{ path: "INBOX", flags: [], specialUse: false }]);
		},

		onLsub(_query: string, _session: ImapSession, callback: Callback) {
			callback(null, [{ path: "INBOX", flags: [] }]);
		},

		onSubscribe(_path: string, _session: ImapSession, callback: Callback) {
			callback(null, true);
		},

		onUnsubscribe(_path: string, _session: ImapSession, callback: Callback) {
			callback(null, true);
		},

		onOpen(path: string, session: ImapSession, callback: Callback) {
			if (path !== "INBOX") return callback(null, "NONEXISTENT");
			const address = session.user?.address;
			if (!address) return callback(new Error("Not authenticated"));
			store
				.listMessages(address)
				.then((rows) => {
					callback(null, {
						_id: address,
						path,
						uidValidity: UIDVALIDITY,
						uidNext: rows.length + 1,
						modifyIndex: 0,
						uidList: rows.map((_, index) => index + 1),
						flags: [],
					});
				})
				.catch((err: Error) => callback(err));
		},

		onStatus(path: string, session: ImapSession, callback: Callback) {
			if (path !== "INBOX") return callback(null, "NONEXISTENT");
			const address = session.user?.address;
			if (!address) return callback(new Error("Not authenticated"));
			store
				.listMessages(address)
				.then((rows) => {
					callback(null, {
						messages: rows.length,
						uidNext: rows.length + 1,
						uidValidity: UIDVALIDITY,
						unseen: 0,
						highestModseq: 0,
					});
				})
				.catch((err: Error) => callback(err));
		},

		onFetch(
			mailbox: string,
			options: FetchOptions,
			session: ImapSession,
			callback: Callback,
		) {
			(async () => {
				const rows = await store.listMessages(mailbox);
				const wanted = new Set(options.messages);
				let rowCount = 0;

				for (let index = 0; index < rows.length; index++) {
					const uid = index + 1;
					if (!wanted.has(uid)) continue;
					const row = rows[index];
					if (!row) continue;
					const raw = await store.getRawContent(row.id);
					if (!raw) continue;

					const messageData = {
						_id: row.id,
						uid,
						flags: [],
						modseq: 0,
						idate: row.createdAt,
						mimeTree: indexer.parseMimeTree(raw),
					};

					const response = session.formatResponse("FETCH", uid, {
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
				}

				callback(null, true, { rowCount });
			})().catch((err: Error) => callback(err));
		},

		onSearch(
			mailbox: string,
			_options: unknown,
			_session: ImapSession,
			callback: Callback,
		) {
			store
				.listMessages(mailbox)
				.then((rows) => {
					callback(null, {
						uidList: rows.map((_, index) => index + 1),
						highestModseq: 0,
					});
				})
				.catch((err: Error) => callback(err));
		},

		onStore(
			_mailbox: string,
			_update: unknown,
			_session: ImapSession,
			callback: Callback,
		) {
			callback(null, true, []);
		},

		onExpunge(
			_mailbox: string,
			_update: unknown,
			_session: ImapSession,
			callback: Callback,
		) {
			callback(null, true);
		},
	};
}
