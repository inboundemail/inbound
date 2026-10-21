import { type Env, type LogRecord, intVar, logPrefix } from "./env";
import { emailTag } from "./redact";
import { hourFloor, hourPrefix } from "./storage";

const HOUR_MS = 3_600_000;
const ROLL_SLACK_MS = 10 * 60_000;
const MAX_LIMIT = 1000;

export interface Cursor {
	ts: number;
	id: string;
}

export interface Filters {
	from: number;
	to: number;
	before?: Cursor;
	levels?: Set<string>;
	sources?: Set<string>;
	pathPrefix?: string;
	status?: { min: number; max: number };
	requestId?: string;
	text?: string;
	host?: string;
	limit: number;
}

export class QueryError extends Error {}

function parseTime(value: string | null, fallback: number): number {
	if (value === null || value === "") return fallback;
	if (/^\d+$/.test(value)) {
		const n = Number(value);
		return n < 1e12 ? n * 1000 : n;
	}
	const parsed = Date.parse(value);
	if (!Number.isFinite(parsed)) throw new QueryError(`invalid time: ${value}`);
	return parsed;
}

function parseStatus(value: string | null): Filters["status"] {
	if (!value) return undefined;
	const v = value.trim().toLowerCase();
	let match = /^([1-5])xx$/.exec(v);
	if (match) {
		const base = Number(match[1]) * 100;
		return { min: base, max: base + 99 };
	}
	match = /^(-?\d{1,3})$/.exec(v);
	if (match) return { min: Number(match[1]), max: Number(match[1]) };
	match = /^(\d{3})-(\d{3})$/.exec(v);
	if (match) return { min: Number(match[1]), max: Number(match[2]) };
	match = /^>=(\d{3})$/.exec(v);
	if (match) return { min: Number(match[1]), max: 999 };
	throw new QueryError("status must look like 500, 5xx, 400-499 or >=400");
}

function parseSet(value: string | null): Set<string> | undefined {
	if (!value) return undefined;
	const items = value
		.split(",")
		.map((s) => s.trim().toLowerCase())
		.filter(Boolean);
	return items.length > 0 ? new Set(items) : undefined;
}

function parseCursor(value: string | null): Cursor | undefined {
	if (!value) return undefined;
	const match = /^(\d+):(.*)$/.exec(value);
	if (!match) throw new QueryError("invalid cursor");
	return { ts: Number(match[1]), id: match[2] };
}

export function encodeCursor(cursor: Cursor): string {
	return `${cursor.ts}:${cursor.id}`;
}

export function parseFilters(url: URL, env: Env, maxHoursOverride?: number): Filters {
	const p = url.searchParams;
	const before = parseCursor(p.get("cursor"));
	const to = before ? before.ts + 1 : parseTime(p.get("to"), Date.now());
	const from = parseTime(p.get("from"), to - HOUR_MS);
	if (from >= to) throw new QueryError("from must be before to");
	const maxHours = maxHoursOverride ?? intVar(env.MAX_QUERY_HOURS, 24);
	if (to - from > maxHours * HOUR_MS) {
		throw new QueryError(`time window is limited to ${maxHours}h; page with from/to`);
	}
	const limit = Math.min(intVar(p.get("limit") ?? undefined, 100), MAX_LIMIT);

	let text = p.get("q")?.trim() || undefined;
	const email = p.get("email")?.trim();
	if (email) {
		if (!env.EMAIL_HASH_KEY) throw new QueryError("email search needs EMAIL_HASH_KEY");
		const tag = emailTag(email, env.EMAIL_HASH_KEY);
		if (!tag) throw new QueryError("invalid email");
		if (text) throw new QueryError("use either q or email, not both");
		text = `~${tag}`;
	}

	return {
		from,
		to,
		before,
		levels: parseSet(p.get("level")),
		sources: parseSet(p.get("source")),
		pathPrefix: p.get("path")?.trim() || undefined,
		status: parseStatus(p.get("status")),
		requestId: p.get("requestId")?.trim() || undefined,
		text,
		host: p.get("host")?.trim().toLowerCase() || undefined,
		limit,
	};
}

