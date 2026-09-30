import { describe, expect, it, mock } from "bun:test";
import type { ApiAuth, AuthenticatedMailbox } from "./auth.ts";
import type { MailboxRow, MailStore } from "./db.ts";
import { buildHandlers } from "./handlers.ts";
import type { ConnectionLimits } from "./limits.ts";

type Handlers = ReturnType<typeof buildHandlers>;
type Session = Parameters<Handlers["onOpen"]>[1];

function createHarness(
	accessMode: AuthenticatedMailbox["accessMode"],
	scopeId: string | null = null,
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
		listMessages: mock(async () => [
			{
				uid: 1,
				structuredEmailId: "message",
				rawSource: "structured",
				flags: [],
				internalDate: new Date(),
				size: 10,
			},
		]),
		addFlag: mock(async () => undefined),
		updateFlags: mock(async () => [] as Array<{ uid: number; flags: string[] }>),
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
			readOnly: Boolean(scopeId),
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
		["read", null],
		["read_write", "scope"],
	] as const)("opens %s credentials and scope folders read-only", async (mode, scopeId) => {
		const { handlers, mailbox, session } = createHarness(mode, scopeId);
		const [selected] = await callbackResult((callback) => {
			handlers.onOpen(mailbox.path, session, callback);
		});
		expect(selected).toMatchObject({ readOnly: true });
	});

	it("rejects STORE, EXPUNGE, and MOVE from read-only scope folders", async () => {
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

		expect([stored, expunged, moved]).toEqual([
			"READ-ONLY",
			"READ-ONLY",
			"READ-ONLY",
		]);
		expect(store.updateFlags).not.toHaveBeenCalled();
		expect(store.expunge).not.toHaveBeenCalled();
		expect(store.copyMessages).not.toHaveBeenCalled();
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

	it("rejects CLOSE-style expunges of scoped or mismatched mailboxes", async () => {
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
		expect(store.deleteMessages).toHaveBeenCalledWith(mailbox.id, [1]);
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

		expect(written).toEqual([
			{ uid: 1, data: { uid: 1, flags: ["\\Seen"] } },
		]);
	});

	it.each([
		["read", null],
		["read_write", "scope"],
	] as const)("never marks messages seen for %s read-only selections", async (mode, scopeId) => {
		const { handlers, mailbox, session, store } = createHarness(mode, scopeId);
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
