import { createHmac } from "node:crypto";
import { gzipSync } from "node:zlib";
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import schema from "../pipeline/schema.json";
import type { Env } from "../src/env";
import worker from "../src/index";
import { normalize } from "../src/normalize";
import { emailTag, redact } from "../src/redact";
import { enforceRetention } from "../src/retention";
import { dayPrefix, gzip, hourPrefix } from "../src/storage";

const testEnv = env as unknown as Env;
const SECRET = "test-drain-secret";
const QUERY_TOKEN = "test-query-token-0123456789abcdef0123";
const BASE = "https://drain.test";

async function call(path: string, init?: RequestInit): Promise<Response> {
	const request = new Request(`${BASE}${path}`, init) as Parameters<typeof worker.fetch>[0];
	return worker.fetch(request, testEnv);
}

function sign(body: string | Uint8Array, secret = SECRET): string {
	return createHmac("sha1", secret).update(body).digest("hex");
}

function ingest(body: string | Uint8Array, headers: Record<string, string> = {}) {
	return call("/ingest", { method: "POST", body, headers });
}

function query(params: Record<string, string>, token = QUERY_TOKEN) {
	const qs = new URLSearchParams(params).toString();
	return call(`/query?${qs}`, {
		headers: { authorization: `Bearer ${token}` },
	});
}

const now = Date.now();
const sample = [
	{
		id: "log-1",
		deploymentId: "dpl_1",
		source: "lambda",
		host: "inbound.new",
		timestamp: now - 60_000,
		projectId: "prj_1",
		level: "error",
		message:
			"send failed for alice.smith@example.com auth=Bearer abcdefghijklmnop key sk_live_1234567890abcdefgh AKIAABCDEFGHIJKLMNOP mail_abcdefghijklmnopqrstuvwxyz",
		requestId: "req-aaa",
		statusCode: 500,
		path: "/api/e2/[[...slugs]]",
		executionRegion: "iad1",
		proxy: {
			timestamp: now - 60_500,
			method: "POST",
			host: "inbound.new",
			path: "/api/e2/emails/0f8fad5b-d9cb-469f-a165-70867728950e?token=supersecretvalue",
			userAgent: ["curl/8"],
			region: "iad1",
			statusCode: 500,
			clientIp: "203.0.113.9",
		},
	},
	{
		id: "log-2",
		deploymentId: "dpl_1",
		source: "lambda",
		host: "inbound.new",
		timestamp: now - 30_000,
		projectId: "prj_1",
		level: "info",
		message:
			"START RequestId: x\nEND RequestId: x\nREPORT RequestId: x\tDuration: 42.5 ms\tBilled Duration: 43 ms\tInit Duration: 300 ms",
		requestId: "req-bbb",
		statusCode: 200,
		path: "/api/e2/[[...slugs]]",
		proxy: {
			timestamp: now - 30_100,
			method: "GET",
			host: "inbound.new",
			path: "/api/e2/domains",
			userAgent: ["Mozilla/5.0"],
			region: "iad1",
			statusCode: 200,
		},
	},
];

