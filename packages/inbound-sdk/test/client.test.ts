import { expect, it } from "bun:test";
import { createReadStream } from "node:fs";
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
		process.env.INBOUND_API_KEY = "  environment-key\n";
		process.env.INBOUND_BASE_URL = "\t https://environment.invalid  ";
		expect(new Inbound().apiKey).toBe("environment-key");
		expect(new Inbound().baseURL).toBe("https://environment.invalid");
		expect(new Inbound({ baseURL: null }).baseURL).toBe("https://inbound.new");
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
	const raw: unknown = await client.attachments.retrieve("invoice #2.pdf", { id: "email/a" });
	if (!(raw instanceof Response)) throw new Error("Expected binary attachment response");
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
	const err = await client.emails.send({ from: "a", to: "b", subject: "x" }).catch(e => e);
	expect(err).toBeInstanceOf(Inbound.InternalServerError);
	expect(err).toMatchObject({ name: "Error", status: 503, error: undefined, body: "unavailable", message: "503 unavailable" });
	expect(calls).toBe(1);
});

it("does not replay endpoint creation or raw POSTs after a lost response, even with a key", async () => {
	const writes: string[] = [];
	const client = make(async (url, init) => {
		writes.push(new URL(String(url)).pathname);
		expect(new Headers(init?.headers).get("Idempotency-Key")).toBe("k");
		throw new TypeError("connection lost after POST");
	});
	const endpoint = { type: "webhook", name: "test", config: { url: "https://example.invalid" } } as const;
	await expect(Promise.resolve(client.endpoints.create(endpoint, { idempotencyKey: "k" }))).rejects.toBeInstanceOf(Inbound.APIConnectionError);
	await expect(Promise.resolve(client.post("/api/e2/emails", { headers: { "Idempotency-Key": "k" } }))).rejects.toBeInstanceOf(Inbound.APIConnectionError);
	expect(writes).toEqual(["/api/e2/endpoints", "/api/e2/emails"]);
});

it("replays a keyed generated reply when the first response is lost", async () => {
	let calls = 0;
	const c = make(async (_, init) => {
		expect(new Headers(init?.headers).get("Idempotency-Key")).toBe("reply-key");
		if (++calls === 1) throw new TypeError("lost response");
		return Response.json({ id: "reply" });
	});
	expect((await c.emails.reply("id", { from: "x" }, { idempotencyKey: "reply-key" })).id).toBe("reply");
	expect(calls).toBe(2);
});

it("exposes status, API code, raw error body and old error classes", async () => {
	const body = { error: { message: "No such mailbox", code: "mailbox_missing" } };
	const client = make(async () => Response.json(body, { status: 404 }));
	const caught: unknown = await client.mailboxes.retrieve("missing").catch(e => e);
	expect(caught).toBeInstanceOf(NotFoundError);
	expect(caught).toBeInstanceOf(InboundError);
	expect(caught).toMatchObject({ name: "Error", status: 404, code: "mailbox_missing", body, error: body, message: `404 ${JSON.stringify(body)}` });
});

it("matches the published APIError factory, names and fallback messages", () => {
	const headers = new Headers();
	for (const [status, cls] of [[400, Inbound.BadRequestError], [401, Inbound.AuthenticationError], [403, Inbound.PermissionDeniedError], [409, Inbound.ConflictError], [422, Inbound.UnprocessableEntityError], [429, Inbound.RateLimitError], [500, Inbound.InternalServerError]] as const) {
		const e = Inbound.APIError.generate(status, undefined, undefined, headers);
		expect(e).toBeInstanceOf(cls);
		expect(e.headers).toBe(headers);
		expect(e.message).toBe(`${status} status code (no body)`);
		expect(e.name).toBe("Error");
	}
	expect(Inbound.APIError.generate(404, { message: "not here" }, undefined, headers).message).toBe("404 not here");
	expect(Inbound.APIError.generate(undefined, undefined, undefined, undefined)).toBeInstanceOf(Inbound.APIConnectionError);
	expect(new InboundError().name).toBe("Error");
});

