import { describe, expect, it, mock } from "bun:test";
import type { AuthenticatedMailbox } from "./auth.ts";
import {
	AppendQuotaError,
	MailboxResyncError,
	type JournalEntry,
	type MailboxRow,
	MailStore,
} from "./db.ts";
import {
	normalizeFlags,
	normalizeMailboxPath,
	isProtectedMailboxPath,
	SPECIAL_USE,
} from "./mailbox-rules.ts";
import { PgNotifier } from "./notifier.ts";

interface SqlRequest {
	statement: string;
	values: unknown[];
}

const principal: AuthenticatedMailbox = {
	userId: "user",
	credentialId: "credential",
	loginAddress: "user@example.com",
	accessMode: "read_write",
	scopes: [
		{
			id: "address-scope",
			type: "address",
			domainId: "domain",
			domain: "example.com",
			address: "User@Example.com",
		},
		{
			id: "domain-scope",
			type: "domain",
			domainId: "domain",
			domain: "Example.com",
			address: null,
		},
	],
};

const storedMailbox = {
	id: "inbox",
	address: "user@example.com",
	path: "INBOX",
	uid_validity: 1,
	uid_next: 1,
	modseq: 0,
	credential_id: "credential",
	scope_id: null,
	subscribed: true,
};

const mailbox: MailboxRow = {
	id: "inbox",
	address: "user@example.com",
	path: "INBOX",
	uidValidity: 1,
	uidNext: 1,
	modseq: 0,
	credentialId: "credential",
	scopeId: null,
	subscribed: true,
};

const fragment = Symbol("fragment");

function createStore(respond?: (request: SqlRequest) => unknown[]) {
	const requests: SqlRequest[] = [];
	function execute(
		strings: TemplateStringsArray,
		...inputs: unknown[]
	): unknown {
		let statement = strings[0] ?? "";
		const values: unknown[] = [];
		inputs.forEach((input, index) => {
			const nested = (input as { [fragment]?: SqlRequest } | null)?.[fragment];
			if (nested) {
				statement += nested.statement;
				values.push(...nested.values);
			} else {
				statement += "?";
				values.push(input);
			}
			statement += strings[index + 1] ?? "";
		});
		const request = { statement, values };
		return {
			[fragment]: request,
			then: (
				resolve: (rows: unknown[]) => unknown,
				reject: (error: unknown) => unknown,
			) =>
				Promise.resolve()
					.then(() => {
						requests.push(request);
						return respond?.(request) ?? [];
					})
					.then(resolve, reject),
		};
	}
	const store = new MailStore("postgres://localhost/inbound", {
		appendMaxBytesPerUser: 1024,
		appendMaxMessagesPerUser: 10,
	});
	Object.assign(store, { sql: execute });
	return { store, requests };
}

