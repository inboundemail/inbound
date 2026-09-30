import { existsSync, readFileSync } from "node:fs";
import { parse } from "dotenv";

export const LOCAL_DB_HOST = "db.localtest.me";
export const LOCAL_DB_NAME = "inbound";
export const LOCAL_APP_PORT = 3000;
export const LOCAL_MAIL_PORT = 8780;
export const LOCAL_REDIS_REST_URL = "http://localhost:8079";
export const LOCAL_REDIS_REST_TOKEN = "inbound-local-redis-token";
export const LOCAL_SERVICE_API_KEY = "inbound-local-service-key";

const KEEP_FROM_ENV_FILES = new Set(["GRAVATAR_API_KEY", "BASEHUB_TOKEN"]);
const ENV_FILES = [".env", ".env.local", ".env.development", ".env.development.local"];

export function localDatabaseUrl(databaseName = LOCAL_DB_NAME) {
	return `postgres://postgres:postgres@${LOCAL_DB_HOST}:5432/${databaseName}`;
}

export function isLocalDatabaseUrl(url: string | undefined) {
	if (!url) return false;
	try {
		return new URL(url).hostname === LOCAL_DB_HOST;
	} catch {
		return false;
	}
}

export function buildLocalEnv(options: {
	appUrl: string;
	databaseName?: string;
	mailPort?: number;
	extra?: Record<string, string>;
}) {
	const fileEnv: Record<string, string> = {};
	for (const file of ENV_FILES) {
		if (existsSync(file)) Object.assign(fileEnv, parse(readFileSync(file, "utf8")));
	}

	const env: Record<string, string> = {};
	for (const [key, value] of Object.entries(process.env)) {
		if (value !== undefined) env[key] = value;
	}
	for (const key of Object.keys(fileEnv)) {
		env[key] = KEEP_FROM_ENV_FILES.has(key) ? fileEnv[key] : "";
	}

	return {
		...env,
		NODE_ENV: "development",
		INBOUND_LOCAL_DEV: "true",
		DATABASE_URL: localDatabaseUrl(options.databaseName),
		NEXT_PUBLIC_APP_URL: options.appUrl,
		BETTER_AUTH_SECRET: "inbound-local-dev-secret-not-for-production",
		SERVICE_API_KEY: LOCAL_SERVICE_API_KEY,
		INBOUND_API_KEY: "inbound-local-placeholder",
		UPSTASH_REDIS_REST_URL: LOCAL_REDIS_REST_URL,
		UPSTASH_REDIS_REST_TOKEN: LOCAL_REDIS_REST_TOKEN,
		AUTUMN_SECRET_KEY: "am_sk_local_mock",
		AWS_ENDPOINT_URL: `http://127.0.0.1:${options.mailPort ?? LOCAL_MAIL_PORT}`,
		AWS_ACCESS_KEY_ID: "local",
		AWS_SECRET_ACCESS_KEY: "local",
		AWS_REGION: "us-east-2",
		S3_BUCKET_NAME: "",
		...options.extra,
	};
}