function newerFirst(a: LogRecord, b: LogRecord): number {
	if (a.ts !== b.ts) return b.ts - a.ts;
	return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

export function matches(record: LogRecord, f: Filters, textLower?: string): boolean {
	if (record.ts < f.from || record.ts >= f.to) return false;
	if (f.before && record.ts === f.before.ts && !(record.id < f.before.id)) return false;
	if (f.levels && !f.levels.has(record.level)) return false;
	if (f.sources && !f.sources.has(record.source)) return false;
	if (f.requestId && record.request_id !== f.requestId) return false;
	if (f.host && record.host?.toLowerCase() !== f.host) return false;
	if (f.status) {
		if (record.status === undefined || record.status < f.status.min || record.status > f.status.max)
			return false;
	}
	if (f.pathPrefix) {
		const p = f.pathPrefix;
		const ok =
			record.req_path?.startsWith(p) || record.path?.startsWith(p) || record.route?.startsWith(p);
		if (!ok) return false;
	}
	if (textLower) {
		const hay = `${record.message ?? ""}\n${record.req_path ?? ""}`.toLowerCase();
		if (!hay.includes(textLower)) return false;
	}
	return true;
}

function toRecord(value: unknown): LogRecord | null {
	if (!value || typeof value !== "object") return null;
	let v = value as Record<string, unknown>;
	if (typeof v.ts !== "number" && "value" in v) {
		const inner = typeof v.value === "string" ? JSON.parse(v.value) : v.value;
		if (!inner || typeof inner !== "object") return null;
		v = inner as Record<string, unknown>;
	}
	if (typeof v.ts !== "number" || typeof v.id !== "string") return null;
	for (const key of Object.keys(v)) if (v[key] === null) delete v[key];
	return v as LogRecord;
}

function escapeRegExp(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function prefilterFor(f: Filters): ((line: string) => boolean) | null {
	const checks: Array<(line: string) => boolean> = [];
	if (f.requestId && !/["\\]/.test(f.requestId)) {
		const id = f.requestId;
		checks.push((line) => line.includes(id));
	}
	if (f.text && !/["\\\u0000-\u001f]/.test(f.text)) {
		const re = new RegExp(escapeRegExp(f.text), "i");
		checks.push((line) => re.test(line));
	}
	if (checks.length === 0) return null;
	return (line) => checks.every((check) => check(line));
}

async function* objectLines(object: R2ObjectBody): AsyncGenerator<string> {
	const reader = object.body.getReader();
	const first = await reader.read();
	if (first.done) return;
	const head = first.value;
	const gz = head.length > 2 && head[0] === 0x1f && head[1] === 0x8b;
	let stream = new ReadableStream<Uint8Array>({
		start(controller) {
			controller.enqueue(head);
		},
		async pull(controller) {
			const { done, value } = await reader.read();
			if (done) controller.close();
			else controller.enqueue(value);
		},
		cancel(reason) {
			return reader.cancel(reason);
		},
	});
	if (gz) stream = stream.pipeThrough(new DecompressionStream("gzip"));
	const lines = stream.pipeThrough(new TextDecoderStream()).getReader();
	let rest = "";
	while (true) {
		const { done, value } = await lines.read();
		if (done) break;
		rest += value;
		let start = 0;
		let idx = rest.indexOf("\n", start);
		while (idx !== -1) {
			if (idx > start) yield rest.slice(start, idx);
			start = idx + 1;
			idx = rest.indexOf("\n", start);
		}
		rest = rest.slice(start);
	}
	if (rest.trim().length > 0) yield rest;
}

export interface ScanStats {
	partitions: number;
	objects: number;
	bytes: number;
	lines: number;
}

export interface ScanResult {
	stats: ScanStats;
	truncated: boolean;
	/** Every record with ts >= completeUntil (and < to) has been visited. */
	completeUntil: number;
}

export interface ScanVisitor {
	onRecord(record: LogRecord): void;
	onPartitionDone?(partitionStart: number): boolean;
}

export interface ScanLimits {
	maxBytes?: number;
}

/**
 * Walks hourly partitions newest-first. Partitions are keyed by ingest/roll
 * time, so partition P holds records with ts in
 * [P - INGEST_LAG_MINUTES, P + 1h + ROLL_SLACK_MS).
 */
export async function scan(
	env: Env,
	f: Filters,
	visitor: ScanVisitor,
	limits: ScanLimits = {},
): Promise<ScanResult> {
	const prefix = logPrefix(env);
	const maxBytes = limits.maxBytes ?? intVar(env.MAX_SCAN_MB, 1024) * 1024 * 1024;
	const maxObjects = intVar(env.MAX_SCAN_OBJECTS, 5000);
	const ingestLag = intVar(env.INGEST_LAG_MINUTES, 60) * 60_000;
	const prefilter = prefilterFor(f);
	const stats: ScanStats = { partitions: 0, objects: 0, bytes: 0, lines: 0 };
	const first = hourFloor(f.from - ROLL_SLACK_MS);
	let completeUntil = f.to;

	for (let hour = hourFloor(f.to - 1 + ingestLag); hour >= first; hour -= HOUR_MS) {
		stats.partitions++;
		let cursor: string | undefined;
		do {
			const listed = await env.LOGS.list({ prefix: hourPrefix(prefix, hour), cursor, limit: 1000 });
			for (const entry of listed.objects) {
				if (stats.bytes >= maxBytes || stats.objects >= maxObjects) {
					return { stats, truncated: true, completeUntil };
				}
				const object = await env.LOGS.get(entry.key);
				if (!object) continue;
				stats.objects++;
				for await (const line of objectLines(object)) {
					stats.bytes += line.length + 1;
					stats.lines++;
					if (prefilter && !prefilter(line)) continue;
					let record: LogRecord | null;
					try {
						record = toRecord(JSON.parse(line));
					} catch {
						continue;
					}
					if (record) visitor.onRecord(record);
				}
			}
			cursor = listed.truncated ? listed.cursor : undefined;
		} while (cursor);
		completeUntil = Math.min(f.to, Math.max(f.from, hour + ROLL_SLACK_MS));
		if (visitor.onPartitionDone?.(hour)) break;
	}
	return { stats, truncated: false, completeUntil: f.from };
}

export async function queryLogs(env: Env, f: Filters) {
	const textLower = f.text?.toLowerCase();
	let top: LogRecord[] = [];
	const compact = () => {
		top.sort(newerFirst);
		if (top.length > f.limit) top = top.slice(0, f.limit);
	};

	const result = await scan(env, f, {
		onRecord(record) {
			if (!matches(record, f, textLower)) return;
			top.push(record);
			if (top.length >= f.limit * 4) compact();
		},
		onPartitionDone(partitionStart) {
			compact();
			return top.length >= f.limit && top[top.length - 1].ts >= partitionStart + ROLL_SLACK_MS;
		},
	});
	compact();

	let logs = top;
	let nextCursor: string | null = null;
	let note: string | undefined;
	if (result.truncated) {
		if (result.completeUntil < f.to) {
			logs = top.filter((r) => r.ts >= result.completeUntil);
			nextCursor =
				logs.length >= f.limit
					? encodeCursor(logs[logs.length - 1])
					: encodeCursor({ ts: result.completeUntil - 1, id: "\uffff" });
		} else {
			note = "scan budget ran out inside one partition; results are partial — narrow the window or add filters";
		}
	} else if (top.length >= f.limit) {
		nextCursor = encodeCursor(top[top.length - 1]);
	}
	if (nextCursor !== null && Number(nextCursor.split(":", 1)[0]) < f.from) nextCursor = null;

	return {
		logs,
		count: logs.length,
		truncated: result.truncated,
		nextCursor,
		...(note ? { note } : {}),
		window: { from: new Date(f.from).toISOString(), to: new Date(f.to).toISOString() },
		scanned: result.stats,
	};
}
