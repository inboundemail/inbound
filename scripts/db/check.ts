import { cpSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { MIGRATIONS_FOLDER, run, validateFolder } from "@/scripts/db/lib";

function drizzleKit(args: string[]) {
	const result = Bun.spawnSync(["bunx", "drizzle-kit", ...args], {
		env: { ...process.env, DATABASE_URL: "" },
		stdin: "ignore",
		stdout: "pipe",
		stderr: "pipe",
	});
	return { ok: result.exitCode === 0, output: `${result.stdout.toString()}${result.stderr.toString()}`.trim() };
}

run(async () => {
	const problems = validateFolder();
	if (problems.length) throw new Error(`Migration folder problems:\n${problems.map((p) => `  ${p}`).join("\n")}`);

	const check = drizzleKit(["check"]);
	if (!check.ok) throw new Error(`drizzle-kit check failed:\n${check.output}`);

	const dir = mkdtempSync(path.join(tmpdir(), "inbound-db-check-"));
	try {
		const copy = path.join(dir, "migrations");
		cpSync(MIGRATIONS_FOLDER, copy, { recursive: true });
		const sqlFiles = () => readdirSync(copy).filter((file) => file.endsWith(".sql")).length;
		const before = sqlFiles();
		const generate = drizzleKit([
			"generate",
			"--dialect=postgresql",
			"--schema=./lib/db/schema.ts",
			`--out=${path.relative(process.cwd(), copy)}`,
		]);
		const created = sqlFiles() > before;
		if (!generate.ok || created) {
			throw new Error(
				`lib/db/schema.ts has changes without a migration. Run: bun run db:generate --name <change>\n${generate.output.split("\n").slice(-5).join("\n")}`,
			);
		}
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
	console.log("db:check passed: migrations are consistent and match lib/db/schema.ts.");
});
