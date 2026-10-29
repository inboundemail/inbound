import { describe, expect, it } from "bun:test";
import type { AuthenticatedMailbox } from "./auth.ts";
import { ExpungeJournal, type MailboxRow, MailStore } from "./db.ts";

interface SqlRequest {
	statement: string;
	values: unknown[];
}

interface SqlStub {
	<T extends readonly object[]>(
		strings: TemplateStringsArray,
		...values: unknown[]
	): Promise<T>;
	begin: <T>(callback: (transaction: SqlStub) => Promise<T>) => Promise<T>;
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

const mailbox: MailboxRow = {
	id: "inbox",
	address: "user@example.com",
	path: "INBOX",
	uidValidity: 1,
	uidNext: 1,
	modseq: 0,
	credentialId: "credential",
	scopeId: null,
};

const fragment = Symbol("fragment");

function createStore(
	respond?: (statement: string) => unknown[] | undefined,
): { store: MailStore; requests: SqlRequest[] } {
	const requests: SqlRequest[] = [];
	function execute<T extends readonly object[]>(
		strings: TemplateStringsArray,
		...inputs: unknown[]
	): Promise<T> {
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
		const result = () => {
			requests.push({ statement, values });
			const custom = respond?.(statement);
			if (custom) return custom;
			if (/SELECT id FROM imap_mailboxes\s+WHERE id = \?/.test(statement)) {
				return [{ id: "owned" }];
			}
			if (statement.includes("SELECT uid_next, modseq")) {
				return [
					{ uid_next: 1, modseq: 0, id: "inbox", path: "INBOX" },
					{ uid_next: 1, modseq: 0, id: "junk", path: "Junk" },
				];
			}
			if (statement.includes("raw_content FROM")) {
				return [{ raw_content: "message" }];
			}
			return [];
		};
		return {
			[fragment]: { statement, values },
			then: (resolve: (value: T) => unknown, reject: (err: unknown) => unknown) =>
				Promise.resolve()
					.then(result)
					.then((rows) => resolve(rows as unknown as T), reject),
		} as unknown as Promise<T>;
	}
	const sql: SqlStub = Object.assign(execute, {
		begin: <T>(callback: (transaction: SqlStub) => Promise<T>) => callback(sql),
	});
	const store = new MailStore("postgres://localhost/inbound", {
		appendMaxBytesPerUser: 1024,
		appendMaxMessagesPerUser: 10,
	});
	Object.assign(store, { sql });
	return { store, requests };
}

describe("MailStore Guard and scope enforcement", () => {
	it("excludes Guard-blocked messages from sync and matches envelope recipients", async () => {
		const { store, requests } = createStore();
		await store.syncMailbox(mailbox, principal);
		const sync = requests.find((request) =>
			request.statement.includes("WITH new_msgs AS"),
		);
		expect(sync?.statement).toContain("se.guard_blocked IS NOT TRUE");
		expect(sync?.statement).toContain("se.envelope_recipients");
	});

	it("restricts structured raw content to unblocked, currently authorized scopes", async () => {
		const { store, requests } = createStore();
		expect(
			(await store.getRawContent("message", "structured", principal))?.toString(),
		).toBe("message");
		const request = requests[0];
		expect(request?.statement).toContain("guard_blocked IS NOT TRUE");
		expect(request?.statement).toContain("lower(se.recipient) = ANY");
		expect(request?.statement).toContain("se.envelope_recipients");
		expect(request?.values).toContainEqual(["user@example.com"]);
		expect(request?.values).toContainEqual(["example.com"]);
	});

	it("preserves appended-message ownership checks without applying structured scopes", async () => {
		const { store, requests } = createStore();
		expect(
			(await store.getRawContent("message", "appended", principal))?.toString(),
		).toBe("message");
		expect(requests[0]?.statement).toContain("FROM imap_appended_messages");
		expect(requests[0]?.statement).not.toContain("guard_blocked");
		expect(requests[0]?.values).toContain("user");
	});

	it("reconciles structured mappings in every credential-owned folder when scopes are revoked", async () => {
		const { store, requests } = createStore();
		await store.ensureScopeMailboxes({ ...principal, scopes: [] });
		const reconciliation = requests.find((request) =>
			request.statement.includes("DELETE FROM imap_mailbox_messages mm"),
		);
		expect(reconciliation?.statement).not.toContain("mb.path = 'INBOX'");
		expect(reconciliation?.statement).toContain("mb.credential_id = ?");
		expect(reconciliation?.statement).toContain("mb.user_id = ?");
		expect(reconciliation?.statement).toContain("mm.raw_source = 'structured'");
		expect(reconciliation?.statement).not.toContain(
			"mm.raw_source = 'appended'",
		);
		expect(reconciliation?.statement).toContain(
			"NOT (se.guard_blocked IS NOT TRUE",
		);
		expect(reconciliation?.statement).toContain("se.envelope_recipients");
		expect(reconciliation?.values).toContain("credential");
		expect(reconciliation?.values).toContain("user");
		expect(
			requests.some((request) =>
				request.statement.includes("DELETE FROM structured_emails"),
			),
		).toBe(false);
	});
});

describe("MailStore tenant isolation", () => {
	it("scopes mailbox-id queries to the session's user and credential", async () => {
		const { store, requests } = createStore();
		const owner = { userId: "user", credentialId: "credential" };
		await store.searchMessages(owner, "inbox", []);
		await store.listMessages(owner, "inbox", [1]);
		await store.listUids(owner, "inbox");
		await store.countMessages(owner, "inbox");
		await store.unseenCount(owner, "inbox");
		await store.getUpdatesSince(owner, "inbox", 0);
		await store.deleteMessages(owner, "inbox", [1]);
		await store.expunge(owner, "inbox");
		await store.expunge(owner, "inbox", [1]);
		await store.copyMessages(owner, "inbox", mailbox, [1]);
		await store.updateFlags(owner, "inbox", [1], "add", ["\\Seen"]);

		const messageQueries = requests.filter((request) =>
			/FROM imap_mailbox_messages|DELETE FROM imap_mailbox_messages/.test(
				request.statement,
			) && request.statement.includes("mailbox_id = ?"),
		);
		expect(messageQueries.length).toBeGreaterThanOrEqual(10);
		for (const request of messageQueries) {
			expect(request.statement).toContain("owner.user_id = ?");
			expect(request.statement).toContain("owner.credential_id = ?");
			expect(request.values).toContain("user");
			expect(request.values).toContain("credential");
		}
		const flagsMailbox = requests.find((request) =>
			request.statement.includes("AS mirrored"),
		);
		expect(flagsMailbox?.statement).toContain("credential_id = ?");
		expect(flagsMailbox?.values).toContain("user");
	});

	it("refuses to sync a mailbox the principal does not own", async () => {
		const { store, requests } = createStore();
		await store.syncMailbox(mailbox, principal);
		const lock = requests.find((request) =>
			request.statement.includes("SELECT uid_next, modseq"),
		);
		expect(lock?.statement).toContain("user_id = ?");
		expect(lock?.statement).toContain("credential_id = ?");
	});
});

describe("MailStore Junk view", () => {
	const structuredRow = {
		uid: 1,
		structured_email_id: "email",
		raw_source: "structured",
		flags: "[]",
		internal_date: new Date(0),
		size: 10,
	};
	const junk: MailboxRow = { ...mailbox, id: "junk", path: "Junk" };

	it("keeps undecided and junk mail out of INBOX", async () => {
		const { store, requests } = createStore();
		await store.syncMailbox(mailbox, principal);
		const sync = requests.find((request) =>
			request.statement.includes("WITH new_msgs AS"),
		);
		expect(sync?.statement).toContain("se.is_junk IS NOT TRUE");
		expect(sync?.statement).toContain(
			"se.is_junk IS NOT NULL OR se.created_at < now() - interval '2 minutes'",
		);
	});

	it("moves messages whose verdict changed between INBOX and Junk, keeping flags and journaling EXPUNGE", async () => {
		const moved = {
			mailbox_id: "inbox",
			uid: 4,
			structured_email_id: "email",
			flags: '["\\\\Seen"]',
			internal_date: new Date(0),
			size: 10,
		};
		const { store, requests } = createStore((statement) => {
			if (statement.includes("RETURNING mm.mailbox_id, mm.uid, mm.structured_email_id, mm.flags")) {
				return statement.includes("se.is_junk IS TRUE") ? [moved] : [];
			}
			if (statement.includes("RETURNING modseq")) return [{ modseq: 9 }];
			if (statement.includes("RETURNING uid") && statement.includes("ON CONFLICT")) {
				return [{ uid: 1 }];
			}
			return undefined;
		});
		await store.syncMailbox(mailbox, principal);
		const lock = requests[0];
		expect(lock?.statement).toContain("path IN ('INBOX', 'Junk')");
		expect(lock?.values).toContain(true);
		expect(lock?.statement).toContain("ORDER BY id");
		const transfers = requests.filter((request) =>
			request.statement.includes("USING structured_emails se"),
		);
		expect(transfers[0]?.statement).toContain("se.is_junk IS TRUE");
		expect(transfers[0]?.values).toContain("inbox");
		expect(transfers[1]?.statement).toContain("se.is_junk IS NOT TRUE");
		expect(transfers[1]?.values).toContain("junk");
		const copy = requests.find(
			(request) =>
				request.statement.includes("INSERT INTO imap_mailbox_messages") &&
				request.values.includes("email"),
		);
		expect(copy?.values).toContain("junk");
		expect(copy?.values).toContain(moved.flags);
		const updates = await store.getUpdatesSince(
			{ userId: "user", credentialId: "credential" },
			"inbox",
			0,
		);
		expect(updates).toContainEqual(
			expect.objectContaining({ command: "EXPUNGE", uid: 4, modseq: 9 }),
		);
	});

	it("fills Junk with junk mail from every scope", async () => {
		const { store, requests } = createStore();
		await store.syncMailbox(junk, principal);
		const sync = requests.find((request) =>
			request.statement.includes("WITH new_msgs AS"),
		);
		expect(sync?.statement).toContain("se.is_junk IS TRUE");
		expect(sync?.statement).not.toContain("interval '2 minutes'");
		expect(sync?.statement).toContain("se.guard_blocked IS NOT TRUE");
		expect(sync?.statement).toContain("imap_mailbox_removals");
		expect(sync?.values).toContainEqual(["user@example.com"]);
		expect(sync?.values).toContainEqual(["example.com"]);
	});

	it("removes junk from scope folders and journals the EXPUNGE", async () => {
		const scoped: MailboxRow = {
			...mailbox,
			id: "inbox",
			path: "Scopes/user@example.com",
			scopeId: "address-scope",
		};
		const { store, requests } = createStore((statement) => {
			if (statement.includes("se.is_junk IS TRUE") && statement.includes("DELETE")) {
				return [{ mailbox_id: "inbox", uid: 3 }];
			}
			if (statement.includes("RETURNING modseq")) return [{ modseq: 5 }];
			return undefined;
		});
		await store.syncMailbox(scoped, principal);
		expect(requests[0]?.values).toContain(false);
		const updates = await store.getUpdatesSince(
			{ userId: "user", credentialId: "credential" },
			"inbox",
			4,
		);
		expect(updates).toContainEqual({
			command: "EXPUNGE",
			uid: 3,
			modseq: 5,
			_id: "inbox:expunge:3:5",
		});
		expect(
			await store.getUpdatesSince(
				{ userId: "user", credentialId: "credential" },
				"inbox",
				5,
			),
		).toEqual([]);
	});

	it("does not sync received mail into other folders", async () => {
		const { store, requests } = createStore();
		expect(
			await store.syncMailbox({ ...mailbox, id: "trash", path: "Trash" }, principal),
		).toBe(0);
		expect(requests).toHaveLength(0);
	});

	it("marks received messages copied into Junk as junk for the account", async () => {
		const { store, requests } = createStore((statement) =>
			statement.includes("SELECT structured_email_id, raw_source, uid")
				? [structuredRow]
				: undefined,
		);
		const owner = { userId: "user", credentialId: "credential" };
		await store.copyMessages(owner, "inbox", junk, [1]);
		const update = requests.find((request) =>
			request.statement.includes("UPDATE structured_emails"),
		);
		expect(update?.statement).toContain("junk_reason = 'user'");
		expect(update?.statement).toContain("user_id = ?");
		expect(update?.statement).toContain("is_junk IS DISTINCT FROM ?");
		expect(update?.statement).not.toContain("junk_reason IS DISTINCT FROM");
		const rowLock = requests.findIndex((request) =>
			request.statement.includes("FROM structured_emails"),
		);
		expect(requests[rowLock]?.statement).toContain("ORDER BY id");
		expect(requests[rowLock]?.statement).toContain("FOR UPDATE");
		expect(rowLock).toBeLessThan(
			requests.findIndex((request) =>
				request.statement.includes("UPDATE structured_emails"),
			),
		);
		expect(update?.values).toContain(true);
		expect(update?.values).toContain("user");
		expect(update?.values).toContainEqual(["email"]);
		expect(
			requests.some((request) =>
				request.statement.includes("DELETE FROM imap_mailbox_removals"),
			),
		).toBe(true);
	});

	it("marks received messages copied into INBOX as not junk", async () => {
		const { store, requests } = createStore((statement) =>
			statement.includes("SELECT structured_email_id, raw_source, uid")
				? [structuredRow]
				: undefined,
		);
		await store.copyMessages(
			{ userId: "user", credentialId: "credential" },
			"junk",
			mailbox,
			[1],
		);
		const update = requests.find((request) =>
			request.statement.includes("UPDATE structured_emails"),
		);
		expect(update?.values).toContain(false);
	});

	it("leaves the verdict alone for appended messages and other folders", async () => {
		const appended = createStore((statement) =>
			statement.includes("SELECT structured_email_id, raw_source, uid")
				? [{ ...structuredRow, raw_source: "appended" }]
				: undefined,
		);
		await appended.store.copyMessages(
			{ userId: "user", credentialId: "credential" },
			"inbox",
			junk,
			[1],
		);
		const other = createStore((statement) =>
			statement.includes("SELECT structured_email_id, raw_source, uid")
				? [structuredRow]
				: undefined,
		);
		await other.store.copyMessages(
			{ userId: "user", credentialId: "credential" },
			"inbox",
			{ ...mailbox, id: "trash", path: "Trash" },
			[1],
		);
		for (const { requests } of [appended, other]) {
			expect(
				requests.some((request) =>
					request.statement.includes("UPDATE structured_emails"),
				),
			).toBe(false);
		}
	});

	it("does not record a removal when a message moves from INBOX into Junk", async () => {
		const { store, requests } = createStore((statement) => {
			if (statement.includes("AS mirrored")) {
				return [{ credential_id: "credential", mirrored: true, junk: false }];
			}
			if (statement.includes("RETURNING mailbox_id, uid, structured_email_id, raw_source")) {
				return [{ ...structuredRow, mailbox_id: "inbox" }];
			}
			return undefined;
		});
		await store.deleteMessages(
			{ userId: "user", credentialId: "credential" },
			"inbox",
			[1],
		);
		const removal = requests.find((request) =>
			request.statement.includes("INSERT INTO imap_mailbox_removals"),
		);
		expect(removal?.statement).toContain("NOT EXISTS");
		expect(removal?.statement).toContain("mb.path = 'Junk'");
	});

	it("records a removal when a message is deleted from Junk, unless it moved to INBOX", async () => {
		const { store, requests } = createStore((statement) => {
			if (statement.includes("AS mirrored")) {
				return [{ credential_id: "credential", mirrored: false, junk: true }];
			}
			if (statement.includes("RETURNING mailbox_id, uid, structured_email_id, raw_source")) {
				return [{ ...structuredRow, mailbox_id: "inbox" }];
			}
			return undefined;
		});
		await store.deleteMessages(
			{ userId: "user", credentialId: "credential" },
			"junk",
			[1],
		);
		const removal = requests.find((request) =>
			request.statement.includes("INSERT INTO imap_mailbox_removals"),
		);
		expect(removal?.statement).toContain(
			"(mb.path = 'INBOX' OR mb.scope_id IS NOT NULL)",
		);
		expect(removal?.values).toContain("credential");
		expect(
			requests.some(
				(request) =>
					request.statement.includes("DELETE FROM imap_mailbox_messages mm") &&
					request.statement.includes("USING imap_mailboxes mb"),
			),
		).toBe(false);
	});
});

describe("MailStore MOVE", () => {
	it("copies and removes in one transaction, locking mailboxes in id order first", async () => {
		const { store, requests } = createStore((statement) => {
			if (statement.includes("SELECT structured_email_id, raw_source, uid")) {
				return [
					{
						uid: 1,
						structured_email_id: "email",
						raw_source: "structured",
						flags: "[]",
						internal_date: new Date(0),
						size: 1,
					},
				];
			}
			if (statement.includes("RETURNING mailbox_id, uid, structured_email_id, raw_source")) {
				return [
					{ mailbox_id: "inbox", uid: 1, structured_email_id: "email", raw_source: "structured" },
				];
			}
			return undefined;
		});
		let transactions = 0;
		const sql = (store as unknown as { sql: { begin: (cb: unknown) => unknown } }).sql;
		const begin = sql.begin;
		sql.begin = (cb: unknown) => {
			transactions++;
			return begin(cb);
		};
		const result = await store.moveMessages(
			{ userId: "user", credentialId: "credential" },
			"inbox",
			{ ...mailbox, id: "junk", path: "Junk" },
			[1],
		);
		expect(transactions).toBe(1);
		expect(result.expunged).toEqual([1]);
		expect(requests[0]?.statement).toContain("ORDER BY id");
		expect(requests[0]?.statement).toContain("FOR UPDATE");
		const insert = requests.findIndex((request) =>
			request.statement.includes("INSERT INTO imap_mailbox_messages"),
		);
		const remove = requests.findIndex((request) =>
			request.statement.includes("RETURNING mailbox_id, uid, structured_email_id"),
		);
		expect(insert).toBeGreaterThan(0);
		expect(remove).toBeGreaterThan(insert);
	});
});

describe("ExpungeJournal", () => {
	it("drops entries older than the retention window", () => {
		let now = 0;
		const journal = new ExpungeJournal(() => now);
		journal.record([{ mailboxId: "m", uid: 1, modseq: 2 }]);
		expect(journal.since("m", 0)).toEqual([{ uid: 1, modseq: 2 }]);
		now = 16 * 60 * 1000;
		expect(journal.since("m", 0)).toEqual([]);
	});

	it("keeps a bounded number of entries per mailbox", () => {
		const journal = new ExpungeJournal(() => 0);
		journal.record(
			Array.from({ length: 2500 }, (_, index) => ({
				mailboxId: "m",
				uid: index,
				modseq: index + 1,
			})),
		);
		const kept = journal.since("m", 0);
		expect(kept).toHaveLength(2000);
		expect(kept[0]).toEqual({ uid: 500, modseq: 501 });
	});
});
