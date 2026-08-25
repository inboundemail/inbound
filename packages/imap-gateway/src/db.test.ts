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

function createStore(): { store: MailStore; requests: SqlRequest[] } {
	const requests: SqlRequest[] = [];
	async function execute<T extends readonly object[]>(
		strings: TemplateStringsArray,
		...values: unknown[]
	): Promise<T> {
		const statement = strings.join("?");
		requests.push({ statement, values });
		if (statement.includes("SELECT uid_next, modseq")) {
			return [{ uid_next: 1, modseq: 0 }] as unknown as T;
		}
		if (statement.includes("SELECT raw_content")) {
			return [{ raw_content: "message" }] as unknown as T;
		}
		return [] as unknown as T;
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
	it.each([
		"credential",
		"",
	])("excludes Guard-blocked messages from sync for credential mode %s", async (credentialId) => {
		const { store, requests } = createStore();
		await store.syncMailbox(mailbox, { ...principal, credentialId });
		const sync = requests.find((request) =>
			request.statement.includes("WITH new_msgs AS"),
		);
		expect(sync?.statement).toContain("se.guard_blocked IS NOT TRUE");
	});

	it("restricts structured raw content to unblocked, currently authorized scopes", async () => {
		const { store, requests } = createStore();
		expect(await store.getRawContent("message", "structured", principal)).toBe(
			"message",
		);
		const request = requests[0];
		expect(request?.statement).toContain("guard_blocked IS NOT TRUE");
		expect(request?.statement).toContain("lower(recipient) = ANY");
		expect(request?.values).toContainEqual(["user@example.com"]);
		expect(request?.values).toContainEqual(["example.com"]);
	});

	it("preserves appended-message ownership checks without applying structured scopes", async () => {
		const { store, requests } = createStore();
		expect(await store.getRawContent("message", "appended", principal)).toBe(
			"message",
		);
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
		expect(reconciliation?.statement).toContain("se.guard_blocked IS TRUE");
		expect(reconciliation?.values).toContain("credential");
		expect(reconciliation?.values).toContain("user");
		expect(
			requests.some((request) =>
				request.statement.includes("DELETE FROM structured_emails"),
			),
		).toBe(false);
	});
});