describe("ingest", () => {
	it("answers the Vercel verification handshake", async () => {
		const get = await call("/ingest");
		expect(get.status).toBe(200);
		expect(get.headers.get("x-vercel-verify")).toBe("test-verify-token");

		const probe = await ingest("");
		expect(probe.status).toBe(200);
		expect(probe.headers.get("x-vercel-verify")).toBe("test-verify-token");
	});

	it("rejects unsigned and wrongly signed payloads", async () => {
		const body = JSON.stringify([{ ...sample[0], id: "evil", requestId: "req-evil" }]);
		expect((await ingest(body)).status).toBe(401);
		expect((await ingest(body, { "x-vercel-signature": sign(body, "wrong") })).status).toBe(403);
		expect((await ingest(body, { "x-vercel-signature": "zz" })).status).toBe(403);
		const res = await query({ requestId: "req-evil" });
		expect((await res.json<{ count: number }>()).count).toBe(0);
	});

	it("stores signed JSON and NDJSON payloads with redaction", async () => {
		const jsonBody = JSON.stringify([sample[0]]);
		const a = await ingest(jsonBody, { "x-vercel-signature": sign(jsonBody) });
		expect(a.status).toBe(200);
		expect(await a.json()).toMatchObject({ accepted: 1, dropped: 0 });

		const ndjson = `${JSON.stringify(sample[1])}\nnot-json\n`;
		const b = await ingest(ndjson, { "x-vercel-signature": sign(ndjson) });
		expect(await b.json()).toMatchObject({ accepted: 1, dropped: 1 });

		const res = await query({ requestId: "req-aaa" });
		const { logs } = await res.json<{ logs: Array<Record<string, unknown>> }>();
		expect(logs).toHaveLength(1);
		const stored = JSON.stringify(logs[0]);
		for (const leaked of ["abcdefghijklmnop", "sk_live_", "AKIAABCDEFGHIJKLMNOP", "mail_abc", "alice.smith", "supersecretvalue"]) {
			expect(stored).not.toContain(leaked);
		}
		expect(logs[0].message).toMatch(/a\*\*\*~[0-9a-f]{8}@example\.com/);
		expect(logs[0].route).toBe("/api/e2/emails/:id");
		expect(logs[0].status).toBe(500);
	});

	it("accepts gzip deliveries signed over the compressed body", async () => {
		const body = gzipSync(JSON.stringify([{ ...sample[1], id: "log-gz", requestId: "req-gz", host: "gz.test" }]));
		const res = await ingest(body, { "content-encoding": "gzip", "x-vercel-signature": sign(body) });
		expect(await res.json()).toMatchObject({ accepted: 1 });
		const found = await (await query({ requestId: "req-gz" })).json<{ count: number }>();
		expect(found.count).toBe(1);
	});
});

describe("redaction", () => {
	it("masks secrets but keeps identifiers useful", () => {
		const out = redact(
			'{\\"password\\":\\"hunter2\\"} to=alice%40example.com <CAD2vD4xq8rQwErTyUiOpAsDfGhJkLzXcVbNm1234567890@mail.gmail.com> ' +
				"req 643af4e3-975a-4cc7-9e7a-1eda11539d90 trace 1b02cd14bb8642fd092bc23f54c7ffcd dpl_233NRGRjVZX1caZrXWtz5g1TAksD " +
				"key=Zx9AbCdEfGhIjKlMnOpQrStUvWxYzAbCdEfGhIjKlMnOp",
			"k",
		);
		expect(out).not.toContain("hunter2");
		expect(out).not.toContain("alice%40");
		const messageId = "CAD2vD4xq8rQwErTyUiOpAsDfGhJkLzXcVbNm1234567890@mail.gmail.com";
		expect(out).toContain(`<C***~${emailTag(messageId, "k")}@mail.gmail.com>`);
		expect(out).toContain("643af4e3-975a-4cc7-9e7a-1eda11539d90");
		expect(out).toContain("1b02cd14bb8642fd092bc23f54c7ffcd");
		expect(out).toContain("dpl_233NRGRjVZX1caZrXWtz5g1TAksD");
		expect(out).not.toContain("Zx9AbCdEfGhIjKlMnOp");
	});
});