describe("MailStore function boundary", () => {
	it("uses the shared ensure result for defaults and scope folders", async () => {
		const { store, requests } = createStore(() => [
			storedMailbox,
			{ ...storedMailbox, id: "archive", path: "Archive" },
			{
				...storedMailbox,
				id: "scope",
				path: "Scopes/user@example.com",
				scope_id: "scope",
			},
		]);
		expect(
			(await store.ensureDefaultMailboxes(principal)).map((row) => row.path),
		).toEqual(["INBOX", "Archive"]);
		expect(
			(await store.ensureScopeMailboxes(principal)).map((row) => row.id),
		).toEqual(["scope"]);
		for (const request of requests)
			expect(request.values).toEqual(["user", "credential"]);
	});

	it("syncs through the database's owned mailbox function", async () => {
		const { store, requests } = createStore(() => [
			{ ...storedMailbox, uid_next: 3 },
		]);
		expect(await store.syncMailbox(mailbox, principal)).toBe(2);
		expect(requests[0]?.values).toEqual(["user", "credential", "inbox"]);
	});

	it("maps persisted flags and passes normalized flags with both ownership keys", async () => {
		const { store, requests } = createStore(() => [
			{ uid: 2, flags: '["\\\\Seen"]' },
		]);
		expect(
			await store.updateFlags(principal, "inbox", [2], "add", [
				"\\seen",
				"\\Seen",
				"\\Recent",
			]),
		).toEqual([{ uid: 2, flags: ["\\Seen"] }]);
		expect(requests[0]?.values).toEqual([
			"user",
			"credential",
			"inbox",
			[2],
			"add",
			["\\Seen"],
		]);
	});

	it("uses one atomic transfer and includes removed UIDs whose destination was already present", async () => {
		const { store, requests } = createStore(({ statement }) =>
			statement.includes("FROM imap_mailbox_expunges")
				? [{ uid: 2 }, { uid: 5 }]
				: [{ source_uid: 2, destination_uid: 9 }],
		);
		const destination = {
			...mailbox,
			id: "archive",
			path: "Archive",
			uidValidity: 8,
		};
		expect(
			await store.moveMessages(principal, "inbox", destination, [2, 5]),
		).toEqual({
			uidValidity: 8,
			sourceUid: [2],
			destinationUid: [9],
			expunged: [2, 5],
		});
		expect(requests).toHaveLength(2);
		expect(requests[0]?.values).toEqual([
			"user",
			"credential",
			"inbox",
			"archive",
			[2, 5],
			true,
		]);
		await store.copyMessages(principal, "inbox", destination, [2]);
		expect(requests[2]?.values).toEqual([
			"user",
			"credential",
			"inbox",
			"archive",
			[2],
			false,
		]);
	});

	it("distinguishes Deleted-only EXPUNGE from explicit forced removal", async () => {
		const { store, requests } = createStore(() => [{ uid: 5 }, { uid: 2 }]);
		expect(await store.expunge(principal, "inbox")).toEqual([2, 5]);
		await store.expunge(principal, "inbox", [2]);
		await store.deleteMessages(principal, "inbox", [5]);
		expect(requests.map((request) => request.values)).toEqual([
			["user", "credential", "inbox", null, false],
			["user", "credential", "inbox", [2], false],
			["user", "credential", "inbox", [5], true],
		]);
	});

	it("passes APPEND quotas and returns database UIDVALIDITY", async () => {
		const { store, requests } = createStore(() => [
			{ uid: 4, uid_validity: 3 },
		]);
		const date = new Date(0);
		expect(
			await store.appendMessage(mailbox, principal, "raw", ["\\seen"], date),
		).toEqual({ uid: 4, uidValidity: 3 });
		expect(requests[0]?.values).toEqual([
			"user",
			"credential",
			"inbox",
			"raw",
			["\\Seen"],
			date.toISOString(),
			1024,
			10,
		]);
		const quota = createStore(() => {
			throw new Error("APPEND quota exceeded");
		});
		await expect(
			quota.store.appendMessage(mailbox, principal, "raw", [], date),
		).rejects.toBeInstanceOf(AppendQuotaError);
	});

	it("persists folder mutations and subscription changes through the same function", async () => {
		const { store, requests } = createStore(() => [storedMailbox]);
		expect(await store.createMailbox(principal, "Projects")).toBe(true);
		expect(await store.renameMailbox(principal, "Projects", "Clients")).toBe(
			true,
		);
		expect(await store.deleteMailbox(principal, "Clients")).toBe(true);
		expect(await store.subscribeMailbox(principal, "inbox", false)).toBe(true);
		expect(requests.map((request) => request.values)).toEqual([
			["user", "credential", "create", "Projects", null, null],
			["user", "credential", "rename", "Projects", "Clients", null],
			["user", "credential", "delete", "Clients", null, null],
			["user", "credential", "subscribe", "INBOX", null, false],
		]);
	});
});

