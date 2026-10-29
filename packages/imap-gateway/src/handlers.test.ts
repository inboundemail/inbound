import { describe, expect, it, mock } from "bun:test";
import { EventEmitter } from "node:events";
import type { ApiAuth, AuthenticatedMailbox } from "./auth.ts";
import type { MailboxRow, MailStore } from "./db.ts";
import { buildHandlers, toImapError } from "./handlers.ts";
import { ConnectionLimits, ContentBudget } from "./limits.ts";

type Handlers = ReturnType<typeof buildHandlers>;
type Session = Parameters<Handlers["onOpen"]>[1];

function createHarness(
	accessMode: AuthenticatedMailbox["accessMode"],
	scopeId: string | null = null,
	contentBudget?: ContentBudget,
	stallTimeoutMs?: number,
) {
	const mailbox: MailboxRow = {
		id: scopeId ? "scope-mailbox" : "inbox",
		address: "user@example.com",
		path: scopeId ? "Scopes/user@example.com" : "INBOX",
		uidValidity: 1,
		uidNext: 2,
		modseq: 1,
		credentialId: "credential",
		scopeId,
	};
	const destination: MailboxRow = {
		...mailbox,
		id: "destination",
		path: "Archive",
		scopeId: null,
	};
	const store = {
		ensureAllMailboxes: mock(async () => [
			{ ...mailbox, subscribed: true },
			{ ...destination, subscribed: false },
		]),
		listMailboxes: mock(async () => [
			{ ...mailbox, subscribed: true },
			{ ...destination, subscribed: false },
		]),
		subscribeMailbox: mock(
			async (
				_principal: AuthenticatedMailbox,
				_path: string,
				_subscribed: boolean,
			) => true,
		),
		createMailbox: mock(async () => true),
		renameMailbox: mock(async () => true),
		deleteMailbox: mock(async () => true),
		ensureDefaultMailboxes: mock(async () => [mailbox]),
		ensureScopeMailboxes: mock(async () => []),
		getMailboxByPath: mock(
			async (
				_principal: AuthenticatedMailbox,
				path: string,
			): Promise<MailboxRow | null> =>
				path === "Archive" ? destination : mailbox,
		),
		syncMailbox: mock(async () => 0),
		countMessages: mock(async () => 1),
		unseenCount: mock(async () => 1),
		listUids: mock(async () => [1]),
		listMessagesInBatches: mock(async function* () {
			yield [
				{
					uid: 1,
					structuredEmailId: "message",
					rawSource: "structured",
					flags: [] as string[],
					internalDate: new Date(),
					size: 10,
				},
			];
		}),
		getRawContent: mock(async () => Buffer.from("Subject: hi\r\n\r\nbody")),
		addFlag: mock(async () => undefined),
		updateFlags: mock(
			async () => [] as Array<{ uid: number; flags: string[] }>,
		),
		expunge: mock(async () => [] as number[]),
		copyMessages: mock(async () => ({
			uidValidity: 1,
			sourceUid: [1],
			destinationUid: [1],
		})),
		deleteMessages: mock(async () => [] as number[]),
		moveMessages: mock(async () => ({
			uidValidity: 1,
			sourceUid: [1],
			destinationUid: [1],
			expunged: [1],
		})),
		appendMessage: mock(async () => ({ uidValidity: 1, uid: 1 })),
	};
	const handlers = buildHandlers(
		{} as ApiAuth,
		store as unknown as MailStore,
		{} as ConnectionLimits,
		{ contentBudget, stallTimeoutMs },
	);
	const session: Session = {
		user: {
			id: "user",
			userId: "user",
			credentialId: "credential",
			loginAddress: "user@example.com",
			username: "user@example.com",
			address: "user@example.com",
			accessMode,
			scopes: scopeId
				? [
						{
							id: scopeId,
							type: "address",
							domainId: "domain",
							domain: "example.com",
							address: "user@example.com",
						},
					]
				: [],
		},
		selected: {
			mailbox: mailbox.id,
			path: mailbox.path,
			readOnly: accessMode !== "read_write" || scopeId !== null,
		},
		formatResponse: () => ({ tag: "*", command: "FETCH", attributes: [] }),
		getQueryResponse: () => [],
		isUTF8Enabled: () => false,
		writeStream: {
			write: (_chunk, done) => done?.(),
		},
	};
	return { handlers, mailbox, session, store };
}

