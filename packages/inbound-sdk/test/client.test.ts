import { expect, it } from "bun:test";
import Inbound, { APIConnectionTimeoutError, APIUserAbortError, APIPromise, type ClientOptions, Inbound as NamedInbound, InboundError, NotFoundError, RateLimitError, toFile, verifyWebhookFromHeaders } from "../src/generated/index.js";

const make = (fetch: NonNullable<ClientOptions["fetch"]>, options?: ClientOptions) => new Inbound({ apiKey: "test", baseURL: "https://mock.invalid/", fetch, ...options });

it("authenticates and encodes positional segments and URL query values", async () => {
	let captured: Request | undefined;
	const client = make(async (url, init) => { captured = new Request(url, init); return Response.json({ data: [] }); });
	const { response } = await client.folderMessages.list("id/a", "To read/#1", { limit: 2, search: "a&b + ü" }).withResponse();
	expect(response.ok).toBe(true);
	const url = new URL(captured!.url);
	expect(url.pathname).toBe("/api/e2/mailboxes/id%2Fa/folders/To%20read%2F%231/messages");
	expect([...url.searchParams]).toEqual([["limit", "2"], ["search", "a&b + ü"]]);
	expect(captured!.headers.get("authorization")).toBe("Bearer test");
	expect(captured!.method).toBe("GET");
	expect(captured!.body).toBeNull();
	expect(() => client.domains.retrieve("..")).toThrow();
});

it("respects the environment and explicit constructor overrides", async () => {
	const saved = [process.env.INBOUND_API_KEY, process.env.INBOUND_BASE_URL];
	try {
		process.env.INBOUND_API_KEY = "environment-key";
		process.env.INBOUND_BASE_URL = "https://environment.invalid";
		expect(new Inbound().apiKey).toBe("environment-key");
		expect(new Inbound().baseURL).toBe("https://environment.invalid");
		expect(new Inbound({ apiKey: "explicit" }).apiKey).toBe("explicit");
		delete process.env.INBOUND_BASE_URL;
		expect(new Inbound().baseURL).toBe("https://inbound.new");
		delete process.env.INBOUND_API_KEY;
		expect(() => new Inbound()).toThrow(InboundError);
	} finally {
		for (const [i, name] of ["INBOUND_API_KEY", "INBOUND_BASE_URL"].entries()) {
			if (saved[i] !== undefined) process.env[name] = saved[i]; else delete process.env[name];
		}
	}
});

it("preserves the old attachment argument order and binary bytes", async () => {
	const paths: string[] = [];
	const client = make(async url => { paths.push(new URL(String(url)).pathname); return new Response(Uint8Array.of(0, 255)); });
	const raw = await client.attachments.retrieve("invoice #2.pdf", { id: "email/a" });
	expect(new Uint8Array(await raw.arrayBuffer())).toEqual(Uint8Array.of(0, 255));
	await client.attachments.retrieve("email/a", "invoice #2.pdf");
	expect(paths[0]).toBe("/api/e2/attachments/email%2Fa/invoice%20%232.pdf");
	expect(paths[1]).toBe(paths[0]);
	expect(await client.folderMessages.retrieveRaw("m", "Drafts", "1")).toBeInstanceOf(Response);
});

it("passes a send key only in HTTP headers, preserving email headers and safely retrying", async () => {
	const calls: Request[] = [];
	const client = make(async (url, init) => {
		calls.push(new Request(url, init));
		return calls.length === 1 ? new Response(null, { status: 503, headers: { "Retry-After": "0" } }) : Response.json({ id: "sent" });
	});
	const body: Inbound.EmailSendParams = { from: "a", to: "b", subject: "x", headers: { "X-Email": "mail" } };
	expect((await client.emails.send({ ...body, idempotencyKey: "order-1" }, { headers: { "X-HTTP": "request" } })).id).toBe("sent");
	expect(calls).toHaveLength(2);
	for (const call of calls) {
		expect(call.headers.get("Idempotency-Key")).toBe("order-1");
		expect(call.headers.get("X-HTTP")).toBe("request");
		expect(call.headers.has("X-Email")).toBe(false);
		expect(await call.json()).toEqual(body);
	}
});

it("does not replay an unkeyed send after a server failure", async () => {
	let calls = 0;
	const client = make(async () => { calls++; return new Response("unavailable", { status: 503 }); });
	await expect(client.emails.send({ from: "a", to: "b", subject: "x" })).rejects.toBeInstanceOf(Inbound.InternalServerError);
	expect(calls).toBe(1);
});

it("exposes status, API code, raw error body and old error classes", async () => {
	const body = { error: { message: "No such mailbox", code: "mailbox_missing" } };
	const client = make(async () => Response.json(body, { status: 404 }));
	const caught: unknown = await client.mailboxes.retrieve("missing").catch(e => e);
	expect(caught).toBeInstanceOf(NotFoundError);
	expect(caught).toBeInstanceOf(InboundError);
	expect(caught).toMatchObject({ status: 404, code: "mailbox_missing", body, error: body, message: "404 No such mailbox" });
});

it("retries 429 up to the configured bound, not before a future Retry-After", async () => {
	let count = 0;
	let after = "0";
	const client = make(async () => { count++; return new Response("busy", { status: 429, headers: { "Retry-After": after } }); }, { maxRetries: 1 });
	await expect(client.spamFilter.retrieve()).rejects.toBeInstanceOf(RateLimitError);
	expect(count).toBe(2);
	after = new Date(Date.now() + 600_000).toUTCString();
	await expect(client.spamFilter.retrieve()).rejects.toBeInstanceOf(RateLimitError);
	expect(count).toBe(3);
});

