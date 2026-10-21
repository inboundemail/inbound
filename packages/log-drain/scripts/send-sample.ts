import { createHmac } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

function devVars(): Record<string, string> {
	const path = join(dirname(fileURLToPath(import.meta.url)), "..", ".dev.vars");
	if (!existsSync(path)) return {};
	const vars: Record<string, string> = {};
	for (const line of readFileSync(path, "utf8").split("\n")) {
		const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
		if (match) vars[match[1]] = match[2].replace(/^["']|["']$/g, "");
	}
	return vars;
}

const local = devVars();
const url = (process.env.DRAIN_URL ?? "http://localhost:8787").replace(/\/$/, "");
const secret = process.env.VERCEL_DRAIN_SECRET ?? local.VERCEL_DRAIN_SECRET;
const queryToken = process.env.QUERY_TOKEN ?? local.QUERY_TOKEN;
if (!secret || !queryToken) {
	console.error("Set VERCEL_DRAIN_SECRET and QUERY_TOKEN (env or .dev.vars)");
	process.exit(1);
}

const runId = `smoke-${Date.now()}`;
const now = Date.now();
const records = [
	{
		id: `${runId}-1`,
		deploymentId: "dpl_smoke",
		source: "lambda",
		host: "inbound.new",
		timestamp: now - 5_000,
		projectId: "prj_smoke",
		level: "error",
		message: `boom for bob@example.org with Bearer abcdef1234567890 and sk_test_abcdefghijklmnop1234 (${runId})`,
		requestId: `${runId}-req`,
		statusCode: 500,
		path: "/api/e2/[[...slugs]]",
		proxy: {
			timestamp: now - 5_200,
			method: "POST",
			host: "inbound.new",
			path: "/api/e2/emails?api_key=leakme123456",
			userAgent: ["smoke"],
			region: "iad1",
			statusCode: 500,
		},
	},
	{
		id: `${runId}-2`,
		deploymentId: "dpl_smoke",
		source: "lambda",
		host: "inbound.new",
		timestamp: now - 4_000,
		projectId: "prj_smoke",
		level: "info",
		message: `REPORT RequestId: x\tDuration: 12.5 ms\tBilled Duration: 13 ms (${runId})`,
		requestId: `${runId}-req2`,
		statusCode: 200,
		proxy: { timestamp: now - 4_100, method: "GET", host: "inbound.new", path: "/api/e2/domains", userAgent: ["smoke"], region: "iad1", statusCode: 200 },
	},
];

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
	console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
	if (!ok) failures++;
}

function sign(body: string | Uint8Array, key = secret as string) {
	return createHmac("sha1", key).update(body).digest("hex");
}

async function post(body: string | Uint8Array, headers: Record<string, string>) {
	return fetch(`${url}/ingest`, { method: "POST", body, headers });
}

const handshake = await fetch(`${url}/ingest`);
check("GET /ingest handshake", handshake.status === 200, `status ${handshake.status}, x-vercel-verify ${handshake.headers.has("x-vercel-verify") ? "present" : "missing"}`);

const ndjson = records.map((r) => JSON.stringify(r)).join("\n");
const unsigned = await post(ndjson, { "content-type": "application/x-ndjson" });
check("unsigned POST rejected", unsigned.status === 401, `status ${unsigned.status}`);

const forged = await post(ndjson, { "x-vercel-signature": sign(ndjson, "not-the-secret") });
check("bad signature rejected", forged.status === 403, `status ${forged.status}`);

const signed = await post(ndjson, { "content-type": "application/x-ndjson", "x-vercel-signature": sign(ndjson) });
check("signed NDJSON accepted", signed.status === 200, JSON.stringify(await signed.json()));

const gzBody = gzipSync(JSON.stringify([{ ...records[1], id: `${runId}-3`, requestId: `${runId}-req3` }]));
const gz = await post(gzBody, { "content-encoding": "gzip", "x-vercel-signature": sign(gzBody) });
check("signed gzip JSON accepted", gz.status === 200, JSON.stringify(await gz.json()));

const delay = Number(process.env.QUERY_DELAY_SECONDS ?? "0");
if (delay > 0) {
	console.log(`waiting ${delay}s for the pipeline to roll files into R2...`);
	await new Promise((resolve) => setTimeout(resolve, delay * 1000));
}

const auth = { authorization: `Bearer ${queryToken}` };
const noAuth = await fetch(`${url}/query`);
check("query without token rejected", noAuth.status === 401, `status ${noAuth.status}`);

const byRequest = await fetch(`${url}/query?requestId=${runId}-req`, { headers: auth });
const found = (await byRequest.json()) as { logs: Array<Record<string, unknown>> };
const stored = JSON.stringify(found.logs[0] ?? {});
check("query by requestId", found.logs.length === 1, `${found.logs.length} log(s)`);
check(
	"secrets and emails redacted",
	!/abcdef1234567890|sk_test_|bob@|leakme/.test(stored),
	String(found.logs[0]?.message ?? ""),
);

const errors = await fetch(`${url}/query?level=error&q=${runId}`, { headers: auth });
const errorLogs = (await errors.json()) as { logs: unknown[] };
check("query by level + text", errorLogs.logs.length === 1, `${errorLogs.logs.length} log(s)`);

const metrics = await fetch(`${url}/metrics?engine=scan&from=${now - 60_000}`, { headers: auth });
const metricsBody = (await metrics.json()) as { routes: Array<{ route: string; requests: number; p50_ms: number | null }> };
const domains = metricsBody.routes.find((r) => r.route === "/api/e2/domains");
check("scan metrics", metrics.status === 200 && (domains?.requests ?? 0) >= 2, JSON.stringify(domains));

process.exit(failures === 0 ? 0 : 1);