function callbackResult(
	invoke: (
		callback: (error: Error | null, ...result: unknown[]) => void,
	) => void,
): Promise<unknown[]> {
	return new Promise((resolve, reject) => {
		invoke((error, ...result) => {
			if (error) reject(error);
			else resolve(result);
		});
	});
}

describe("IMAP backend authorization", () => {
	it("lists only subscribed mailboxes and persists subscribe/unsubscribe", async () => {
		const { handlers, session, store } = createHarness("read_write");
		const [folders] = await callbackResult((callback) =>
			handlers.onLsub("*", session, callback),
		);
		expect(folders).toEqual([{ path: "INBOX", flags: [] }]);
		const [subscribed] = await callbackResult((callback) =>
			handlers.onSubscribe("Archive", session, callback),
		);
		const [unsubscribed] = await callbackResult((callback) =>
			handlers.onUnsubscribe("INBOX", session, callback),
		);
		expect([subscribed, unsubscribed]).toEqual([true, true]);
		expect(store.subscribeMailbox).toHaveBeenNthCalledWith(
			1,
			session.user,
			"Archive",
			true,
		);
		expect(store.subscribeMailbox).toHaveBeenNthCalledWith(
			2,
			session.user,
			"INBOX",
			false,
		);
	});

	it("advertises Archive special use and protects it from rename/delete", async () => {
		const { handlers, session, store } = createHarness("read_write");
		const [folders] = await callbackResult((callback) =>
			handlers.onList("*", session, callback),
		);
		expect(folders).toContainEqual({
			path: "Archive",
			flags: [],
			specialUse: "\\Archive",
		});
		expect(store.ensureAllMailboxes).toHaveBeenCalledTimes(1);
		expect(store.ensureDefaultMailboxes).not.toHaveBeenCalled();
		expect(store.ensureScopeMailboxes).not.toHaveBeenCalled();
		expect(store.listMailboxes).not.toHaveBeenCalled();
		const [renamed] = await callbackResult((callback) =>
			handlers.onRename("Archive", "Old", session, callback),
		);
		const [deleted] = await callbackResult((callback) =>
			handlers.onDelete("Archive", session, callback),
		);
		expect([renamed, deleted]).toEqual(["CANNOT", "CANNOT"]);
		expect(store.renameMailbox).not.toHaveBeenCalled();
		expect(store.deleteMailbox).not.toHaveBeenCalled();
	});

	it.each([
		["read", null, true],
		["read_write", "scope", true],
		["read_write", null, false],
	] as const)("opens %s credential folders with readOnly=%s for scope %s", async (mode, scopeId, readOnly) => {
		const { handlers, mailbox, session, store } = createHarness(mode, scopeId);
		const [selected] = await callbackResult((callback) => {
			handlers.onOpen(mailbox.path, session, callback);
		});
		expect(selected).toMatchObject({ readOnly });
		expect(store.ensureAllMailboxes).toHaveBeenCalledTimes(1);
		expect(store.ensureDefaultMailboxes).not.toHaveBeenCalled();
		expect(store.ensureScopeMailboxes).not.toHaveBeenCalled();
	});

	it.each([
		"scope-id",
		"scope-path",
	])("opens a folder identified by %s as read-only", async (identity) => {
		const { handlers, mailbox, session } = createHarness("read_write", "scope");
		if (identity === "scope-id") mailbox.path = "Scoped view";
		else mailbox.scopeId = null;
		const [selected] = await callbackResult((callback) =>
			handlers.onOpen(mailbox.path, session, callback),
		);
		expect(selected).toMatchObject({ readOnly: true });
	});

	it("ensures all folders only once for STATUS", async () => {
		const { handlers, mailbox, session, store } = createHarness("read_write");
		const [status] = await callbackResult((callback) =>
			handlers.onStatus(mailbox.path, session, callback),
		);
		expect(status).toMatchObject({ messages: 1, unseen: 1 });
		expect(store.ensureAllMailboxes).toHaveBeenCalledTimes(1);
		expect(store.ensureDefaultMailboxes).not.toHaveBeenCalled();
		expect(store.ensureScopeMailboxes).not.toHaveBeenCalled();
	});

	it("rejects STORE, EXPUNGE, and MOVE from scope paths even if selected readOnly is false", async () => {
		const { handlers, mailbox, session, store } = createHarness(
			"read_write",
			"scope",
		);
		if (session.selected) session.selected.readOnly = false;
		const [stored] = await callbackResult((callback) => {
			handlers.onStore(
				mailbox.id,
				{
					value: ["\\Seen"],
					action: "add",
					silent: false,
					messages: [1],
					unchangedSince: 0,
				},
				session,
				callback,
			);
		});
		const [expunged] = await callbackResult((callback) => {
			handlers.onExpunge(mailbox.id, { isUid: false }, session, callback);
		});
		const [moved] = await callbackResult((callback) => {
			handlers.onMove(
				mailbox.id,
				{ destination: "Archive", messages: [1] },
				session,
				callback,
			);
		});

		expect([stored, expunged, moved]).toEqual([
			"READ-ONLY",
			"READ-ONLY",
			"READ-ONLY",
		]);
		expect(store.updateFlags).not.toHaveBeenCalled();
		expect(store.expunge).not.toHaveBeenCalled();
		expect(store.moveMessages).not.toHaveBeenCalled();
	});

	it("moves INBOX messages into Junk in one store call and reports every removed UID", async () => {
		const { handlers, mailbox, session, store } = createHarness("read_write");
		const notifications: unknown[] = [];
		session.selected = {
			mailbox: mailbox.id,
			path: mailbox.path,
			readOnly: false,
			notifications,
		};
		const junk: MailboxRow = { ...mailbox, id: "junk", path: "Junk" };
		store.getMailboxByPath.mockImplementation(async () => junk);
		store.moveMessages.mockImplementation(async () => ({
			uidValidity: 1,
			sourceUid: [1],
			destinationUid: [7],
			expunged: [1, 2],
		}));
		const [moved, info] = await callbackResult((callback) => {
			handlers.onMove(
				mailbox.id,
				{ destination: "Junk", messages: [1, 2] },
				session,
				callback,
			);
		});

		expect(moved).toBe(true);
		expect(info).toEqual({
			uidValidity: 1,
			sourceUid: [1],
			destinationUid: [7],
		});
		expect(store.moveMessages).toHaveBeenCalledWith(
			session.user,
			mailbox.id,
			junk,
			[1, 2],
		);
		expect(store.copyMessages).not.toHaveBeenCalled();
		expect(store.deleteMessages).not.toHaveBeenCalled();
		expect(notifications).toEqual([
			{ command: "EXPUNGE", uid: 1 },
			{ command: "EXPUNGE", uid: 2 },
		]);
	});

	it("refuses to move messages into Junk for read-only credentials", async () => {
		const { handlers, mailbox, session, store } = createHarness("read");
		const [result] = await callbackResult((callback) => {
			handlers.onMove(
				mailbox.id,
				{ destination: "Junk", messages: [1] },
				session,
				callback,
			);
		});

		expect(result).toBe("READ-ONLY");
		expect(store.moveMessages).not.toHaveBeenCalled();
	});

	it("refuses MOVE from a read-only scope folder into INBOX", async () => {
		const { handlers, mailbox, session, store } = createHarness(
			"read_write",
			"scope",
		);
		const inbox: MailboxRow = {
			...mailbox,
			id: "inbox",
			path: "INBOX",
			scopeId: null,
		};
		store.getMailboxByPath.mockImplementation(async () => inbox);
		const [result] = await callbackResult((callback) => {
			handlers.onMove(
				mailbox.id,
				{ destination: "INBOX", messages: [1] },
				session,
				callback,
			);
		});

		expect(result).toBe("READ-ONLY");
		expect(store.moveMessages).not.toHaveBeenCalled();
	});

	it("fails closed when selected mailbox does not match the mutation source", async () => {
		const { handlers, mailbox, session, store } = createHarness("read_write");
		session.selected = {
			mailbox: "different-mailbox",
			path: "Archive",
			readOnly: false,
		};
		const [stored] = await callbackResult((callback) => {
			handlers.onStore(
				mailbox.id,
				{
					value: ["\\Seen"],
					action: "add",
					silent: false,
					messages: [1],
					unchangedSince: 0,
				},
				session,
				callback,
			);
		});
		const [expunged] = await callbackResult((callback) => {
			handlers.onExpunge(mailbox.id, { isUid: false }, session, callback);
		});
		const [moved] = await callbackResult((callback) => {
			handlers.onMove(
				mailbox.id,
				{ destination: "Archive", messages: [1] },
				session,
				callback,
			);
		});

		expect([stored, expunged, moved]).toEqual([
			"READ-ONLY",
			"READ-ONLY",
			"READ-ONLY",
		]);
		expect(store.updateFlags).not.toHaveBeenCalled();
		expect(store.expunge).not.toHaveBeenCalled();
		expect(store.copyMessages).not.toHaveBeenCalled();
	});

	it("does not mark messages seen for a mismatched selected mailbox", async () => {
		const { handlers, mailbox, session, store } = createHarness("read_write");
		session.selected = {
			mailbox: "different-mailbox",
			path: "Archive",
			readOnly: false,
		};
		const [success] = await callbackResult((callback) => {
			handlers.onFetch(
				mailbox.id,
				{
					messages: [1],
					query: [{ item: "flags" }],
					metadataOnly: true,
					markAsSeen: true,
					isUid: true,
				},
				session,
				callback,
			);
		});

		expect(success).toBe(true);
		expect(store.addFlag).not.toHaveBeenCalled();
	});

	it("rejects mutations without a selected mailbox", async () => {
		const { handlers, mailbox, session, store } = createHarness("read_write");
		session.selected = false;
		const [result] = await callbackResult((callback) => {
			handlers.onExpunge(mailbox.id, { isUid: false }, session, callback);
		});

		expect(result).toBe("READ-ONLY");
		expect(store.expunge).not.toHaveBeenCalled();
	});

	it("allows CLOSE to expunge an independently verified writable mailbox", async () => {
		const { handlers, mailbox, session, store } = createHarness("read_write");
		session.selected = false;
		const [result] = await callbackResult((callback) => {
			handlers.onExpunge(
				mailbox.id,
				{ isUid: false, silent: true, path: mailbox.path },
				session,
				callback,
			);
		});

		expect(result).toBe(true);
		expect(store.getMailboxByPath).toHaveBeenCalledTimes(1);
		expect(store.expunge).toHaveBeenCalledTimes(1);
	});

	it.each([
		"scope-id",
		"scope-path",
	])("rejects CLOSE-style expunges identified by %s and mismatched mailboxes", async (identity) => {
		const scoped = createHarness("read_write", "scope");
		if (identity === "scope-id") scoped.mailbox.path = "Scoped view";
		else scoped.mailbox.scopeId = null;
		scoped.session.selected = false;
		const [scopeResult] = await callbackResult((callback) => {
			scoped.handlers.onExpunge(
				scoped.mailbox.id,
				{ isUid: false, silent: true, path: scoped.mailbox.path },
				scoped.session,
				callback,
			);
		});
		const writable = createHarness("read_write");
		writable.session.selected = false;
		const [mismatchResult] = await callbackResult((callback) => {
			writable.handlers.onExpunge(
				writable.mailbox.id,
				{ isUid: false, silent: true, path: "Archive" },
				writable.session,
				callback,
			);
		});

		expect(scopeResult).toBe("READ-ONLY");
		expect(mismatchResult).toBe("READ-ONLY");
		expect(scoped.store.expunge).not.toHaveBeenCalled();
		expect(writable.store.expunge).not.toHaveBeenCalled();
	});

	it("preserves COPY from a read-only source into a writable destination", async () => {
		const { handlers, mailbox, session, store } = createHarness(
			"read_write",
			"scope",
		);
		const [success] = await callbackResult((callback) => {
			handlers.onCopy(
				null,
				mailbox.id,
				{ destination: "Archive", messages: [1] },
				session,
				callback,
			);
		});

		expect(success).toBe(true);
		expect(store.copyMessages).toHaveBeenCalledTimes(1);
	});

	it("preserves APPEND to a writable destination while a read-only folder is selected", async () => {
		const { handlers, session, store } = createHarness("read_write", "scope");
		const [success] = await callbackResult((callback) => {
			handlers.onAppend(
				"Archive",
				[],
				undefined,
				Buffer.from("Subject: test\r\n\r\nbody"),
				session,
				callback,
			);
		});

		expect(success).toBe(true);
		expect(store.appendMessage).toHaveBeenCalledTimes(1);
		expect(
			(store.appendMessage.mock.calls[0] as unknown[] | undefined)?.[1],
		).toMatchObject({ userId: "user", credentialId: "credential" });
	});

	it.each([
		Buffer.from([0xff]),
		Buffer.from("Subject: test\r\n\r\n\0body"),
	])("rejects APPEND bytes that cannot round-trip through Postgres text", async (raw) => {
		const { handlers, session, store } = createHarness("read_write");
		await expect(
			callbackResult((callback) => {
				handlers.onAppend("INBOX", [], undefined, raw, session, callback);
			}),
		).rejects.toMatchObject({
			responseMessage:
				"APPEND requires UTF-8 content without NUL bytes; use MIME transfer encoding for binary content",
		});
		expect(store.appendMessage).not.toHaveBeenCalled();
		expect(store.ensureDefaultMailboxes).not.toHaveBeenCalled();
	});

	it("preserves UTF-8 and MIME transfer-encoded APPEND content exactly", async () => {
		const { handlers, session, store } = createHarness("read_write");
		const raw =
			"Subject: café\r\nContent-Transfer-Encoding: base64\r\n\r\n/wA=";
		const [success] = await callbackResult((callback) => {
			handlers.onAppend(
				"INBOX",
				[],
				undefined,
				Buffer.from(raw),
				session,
				callback,
			);
		});
		expect(success).toBe(true);
		expect((store.appendMessage.mock.calls[0] as unknown[])[2]).toBe(raw);
	});

	it("reports EXPUNGE for every message removed by EXPUNGE and MOVE", async () => {
		const { handlers, mailbox, session, store } = createHarness("read_write");
		const notifications: unknown[] = [];
		session.selected = {
			mailbox: mailbox.id,
			path: mailbox.path,
			readOnly: false,
			notifications,
		};
		store.expunge.mockImplementation(async () => [2, 5]);
		store.moveMessages.mockImplementation(async () => ({
			uidValidity: 1,
			sourceUid: [],
			destinationUid: [],
			expunged: [1, 3],
		}));
		await callbackResult((callback) => {
			handlers.onExpunge(mailbox.id, { isUid: false }, session, callback);
		});
		const [moved] = await callbackResult((callback) => {
			handlers.onMove(
				mailbox.id,
				{ destination: "Archive", messages: [1] },
				session,
				callback,
			);
		});

		expect(moved).toBe(true);
		expect(notifications).toEqual([
			{ command: "EXPUNGE", uid: 2 },
			{ command: "EXPUNGE", uid: 5 },
			{ command: "EXPUNGE", uid: 1 },
			{ command: "EXPUNGE", uid: 3 },
		]);
	});

	it("refuses MOVE into the source mailbox", async () => {
		const { handlers, mailbox, session, store } = createHarness("read_write");
		const [result] = await callbackResult((callback) => {
			handlers.onMove(
				mailbox.id,
				{ destination: mailbox.path, messages: [1] },
				session,
				callback,
			);
		});

		expect(result).toBe("CANNOT");
		expect(store.moveMessages).not.toHaveBeenCalled();
	});

	it("returns updated flags for non-silent STORE only", async () => {
		const { handlers, mailbox, session, store } = createHarness("read_write");
		const written: unknown[] = [];
		session.formatResponse = (_command, uid, data) => ({ uid, data });
		session.writeStream = { write: (chunk) => written.push(chunk) };
		store.updateFlags.mockImplementation(async () => [
			{ uid: 1, flags: ["\\Seen"] },
		]);
		for (const silent of [true, false]) {
			await callbackResult((callback) => {
				handlers.onStore(
					mailbox.id,
					{
						value: ["\\Seen"],
						action: "add",
						silent,
						messages: [1],
						unchangedSince: 0,
					},
					session,
					callback,
				);
			});
		}

		expect(written).toEqual([{ uid: 1, data: { uid: 1, flags: ["\\Seen"] } }]);
	});

	it("never marks messages seen for read-only credentials", async () => {
		const { handlers, mailbox, session, store } = createHarness("read");
		const [success] = await callbackResult((callback) => {
			handlers.onFetch(
				mailbox.id,
				{
					messages: [1],
					query: [{ item: "flags" }],
					metadataOnly: true,
					markAsSeen: true,
					isUid: true,
				},
				session,
				callback,
			);
		});

		expect(success).toBe(true);
		expect(store.addFlag).not.toHaveBeenCalled();
	});
});