it("times out an in-flight request and distinguishes caller abort", async () => {
	const client = make(async (_, init) => new Promise((_resolve, reject) => init!.signal!.addEventListener("abort", () => reject(init!.signal!.reason))), { timeout: 10 });
	await expect(client.mailboxes.list()).rejects.toBeInstanceOf(APIConnectionTimeoutError);
	await expect(client.mailboxes.list({}, { signal: AbortSignal.abort() })).rejects.toBeInstanceOf(APIUserAbortError);
});

it("iterates lazily, preserving filters and respecting the server's offset and limit", async () => {
	const urls: URL[] = [];
	const client = make(async u => {
		const url = new URL(String(u)); urls.push(url);
		const offset = Number(url.searchParams.get("offset"));
		return Response.json({ data: [{ id: `id-${offset}` }], pagination: { limit: 1, offset, total: 4, hasMore: offset < 3 } });
	});
	const items = client.domains.listAll({ offset: 1, limit: 5, status: "pending" });
	expect(urls).toHaveLength(0);
	const ids = [];
	for await (const domain of items) ids.push(domain.id);
	expect(ids).toEqual(["id-1", "id-2", "id-3"]);
	expect(urls.every(url => url.searchParams.get("status") === "pending")).toBe(true);
});

it("handles the email API's snake-case pagination and stops when the consumer breaks", async () => {
	let count = 0;
	const client = make(async () => Response.json({ data: [{ id: ++count }], pagination: { limit: 1, offset: count - 1, total: 3, has_more: true } }));
	for await (const email of client.emails.listAll()) { if (email.id && count === 2) break; }
	expect(count).toBe(2);
});

it("retains published names, webhook helper, and a single response for multiple awaits", async () => {
	let calls = 0;
	const client = make(async () => { calls++; return Response.json({ config: { verificationToken: "fixture" } }); });
	expect(NamedInbound).toBe(Inbound);
	expect(client.threads).toBe(client.mail);
	const promise = client.endpoints.retrieve("one");
	expect(promise).toBeInstanceOf(APIPromise);
	expect(await promise).toBe(await promise);
	expect(calls).toBe(1);
	expect(await verifyWebhookFromHeaders({ "x-endpoint-id": "one", "x-webhook-verification-token": "fixture" }, client)).toBe(true);
	expect(await verifyWebhookFromHeaders({}, client)).toBe(false);
	expect(await (await toFile(Uint8Array.of(65), "f.txt")).text()).toBe("A");
	const tag: Inbound.EmailSendParams.Tag = { name: "label", value: "file" };
	expect(tag.name).toBe("label");
});

it("keeps every 0.20 resource method from api.md on its original verb and path", async () => {
	const calls: string[] = [];
	const c = make(async (url, init) => {
		calls.push(`${init!.method} ${new URL(String(url)).pathname.replace("/api/e2/", "")}`);
		return Response.json({});
	});
	const cases = [
		["GET attachments/i/f", () => c.attachments.retrieve("f", { id: "i" })],
		["POST domains", () => c.domains.create({ domain: "example.org" })],
		["GET domains/i", () => c.domains.retrieve("i", { check: "true" })],
		["PATCH domains/i", () => c.domains.update("i", {})],
		["GET domains", () => c.domains.list({ limit: 1, offset: 0 })],
		["DELETE domains/i", () => c.domains.delete("i")],
		["POST endpoints", () => c.endpoints.create({ name: "hook", type: "webhook", config: { url: "https://example.org" } })],
		["GET endpoints/i", () => c.endpoints.retrieve("i")],
		["PUT endpoints/i", () => c.endpoints.update("i", {})],
		["GET endpoints", () => c.endpoints.list({})],
		["DELETE endpoints/i", () => c.endpoints.delete("i")],
		["POST endpoints/i/test", () => c.endpoints.test("i")],
		["POST email-addresses", () => c.emailAddresses.create({ domainId: "d", address: "x" })],
		["GET email-addresses/i", () => c.emailAddresses.retrieve("i")],
		["PUT email-addresses/i", () => c.emailAddresses.update("i", {})],
		["GET email-addresses", () => c.emailAddresses.list({})],
		["DELETE email-addresses/i", () => c.emailAddresses.delete("i")],
		["GET emails/i", () => c.emails.retrieve("i")],
		["GET emails", () => c.emails.list({})],
		["DELETE emails/i", () => c.emails.delete("i")],
		["POST emails/i/reply", () => c.emails.reply("i", { from: "a" })],
		["POST emails/i/retry", () => c.emails.retry("i", {})],
		["POST emails", () => c.emails.send({ from: "a", to: "b", subject: "fixture" })],
		["GET mail/threads/i", () => c.mail.retrieve("i")],
		["GET mail/threads", () => c.mail.list({})],
	] as const;
	for (const [expected, run] of cases) { await run(); expect(calls.pop()).toBe(expected); }
});

it("lets asResponse callers read non-JSON wire data", async () => {
	const c = make(async () => new Response("unparsed"));
	expect(await (await c.domains.list().asResponse()).text()).toBe("unparsed");
});

it("renders the optional React field without mutating caller input", async () => {
	let sent: Record<string, unknown> = {};
	const c = make(async (_, init) => { sent = JSON.parse(String(init!.body)); return Response.json({ id: "test" }); });
	const params = { from: "a", to: "b", subject: "fixture", react: "Rendered fixture" };
	await c.emails.send(params);
	expect(sent.html).toContain("Rendered fixture");
	expect(sent).not.toHaveProperty("react");
	expect(params).not.toHaveProperty("html");
});
