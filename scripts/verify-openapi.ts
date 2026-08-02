/**
 * Verify that the locally generated OpenAPI spec matches the production spec
 *
 * This script:
 * 1. Reads the local public/openapi.json
 * 2. Fetches the production spec from inbound.new/openapi.json
 * 3. Compares them and reports any differences
 *
 * Usage: bun run scripts/verify-openapi.ts
 */

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";

const LOCAL_SPEC_PATH = "./public/openapi.json";
const PRODUCTION_URL = "https://inbound.new/openapi.json";

interface OpenAPISpec {
	openapi: string;
	info: { title: string; version: string };
	paths: Record<string, unknown>;
	[key: string]: unknown;
}

function deepEqual(obj1: unknown, obj2: unknown, path = ""): string[] {
	const differences: string[] = [];

	if (typeof obj1 !== typeof obj2) {
		differences.push(
			`${path}: type mismatch (${typeof obj1} vs ${typeof obj2})`,
		);
		return differences;
	}

	if (obj1 === null || obj2 === null) {
		if (obj1 !== obj2) {
			differences.push(
				`${path}: ${JSON.stringify(obj1)} vs ${JSON.stringify(obj2)}`,
			);
		}
		return differences;
	}

	if (typeof obj1 !== "object") {
		if (obj1 !== obj2) {
			const val1 =
				typeof obj1 === "string" && obj1.length > 50
					? `${obj1.slice(0, 50)}...`
					: obj1;
			const val2 =
				typeof obj2 === "string" && (obj2 as string).length > 50
					? `${(obj2 as string).slice(0, 50)}...`
					: obj2;
			differences.push(
				`${path}: ${JSON.stringify(val1)} vs ${JSON.stringify(val2)}`,
			);
		}
		return differences;
	}

	if (Array.isArray(obj1) && Array.isArray(obj2)) {
		if (obj1.length !== obj2.length) {
			differences.push(
				`${path}: array length mismatch (${obj1.length} vs ${obj2.length})`,
			);
		}
		const maxLen = Math.max(obj1.length, obj2.length);
		for (let i = 0; i < maxLen; i++) {
			differences.push(...deepEqual(obj1[i], obj2[i], `${path}[${i}]`));
		}
		return differences;
	}

	if (Array.isArray(obj1) !== Array.isArray(obj2)) {
		differences.push(`${path}: array vs object mismatch`);
		return differences;
	}

	const keys1 = Object.keys(obj1 as Record<string, unknown>);
	const keys2 = Object.keys(obj2 as Record<string, unknown>);
	const allKeys = new Set([...keys1, ...keys2]);

	for (const key of allKeys) {
		const newPath = path ? `${path}.${key}` : key;
		if (!keys1.includes(key)) {
			differences.push(`${newPath}: missing in local spec`);
		} else if (!keys2.includes(key)) {
			differences.push(`${newPath}: missing in production spec`);
		} else {
			differences.push(
				...deepEqual(
					(obj1 as Record<string, unknown>)[key],
					(obj2 as Record<string, unknown>)[key],
					newPath,
				),
			);
		}
	}

	return differences;
}

async function verifyOpenAPISpec() {
	console.log("🔍 Verifying OpenAPI specification...\n");

	// Check local spec exists
	if (!existsSync(LOCAL_SPEC_PATH)) {
		console.error(`❌ Local spec not found at ${LOCAL_SPEC_PATH}`);
		console.error("   Run 'bun run generate:openapi' first");
		process.exit(1);
	}

	// Read local spec
	console.log(`📄 Reading local spec from ${LOCAL_SPEC_PATH}`);
	const localFileContent = await readFile(LOCAL_SPEC_PATH, "utf-8");
	const localSpec: OpenAPISpec = JSON.parse(localFileContent);

	// Fetch production spec
	console.log(`🌐 Fetching production spec from ${PRODUCTION_URL}`);
	let productionSpec: OpenAPISpec;

	try {
		const response = await fetch(PRODUCTION_URL, {
			headers: {
				Accept: "application/json",
			},
		});

		if (!response.ok) {
			throw new Error(`HTTP ${response.status}: ${response.statusText}`);
		}

		productionSpec = await response.json();
	} catch (error) {
		console.error(
			`❌ Failed to fetch production spec: ${(error as Error).message}`,
		);
		process.exit(1);
	}

	// Compare specs
	console.log("\n📊 Comparing specifications...\n");

	const differences = deepEqual(localSpec, productionSpec);

	if (differences.length === 0) {
		console.log("✅ Specs are identical!");
		console.log(`   📍 Local: ${LOCAL_SPEC_PATH}`);
		console.log(`   🌐 Production: ${PRODUCTION_URL}`);
		console.log(`   📊 Paths: ${Object.keys(localSpec.paths || {}).length}`);
		console.log(`   📌 Version: ${localSpec.info?.version}`);
	} else {
		console.log(`⚠️  Found ${differences.length} difference(s):\n`);

		// Group differences by category
		const pathDiffs = differences.filter((d) => d.startsWith("paths."));
		const infoDiffs = differences.filter((d) => d.startsWith("info."));
		const otherDiffs = differences.filter(
			(d) => !d.startsWith("paths.") && !d.startsWith("info."),
		);

		if (infoDiffs.length > 0) {
			console.log("📋 Info differences:");
			for (const diff of infoDiffs.slice(0, 10)) {
				console.log(`   - ${diff}`);
			}
			if (infoDiffs.length > 10) {
				console.log(`   ... and ${infoDiffs.length - 10} more`);
			}
			console.log();
		}

		if (pathDiffs.length > 0) {
			console.log("🛤️  Path differences:");
			for (const diff of pathDiffs.slice(0, 20)) {
				console.log(`   - ${diff}`);
			}
			if (pathDiffs.length > 20) {
				console.log(`   ... and ${pathDiffs.length - 20} more`);
			}
			console.log();
		}

		if (otherDiffs.length > 0) {
			console.log("📦 Other differences:");
			for (const diff of otherDiffs.slice(0, 10)) {
				console.log(`   - ${diff}`);
			}
			if (otherDiffs.length > 10) {
				console.log(`   ... and ${otherDiffs.length - 10} more`);
			}
			console.log();
		}

		console.log(
			"💡 Tip: This may be expected if local code has changed since last deploy",
		);
	}

	// Summary stats
	console.log("\n📈 Summary:");
	console.log(`   Local paths: ${Object.keys(localSpec.paths || {}).length}`);
	console.log(
		`   Production paths: ${Object.keys(productionSpec.paths || {}).length}`,
	);
	console.log(`   Local version: ${localSpec.info?.version}`);
	console.log(`   Production version: ${productionSpec.info?.version}`);
}

verifyOpenAPISpec().catch((error) => {
	console.error("\n❌ Verification failed:", error.message);
	process.exit(1);
});
