#!/usr/bin/env bun

import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { resolve, sep } from "node:path";

const TARGETS = [
	".next",
	".turbo",
	"node_modules/.cache",
	"coverage",
	"playwright-report",
	"test-results",
];

const dryRun = process.argv.includes("--dry-run");
const root = process.cwd();

function resolveWithinRepo(target: string) {
	const resolved = resolve(root, target);
	if (resolved !== root && !resolved.startsWith(`${root}${sep}`)) {
		throw new Error(`Refusing to remove path outside the repository: ${target}`);
	}
	return resolved;
}

for (const target of TARGETS) {
	const resolved = resolveWithinRepo(target);
	if (!existsSync(resolved)) {
		console.log(`skip ${target}`);
		continue;
	}

	if (dryRun) {
		console.log(`would remove ${target}`);
		continue;
	}

	await rm(resolved, { recursive: true, force: true });
	console.log(`removed ${target}`);
}

console.log(dryRun ? "local dev cleanup dry run complete" : "local dev cleanup complete");
