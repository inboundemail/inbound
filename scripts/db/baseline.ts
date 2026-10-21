import { readFileSync } from "node:fs";
import path from "node:path";
import type { Client } from "pg";
import {
	confirmHost,
	hostOf,
	MIGRATION_LOCK_KEY,
	MIGRATIONS_FOLDER,
	readMigrations,
	resolveTarget,
	run,
	withClient,
} from "@/scripts/db/lib";

const BASELINE_TAGS = ["0000_baseline", "0001_imap_notify_triggers"];
const TRIGGERS = [
	["structured_emails", "imap_notify_structured_email"],
	["imap_mailbox_messages", "imap_notify_mailbox_message"],
	["imap_credentials", "imap_notify_credential_changed"],
	["imap_credential_scopes", "imap_notify_scope_changed"],
];

type Named = Record<string, { name: string }>;

type Snapshot = {
	tables: Record<
		string,
		{
			name: string;
			columns: Record<string, { name: string; primaryKey: boolean }>;
			indexes: Named;
			foreignKeys: Named;
			uniqueConstraints: Named;
			compositePrimaryKeys: Named;
		}
	>;
	enums: Record<string, { name: string; values: string[] }>;
};

async function missingObjects(client: Client) {
	const snapshot: Snapshot = JSON.parse(readFileSync(path.join(MIGRATIONS_FOLDER, "meta/0000_snapshot.json"), "utf8"));
	const columns = await client.query<{ table_name: string; column_name: string }>(
		`select table_name, column_name from information_schema.columns where table_schema = 'public'`,
	);
	const indexes = await client.query<{ indexname: string }>(`select indexname from pg_indexes where schemaname = 'public'`);
	const triggers = await client.query<{ table_name: string; tgname: string }>(
		`select c.relname as table_name, t.tgname from pg_trigger t join pg_class c on c.oid = t.tgrelid where not t.tgisinternal`,
	);
	const constraints = await client.query<{ table_name: string; conname: string }>(
		`select c.relname as table_name, k.conname from pg_constraint k join pg_class c on c.oid = k.conrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public'`,
	);
	const enums = await client.query<{ typname: string; label: string }>(
		`select t.typname, e.enumlabel as label from pg_enum e join pg_type t on t.oid = e.enumtypid`,
	);

	const haveColumns = new Set(columns.rows.map((r) => `${r.table_name}.${r.column_name}`));
	const haveIndexes = new Set(indexes.rows.map((r) => r.indexname));
	const haveTriggers = new Set(triggers.rows.map((r) => `${r.table_name}.${r.tgname}`));
	const haveEnums = new Set(enums.rows.map((r) => `${r.typname}.${r.label}`));
	const haveConstraints = new Set(constraints.rows.map((r) => `${r.table_name}.${r.conname}`));

	const missing: string[] = [];
	for (const table of Object.values(snapshot.tables)) {
		for (const column of Object.values(table.columns)) {
			if (!haveColumns.has(`${table.name}.${column.name}`)) missing.push(`column ${table.name}.${column.name}`);
		}
		for (const index of Object.values(table.indexes)) {
			if (!haveIndexes.has(index.name)) missing.push(`index ${index.name}`);
		}
		const constraintNames = [
			...Object.values(table.compositePrimaryKeys),
			...Object.values(table.uniqueConstraints),
			...Object.values(table.foreignKeys),
		].map((constraint) => constraint.name);
		if (Object.values(table.columns).some((column) => column.primaryKey)) constraintNames.push(`${table.name}_pkey`);
		for (const constraint of constraintNames) {
			if (!haveConstraints.has(`${table.name}.${constraint}`)) missing.push(`constraint ${constraint} on ${table.name}`);
		}
	}
	for (const type of Object.values(snapshot.enums)) {
		for (const value of type.values) {
			if (!haveEnums.has(`${type.name}.${value}`)) missing.push(`enum value ${type.name}.${value}`);
		}
	}
	const missingTriggers = TRIGGERS.filter(([table, trigger]) => !haveTriggers.has(`${table}.${trigger}`));
	return { missing, missingTriggers, tableCount: Object.keys(snapshot.tables).length };
}

run(async () => {
	const [target, ...rest] = process.argv.slice(2);
	const apply = rest.includes("--apply");
	const { name, url, prod } = resolveTarget(target, rest);
	const host = hostOf(url);
	console.log(`Target: ${name} (${host})`);

	const baseline = readMigrations().filter((m) => BASELINE_TAGS.includes(m.tag));
	if (baseline.length !== BASELINE_TAGS.length) throw new Error("Baseline migrations not found in the journal");

	await withClient(url, async (client) => {
		const table = await client.query(`select to_regclass('drizzle.__drizzle_migrations') is not null as ok`);
		if (table.rows[0].ok) {
			const count = await client.query(`select count(*)::int as n from drizzle.__drizzle_migrations`);
			if (count.rows[0].n > 0) {
				throw new Error(`Refusing: drizzle.__drizzle_migrations already has ${count.rows[0].n} row(s)`);
			}
		}

		const { missing, missingTriggers, tableCount } = await missingObjects(client);
		if (missing.length) {
			throw new Error(`Refusing: the target does not match the baseline. Missing:\n${missing.map((m) => `  ${m}`).join("\n")}`);
		}
		console.log(`Schema check passed: all columns, indexes, constraints and enums of ${tableCount} tables exist.`);
		// 0001 is idempotent, so a target without the IMAP triggers records only 0000 and db:migrate applies 0001.
		const migrations = missingTriggers.length ? baseline.slice(0, 1) : baseline;
		if (missingTriggers.length) {
			console.log(`IMAP triggers missing (${missingTriggers.map(([, t]) => t).join(", ")}): 0001 stays pending for db:migrate.`);
		} else {
			console.log("The 4 IMAP triggers exist.");
		}
		console.log("Rows to insert into drizzle.__drizzle_migrations:");
		for (const m of migrations) console.log(`  ${m.tag}  hash=${m.hash}  created_at=${m.when}`);

		if (!apply) {
			console.log("Dry run. Re-run with --apply to record them.");
			return;
		}
		if (prod) confirmHost(host, rest);

		await client.query("begin");
		try {
			await client.query("select pg_advisory_xact_lock(hashtext($1))", [MIGRATION_LOCK_KEY]);
			await client.query(`create schema if not exists drizzle`);
			await client.query(
				`create table if not exists drizzle.__drizzle_migrations (id serial primary key, hash text not null, created_at bigint)`,
			);
			const recheck = await client.query(`select count(*)::int as n from drizzle.__drizzle_migrations`);
			if (recheck.rows[0].n > 0) throw new Error("Refusing: drizzle.__drizzle_migrations is no longer empty");
			for (const m of migrations) {
				await client.query(`insert into drizzle.__drizzle_migrations ("hash", "created_at") values ($1, $2)`, [m.hash, m.when]);
			}
			await client.query("commit");
		} catch (error) {
			await client.query("rollback");
			throw error;
		}
		console.log(`Baseline recorded. db:migrate now applies migrations after ${migrations[migrations.length - 1].tag}.`);
	});
});