describe("MailStore reads and persistent updates", () => {
	it("delegates raw structured content visibility to the shared authorization function", async () => {
		const { store, requests } = createStore(() => [{ raw_content: "message" }]);
		expect(
			(
				await store.getRawContent("message", "structured", principal)
			)?.toString(),
		).toBe("message");
		expect(requests[0]?.statement).toContain("imap_visible");
		expect(requests[0]?.values).toEqual([
			"message",
			"user",
			"user",
			"credential",
		]);
	});

	it("preserves appended-message ownership checks", async () => {
		const { store, requests } = createStore(() => [{ raw_content: "message" }]);
		expect(
			(await store.getRawContent("message", "appended", principal))?.toString(),
		).toBe("message");
		expect(requests[0]?.values).toEqual(["message", "user"]);
		expect(requests[0]?.statement).not.toContain("guard_blocked");
	});

	it("scopes mailbox-id reads to both user and credential", async () => {
		const { store, requests } = createStore();
		await store.searchMessages(principal, "inbox", []);
		await store.listMessages(principal, "inbox", [1]);
		await store.listUids(principal, "inbox");
		await store.countMessages(principal, "inbox");
		await store.unseenCount(principal, "inbox");
		for (const request of requests) {
			expect(request.values).toContain("user");
			expect(request.values).toContain("credential");
		}
	});

	it("returns EXISTS, flags FETCH, and durable EXPUNGE with distinct revision keys", async () => {
		const updates = [
			{ expunge_floor: 2, command: "EXISTS", uid: 8, modseq: 5, flags: "[]" },
			{
				expunge_floor: 2,
				command: "FETCH",
				uid: 3,
				modseq: 6,
				flags: '["\\\\Seen"]',
			},
			{ expunge_floor: 2, command: "EXPUNGE", uid: 1, modseq: 7, flags: null },
		];
		const first = createStore(() => updates);
		const restarted = createStore(() => updates);
		const expected: JournalEntry[] = [
			{ command: "EXISTS", uid: 8, modseq: 5, _id: "inbox:8:5" },
			{
				command: "FETCH",
				uid: 3,
				modseq: 6,
				_id: "inbox:3:6",
				flags: ["\\Seen"],
			},
			{ command: "EXPUNGE", uid: 1, modseq: 7, _id: "inbox:1:7" },
		];
		expect(await first.store.getUpdatesSince(principal, "inbox", 2)).toEqual(
			expected,
		);
		expect(
			await restarted.store.getUpdatesSince(principal, "inbox", 2),
		).toEqual(expected);
	});

	it("requires resync only below the retained tombstone floor or after mailbox removal", async () => {
		const { store } = createStore(() => [
			{ expunge_floor: 5, command: null, uid: null, modseq: null, flags: null },
		]);
		await expect(
			store.getUpdatesSince(principal, "inbox", 4),
		).rejects.toBeInstanceOf(MailboxResyncError);
		expect(await store.getUpdatesSince(principal, "inbox", 5)).toEqual([]);
		await expect(
			createStore().store.getUpdatesSince(principal, "inbox", 5),
		).rejects.toBeInstanceOf(MailboxResyncError);
	});
});

describe("shared mailbox rules", () => {
	it("canonicalizes system flags, drops Recent, and deduplicates case-insensitively", () => {
		expect(
			normalizeFlags([
				"\\seen",
				"\\Seen",
				"\\RECENT",
				"Tag",
				"tag",
				"\\flagged",
			]),
		).toEqual(["\\Seen", "Tag", "\\Flagged"]);
		expect(() => normalizeFlags(["\\Unknown"])).toThrow();
		expect(() => normalizeFlags(["two words"])).toThrow();
	});

	it("normalizes INBOX, protects managed folders, and rejects invalid paths", () => {
		expect(normalizeMailboxPath("inbox")).toBe("INBOX");
		expect(normalizeMailboxPath("Projects/Client")).toBe("Projects/Client");
		for (const path of ["", "../Inbox", "Projects//Client", "Inbox\r\n"])
			expect(() => normalizeMailboxPath(path)).toThrow();
		for (const path of ["INBOX", "Archive", "Scopes", "Scopes/a@example.com"])
			expect(isProtectedMailboxPath(path)).toBe(true);
		expect(SPECIAL_USE.Archive).toBe("\\Archive");
	});
});