describe("FETCH content handling", () => {
	const bodyQuery = [
		{ item: "uid", original: { value: "UID" } },
		{
			item: "body",
			path: "",
			type: "content",
			isLiteral: true,
			original: { value: "BODY", section: [] },
		},
	];

	it.each([
		"scope-id",
		"scope-path",
	])("serves scope BODY[] identified by %s without adding Seen", async (identity) => {
		const budget = new ContentBudget(1024, 50);
		const { handlers, mailbox, session, store } = createHarness(
			"read_write",
			"scope",
			budget,
		);
		if (identity === "scope-id") mailbox.path = "Scoped view";
		else mailbox.scopeId = null;
		const [opened] = await callbackResult((callback) =>
			handlers.onOpen(mailbox.path, session, callback),
		);
		const selected = opened as { _id: string; path: string; readOnly: boolean };
		session.selected = {
			mailbox: selected._id,
			path: selected.path,
			readOnly: selected.readOnly,
		};
		let message: { flags?: string[]; raw?: unknown } | undefined;
		session.getQueryResponse = (_query, data) => {
			message = data as typeof message;
			return [];
		};
		const [success] = await callbackResult((callback) =>
			handlers.onFetch(
				mailbox.id,
				{
					messages: [1],
					query: bodyQuery,
					metadataOnly: false,
					markAsSeen: true,
					isUid: true,
				},
				session,
				callback,
			),
		);
		expect(selected.readOnly).toBe(true);
		expect(success).toBe(true);
		expect(Buffer.isBuffer(message?.raw)).toBe(true);
		expect(message?.flags).toEqual([]);
		expect(store.addFlag).not.toHaveBeenCalled();
		expect(budget.used).toBe(0);
	});

	it("passes stored bytes to the response builder and releases the budget", async () => {
		const budget = new ContentBudget(1024, 50);
		const { handlers, mailbox, session, store } = createHarness(
			"read",
			null,
			budget,
		);
		let message: { raw?: unknown } | undefined;
		session.getQueryResponse = (_query, data) => {
			message = data as { raw?: unknown };
			return [];
		};
		const [success] = await callbackResult((callback) => {
			handlers.onFetch(
				mailbox.id,
				{
					messages: [1],
					query: bodyQuery,
					metadataOnly: false,
					markAsSeen: false,
					isUid: true,
				},
				session,
				callback,
			);
		});

		expect(success).toBe(true);
		expect(Buffer.isBuffer(message?.raw)).toBe(true);
		expect(store.getRawContent).toHaveBeenCalledTimes(1);
		expect(budget.used).toBe(0);
	});

	it("releases the budget when the client disconnects mid-response", async () => {
		const budget = new ContentBudget(1024, 50);
		const { handlers, mailbox, session } = createHarness("read", null, budget);
		const socket = Object.assign(new EventEmitter(), {
			destroyed: false,
			writableNeedDrain: false,
			destroy: () => undefined,
		});
		session.socket = socket;
		session.writeStream = { write: () => undefined };
		const pending = callbackResult((callback) => {
			handlers.onFetch(
				mailbox.id,
				{
					messages: [1],
					query: bodyQuery,
					metadataOnly: false,
					markAsSeen: false,
					isUid: true,
				},
				session,
				callback,
			);
		}).catch((err: unknown) => err);
		await Bun.sleep(5);
		expect(budget.used).toBeGreaterThan(0);
		socket.emit("close");
		expect(await pending).toBeInstanceOf(Error);
		expect(budget.used).toBe(0);
	});

	it("disconnects a client that stops reading a FETCH response and releases the budget", async () => {
		const budget = new ContentBudget(1024, 50);
		const { handlers, mailbox, session } = createHarness(
			"read",
			null,
			budget,
			40,
		);
		let destroyed = false;
		const socket = Object.assign(new EventEmitter(), {
			destroyed: false,
			writableNeedDrain: true,
			destroy: () => {
				destroyed = true;
				socket.destroyed = true;
			},
		});
		session.socket = socket;
		// The response never finishes piping into a socket whose peer stopped reading.
		session.writeStream = { write: () => undefined };
		const pending = callbackResult((callback) => {
			handlers.onFetch(
				mailbox.id,
				{
					messages: [1],
					query: bodyQuery,
					metadataOnly: false,
					markAsSeen: false,
					isUid: true,
				},
				session,
				callback,
			);
		}).catch((err: unknown) => err);
		await Bun.sleep(25);
		socket.emit("drain");
		await Bun.sleep(25);
		expect(destroyed).toBe(false);
		expect(budget.used).toBeGreaterThan(0);

		expect(await pending).toBeInstanceOf(Error);
		expect(destroyed).toBe(true);
		expect(budget.used).toBe(0);
		expect(socket.listenerCount("drain")).toBe(0);
		expect(socket.listenerCount("close")).toBe(0);
	});

	it("answers NO [LIMIT] instead of loading content beyond the in-flight budget", async () => {
		const budget = new ContentBudget(20, 10);
		const held = await budget.acquire(20);
		const { handlers, mailbox, session, store } = createHarness(
			"read",
			null,
			budget,
		);
		const error = await callbackResult((callback) => {
			handlers.onFetch(
				mailbox.id,
				{
					messages: [1],
					query: bodyQuery,
					metadataOnly: false,
					markAsSeen: false,
					isUid: true,
				},
				session,
				callback,
			);
		}).catch((err: unknown) => err);

		expect((error as { imapCode?: string }).imapCode).toBe("LIMIT");
		expect(store.getRawContent).not.toHaveBeenCalled();
		held();
		expect(budget.used).toBe(0);
	});
});

