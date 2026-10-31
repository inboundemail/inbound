/**
 * Generate static OpenAPI specification from Elysia e2 routes
 *
 * This script:
 * 1. Imports the Elysia app
 * 2. Fetches the OpenAPI spec from the internal endpoint
 * 3. Validates the spec for common issues
 * 4. Writes to public/openapi.json
 *
 * Usage: bun run scripts/generate-openapi.ts
 */

import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { addCodeSamples, type SampleSpec } from "../packages/sdk-codegen/samples";

// Set required env vars with dummy values for spec generation
// (The spec generation doesn't actually hit the DB or external services - it just introspects routes)
process.env.DATABASE_URL ??= "postgres://dummy:dummy@localhost:5432/dummy";
process.env.INBOUND_API_KEY ??= "dummy_key_for_openapi_generation";

// Import the Elysia app after env vars are set
const { app } = await import("../app/api/e2/[[...slugs]]/route");

interface OpenAPISpec extends SampleSpec {
	openapi: string;
	info: { title: string; version: string };
	components?: Record<string, unknown>;
	tags?: Array<{ name: string; description?: string }>;
}

interface ValidationResult {
	valid: boolean;
	errors: string[];
	warnings: string[];
}

function validateOpenAPISpec(spec: OpenAPISpec): ValidationResult {
	const errors: string[] = [];
	const warnings: string[] = [];

	// Check required fields
	if (!spec.openapi) errors.push('Missing "openapi" version field');
	if (!spec.info?.title) errors.push('Missing "info.title" field');
	if (!spec.info?.version) errors.push('Missing "info.version" field');
	if (!spec.paths || Object.keys(spec.paths).length === 0) {
		errors.push("No paths defined in specification");
	}

	// Validate each path
	for (const [path, methods] of Object.entries(spec.paths || {})) {
		if (typeof methods !== "object" || methods === null) continue;

		for (const [method, operation] of Object.entries(
			methods as Record<string, unknown>,
		)) {
			if (["get", "post", "put", "patch", "delete"].includes(method)) {
				const op = operation as Record<string, unknown>;

				// Check for responses
				if (
					!op.responses ||
					Object.keys(op.responses as Record<string, unknown>).length === 0
				) {
					warnings.push(
						`${method.toUpperCase()} ${path}: No responses defined`,
					);
				}

				// Check for tags
				if (!op.tags || (op.tags as string[]).length === 0) {
					warnings.push(`${method.toUpperCase()} ${path}: No tags defined`);
				}

				// Check for summary/description
				if (!op.summary && !op.description) {
					warnings.push(
						`${method.toUpperCase()} ${path}: No summary or description`,
					);
				}
			}
		}
	}

	return {
		valid: errors.length === 0,
		errors,
		warnings,
	};
}

async function generateOpenAPISpec() {
	console.log("📄 Generating OpenAPI specification...\n");

	// Fetch the OpenAPI spec from the Elysia app
	const response = await app.fetch(
		new Request("http://localhost/api/e2/openapi.json"),
	);

	if (!response.ok) {
		throw new Error(
			`Failed to fetch OpenAPI spec: ${response.status} ${response.statusText}`,
		);
	}

	const spec: OpenAPISpec = await response.json();

	// Validate the spec
	console.log("🔍 Validating specification...");
	const validation = validateOpenAPISpec(spec);

	if (validation.errors.length > 0) {
		console.error("\n❌ Validation errors:");
		for (const err of validation.errors) {
			console.error(`   - ${err}`);
		}
	}

	if (validation.warnings.length > 0) {
		console.warn("\n⚠️  Validation warnings:");
		for (const warn of validation.warnings) {
			console.warn(`   - ${warn}`);
		}
	}

	if (!validation.valid) {
		throw new Error("OpenAPI specification validation failed");
	}
	addCodeSamples(spec);

	// Ensure output directory exists
	const outputDir = "./public";
	if (!existsSync(outputDir)) {
		await mkdir(outputDir, { recursive: true });
		console.log(`\n📁 Created directory: ${outputDir}`);
	}

	// Write to public directory
	const outputPath = `${outputDir}/openapi.json`;
	await writeFile(outputPath, JSON.stringify(spec, null, 2), "utf-8");

	// Summary
	const pathCount = Object.keys(spec.paths || {}).length;
	const tagCount = spec.tags?.length || 0;

	console.log("\n✅ OpenAPI spec generated successfully!");
	console.log(`   📍 Output: ${outputPath}`);
	console.log(`   📊 Paths: ${pathCount}`);
	console.log(`   🏷️  Tags: ${tagCount}`);
	console.log(`   📌 Version: ${spec.info?.version}`);

	if (validation.warnings.length > 0) {
		console.log(`   ⚠️  Warnings: ${validation.warnings.length}`);
	}
}

generateOpenAPISpec()
	.then(() => {
		// Explicitly exit to prevent hanging from open connections (Redis, etc.)
		process.exit(0);
	})
	.catch((error) => {
		console.error("\n❌ Failed to generate OpenAPI spec:", error.message);
		process.exit(1);
	});
