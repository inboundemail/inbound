import { describe, expect, it } from "bun:test";
import type { AuthenticatedMailbox } from "./auth.ts";
import { type MailboxRow, MailStore } from "./db.ts";

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

function createStore(): { store: MailStore; requests: SqlRequest[] } {
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
			if (statement.includes("SELECT uid_next, modseq")) {
				return [{ uid_next: 1, modseq: 0 }];
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