describe("backend error mapping", () => {
	it("rejects managed-folder CREATE before SQL and reports existing custom folders", async () => {
		const { handlers, session, store } = createHarness("read_write");
		for (const path of [
			"inbox",
			"Sent",
			"Drafts",
			"Trash",
			"Junk",
			"Archive",
			"Scopes",
			"Scopes/user@example.com",
		]) {
			const [result] = await callbackResult((callback) =>
				handlers.onCreate(path, session, callback),
			);
			expect(result).toBe("CANNOT");
		}
		expect(store.createMailbox).not.toHaveBeenCalled();
		store.createMailbox.mockImplementation(async () => false);
		const [result] = await callbackResult((callback) =>
			handlers.onCreate("Projects", session, callback),
		);
		expect(result).toBe("ALREADYEXISTS");
	});

	it("maps invalid CREATE paths and expected SQL folder refusals to CANNOT", async () => {
		const { handlers, session, store } = createHarness("read_write");
		const invalid = await callbackResult((callback) =>
			handlers.onCreate("Projects//Invalid", session, callback),
		).catch((err: unknown) => err);
		expect(invalid).toMatchObject({ code: "CANNOT" });
		expect(store.createMailbox).not.toHaveBeenCalled();
		for (const message of [
			"Invalid mailbox path",
			"Special mailboxes are managed",
			"Scope mailboxes are managed",
		]) {
			store.createMailbox.mockImplementation(async () => {
				throw Object.assign(new Error(message), { code: "P0001" });
			});
			const error = await callbackResult((callback) =>
				handlers.onCreate("Projects", session, callback),
			).catch((err: unknown) => err);
			expect(error).toMatchObject({ code: "CANNOT" });
		}
	});

	it("maps rejected descendant rename paths to CANNOT and collisions to ALREADYEXISTS", async () => {
		const { handlers, session, store } = createHarness("read_write");
		store.getMailboxByPath.mockImplementation(async () => null);
		for (const [code, message, expected] of [
			["P0001", "Invalid destination path", "CANNOT"],
			["23505", "private unique constraint", "ALREADYEXISTS"],
		]) {
			store.renameMailbox.mockImplementation(async () => {
				throw Object.assign(new Error(message), { code });
			});
			const error = await callbackResult((callback) =>
				handlers.onRename("Projects", "Clients", session, callback),
			).catch((err: unknown) => err);
			expect(error).toMatchObject({ code: expected });
			expect((error as Error).message).not.toContain(message ?? "private");
		}
	});

	it("never exposes raw Postgres codes or messages", () => {
		const unique = Object.assign(
			new Error('duplicate key value violates "x"'),
			{
				code: "23505",
			},
		);
		const timeout = Object.assign(new Error("canceling statement"), {
			code: "57014",
		});
		const mapped = toImapError(unique) as Error & { code: string };
		expect(mapped.code).toBe("SERVERBUG");
		expect(mapped.message).not.toContain("duplicate");
		expect((toImapError(timeout) as Error & { code: string }).code).toBe(
			"TEMPFAIL",
		);
		expect(
			(
				toImapError(
					Object.assign(new Error("x"), { code: "08006" }),
				) as Error & {
					code: string;
				}
			).code,
		).toBe("TEMPFAIL");
	});
});

