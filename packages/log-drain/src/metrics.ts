import type { Env, LogRecord } from "./env";
import { type Filters, QueryError, matches, scan } from "./query";

const MAX_POINTS_PER_INVOCATION = 250;
const MAX_INDEX_BYTES = 96;
const MAX_SCAN_GROUPS = 200_000;
const SCAN_METRICS_MAX_BYTES = 256 * 1024 * 1024;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function truncateBytes(value: string, max: number): string {
	const bytes = encoder.encode(value);
	if (bytes.length <= max) return value;
	return decoder.decode(bytes.slice(0, max)).replace(/\uFFFD$/, "");
}

interface RequestSample {
	route: string;
	method: string;
	source: string;
	host: string;
	region: string;
	status: number;
	durationMs?: number;
}

function isRequestRecord(r: LogRecord): boolean {
	return r.status !== undefined || r.req_path !== undefined;
}

function mergeSample(target: RequestSample | undefined, r: LogRecord): RequestSample {
	const s: RequestSample = target ?? {
		route: r.route ?? r.path ?? "unknown",
		method: r.method ?? "",
		source: r.source,
		host: r.host ?? "",
		region: r.region ?? "",
		status: r.status ?? 0,
	};
	if (r.status !== undefined && (r.status > s.status || r.status < 0)) s.status = r.status;
	if (r.duration_ms !== undefined) s.durationMs = Math.max(s.durationMs ?? 0, r.duration_ms);
	if (!s.method && r.method) s.method = r.method;
	return s;
}

function groupRequests(records: Iterable<LogRecord>): Map<string, RequestSample> {
	const groups = new Map<string, RequestSample>();
	for (const r of records) {
		if (!isRequestRecord(r) && r.duration_ms === undefined) continue;
		const key = r.request_id ?? r.id;
		groups.set(key, mergeSample(groups.get(key), r));
	}
	return groups;
}

export function writeMetrics(env: Env, records: LogRecord[]): number {
	if (!env.METRICS) return 0;
	const rate = Math.min(1, Math.max(0, Number(env.METRICS_SAMPLE_RATE ?? "1") || 0));
	if (rate === 0) return 0;
	let samples = [...groupRequests(records).values()];
	let weight = 1;
	if (rate < 1) {
		samples = samples.filter(() => Math.random() < rate);
		weight = 1 / rate;
	}
	if (samples.length > MAX_POINTS_PER_INVOCATION) {
		weight *= samples.length / MAX_POINTS_PER_INVOCATION;
		for (let i = samples.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[samples[i], samples[j]] = [samples[j], samples[i]];
		}
		samples = samples.slice(0, MAX_POINTS_PER_INVOCATION);
	}
	for (const s of samples) {
		env.METRICS.writeDataPoint({
			indexes: [truncateBytes(s.route, MAX_INDEX_BYTES)],
			blobs: [s.route, s.method, s.source, s.host, s.region].map((b) => truncateBytes(b, 512)),
			doubles: [s.status, s.durationMs ?? 0, s.durationMs === undefined ? 0 : 1, weight],
		});
	}
	return samples.length;
}

export interface RouteMetrics {
	route: string;
	requests: number;
	errors: number;
	client_errors: number;
	p50_ms: number | null;
	p95_ms: number | null;
}

function percentile(sorted: number[], q: number): number | null {
	if (sorted.length === 0) return null;
	const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1));
	return Math.round(sorted[idx] * 100) / 100;
}

export async function scanMetrics(env: Env, f: Filters) {
	const groups = new Map<string, RequestSample>();
	const scope: Filters = { ...f, status: undefined, levels: undefined, before: undefined };
	let capped = false;
	const result = await scan(
		env,
		f,
		{
			onRecord(record) {
				if (!isRequestRecord(record) && record.duration_ms === undefined) return;
				if (!matches(record, scope)) return;
				const key = record.request_id ?? record.id;
				const existing = groups.get(key);
				if (!existing && groups.size >= MAX_SCAN_GROUPS) {
					capped = true;
					return;
				}
				groups.set(key, mergeSample(existing, record));
			},
			onPartitionDone: () => capped,
		},
		{ maxBytes: SCAN_METRICS_MAX_BYTES },
	);

	const byRoute = new Map<string, RequestSample[]>();
	for (const s of groups.values()) {
		const list = byRoute.get(s.route) ?? [];
		list.push(s);
		byRoute.set(s.route, list);
	}
	const routes: RouteMetrics[] = [];
	for (const [route, samples] of byRoute) {
		const durations = samples
			.map((s) => s.durationMs)
			.filter((d): d is number => d !== undefined)
			.sort((a, b) => a - b);
		routes.push({
			route,
			requests: samples.length,
			errors: samples.filter((s) => s.status >= 500 || s.status < 0).length,
			client_errors: samples.filter((s) => s.status >= 400 && s.status < 500).length,
			p50_ms: percentile(durations, 0.5),
			p95_ms: percentile(durations, 0.95),
		});
	}
	routes.sort((a, b) => b.requests - a.requests);
	return {
		engine: "scan",
		truncated: result.truncated || capped,
		scanned: result.stats,
		routes: routes.slice(0, 200),
	};
}