function notifierHarness(sync?: () => Promise<number>) {
	const store = {
		getMailboxByPath: mock(
			async (_user: AuthenticatedMailbox, path: string) => ({
				...mailbox,
				path,
			}),
		),
		syncMailbox: mock(sync ?? (async () => 0)),
		getUpdatesSince: mock(
			async () => [] as Awaited<ReturnType<MailStore["getUpdatesSince"]>>,
		),
	};
	const notifier = new PgNotifier(
		"postgres://localhost/inbound",
		store as unknown as MailStore,
	);
	const callbacks = new Map<string, (payload: string) => void>();
	Object.assign(notifier, {
		sql: {
			listen: async (channel: string, callback: (payload: string) => void) => {
				callbacks.set(channel, callback);
			},
			end: async () => undefined,
		},
	});
	return { notifier, store, callbacks };
}

describe("Postgres notifications", () => {
	it("routes credential state changes without sync and user changes across secondary recipients", async () => {
		const { notifier, store, callbacks } = notifierHarness();
		const wake = mock(() => undefined);
		const other = mock(() => undefined);
		notifier.addListener({ user: principal }, wake);
		notifier.addListener(
			{ user: { ...principal, credentialId: "second", scopes: [] } },
			wake,
		);
		notifier.addListener(
			{ user: { ...principal, userId: "other", credentialId: "other" } },
			other,
		);
		await notifier.start();
		try {
			expect(callbacks.has("imap_changed")).toBe(false);
			callbacks.get("imap_state_changed")?.("cred:credential");
			await Bun.sleep(0);
			expect(wake).toHaveBeenCalledTimes(1);
			expect(store.syncMailbox).not.toHaveBeenCalled();
			callbacks.get("imap_received_changed")?.(
				JSON.stringify({ userId: "user" }),
			);
			await Bun.sleep(0);
			expect(wake).toHaveBeenCalledTimes(3);
			expect(other).not.toHaveBeenCalled();
			expect(store.syncMailbox).toHaveBeenCalledTimes(6);
		} finally {
			await notifier.stop();
		}
	});

	it("coalesces a credential's sessions and reruns when received work arrives mid-sync", async () => {
		let release: (() => void) | undefined;
		let entered: (() => void) | undefined;
		const started = new Promise<void>((resolve) => {
			entered = resolve;
		});
		let calls = 0;
		let active = 0;
		let peak = 0;
		const { notifier, callbacks, store } = notifierHarness(async () => {
			active++;
			peak = Math.max(peak, active);
			if (++calls === 1) {
				entered?.();
				await new Promise<void>((resolve) => {
					release = resolve;
				});
			}
			active--;
			return 0;
		});
		const wake = mock(() => undefined);
		notifier.addListener({ user: principal }, wake);
		notifier.addListener({ user: principal }, wake);
		await notifier.start();
		try {
			callbacks.get("imap_received_changed")?.("user:user");
			await started;
			callbacks.get("imap_received_changed")?.("user:user");
			callbacks.get("imap_received_changed")?.("user:user");
			callbacks.get("imap_state_changed")?.("cred:credential");
			release?.();
			await Bun.sleep(0);
			expect(peak).toBe(1);
			expect(store.syncMailbox).toHaveBeenCalledTimes(5);
			expect(wake).toHaveBeenCalledTimes(4);
		} finally {
			release?.();
			await notifier.stop();
		}
	});

	it("filters received changes by recipient and domain before scheduling credentials and views", async () => {
		const { notifier, store, callbacks } = notifierHarness();
		const wake = mock(() => undefined);
		const unrelated = mock(() => undefined);
		notifier.addListener({ user: principal }, wake);
		notifier.addListener({ user: principal }, wake);
		for (let index = 0; index < 100; index++) {
			notifier.addListener(
				{
					user: {
						...principal,
						credentialId: `unrelated-${index}`,
						scopes: [
							{
								...principal.scopes[0]!,
								address: `user${index}@other.example`,
							},
						],
					},
				},
				unrelated,
			);
		}
		notifier.addListener(
			{ user: { ...principal, userId: "other-owner" } },
			unrelated,
		);
		await notifier.start();
		try {
			callbacks.get("imap_received_changed")?.(
				JSON.stringify({
					userId: "user",
					addresses: ["secondary@example.com"],
				}),
			);
			await Bun.sleep(0);
			expect(store.getMailboxByPath.mock.calls.map((call) => call[1])).toEqual([
				"INBOX",
				"Junk",
				"Scopes/*@Example.com",
			]);
			expect(wake).toHaveBeenCalledTimes(2);
			expect(unrelated).not.toHaveBeenCalled();
			store.getMailboxByPath.mockClear();
			callbacks.get("imap_received_changed")?.(
				JSON.stringify({
					userId: "user",
					addresses: ["USER@EXAMPLE.COM", "secondary@example.com"],
				}),
			);
			await Bun.sleep(0);
			expect(store.getMailboxByPath.mock.calls.map((call) => call[1])).toEqual([
				"INBOX",
				"Junk",
				"Scopes/User@Example.com",
				"Scopes/*@Example.com",
			]);
			expect(unrelated).not.toHaveBeenCalled();
			store.getMailboxByPath.mockClear();
			for (const payload of [
				"not-json",
				"null",
				JSON.stringify({ userId: "user", addresses: [] }),
				JSON.stringify({ userId: "user", addresses: ["user@notexample.com"] }),
			]) {
				callbacks.get("imap_received_changed")?.(payload);
			}
			await Bun.sleep(0);
			expect(store.getMailboxByPath).not.toHaveBeenCalled();
		} finally {
			await notifier.stop();
		}
	});

	it("delivers stale-cursor DROP through the listener, not the journal", async () => {
		const { notifier, store } = notifierHarness();
		const session = { user: principal, selected: { mailbox: "inbox" } };
		const wake = mock(() => undefined);
		notifier.addListener(session, wake);
		store.getUpdatesSince.mockImplementation(async () => {
			throw new MailboxResyncError("expired");
		});
		const updates = await new Promise<unknown>((resolve, reject) => {
			notifier.getUpdates(
				"inbox",
				0,
				(err, rows) => (err ? reject(err) : resolve(rows)),
				session,
			);
		});
		expect(updates).toEqual([]);
		expect(wake).toHaveBeenCalledWith({ command: "DROP", mailbox: "inbox" });
	});

	it("serializes overlapping journal reads against the core's updated selected cursor", async () => {
		const { notifier, store } = notifierHarness();
		const session = {
			user: principal,
			selected: { mailbox: "inbox", modifyIndex: 1 },
		};
		const cursors: number[] = [];
		Object.assign(store, {
			getUpdatesSince: async (
				_owner: unknown,
				_mailbox: string,
				since: number,
			) => {
				cursors.push(since);
				await Bun.sleep(0);
				return since < 2
					? [{ command: "EXISTS", uid: 2, modseq: 2, _id: "inbox:2:2" }]
					: [];
			},
		});
		const receive = () =>
			new Promise<unknown>((resolve, reject) => {
				notifier.getUpdates(
					"inbox",
					1,
					(err, updates) => {
						if (err) return reject(err);
						const rows = updates as JournalEntry[];
						if (rows.length)
							session.selected.modifyIndex = rows[rows.length - 1]?.modseq ?? 1;
						resolve(rows);
					},
					session,
				);
			});
		const results = await Promise.all([receive(), receive()]);
		expect(cursors).toEqual([1, 2]);
		expect(results[0]).toEqual([
			{ command: "EXISTS", uid: 2, modseq: 2, _id: "inbox:2:2" },
		]);
		expect(results[1]).toEqual([]);
	});
});
