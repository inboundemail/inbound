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
	"This database already has tables but no recorded migrations. Shared databases need db:baseline:prod / db:baseline:preview first; a local one built by the old drizzle-kit export flow needs `bun run dev:local reset` (deletes local data).";

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

function sameHost(a: string, b: string) {
	const normalize = (host: string) => host.replace("-pooler.", ".").toLowerCase();
	return normalize(a) === normalize(b);
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

export async function applyMigrations(url: string, folder = MIGRATIONS_FOLDER) {
	return withClient(url, async (client) => {
		const { pending, skipped, unbaselined } = await migrationStatus(client, folder);
		if (unbaselined) {
			throw new Error(UNBASELINED);
		}
		if (skipped.length) {
			throw new Error(
				`These migrations are older than the last applied one but are not recorded (edited after applying, or generated on an older base):\n${skipped.map((m) => `  ${m.tag}`).join("\n")}\nNever edit an applied migration. Regenerate unapplied ones on top of the latest migration.`,
			);
		}
		if (pending.length) await migrate(drizzle(client), { migrationsFolder: folder });
		return pending.map((m) => m.tag);
	});
}

export function readPreviewDatabaseUrl(branch: string) {
	const dir = mkdtempSync(path.join(tmpdir(), "inbound-db-env-"));
	chmodSync(dir, 0o700);
	const pull = (environment: string, gitBranch?: string) => {
		const file = path.join(dir, `${environment}.env`);
		writeFileSync(file, "", { mode: 0o600 });
		const args = ["vercel", "env", "pull", file, `--environment=${environment}`, "--yes"];
		if (gitBranch) args.push(`--git-branch=${gitBranch}`);
		const result = Bun.spawnSync(args, { stdin: "ignore", stdout: "pipe", stderr: "pipe" });
		if (result.exitCode !== 0) {
			throw new Error(`vercel env pull (${environment}) failed. Is this checkout linked (vercel link)?\n${result.stderr.toString().trim()}`);
		}
		chmodSync(file, 0o600);
		return parse(readFileSync(file, "utf8"));
	};
	try {
		const preview = pull("preview", branch);
		const url = preview.DATABASE_URL_UNPOOLED || preview.DATABASE_URL;
		if (!url) throw new Error(`No DATABASE_URL_UNPOOLED in the Vercel Preview environment for branch ${branch}`);
		const production = pull("production");
		const prodHosts = [
			production.DATABASE_URL,
			production.DATABASE_URL_UNPOOLED,
			process.env.PROD_DATABASE_URL,
		]
			.filter((value): value is string => Boolean(value) && value.includes("://"))
			.map(hostOf);
		if (process.env.PROD_DATABASE_HOST) prodHosts.push(process.env.PROD_DATABASE_HOST);
		if (prodHosts.length === 0) {
			throw new Error(
				"Refusing: cannot tell which host is production (Vercel hides it). Set PROD_DATABASE_HOST (hostname only) or PROD_DATABASE_URL.",
			);
		}
		if (prodHosts.some((host) => sameHost(host, hostOf(url)))) {
			throw new Error(`Refusing: the Preview database for ${branch} resolves to the production host ${hostOf(url)}`);
		}
		return url;
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
	if (args.includes("--yes")) return;
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
		return { name: `preview branch ${branch}`, url: readPreviewDatabaseUrl(branch), prod: false };
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
