import type { LogRecord } from "./env";
import { redact } from "./redact";

type Json = Record<string, unknown>;

export interface NormalizeOptions {
	maxMessageChars: number;
	emailHashKey?: string;
}

const REPORT_DURATION = /(?<!Billed |Init )\bDuration:\s*([0-9]+(?:\.[0-9]+)?)\s*ms/;
const ID_SEGMENT =
	/^(?:[0-9]+|[0-9a-f]{16,}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|(?=[^/]*[0-9])[A-Za-z0-9_.~-]{12,}|[A-Za-z0-9_.~-]{32,}|.*@.*)$/i;

function str(value: unknown, max = 2048): string | undefined {
	if (typeof value === "string") return value.length > max ? value.slice(0, max) : value;
	if (typeof value === "number" && Number.isFinite(value)) return String(value);
	return undefined;
}

function int(value: unknown): number | undefined {
	const n = typeof value === "string" ? Number(value) : value;
	return typeof n === "number" && Number.isFinite(n) ? Math.trunc(n) : undefined;
}

function num(value: unknown): number | undefined {
	const n = typeof value === "string" ? Number(value) : value;
	return typeof n === "number" && Number.isFinite(n) && n >= 0 ? n : undefined;
}

function obj(value: unknown): Json | undefined {
	return value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : undefined;
}

function timestamp(value: unknown): number {
	if (typeof value === "number" && Number.isFinite(value)) {
		return value < 1e12 ? Math.trunc(value * 1000) : Math.trunc(value);
	}
	if (typeof value === "string") {
		const parsed = Date.parse(value);
		if (Number.isFinite(parsed)) return parsed;
	}
	return Date.now();
}

export function routeFor(path: string | undefined): string | undefined {
	if (!path) return undefined;
	const bare = path.split(/[?#]/, 1)[0] || "/";
	const segments = bare.split("/").map((segment) => {
		if (segment === "" || segment.startsWith("[")) return segment;
		return ID_SEGMENT.test(segment) ? ":id" : segment;
	});
	const route = segments.join("/") || "/";
	return route.length > 200 ? route.slice(0, 200) : route;
}

function durationFrom(raw: Json, proxy: Json | undefined, message: string | undefined) {
	const direct = num(raw.durationMs) ?? num(raw.duration) ?? num(proxy?.duration);
	if (direct !== undefined) return direct;
	if (!message || !message.includes("Duration:")) return undefined;
	const match = REPORT_DURATION.exec(message);
	return match ? Number(match[1]) : undefined;
}

export function normalize(input: unknown, options: NormalizeOptions): LogRecord | null {
	const raw = obj(input);
	if (!raw) return null;
	const proxy = obj(raw.proxy);
	const key = options.emailHashKey;

	const rawMessage =
		typeof raw.message === "string"
			? raw.message
			: raw.message === undefined || raw.message === null
				? undefined
				: JSON.stringify(raw.message);
	const durationMs = durationFrom(raw, proxy, rawMessage);
	const message =
		rawMessage === undefined
			? undefined
			: redact(
					rawMessage.length > options.maxMessageChars
						? `${rawMessage.slice(0, options.maxMessageChars)}…[truncated]`
						: rawMessage,
					key,
				);

	const reqPathRaw = str(proxy?.path);
	const reqPath = reqPathRaw === undefined ? undefined : redact(reqPathRaw, key);
	const path = str(raw.path);
	const userAgents = proxy?.userAgent;
	const userAgent = Array.isArray(userAgents) ? str(userAgents[0], 512) : str(userAgents, 512);
	const referer = str(proxy?.referer);
	const destination = str(raw.destination);
	const ts = timestamp(raw.timestamp);

	const record: LogRecord = {
		ts,
		id: str(raw.id, 128) ?? `${ts}-${crypto.randomUUID()}`,
		level: (str(raw.level, 16) ?? "info").toLowerCase(),
		source: str(raw.source, 32) ?? "unknown",
		type: str(raw.type, 64),
		message,
		request_id: str(raw.requestId, 128),
		trace_id: str(raw.traceId, 64) ?? str(raw["trace.id"], 64),
		span_id: str(raw.spanId, 64) ?? str(raw["span.id"], 64),
		host: str(raw.host, 256),
		path,
		route: routeFor(reqPath ?? path),
		entrypoint: str(raw.entrypoint, 256),
		status: int(raw.statusCode) ?? int(proxy?.statusCode),
		method: str(proxy?.method, 16),
		req_path: reqPath,
		client_ip: str(proxy?.clientIp, 64),
		user_agent: userAgent,
		referer: referer === undefined ? undefined : redact(referer, key),
		region: str(raw.executionRegion, 16) ?? str(proxy?.lambdaRegion, 16) ?? str(proxy?.region, 16),
		cache: str(proxy?.vercelCache, 16),
		path_type: str(proxy?.pathType, 32),
		waf_action: str(proxy?.wafAction, 16),
		response_bytes: int(proxy?.responseByteSize),
		duration_ms: durationMs,
		deployment_id: str(raw.deploymentId, 64),
		project_id: str(raw.projectId, 64),
		project_name: str(raw.projectName, 128),
		environment: str(raw.environment, 32),
		branch: str(raw.branch, 256),
		build_id: str(raw.buildId, 64),
		edge_type: str(raw.edgeType, 32),
		destination: destination === undefined ? undefined : redact(destination, key),
	};

	const loose = record as Record<string, unknown>;
	for (const field of Object.keys(loose)) {
		if (loose[field] === undefined) delete loose[field];
	}
	return record;
}

export function parseDrainBody(text: string): { items: unknown[]; malformed: number } {
	const trimmed = text.trim();
	if (trimmed === "") return { items: [], malformed: 0 };
	if (trimmed.startsWith("[")) {
		const parsed: unknown = JSON.parse(trimmed);
		return Array.isArray(parsed) ? { items: parsed, malformed: 0 } : { items: [], malformed: 1 };
	}
	const items: unknown[] = [];
	let malformed = 0;
	for (const line of trimmed.split("\n")) {
		const candidate = line.trim();
		if (candidate === "") continue;
		try {
			items.push(JSON.parse(candidate));
		} catch {
			malformed++;
		}
	}
	return { items, malformed };
}
