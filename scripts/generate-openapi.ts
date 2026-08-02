import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import {
	getSdkOperationId,
	getSdkOperationKey,
	HTTP_METHODS,
	SDK_OPERATIONS,
} from "./sdk-operations";

process.env.DATABASE_URL ??= "postgres://dummy:dummy@localhost:5432/dummy";
process.env.INBOUND_API_KEY ??= "dummy_key_for_openapi_generation";

export interface OpenAPISpec {
	openapi: string;
	info: {
		title: string;
		version: string;
		license?: { name: string; identifier?: string };
	};
	paths: Record<string, Record<string, unknown>>;
	components?: Record<string, unknown>;
	tags?: Array<{ name: string; description?: string }>;
	webhooks?: Record<string, unknown>;
	[key: string]: unknown;
}

interface ValidationResult {
	valid: boolean;
	errors: string[];
	warnings: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stripUnsupportedKeywords(value: unknown): void {
	if (Array.isArray(value)) {
		for (const item of value) stripUnsupportedKeywords(item);
		return;
	}

	if (!isRecord(value)) return;

	delete value.nullable;
	for (const child of Object.values(value)) {
		stripUnsupportedKeywords(child);
	}
}

function normalizeOpenAPISpec(input: OpenAPISpec): OpenAPISpec {
	const spec = structuredClone(input);
	stripUnsupportedKeywords(spec);

	spec.info.license = {
		name: "Apache-2.0",
		identifier: "Apache-2.0",
	};

	const configuredOperations = new Set<string>();
	const declaredTags = new Set(spec.tags?.map((tag) => tag.name) ?? []);
	const tagDescriptions: Record<string, string> = {
		Guard: "Create and manage inbound email filtering rules.",
		Inbox: "List and retrieve threaded email conversations.",
		Onboarding: "Validate an account's initial send and reply flow.",
	};

	for (const [path, pathItem] of Object.entries(spec.paths)) {
		for (const method of HTTP_METHODS) {
			const operation = pathItem[method];
			if (!isRecord(operation)) continue;

			const key = getSdkOperationKey(method, path);
			const config = SDK_OPERATIONS[key as keyof typeof SDK_OPERATIONS];
			if (!config) {
				throw new Error(`Public E2 operation is missing SDK metadata: ${key}`);
			}

			configuredOperations.add(key);
			operation.operationId = getSdkOperationId(config);

			if (Array.isArray(operation.tags)) {
				for (const tag of operation.tags) {
					if (typeof tag !== "string" || declaredTags.has(tag)) continue;
					spec.tags ??= [];
					spec.tags.push({
						name: tag,
						description: tagDescriptions[tag],
					});
					declaredTags.add(tag);
				}
			}
		}
	}

	for (const key of Object.keys(SDK_OPERATIONS)) {
		if (!configuredOperations.has(key)) {
			throw new Error(`SDK operation no longer exists in E2 OpenAPI: ${key}`);
		}
	}

	const attachmentOperation =
		spec.paths["/api/e2/attachments/{id}/{filename}"]?.get;
	if (isRecord(attachmentOperation)) {
		const responses = isRecord(attachmentOperation.responses)
			? attachmentOperation.responses
			: {};
		responses["200"] = {
			description: "Binary attachment content",
			content: {
				"application/octet-stream": {
					schema: { type: "string", format: "binary" },
				},
			},
		};
		attachmentOperation.responses = responses;
	}

	const emailReceived = spec.webhooks?.emailReceived;
	if (isRecord(emailReceived) && isRecord(emailReceived.post)) {
		emailReceived.post.operationId = "webhooks.emailReceived";
	}

	return spec;
}

function validateOpenAPISpec(spec: OpenAPISpec): ValidationResult {
	const errors: string[] = [];
	const warnings: string[] = [];
	const operationIds = new Set<string>();

	if (!spec.openapi) errors.push('Missing "openapi" version field');
	if (!spec.info?.title) errors.push('Missing "info.title" field');
	if (!spec.info?.version) errors.push('Missing "info.version" field');
	if (!spec.paths || Object.keys(spec.paths).length === 0) {
		errors.push("No paths defined in specification");
	}

	for (const [path, methods] of Object.entries(spec.paths || {})) {
		for (const method of HTTP_METHODS) {
			const operation = methods[method];
			if (!isRecord(operation)) continue;

			if (!isRecord(operation.responses)) {
				errors.push(`${method.toUpperCase()} ${path}: No responses defined`);
			}

			if (!Array.isArray(operation.tags) || operation.tags.length === 0) {
				warnings.push(`${method.toUpperCase()} ${path}: No tags defined`);
			}

			if (!operation.summary && !operation.description) {
				warnings.push(
					`${method.toUpperCase()} ${path}: No summary or description`,
				);
			}

			if (typeof operation.operationId !== "string") {
				errors.push(`${method.toUpperCase()} ${path}: Missing operationId`);
			} else if (operationIds.has(operation.operationId)) {
				errors.push(`Duplicate operationId: ${operation.operationId}`);
			} else {
				operationIds.add(operation.operationId);
			}
		}
	}

	return {
		valid: errors.length === 0,
		errors,
		warnings,
	};
}

export async function generateOpenAPISpec(): Promise<OpenAPISpec> {
	console.log("Generating OpenAPI specification...");
	const { app } = await import("../app/api/e2/[[...slugs]]/route");
	const response = await app.fetch(
		new Request("http://localhost/api/e2/openapi.json"),
	);

	if (!response.ok) {
		throw new Error(
			`Failed to fetch OpenAPI spec: ${response.status} ${response.statusText}`,
		);
	}

	const spec = normalizeOpenAPISpec((await response.json()) as OpenAPISpec);
	const validation = validateOpenAPISpec(spec);

	for (const warning of validation.warnings) {
		console.warn(`OpenAPI warning: ${warning}`);
	}

	if (!validation.valid) {
		throw new Error(
			`OpenAPI validation failed:\n${validation.errors.map((error) => `- ${error}`).join("\n")}`,
		);
	}

	const outputDir = "./public";
	if (!existsSync(outputDir)) await mkdir(outputDir, { recursive: true });

	const outputPath = `${outputDir}/openapi.json`;
	await writeFile(outputPath, `${JSON.stringify(spec, null, 2)}\n`, "utf-8");

	console.log(
		`Generated ${outputPath} with ${Object.keys(spec.paths).length} paths`,
	);
	return spec;
}

if (import.meta.main) {
	generateOpenAPISpec()
		.then(() => process.exit(0))
		.catch((error: unknown) => {
			console.error(
				"Failed to generate OpenAPI spec:",
				error instanceof Error ? error.message : error,
			);
			process.exit(1);
		});
}