it("retries 429 up to the configured bound and honors x-should-retry false", async () => {
	let count = 0;
	let hint = "true";
	const client = make(async () => { count++; return new Response("busy", { status: 429, headers: { "Retry-After": "0", "x-should-retry": hint } }); }, { maxRetries: 1 });
	await expect(Promise.resolve(client.spamFilter.retrieve())).rejects.toBeInstanceOf(RateLimitError);
	expect(count).toBe(2);
	hint = "false";
	await expect(Promise.resolve(client.spamFilter.retrieve())).rejects.toBeInstanceOf(RateLimitError);
	expect(count).toBe(3);
});

it("times out an in-flight request and distinguishes caller abort", async () => {
	const client = make(async (_, init) => new Promise((_resolve, reject) => init!.signal!.addEventListener("abort", () => reject(init!.signal!.reason))), { timeout: 10, maxRetries: 0 });
	await expect(Promise.resolve(client.mailboxes.list())).rejects.toBeInstanceOf(APIConnectionTimeoutError);
	await expect(Promise.resolve(client.mailboxes.list({}, { signal: AbortSignal.abort() }))).rejects.toBeInstanceOf(APIUserAbortError);
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

it("uses request.query.offset once without losing request filters on later pages", async () => {
	const offsets: number[] = [];
	const client = make(async url => {
		const query = new URL(String(url)).searchParams;
		const offset = Number(query.get("offset"));
		offsets.push(offset);
		expect(query.get("status")).toBe("pending");
		return Response.json({ data: [{ id: String(offset) }], pagination: { offset, limit: 1, total: 5, hasMore: offset < 4 } });
	});
	const query = Object.freeze({ offset: "2", status: "pending" });
	const ids: string[] = [];
	for await (const item of client.domains.listAll({ offset: 1 }, { query })) ids.push(item.id);
	expect(ids).toEqual(["2", "3", "4"]);
	expect(offsets).toEqual([2, 3, 4]);
	expect(query.offset).toBe("2");
});

it("honors a caller's binary request on a JSON route and forces binary on downloads", async () => {
	const c = make(async () => Response.json({ id: "fixture" }));
	const raw = await c.domains.list({}, { __binaryResponse: true });
	expect(raw).toBeInstanceOf(Response);
	expect(await c.attachments.retrieve("id", "name", { __binaryResponse: false })).toBeInstanceOf(Response);
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

it("renders the React field without mutating caller input", async () => {
	let sent: Record<string, unknown> = {};
	const c = make(async (_, init) => { sent = JSON.parse(String(init!.body)); return Response.json({ id: "test" }); });
	const params = { from: "a", to: "b", subject: "fixture", react: "Rendered fixture" };
	await c.emails.send(params);
	expect(sent.html).toContain("Rendered fixture");
	expect(sent).not.toHaveProperty("react");
	expect(params).not.toHaveProperty("html");
});

it("merges default, modeled and request options in order without mutating the original client", async () => {
	const logs: string[] = [];
	const calls: Request[] = [];
	const base = make(async (u, init) => { calls.push(new Request(u, init)); return Response.json({}); }, {
		defaultHeaders: { Authorization: "override", "x-remove": "yes", "x-many": "old" }, defaultQuery: { limit: "6", drop: "yes" }, fetchOptions: { redirect: "error" },
		logger: { ...console, debug: line => logs.push(line) },
	});
	const c = base.withOptions({ logLevel: "debug" });
	await c.domains.list({ limit: 3 }, { query: { limit: 2, drop: undefined }, headers: { "X-Remove": null, "X-Many": ["a", "b"] }, fetchOptions: { redirect: "manual" } });
	await base.domains.list();
	expect(calls[0].headers.get("authorization")).toBe("override");
	expect(calls[0].headers.has("x-remove")).toBe(false);
	expect(calls[0].headers.get("x-many")).toBe("a, b");
	expect(new URL(calls[0].url).search).toBe("?limit=2");
	expect(calls[0].redirect).toBe("manual");
	expect(calls[1].redirect).toBe("error");
	expect(calls[1].headers.get("x-remove")).toBe("yes");
	expect(logs).toHaveLength(2);
	expect(logs.join(" ")).not.toContain("override");
});

it("passes idempotencyKey from request options for send and reply", async () => {
	const keys: (string | null)[] = [];
	const client = make(async (_, init) => { keys.push(new Headers(init?.headers).get("idempotency-key")); return Response.json({}); });
	await client.emails.send({ from: "a", to: "b", subject: "s" }, { idempotencyKey: "send" });
	await client.emails.reply("id", { from: "a" }, { idempotencyKey: "reply" });
	expect(keys).toEqual(["send", "reply"]);
});

it("applies header values and removals from the published nullable-header shape", async () => {
	const c = make(async (_, init) => {
		const headers = new Headers(init?.headers);
		expect(headers.get("x-value")).toBe("new");
		expect(headers.has("x-remove")).toBe(false);
		return Response.json({});
	}, { defaultHeaders: { "x-value": "old", "x-remove": "old" } });
	await c.domains.list({}, { headers: { values: new Headers({ "x-value": "new" }), nulls: new Set(["x-remove"]) } });
});

it("supports primitive HTTP methods, promised options, text, +json and 204 null", async () => {
	const methods: string[] = [];
	const c = make(async (_, init) => {
		methods.push(init!.method!);
		if (init!.method === "DELETE") return new Response(null, { status: 204 });
		if (init!.method === "GET") return new Response('{"ok":true}', { headers: { "content-type": "application/vnd.test+json; charset=utf-8" } });
		return new Response(init?.body ? String(init.body) : "ok");
	});
	expect(await c.post<string>("/raw", Promise.resolve({ body: { a: 1 } }))).toBe('{"a":1}');
	expect(await c.patch<string>("/raw")).toBe("ok");
	expect(await c.put<string>("/raw")).toBe("ok");
	expect(await c.request<{ ok: boolean }>(Promise.resolve({ path: "/raw", method: "get" }))).toEqual({ ok: true });
	expect(await c.delete("/raw")).toBeNull();
	expect(methods).toEqual(["POST", "PATCH", "PUT", "GET", "DELETE"]);
});

it("retries network failures and uses a new per-attempt timeout", async () => {
	const signals: AbortSignal[] = [];
	const c = make(async (_, init) => {
		const signal = init!.signal!; signals.push(signal);
		if (signals.length === 1) throw new TypeError("network down");
		if (signals.length === 2) return new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason)));
		return new Response("ok");
	}, { timeout: 15 });
	expect(await c.get<string>("/x")).toBe("ok");
	expect(new Set(signals).size).toBe(3);
	expect(signals[1].aborted).toBe(true);
	expect(signals[2].aborted).toBe(false);
});

it("honors 408, 409, retry-after-ms and explicit retry hints on safe requests", async () => {
	for (const [method, status] of [["head", 408], ["options", 409], ["put", 400], ["delete", 503]] as const) {
		let n = 0;
		const c = make(async () => ++n > 1 ? new Response("ok") : new Response(null, { status, headers: { "retry-after-ms": "15", "retry-after": "50", ...(status === 400 && { "x-should-retry": "true" }) } }));
		const start = performance.now();
		expect(await c.request<string>({ method, path: "/raw", idempotencyKey: "key" })).toBe("ok");
		expect(performance.now() - start).toBeGreaterThanOrEqual(13);
	}
});

it("preserves stream basenames, BunFile and structural blob and response inputs; sends nested multipart", async () => {
	const file = Bun.file(import.meta.path);
	expect((await toFile(createReadStream(import.meta.path))).name).toBe("client.test.ts");
	expect((await toFile(file)).name).toBe("client.test.ts");
	const blob = { name: "x.pdf", type: "application/pdf", size: 2, text: async () => "hi", arrayBuffer: async () => Uint8Array.of(0, 255).buffer, slice: () => new Blob() };
	const response = { url: "https://example.org/receipt.pdf", blob: async () => blob };
	expect((await toFile(response)).name).toBe("receipt.pdf");
	let form: FormData | undefined;
	const c = make(async (u, init) => { form = await new Request(u, init).formData(); return Response.json({}); });
	await c.emails.send({ from: "a", to: "b", subject: "x", headers: { payload: [blob] } });
	const uploaded = form!.get("headers[payload][]") as File;
	expect(uploaded.name).toBe("x.pdf");
	expect(new Uint8Array(await uploaded.arrayBuffer())).toEqual(Uint8Array.of(0, 255));
	expect(form!.get("subject")).toBe("x");
});

it("rejects incremental folder options on listAll before issuing a request", () => {
	const c = make(async () => { throw new Error("unexpected fetch"); });
	// @ts-expect-error JavaScript callers also receive a clear diagnostic.
	expect(() => c.folderMessages.listAll("box", "Inbox", { sinceUid: 3 })).toThrow("incremental folder sync");
});
