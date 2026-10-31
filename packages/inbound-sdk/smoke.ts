import { homedir } from "node:os";
import { join } from "node:path";
import Inbound from "./src/generated/index.js";

try {
	const credentials = await Bun.file(join(homedir(), ".config/inboundctl/credentials.json")).json();
	if (typeof credentials.apiKey !== "string" || !credentials.apiKey) throw new Error();
	const client = new Inbound({ apiKey: credentials.apiKey, baseURL: "https://inbound.new", maxRetries: 0,
		fetch: (url, init) => {
			if (init?.method !== "GET" || new URL(String(url)).origin !== "https://inbound.new") throw new Error();
			return fetch(url, { ...init, redirect: "error" });
		},
	});
	const domains = await client.domains.list({ limit: 1 });
	const mailboxes = await client.mailboxes.list({ limit: 1 });
	const mailbox = await client.mailboxes.retrieve(mailboxes.data[0].id);
	const folders = await client.folders.list(mailbox.id);
	const spam = await client.spamFilter.retrieve();
	if (!mailbox.id || mailbox.id !== mailboxes.data[0].id || !spam.level) throw new Error();
	console.log(JSON.stringify({ domains: domains.pagination.total, mailboxes: mailboxes.pagination.total, mailboxId: mailbox.id, folders: folders.data.length, spamFilters: 1 }));
} catch {
	console.error("Read-only smoke failed; response bodies and credentials suppressed.");
	process.exitCode = 1;
}
