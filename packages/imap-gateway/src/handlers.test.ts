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
		ensureDefaultMailboxes: mock(async () => [mailbox]),
		ensureScopeMailboxes: mock(async () => []),
		getMailboxByPath: mock(
			async (_principal: AuthenticatedMailbox, path: string) =>
				path === "Archive" ? destination : mailbox,
		),
		syncMailbox: mock(async () => 0),
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
			readOnly: accessMode !== "read_write",
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
	it.each([
		["read", null, true],
		["read_write", "scope", false],
	] as const)("opens %s credential folders with readOnly=%s for scope %s", async (mode, scopeId, readOnly) => {
		const { handlers, mailbox, session } = createHarness(mode, scopeId);
		const [selected] = await callbackResult((callback) => {
			handlers.onOpen(mailbox.path, session, callback);
		});
		expect(selected).toMatchObject({ readOnly });
	});

	it("allows STORE, EXPUNGE, and MOVE from scope folders", async () => {
		const { handlers, mailbox, session, store } = createHarness(
			"read_write",
			"scope",
		);
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

		expect([stored, expunged, moved]).toEqual([true, true, true]);
		expect(store.updateFlags).toHaveBeenCalledTimes(1);
		expect(store.expunge).toHaveBeenCalledTimes(1);
		expect(store.deleteMessages).toHaveBeenCalledWith(
			session.user,
			mailbox.id,
			[1],
		);
	});

	it("moves INBOX messages into Junk by copying before deleting, so the copy keeps the message", async () => {
		const { handlers, mailbox, session, store } = createHarness("read_write");
		const junk: MailboxRow = { ...mailbox, id: "junk", path: "Junk" };
		store.getMailboxByPath.mockImplementation(async () => junk);
		const order: string[] = [];
		store.copyMessages.mockImplementation(async () => {
			order.push("copy");
			return { uidValidity: 1, sourceUid: [1], destinationUid: [1] };
		});
		store.deleteMessages.mockImplementation(async () => {
			order.push("delete");
			return [1];
		});
		const [moved] = await callbackResult((callback) => {
			handlers.onMove(
				mailbox.id,
				{ destination: "Junk", messages: [1] },
				session,
				callback,
			);
		});

		expect(moved).toBe(true);
		expect(order).toEqual(["copy", "delete"]);
		expect(store.copyMessages).toHaveBeenCalledWith(
			session.user,
			mailbox.id,
			junk,
			[1],
		);
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
		expect(store.copyMessages).not.toHaveBeenCalled();
	});

	it("refuses MOVE from a scope folder into INBOX, which already holds the message", async () => {
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

		expect(result).toBe("CANNOT");
		expect(store.deleteMessages).not.toHaveBeenCalled();
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

	it("allows CLOSE-style expunges of scope folders but not mismatched mailboxes", async () => {
		const scoped = createHarness("read_write", "scope");
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

		expect(scopeResult).toBe(true);
		expect(mismatchResult).toBe("READ-ONLY");
		expect(scoped.store.expunge).toHaveBeenCalledTimes(1);
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
		store.deleteMessages.mockImplementation(async () => [1]);
		store.copyMessages.mockImplementation(async () => ({
			uidValidity: 1,
			sourceUid: [],
			destinationUid: [],
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
		expect(store.deleteMessages).toHaveBeenCalledWith(
			session.user,
			mailbox.id,
			[1],
		);
		expect(notifications).toEqual([
			{ command: "EXPUNGE", uid: 2 },
			{ command: "EXPUNGE", uid: 5 },
			{ command: "EXPUNGE", uid: 1 },
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
		expect(store.deleteMessages).not.toHaveBeenCalled();
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
	it("never exposes raw Postgres codes or messages", () => {
		const unique = Object.assign(new Error('duplicate key value violates "x"'), {
			code: "23505",
		});
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
				toImapError(Object.assign(new Error("x"), { code: "08006" })) as Error & {
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
