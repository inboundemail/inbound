import { LOCAL_DB_NAME, LOCAL_REDIS_REST_TOKEN, LOCAL_REDIS_REST_URL } from "@/scripts/local-dev/env";

const COMPOSE = ["docker", "compose", "-f", "docker-compose.dev.yml"];

function run(cmd: string[], input?: string) {
	const result = Bun.spawnSync(cmd, {
		stdin: input === undefined ? "ignore" : new TextEncoder().encode(input),
		stdout: "pipe",
		stderr: "pipe",
	});
	if (result.exitCode !== 0) {
		const output = result.stderr.toString() || result.stdout.toString();
		throw new Error(`Command failed: ${cmd.join(" ")}\n${output}`);
	}
	return result.stdout.toString();
}

export function psql(query: string, databaseName = LOCAL_DB_NAME) {
	return run(
		[...COMPOSE, "exec", "-T", "postgres", "psql", "-U", "postgres", "-d", databaseName, "-v", "ON_ERROR_STOP=1", "-tA"],
		query,
	).trim();
}

export function startServices() {
	run([...COMPOSE, "up", "-d", "--wait"]);
}

export function removeServices() {
	run([...COMPOSE, "down", "-v"]);
}

function schemaSql() {
	return run(["bunx", "drizzle-kit", "export", "--dialect=postgresql", "--schema=./lib/db/schema.ts"]);
}

export function ensureSchema(databaseName = LOCAL_DB_NAME) {
	const hasSchema = psql("select to_regclass('public.\"user\"') is not null;", databaseName);
	if (hasSchema === "t") return false;
	psql(schemaSql(), databaseName);
	return true;
}

export function recreateDatabase(databaseName: string) {
	if (databaseName === LOCAL_DB_NAME) {
		throw new Error("Refusing to recreate the main local development database");
	}
	psql(`drop database if exists "${databaseName}" with (force);`, "postgres");
	psql(`create database "${databaseName}";`, "postgres");
	psql(schemaSql(), databaseName);
}

export async function flushRedis() {
	const response = await fetch(LOCAL_REDIS_REST_URL, {
		method: "POST",
		headers: { Authorization: `Bearer ${LOCAL_REDIS_REST_TOKEN}`, "Content-Type": "application/json" },
		body: JSON.stringify(["FLUSHALL"]),
	});
	if (!response.ok) throw new Error(`Failed to flush local Redis (${response.status})`);
}

export function runSeed<T>(args: string[], env: Record<string, string>): T {
	const result = Bun.spawnSync(["bun", "scripts/local-dev/seed.ts", ...args], {
		env,
		stdin: "ignore",
		stdout: "pipe",
		stderr: "pipe",
	});
	const stdout = result.stdout.toString();
	const marker = stdout.split("\n").find((line) => line.startsWith("__SEED_RESULT__"));
	if (result.exitCode !== 0 || !marker) {
		throw new Error(`Seeding failed (${args.join(" ")}):\n${result.stderr.toString() || stdout}`);
	}
	return JSON.parse(marker.slice("__SEED_RESULT__".length)) as T;
}
