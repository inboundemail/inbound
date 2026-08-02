import { appendFile, readFile, writeFile } from "node:fs/promises";

export type SdkVersionBump = "minor" | "patch";

export function getNextSdkVersion(
	baseVersion: string,
	bump: SdkVersionBump,
): string {
	const versionMatch = /^(\d+)\.(\d+)\.(\d+)$/.exec(baseVersion);
	if (!versionMatch) throw new Error(`Invalid base version: ${baseVersion}`);

	const major = Number(versionMatch[1]);
	const minor = Number(versionMatch[2]);
	const patch = Number(versionMatch[3]);
	return bump === "minor"
		? `${major}.${minor + 1}.0`
		: `${major}.${minor}.${patch + 1}`;
}

async function main() {
	const [bump, baseVersion] = Bun.argv.slice(2);
	if ((bump !== "patch" && bump !== "minor") || !baseVersion) {
		throw new Error(
			"Usage: bun run scripts/bump-sdk-version.ts <patch|minor> <base-version>",
		);
	}

	const nextVersion = getNextSdkVersion(baseVersion, bump);
	const packagePath = "./packages/inbound-sdk/package.json";
	const packageJson = JSON.parse(
		await readFile(packagePath, "utf-8"),
	) as Record<string, unknown>;
	packageJson.version = nextVersion;
	await writeFile(
		packagePath,
		`${JSON.stringify(packageJson, null, 2)}\n`,
		"utf-8",
	);

	const changelogPath = "./packages/inbound-sdk/CHANGELOG.md";
	const existing = await readFile(changelogPath, "utf-8").catch(
		() => "# Changelog\n",
	);
	const entry = `\n## ${nextVersion}\n\n- ${bump === "minor" ? "Additive E2 API and generated SDK updates." : "SDK and documentation fixes."}\n`;
	const changelog = existing.startsWith("# Changelog")
		? existing.replace("# Changelog\n", `# Changelog\n${entry}`)
		: `# Changelog\n${entry}\n${existing}`;
	await writeFile(changelogPath, changelog, "utf-8");

	console.log(nextVersion);
	if (process.env.GITHUB_OUTPUT) {
		await appendFile(
			process.env.GITHUB_OUTPUT,
			`version=${nextVersion}\n`,
			"utf-8",
		);
	}
}

if (import.meta.main) {
	await main();
}
