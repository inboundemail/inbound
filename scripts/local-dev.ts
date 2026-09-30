import { existsSync, readFileSync } from "node:fs";
import { parse } from "dotenv";
import { nanoid } from "nanoid";

const COMPOSE = ["docker", "compose", "-f", "docker-compose.dev.yml"];
const LOCAL_DATABASE_URL =
	"postgres://postgres:postgres@db.localtest.me:5432/inbound";
const LOCAL_APP_URL = "http://localhost:3000";

const KEEP_FROM_ENV = new Set(["GRAVATAR_API_KEY", "BASEHUB_TOKEN"]);

function run(cmd: string[], input?: string) {
	const result = Bun.spawnSync(cmd, {
		stdin: input === undefined ? "inherit" : new TextEncoder().encode(input),
		stdout: "pipe",
		stderr: "pipe",
	});
	return {
		ok: result.exitCode === 0,
		stdout: result.stdout.toString(),
		stderr: result.stderr.toString(),
	};
}

function must(cmd: string[], input?: string) {
	const result = run(cmd, input);
	if (!result.ok) {
		console.error(result.stderr || result.stdout);
		throw new Error(`Command failed: ${cmd.join(" ")}`);
	}
	return result.stdout;
}

function psql(query: string) {
	return must(
		[...COMPOSE, "exec", "-T", "postgres", "psql", "-U", "postgres", "-d", "inbound", "-v", "ON_ERROR_STOP=1", "-tA"],
		query,
	).trim();
}

function startDatabase() {
	must([...COMPOSE, "up", "-d", "--wait"]);
}

function applySchemaIfMissing() {
	const hasSchema = psql("select to_regclass('public.\"user\"') is not null;");
	if (hasSchema === "t") return;

	console.log("Applying lib/db/schema.ts to the local database...");
	const schemaSql = must([
		"bunx",
		"drizzle-kit",
		"export",
		"--dialect=postgresql",
		"--schema=./lib/db/schema.ts",
	]);
	psql(schemaSql);
}

function buildLocalEnv() {
	const fileEnv: Record<string, string> = {};
	for (const file of [".env", ".env.local", ".env.development", ".env.development.local"]) {
		if (existsSync(file)) Object.assign(fileEnv, parse(readFileSync(file, "utf8")));
	}
	const env: Record<string, string> = {};

	for (const [key, value] of Object.entries(process.env)) {
		if (value !== undefined) env[key] = value;
	}

	for (const key of Object.keys(fileEnv)) {
		env[key] = KEEP_FROM_ENV.has(key) ? fileEnv[key] : "";
	}

	const autumnKey = fileEnv.AUTUMN_SECRET_KEY ?? "";
	if (autumnKey.startsWith("am_sk_test")) env.AUTUMN_SECRET_KEY = autumnKey;

	return {
		...env,
		NODE_ENV: "development",
		DATABASE_URL: LOCAL_DATABASE_URL,
		NEXT_PUBLIC_APP_URL: LOCAL_APP_URL,
		BETTER_AUTH_SECRET: "inbound-local-dev-secret-not-for-production",
		ALLOW_REQUESTS_WITHOUT_RATE_LIMIT: "true",
		INBOUND_LOCAL_DEV: "true",
	};
}

function seed(email: string) {
	const escaped = email.replace(/'/g, "''");
	const userId = psql(`select id from "user" where email = '${escaped}' limit 1;`);
	if (!userId) {
		throw new Error(
			`No local user with email ${email}. Sign in once at ${LOCAL_APP_URL}/login (the magic link is printed in the dev server output), then seed again.`,
		);
	}

	const domainId = `dom_${nanoid()}`;
	const endpointId = `end_${nanoid()}`;
	const domain = "demo.localtest.me";
	const from = (name: string, address: string) =>
		JSON.stringify({ text: `${name} <${address}>`, addresses: [{ name, address }] }).replace(/'/g, "''");
	const to = (address: string) =>
		JSON.stringify({ text: address, addresses: [{ name: null, address }] });

	const emails = [
		["Ada Lovelace", "ada@example.com", "Welcome to the local inbox", "This is seeded local data."],
		["Billing Bot", "billing@example.com", "Your invoice is ready", "Invoice #1234 is attached."],
		["Suspicious Sender", "promo@spam.example", "You won a prize!!!", "Click here to claim."],
	];

	psql(`
		insert into email_domains (id, domain, status, user_id, can_receive_emails, created_at, updated_at)
		values ('${domainId}', '${domain}', 'verified', '${userId}', true, now(), now())
		on conflict do nothing;
		insert into endpoints (id, name, type, config, user_id, is_active, created_at, updated_at)
		values ('${endpointId}', 'Local webhook', 'webhook', '{"url":"http://localhost:9999/webhook","timeout":30,"retryAttempts":3}', '${userId}', true, now(), now());
		insert into email_addresses (id, address, domain_id, user_id, endpoint_id, is_active, created_at, updated_at)
		values ('addr_${nanoid()}', 'hello@${domain}', '${domainId}', '${userId}', '${endpointId}', true, now(), now());
		${emails
			.map(
				([name, address, subject, body], i) => `
		insert into structured_emails (id, email_id, ses_event_id, user_id, message_id, subject, recipient, from_data, to_data, text_body, html_body, date, created_at, updated_at)
		values ('inbnd_${nanoid()}', 'eml_${nanoid()}', 'ses_${nanoid()}', '${userId}', '<seed-${i}-${nanoid()}@example.com>', '${subject}', 'hello@${domain}', '${from(name, address)}', '${to(`hello@${domain}`)}', '${body}', '<p>${body}</p>', now() - interval '${i} hours', now() - interval '${i} hours', now());`,
			)
			.join("\n")}
	`);

	console.log(`Seeded ${domain}, hello@${domain}, one endpoint, and ${emails.length} received emails for ${email}.`);
}

async function main() {
	const [command, arg] = process.argv.slice(2);

	if (command === "reset") {
		must([...COMPOSE, "down", "-v"]);
		console.log("Local database removed. The next `bun run dev:local` starts fresh.");
		return;
	}

	startDatabase();
	applySchemaIfMissing();

	if (command === "seed") {
		if (!arg) throw new Error("Usage: bun run dev:local seed you@example.com");
		seed(arg);
		return;
	}

	if (command === "db") {
		console.log("Local database is ready.");
		return;
	}

	console.log(`Starting next dev against the local database at ${LOCAL_APP_URL}`);
	console.log("Sending, AWS, QStash, Svix, Redis, and OAuth credentials are blanked for this process.");
	const child = Bun.spawn(["bunx", "next", "dev"], {
		env: buildLocalEnv(),
		stdio: ["inherit", "inherit", "inherit"],
	});
	process.on("SIGINT", () => child.kill("SIGINT"));
	process.exit(await child.exited);
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : error);
	process.exit(1);
});
