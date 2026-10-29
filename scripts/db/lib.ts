import { chmodSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { parse } from "dotenv";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { Client } from "pg";

export const MIGRATIONS_FOLDER = path.resolve(import.meta.dir, "../../drizzle/migrations");
export const LOCAL_PG_PORT = 54329;

export const UNBASELINED =
	"This database already has tables but no recorded migrations. Record the baseline first: db:baseline:prod, db:baseline:preview <branch> or db:baseline:local [db]. If db:baseline:local refuses an old local database, `bun run dev:local reset` rebuilds it (deletes local data).";

export const MIGRATION_LOCK_KEY = "inbound_db_migrations";

export type Migration = { tag: string; hash: string; when: number };

type JournalEntry = { idx: number; when: number; tag: string };

export function readJournal(folder = MIGRATIONS_FOLDER): JournalEntry[] {
	return JSON.parse(readFileSync(path.join(folder, "meta/_journal.json"), "utf8")).entries;
}

export function readMigrations(folder = MIGRATIONS_FOLDER): Migration[] {
	const entries = readJournal(folder);
	const files = readMigrationFiles({ migrationsFolder: folder });
	return entries.map((entry, i) => ({
		tag: entry.tag,
		when: entry.when,
		hash: files[i].hash,
	}));
}

export function validateFolder(folder = MIGRATIONS_FOLDER) {
	const problems: string[] = [];
	const entries = readJournal(folder);
	const tags = new Set(entries.map((e) => e.tag));
	entries.forEach((entry, i) => {
		const number = entry.tag.slice(0, 4);
		if (entry.idx !== i || number !== String(i).padStart(4, "0")) {
			problems.push(`journal entry ${entry.tag} is out of sequence (expected ${String(i).padStart(4, "0")}_*)`);
		}
		if (i > 0 && entry.when <= entries[i - 1].when) {
			problems.push(`journal entry ${entry.tag} is not newer than ${entries[i - 1].tag}`);
		}
	});
	for (const file of readdirSync(folder)) {
		if (file.endsWith(".sql") && !tags.has(file.slice(0, -4))) {
			problems.push(`${file} is not in meta/_journal.json`);
		}
	}
	for (const tag of tags) {
		try {
			readFileSync(path.join(folder, `${tag}.sql`));
		} catch {
			problems.push(`journal entry ${tag} has no SQL file`);
		}
	}
	return problems;
}

export function hostOf(url: string) {
	return new URL(url).hostname;
}

export function normalizeHost(value: string) {
	let host = value.trim();
	if (host.includes("://")) host = new URL(host).hostname;
	host = host.replace(/:\d+$/, "").toLowerCase().replace(/-pooler(?=\.)/, "");
	if (!host || /[/:@]/.test(host)) throw new Error("Invalid database host: expected a hostname or a database URL (check PROD_DATABASE_HOST)");
	return host;
}

export function localUrl(databaseName: string) {
	return `postgres://postgres:postgres@127.0.0.1:${LOCAL_PG_PORT}/${databaseName}`;
}

export async function withClient<T>(url: string, fn: (client: Client) => Promise<T>) {
	const client = new Client({ connectionString: url });
	await client.connect();
	try {
		return await fn(client);
	} finally {
		await client.end();
	}
}

async function appliedRows(client: Client) {
	const exists = await client.query(`select to_regclass('drizzle.__drizzle_migrations') is not null as ok`);
	if (!exists.rows[0].ok) return [];
	const result = await client.query<{ hash: string; created_at: string }>(
		`select hash, created_at from drizzle.__drizzle_migrations order by created_at`,
	);
	return result.rows.map((row) => ({ hash: row.hash, createdAt: Number(row.created_at) }));
}

export async function migrationStatus(client: Client, folder = MIGRATIONS_FOLDER) {
	const migrations = readMigrations(folder);
	const applied = await appliedRows(client);
	const last = applied.length ? Math.max(...applied.map((row) => row.createdAt)) : null;
	const appliedHashes = new Set(applied.map((row) => row.hash));
	const pending = migrations.filter((m) => last === null || m.when > last);
	const skipped = migrations.filter((m) => last !== null && m.when <= last && !appliedHashes.has(m.hash));
	const hasSchema = await client.query(`select to_regclass('public."user"') is not null as ok`);
	const unbaselined = applied.length === 0 && hasSchema.rows[0].ok === true;
	return { migrations, applied, pending, skipped, unbaselined };
}

export function assertMigratable(status: { skipped: Migration[]; unbaselined: boolean }) {
	if (status.unbaselined) throw new Error(UNBASELINED);
	if (status.skipped.length) {
		throw new Error(
			`These migrations are older than the last applied one but are not recorded (edited after applying, or generated on an older base):\n${status.skipped.map((m) => `  ${m.tag}`).join("\n")}\nNever edit an applied migration. Regenerate unapplied ones on top of the latest migration.`,
		);
	}
}

export const MIGRATION_LOCK_TIMEOUT = "5s";

function isLockTimeout(error: unknown): boolean {
	for (let current: unknown = error; current; current = (current as { cause?: unknown }).cause) {
		if ((current as { code?: unknown }).code === "55P03") return true;
	}
	return false;
}

export async function applyMigrations(url: string, folder = MIGRATIONS_FOLDER) {
	if (/-pooler\./i.test(hostOf(url))) {
		throw new Error("Migrations require a direct database connection. Use DATABASE_URL_UNPOOLED, not a Neon -pooler URL.");
	}
	return withClient(url, async (client) => {
		// drizzle's migrator opens its own transaction, so hold a session-level lock around it.
		await client.query("select pg_advisory_lock(hashtext($1))", [MIGRATION_LOCK_KEY]);
		try {
			const status = await migrationStatus(client, folder);
			assertMigratable(status);
			if (status.pending.length) {
				// drizzle runs pending migrations in its own transaction, which inherits this
				// session setting: a blocked ALTER fails fast instead of queueing inbound inserts.
				await client.query(`select set_config('lock_timeout', $1, false)`, [MIGRATION_LOCK_TIMEOUT]);
				try {
					await migrate(drizzle(client), { migrationsFolder: folder });
				} catch (error) {
					if (isLockTimeout(error)) {
						throw new Error(
							`A migration waited more than ${MIGRATION_LOCK_TIMEOUT} for a table lock and was rolled back; nothing was applied. Another transaction holds the lock (often a long-running query). Retry the command in a moment.`,
						);
					}
					throw error;
				} finally {
					await client.query("reset lock_timeout").catch(() => {});
				}
			}
			return status.pending.map((m) => m.tag);
		} finally {
			await client.query("select pg_advisory_unlock(hashtext($1))", [MIGRATION_LOCK_KEY]);
		}
	});
}

type EnvValues = Record<string, string | undefined>;

export function checkPreviewDatabase(options: {
	branch: string;
	branchEnv: EnvValues;
	sharedEnv: EnvValues;
	productionEnv: EnvValues;
	prodDatabaseUrl?: string;
	prodDatabaseHost?: string;
	allowSharedPreview: boolean;
}) {
	const { branch } = options;
	const url = options.branchEnv.DATABASE_URL_UNPOOLED || options.branchEnv.DATABASE_URL;
	if (!url) throw new Error(`No DATABASE_URL_UNPOOLED in the Vercel Preview environment for branch ${branch}`);
	const host = normalizeHost(url);

	const prodHosts = [
		options.productionEnv.DATABASE_URL,
		options.productionEnv.DATABASE_URL_UNPOOLED,
		options.prodDatabaseUrl,
	]
		.filter((value): value is string => typeof value === "string" && value.includes("://"))
		.map(normalizeHost);
	if (options.prodDatabaseHost) prodHosts.push(normalizeHost(options.prodDatabaseHost));
	if (prodHosts.length === 0) {
		throw new Error(
			"Refusing: cannot tell which host is production (Vercel hides it). Set PROD_DATABASE_HOST (hostname only) or PROD_DATABASE_URL.",
		);
	}
	if (prodHosts.includes(host)) {
		throw new Error(`Refusing: the Preview database for ${branch} resolves to the production host ${hostOf(url)}`);
	}

	const sharedHosts = [options.sharedEnv.DATABASE_URL_UNPOOLED, options.sharedEnv.DATABASE_URL]
		.filter((value): value is string => typeof value === "string" && value.includes("://"))
		.map(normalizeHost);
	if (sharedHosts.includes(host) && !options.allowSharedPreview) {
		throw new Error(
			`Refusing: no branch-specific database for ${branch} yet (${hostOf(url)} is the environment-wide Preview database); deploy the branch first, or pass --allow-shared-preview`,
		);
	}
	return url;
}

export function readPreviewDatabaseUrl(branch: string, allowSharedPreview: boolean) {
	const dir = mkdtempSync(path.join(tmpdir(), "inbound-db-env-"));
	chmodSync(dir, 0o700);
	const pull = (name: string, environment: string, gitBranch?: string) => {
		const file = path.join(dir, `${name}.env`);
		writeFileSync(file, "", { mode: 0o600 });
		const args = ["vercel", "env", "pull", file, `--environment=${environment}`, "--yes"];
		if (gitBranch) args.push(`--git-branch=${gitBranch}`);
		const result = Bun.spawnSync(args, { stdin: "ignore", stdout: "pipe", stderr: "pipe" });
		if (result.exitCode !== 0) {
			throw new Error(
				`vercel env pull (${environment}) failed. Is this checkout linked (vercel link)?\n${result.stderr.toString().trim()}`,
			);
		}
		chmodSync(file, 0o600);
		return parse(readFileSync(file, "utf8"));
	};
	try {
		return checkPreviewDatabase({
			branch,
			branchEnv: pull("preview-branch", "preview", branch),
			sharedEnv: pull("preview-shared", "preview"),
			productionEnv: pull("production", "production"),
			prodDatabaseUrl: process.env.PROD_DATABASE_URL,
			prodDatabaseHost: process.env.PROD_DATABASE_HOST,
			allowSharedPreview,
		});
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

export function requireProdUrl() {
	const url = process.env.PROD_DATABASE_URL;
	if (!url) throw new Error("Set PROD_DATABASE_URL to the production database URL (DATABASE_URL is never used).");
	return url;
}

export function confirmHost(host: string, args: string[]) {
	const yes = args.find((arg) => arg === "--yes" || arg.startsWith("--yes="));
	if (yes === "--yes") throw new Error(`Pass --yes=${host} to skip the prompt.`);
	if (yes) {
		if (yes.slice("--yes=".length) !== host) throw new Error("--yes host did not match. Nothing was changed.");
		return;
	}
	const answer = prompt(`Type the host (${host}) to continue:`);
	if (answer?.trim() !== host) throw new Error("Host did not match. Nothing was changed.");
}

export function currentGitBranch() {
	const result = Bun.spawnSync(["git", "rev-parse", "--abbrev-ref", "HEAD"], { stdout: "pipe", stderr: "pipe" });
	return result.stdout.toString().trim();
}

export function resolveTarget(target: string | undefined, rest: string[]) {
	const positional = rest.filter((arg) => !arg.startsWith("--"));
	if (target === "local") {
		const databaseName = positional[0] ?? "inbound";
		return { name: `local database ${databaseName}`, url: localUrl(databaseName), prod: false };
	}
	if (target === "preview") {
		const branch = positional[0] ?? currentGitBranch();
		if (!branch || branch === "main" || branch === "HEAD") throw new Error("Pass the git branch of the preview deployment");
		const url = readPreviewDatabaseUrl(branch, rest.includes("--allow-shared-preview"));
		return { name: `preview branch ${branch}`, url, prod: false };
	}
	if (target === "prod") return { name: "production", url: requireProdUrl(), prod: true };
	throw new Error("Target must be local, preview or prod");
}

export function run(main: () => Promise<void>) {
	main().catch((error) => {
		console.error(error instanceof Error ? error.message : error);
		process.exit(1);
	});
}
