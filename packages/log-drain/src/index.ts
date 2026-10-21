import { bearerToken, safeEqual, verifyVercelSignature } from "./crypto";
import { type Env, type LogRecord, intVar } from "./env";
import { analyticsMetrics, scanMetrics, writeMetrics } from "./metrics";
import { normalize, parseDrainBody } from "./normalize";
import { QueryError, parseFilters, queryLogs } from "./query";
import { enforceRetention } from "./retention";
import { storeRecords } from "./storage";

const MAX_BODY_BYTES = 4 * 1024 * 1024;
const MAX_INFLATED_BYTES = 8 * 1024 * 1024;
const MIN_QUERY_TOKEN_LENGTH = 32;
const METRICS_MAX_HOURS = 24 * 30;

function json(body: unknown, status = 200, headers: HeadersInit = {}): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json", "cache-control": "no-store", ...headers },
	});
}

function verifyHeaders(env: Env): Record<string, string> {
	return env.VERCEL_VERIFY_TOKEN ? { "x-vercel-verify": env.VERCEL_VERIFY_TOKEN } : {};
}

async function readCapped(stream: ReadableStream<Uint8Array>, max: number): Promise<Uint8Array | null> {
	const reader = stream.getReader();
	const chunks: Uint8Array[] = [];
	let total = 0;
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		total += value.byteLength;
		if (total > max) {
			await reader.cancel();
			return null;
		}
		chunks.push(value);
	}
	const out = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		out.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return out;
}

async function readBody(request: Request): Promise<Uint8Array | null> {
	const declared = Number(request.headers.get("content-length") ?? "0");
	if (declared > MAX_BODY_BYTES) return null;
	if (!request.body) return new Uint8Array(0);
	return readCapped(request.body, MAX_BODY_BYTES);
}

function gunzip(bytes: Uint8Array): Promise<Uint8Array | null> {
	const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
	return readCapped(stream, MAX_INFLATED_BYTES);
}

function isGzip(bytes: Uint8Array): boolean {
	return bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
}

async function handleIngest(request: Request, env: Env): Promise<Response> {
	const vh = verifyHeaders(env);
	if (request.method === "GET" || request.method === "HEAD") {
		return new Response(request.method === "HEAD" ? null : "ok", { status: 200, headers: vh });
	}
	if (request.method !== "POST") return json({ error: "method not allowed" }, 405, vh);

	const raw = await readBody(request);
	if (raw === null) return json({ error: "payload too large" }, 413, vh);

	const signature = request.headers.get("x-vercel-signature");
	if (!signature) {
		const probe = raw.byteLength === 0 || new TextDecoder().decode(raw).trim() === "";
		return probe ? json({ ok: true }, 200, vh) : json({ error: "missing signature" }, 401, vh);
	}
	if (!env.VERCEL_DRAIN_SECRET) return json({ error: "drain secret not configured" }, 503, vh);

	let body = raw;
	let valid = verifyVercelSignature(raw, signature, env.VERCEL_DRAIN_SECRET);
	if (isGzip(raw)) {
		let inflated: Uint8Array | null;
		try {
			inflated = await gunzip(raw);
		} catch {
			return json({ error: "invalid gzip body" }, 400, vh);
		}
		if (inflated === null) return json({ error: "payload too large" }, 413, vh);
		body = inflated;
		if (!valid) valid = verifyVercelSignature(body, signature, env.VERCEL_DRAIN_SECRET);
	}
	if (!valid) return json({ error: "invalid signature" }, 403, vh);

	let parsed: { items: unknown[]; malformed: number };
	try {
		parsed = parseDrainBody(new TextDecoder().decode(body));
	} catch {
		return json({ error: "invalid JSON" }, 400, vh);
	}

	const options = {
		maxMessageChars: intVar(env.MAX_MESSAGE_CHARS, 32768),
		emailHashKey: env.EMAIL_HASH_KEY,
	};
	const records: LogRecord[] = [];
	let dropped = parsed.malformed;
	for (const item of parsed.items) {
		const record = normalize(item, options);
		if (record) records.push(record);
		else dropped++;
	}

	await storeRecords(env, records);
	let metricPoints = 0;
	try {
		metricPoints = writeMetrics(env, records);
	} catch (error) {
		console.error("metrics write failed", error instanceof Error ? error.message : String(error));
	}
	return json({ ok: true, accepted: records.length, dropped, metricPoints }, 200, vh);
}

function authorize(request: Request, env: Env): Response | null {
	if (!env.QUERY_TOKEN || env.QUERY_TOKEN.length < MIN_QUERY_TOKEN_LENGTH) {
		return json({ error: "query API disabled: QUERY_TOKEN not configured" }, 503);
	}
	const token = bearerToken(request);
	if (!token || !safeEqual(token, env.QUERY_TOKEN)) {
		return json({ error: "unauthorized" }, 401, { "www-authenticate": "Bearer" });
	}
	return null;
}

async function handleQuery(request: Request, env: Env): Promise<Response> {
	const denied = authorize(request, env);
	if (denied) return denied;
	const filters = parseFilters(new URL(request.url), env);
	return json(await queryLogs(env, filters));
}

async function handleMetrics(request: Request, env: Env): Promise<Response> {
	const denied = authorize(request, env);
	if (denied) return denied;
	const url = new URL(request.url);
	const useAnalytics =
		url.searchParams.get("engine") !== "scan" && !!env.CF_ACCOUNT_ID && !!env.CF_ANALYTICS_TOKEN;
	const filters = parseFilters(url, env, useAnalytics ? METRICS_MAX_HOURS : undefined);
	const result = useAnalytics ? await analyticsMetrics(env, filters) : await scanMetrics(env, filters);
	return json({
		window: { from: new Date(filters.from).toISOString(), to: new Date(filters.to).toISOString() },
		...result,
	});
}

export default {
	async fetch(request, env): Promise<Response> {
		const { pathname } = new URL(request.url);
		try {
			if (pathname === "/ingest") return await handleIngest(request, env);
			if (request.method !== "GET") return json({ error: "method not allowed" }, 405);
			if (pathname === "/query") return await handleQuery(request, env);
			if (pathname === "/metrics") return await handleMetrics(request, env);
			if (pathname === "/health") return new Response("ok");
			return json({ error: "not found" }, 404);
		} catch (error) {
			if (error instanceof QueryError) return json({ error: error.message }, 400);
			console.error("log-drain error", error instanceof Error ? error.message : String(error));
			return json({ error: "internal error" }, 500);
		}
	},

	async scheduled(_controller, env, ctx): Promise<void> {
		ctx.waitUntil(
			enforceRetention(env).then((deleted) => {
				if (deleted > 0) console.log(`retention: deleted ${deleted} objects`);
			}),
		);
	},
} satisfies ExportedHandler<Env>;