describe("query", () => {
	it("requires the bearer token", async () => {
		expect((await call("/query")).status).toBe(401);
		expect((await query({}, "wrong-token")).status).toBe(401);
	});

	it("filters by level, status, path, text and email", async () => {
		const ids = async (params: Record<string, string>) =>
			(await (await query({ host: "inbound.new", ...params })).json<{ logs: Array<{ id: string }> }>()).logs
				.map((l) => l.id)
				.sort();
		expect(await ids({})).toEqual(["log-1", "log-2"]);
		expect(await ids({ level: "error" })).toEqual(["log-1"]);
		expect(await ids({ status: "5xx" })).toEqual(["log-1"]);
		expect(await ids({ path: "/api/e2/domains" })).toEqual(["log-2"]);
		expect(await ids({ q: "billed duration" })).toEqual(["log-2"]);
		expect(await ids({ email: "Alice.Smith@example.com" })).toEqual(["log-1"]);
		expect(await ids({ limit: "1" })).toEqual(["log-2"]);
		expect((await query({ status: "abc" })).status).toBe(400);
	});

	it("pages across partitions without losing same-millisecond records", async () => {
		const t1 = Date.now() - 1_000;
		const t0 = Date.now() - 2 * 3_600_000;
		const rec = (id: string, ts: number) => JSON.stringify({ ts, id, level: "warning", source: "edge", message: "page" });
		await testEnv.LOGS.put(`${hourPrefix("logs/", t1)}seed-a.json.gz`, await gzip(`${rec("p-a", t1)}\n${rec("p-b", t1)}\n${rec("p-c", t1)}\n`));
		await testEnv.LOGS.put(`${hourPrefix("logs/", t0)}seed-b.json.gz`, await gzip(`${rec("p-d", t0)}\n${rec("p-e", t0)}\n`));

		const seen: string[] = [];
		let cursor: string | null = null;
		const from = String(Date.now() - 3 * 3_600_000);
		for (let page = 0; page < 5; page++) {
			const params: Record<string, string> = { level: "warning", limit: "2", from };
			if (cursor) params.cursor = cursor;
			const body = await (await query(params)).json<{ logs: Array<{ id: string }>; nextCursor: string | null }>();
			seen.push(...body.logs.map((l) => l.id));
			cursor = body.nextCursor;
			if (!cursor) break;
		}
		expect(seen).toEqual(["p-c", "p-b", "p-a", "p-e", "p-d"]);
	});

	it("computes route metrics by scanning", async () => {
		const res = await call("/metrics?engine=scan&host=inbound.new", {
			headers: { authorization: `Bearer ${QUERY_TOKEN}` },
		});
		const body = await res.json<{ routes: Array<Record<string, unknown>> }>();
		const domains = body.routes.find((r) => r.route === "/api/e2/domains");
		const emails = body.routes.find((r) => r.route === "/api/e2/emails/:id");
		expect(domains).toMatchObject({ requests: 1, errors: 0, p50_ms: 42.5, p95_ms: 42.5 });
		expect(emails).toMatchObject({ requests: 1, errors: 1, p50_ms: null });
	});
});

describe("retention", () => {
	it("deletes partitions older than RETENTION_DAYS only", async () => {
		const old = Date.now() - 32 * 86_400_000;
		const oldKey = `${dayPrefix("logs/", old)}hour=00/old.json.gz`;
		const freshKey = `${dayPrefix("logs/", Date.now() - 2 * 86_400_000)}hour=00/fresh.json.gz`;
		await testEnv.LOGS.put(oldKey, "{}\n");
		await testEnv.LOGS.put(freshKey, "{}\n");
		expect(await enforceRetention(testEnv)).toBe(1);
		expect(await testEnv.LOGS.head(oldKey)).toBeNull();
		expect(await testEnv.LOGS.head(freshKey)).not.toBeNull();
	});
});

describe("pipeline schema", () => {
	it("covers every field a fully populated record can emit", () => {
		const record = normalize(
			{
				...sample[0],
				type: "stdout",
				traceId: "t",
				spanId: "s",
				entrypoint: "api/index.js",
				environment: "production",
				branch: "main",
				buildId: "bld_1",
				edgeType: "middleware",
				destination: "https://example.com",
				projectName: "inbound",
				message: "REPORT Duration: 1 ms",
				proxy: { ...sample[0].proxy, referer: "https://x.test", vercelCache: "MISS", pathType: "func", wafAction: "log", responseByteSize: 10 },
			},
			{ maxMessageChars: 1000 },
		);
		const names = schema.fields.map((f) => f.name).sort();
		expect(Object.keys(record ?? {}).sort()).toEqual(names);
	});
});
