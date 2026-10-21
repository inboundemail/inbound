import type { Pipeline } from "cloudflare:pipelines";

export type LogRecord = {
	ts: number;
	id: string;
	level: string;
	source: string;
	type?: string;
	message?: string;
	request_id?: string;
	trace_id?: string;
	span_id?: string;
	host?: string;
	path?: string;
	route?: string;
	entrypoint?: string;
	status?: number;
	method?: string;
	req_path?: string;
	client_ip?: string;
	user_agent?: string;
	referer?: string;
	region?: string;
	cache?: string;
	path_type?: string;
	waf_action?: string;
	response_bytes?: number;
	duration_ms?: number;
	deployment_id?: string;
	project_id?: string;
	project_name?: string;
	environment?: string;
	branch?: string;
	build_id?: string;
	edge_type?: string;
	destination?: string;
};

export interface Env {
	LOGS: R2Bucket;
	LOG_STREAM?: Pipeline<LogRecord>;
	METRICS?: AnalyticsEngineDataset;

	VERCEL_DRAIN_SECRET?: string;
	VERCEL_VERIFY_TOKEN?: string;
	QUERY_TOKEN?: string;
	EMAIL_HASH_KEY?: string;
	CF_ANALYTICS_TOKEN?: string;

	CF_ACCOUNT_ID?: string;
	LOG_PREFIX?: string;
	RETENTION_DAYS?: string;
	MAX_QUERY_HOURS?: string;
	MAX_MESSAGE_CHARS?: string;
	MAX_SCAN_MB?: string;
	MAX_SCAN_OBJECTS?: string;
	INGEST_LAG_MINUTES?: string;
	AE_DATASET?: string;
	METRICS_SAMPLE_RATE?: string;
}

export function intVar(value: string | undefined, fallback: number): number {
	const n = Number.parseInt(value ?? "", 10);
	return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function logPrefix(env: Env): string {
	const p = env.LOG_PREFIX ?? "logs/";
	return p === "" || p.endsWith("/") ? p : `${p}/`;
}