function safeValue(value: string): string {
	if (/['\\%\u0000-\u001f]/.test(value) || value.length > 256) {
		throw new QueryError("filter values for the analytics engine cannot contain quotes, backslashes, % or control characters");
	}
	return value;
}

function sqlLiteral(value: string): string {
	return `'${safeValue(value)}'`;
}

async function aeQuery(env: Env, sql: string): Promise<Array<Record<string, unknown>>> {
	const res = await fetch(
		`https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/analytics_engine/sql`,
		{
			method: "POST",
			headers: { authorization: `Bearer ${env.CF_ANALYTICS_TOKEN}` },
			body: sql,
		},
	);
	if (!res.ok) throw new Error(`analytics engine query failed: ${res.status}`);
	const body = (await res.json()) as { data?: Array<Record<string, unknown>> };
	return body.data ?? [];
}

export async function analyticsMetrics(env: Env, f: Filters) {
	const dataset = env.AE_DATASET ?? "inbound_requests";
	if (!/^[A-Za-z0-9_]+$/.test(dataset)) throw new QueryError("invalid AE_DATASET");
	const where = [
		`timestamp >= toDateTime(${Math.floor(f.from / 1000)})`,
		`timestamp < toDateTime(${Math.ceil(f.to / 1000)})`,
	];
	if (f.levels || f.status || f.requestId || f.text || f.before) {
		throw new QueryError("level, status, requestId, q, email and cursor need engine=scan");
	}
	if (f.pathPrefix) where.push(`blob1 LIKE '${safeValue(f.pathPrefix)}%'`);
	if (f.sources) where.push(`blob3 IN (${[...f.sources].map(sqlLiteral).join(", ")})`);
	if (f.host) where.push(`blob4 = ${sqlLiteral(f.host)}`);
	const w = where.join(" AND ");

	const [counts, latency] = await Promise.all([
		aeQuery(
			env,
			`SELECT blob1 AS route, SUM(_sample_interval * double4) AS requests, ` +
				`sumIf(_sample_interval * double4, double1 >= 500 OR double1 < 0) AS errors, ` +
				`sumIf(_sample_interval * double4, double1 >= 400 AND double1 < 500) AS client_errors ` +
				`FROM ${dataset} WHERE ${w} GROUP BY route ORDER BY requests DESC LIMIT 200 FORMAT JSON`,
		),
		aeQuery(
			env,
			`SELECT blob1 AS route, quantileExactWeighted(0.5)(double2, _sample_interval) AS p50, ` +
				`quantileExactWeighted(0.95)(double2, _sample_interval) AS p95 ` +
				`FROM ${dataset} WHERE ${w} AND double3 = 1 GROUP BY route LIMIT 1000 FORMAT JSON`,
		),
	]);

	const lat = new Map(latency.map((row) => [String(row.route), row]));
	const round = (v: unknown) => (v === undefined || v === null ? null : Math.round(Number(v) * 100) / 100);
	const prefix = f.pathPrefix;
	const rows = prefix ? counts.filter((row) => String(row.route).startsWith(prefix)) : counts;
	const routes: RouteMetrics[] = rows.map((row) => ({
		route: String(row.route),
		requests: Math.round(Number(row.requests)),
		errors: Math.round(Number(row.errors)),
		client_errors: Math.round(Number(row.client_errors)),
		p50_ms: round(lat.get(String(row.route))?.p50),
		p95_ms: round(lat.get(String(row.route))?.p95),
	}));
	return { engine: "analytics-engine", truncated: false, routes };
}
