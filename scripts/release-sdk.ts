import { parseArgs } from "node:util";

const args = process.argv.slice(2);
const { positionals, values } = parseArgs({
	args: args[0] === "--" ? args.slice(1) : args,
	allowPositionals: true,
	options: { apply: { type: "boolean" }, "dry-run": { type: "boolean" }, notes: { type: "string" } },
});
const [version] = positionals;
// A canonical npm version, including optional SemVer prerelease identifiers.
const part = "(?:0|[1-9]\\d*)";
const pre = `(?:${part}|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*)`;
if (positionals.length !== 1 || !new RegExp(`^${part}\\.${part}\\.${part}(?:-${pre}(?:\\.${pre})*)?$`).test(version) || (values.apply && values["dry-run"])) {
	throw new Error('Usage: bun run sdk:release -- <version> [--dry-run | --apply] [--notes "release notes"]');
}

const sdk = "packages/inbound-sdk";
const manifest = Bun.file(`${sdk}/package.json`);
const current = (await manifest.json()).version as string;
const changelog = Bun.file(`${sdk}/CHANGELOG.md`);
const history = await changelog.text();
const tag = `inboundemail-v${version}`;
const push = `git push --atomic origin main refs/tags/${tag}`;
console.log([
	values.apply ? "Preparing release:" : "Dry run (no changes):",
	`1. Require a clean main checkout and an unused tag ${tag}.`,
	`2. Set inboundemail ${current} → ${version}; run bun run generate:sdk and bun run sdk:check.`,
	`3. Update CHANGELOG.md using ${values.notes ? "provided notes" : "generated SDK changes or the existing release entry"}.`,
	`4. Commit "inboundemail ${version}" and create annotated tag ${tag} locally.`,
].join("\n"));
if (!values.apply) {
	console.log(`After review, the manual push command would be:\n${push}`);
	process.exit(0);
}

function run(...cmd: string[]) {
	const result = Bun.spawnSync(cmd, { stderr: "inherit" });
	if (result.exitCode !== 0) throw new Error(`Failed: ${cmd.join(" ")}`);
	return result.stdout.toString().trim();
}
if (run("git", "branch", "--show-current") !== "main" || run("git", "status", "--porcelain")) {
	throw new Error("Start from a clean checkout on main.");
}
if (run("git", "tag", "--list", tag)) throw new Error(`Tag already exists: ${tag}`);
if (Bun.semver.order(version, current) < 0) throw new Error(`Version must not be lower than ${current}.`);

const manifestText = await manifest.text();
await Bun.write(manifest, manifestText.replace(`"version": "${current}"`, `"version": "${version}"`));
console.log(run("bun", "--no-env-file", "run", "generate:sdk"));
console.log(run("bun", "--no-env-file", "run", "sdk:check"));
const generated = `${sdk}/src/generated`;
run("git", "add", "--", generated, `${sdk}/package.json`);
const previous = run("git", "tag", "--merged", "HEAD", "--list", "inboundemail-v*", "--sort=-version:refname").split("\n")[0];
const diff = run("git", "diff", "--cached", "--name-status", previous || "HEAD", "--", generated);
const heading = `## ${version}`;
const existing = history.split("\n").includes(heading);
if (!existing || values.notes?.trim()) {
	const notes = values.notes?.trim() || (diff ? `Generated SDK changes:\n\n\`\`\`text\n${diff}\n\`\`\`` : "No generated SDK changes.");
	const body = history.slice("# Changelog\n".length).trimStart();
	if (!history.startsWith("# Changelog\n")) throw new Error("Expected # Changelog heading.");
	if (existing && !body.startsWith(`${heading}\n`)) throw new Error(`Historical entry already exists: ${version}`);
	const rest = existing ? body.slice(heading.length).trimStart() : body;
	await Bun.write(changelog, `# Changelog\n\n${heading}\n\n${notes}\n\n${rest}`);
}
run("git", "add", "--", `${sdk}/CHANGELOG.md`);
// The initial manifest and release notes may already be present on main.
run("git", "commit", "--allow-empty", "-m", `inboundemail ${version}`);
run("git", "tag", "-a", tag, "-m", `inboundemail ${version}`);
console.log(`Local release prepared. After review, push with:\n${push}`);