describe("LOGIN accounting", () => {
	it("counts malformed usernames against the IP only and remembers valid sessions", async () => {
		const limits = new ConnectionLimits(5, 10, 60_000, 10);
		const remembered: unknown[] = [];
		const handlers = buildHandlers(
			{
				authenticate: async () => ({
					userId: "user",
					credentialId: "credential",
					loginAddress: "user@example.com",
					accessMode: "read" as const,
					scopes: [],
				}),
			} as unknown as ApiAuth,
			{} as MailStore,
			limits,
			{
				sessions: {
					remember: (session: unknown) => remembered.push(session),
				} as never,
			},
		);
		const session = { remoteAddress: "192.0.2.9" } as Session;
		const [malformed] = await callbackResult((callback) =>
			handlers.onAuth(
				{ username: "junk\r\nforged", password: "x" },
				session,
				callback,
			),
		);
		expect(malformed).toBeUndefined();
		const records = limits as unknown as { failures: Map<string, unknown> };
		expect(records.failures.size).toBe(0);

		const [result] = await callbackResult((callback) =>
			handlers.onAuth(
				{ username: "User@Example.com", password: "secret" },
				session,
				callback,
			),
		);
		expect(result).toMatchObject({ user: { userId: "user" } });
		expect(remembered).toEqual([session]);
	});
});
