import { mkdir, writeFile } from "node:fs/promises";
import openapiTS, { astToString } from "openapi-typescript";
import type { OpenAPISpec } from "./generate-openapi";
import {
	HTTP_METHODS,
	SDK_OPERATIONS,
	SDK_RESOURCES,
	type SdkOperationConfig,
	type SdkResourceName,
} from "./sdk-operations";

const OUTPUT_DIR = "./packages/inbound-sdk/src/generated";

interface GeneratedOperation {
	config: SdkOperationConfig;
	method: string;
	path: string;
	operationId: string;
	pathParams: string[];
	hasBody: boolean;
	hasQuery: boolean;
	queryRequired: boolean;
	responseStatus: number;
	responseType: "arrayBuffer" | "json" | "void";
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toPascalCase(value: string): string {
	return value
		.replace(/([a-z0-9])([A-Z])/g, "$1 $2")
		.split(/[^a-zA-Z0-9]+/)
		.filter(Boolean)
		.map((part) => `${part[0]?.toUpperCase()}${part.slice(1)}`)
		.join("");
}

function getParameters(operation: Record<string, unknown>) {
	return Array.isArray(operation.parameters)
		? operation.parameters.filter(isRecord)
		: [];
}

function getSuccessResponse(operation: Record<string, unknown>): {
	status: number;
	type: "arrayBuffer" | "json" | "void";
} {
	if (!isRecord(operation.responses)) {
		throw new Error("Operation has no response object");
	}

	for (const status of [200, 201, 202, 204]) {
		const response = operation.responses[String(status)];
		if (!isRecord(response)) continue;
		if (status === 204 || !isRecord(response.content)) {
			return { status, type: "void" };
		}
		if (response.content["application/json"]) {
			return { status, type: "json" };
		}
		return { status, type: "arrayBuffer" };
	}

	throw new Error("Operation has no successful response");
}

function getOperations(spec: OpenAPISpec): GeneratedOperation[] {
	const operations: GeneratedOperation[] = [];

	for (const [path, pathItem] of Object.entries(spec.paths)) {
		for (const method of HTTP_METHODS) {
			const operation = pathItem[method];
			if (!isRecord(operation) || typeof operation.operationId !== "string") {
				continue;
			}

			const key = `${method.toUpperCase()} ${path}`;
			const config = SDK_OPERATIONS[key as keyof typeof SDK_OPERATIONS];
			if (!config) throw new Error(`Missing SDK operation config: ${key}`);

			const parameters = getParameters(operation);
			const success = getSuccessResponse(operation);
			const pathParams = [...path.matchAll(/\{([^}]+)\}/g)].map(
				(match) => match[1],
			);
			const queryParameters = parameters.filter(
				(parameter) => parameter.in === "query",
			);

			operations.push({
				config,
				method: method.toUpperCase(),
				path,
				operationId: operation.operationId,
				pathParams,
				hasBody: isRecord(operation.requestBody),
				hasQuery: queryParameters.length > 0,
				queryRequired: queryParameters.some(
					(parameter) => parameter.required === true,
				),
				responseStatus: success.status,
				responseType: config.responseType ?? success.type,
			});
		}
	}

	return operations;
}

function getTypeNames(operation: GeneratedOperation) {
	const resource = SDK_RESOURCES[operation.config.resource];
	const base = `${resource.typePrefix}${toPascalCase(operation.config.method)}`;
	return {
		params: `${base}Params`,
		response: `${base}Response`,
	};
}

function renderPath(path: string, pathParams: string[]): string {
	let rendered = path.replace(/`/g, "\\`");
	for (const param of pathParams) {
		rendered = rendered.replace(
			`{${param}}`,
			`\${encodeURIComponent(String(${param}))}`,
		);
	}
	return `\`${rendered}\``;
}

function renderTypeAliases(operation: GeneratedOperation): string {
	const names = getTypeNames(operation);
	const operationType = `operations[${JSON.stringify(operation.operationId)}]`;
	const aliases: string[] = [];

	if (operation.hasBody) {
		const bodyType = `OperationBody<${operationType}>`;
		aliases.push(
			`export type ${names.params} = ${bodyType}${operation.config.prepareEmailBody ? " & ReactEmailOptions" : ""};`,
		);
	} else if (operation.hasQuery) {
		aliases.push(
			`export type ${names.params} = OperationQuery<${operationType}>;`,
		);
	}

	if (operation.responseType === "arrayBuffer") {
		aliases.push(`export type ${names.response} = ArrayBuffer;`);
	} else if (operation.responseType === "void") {
		aliases.push(`export type ${names.response} = void;`);
	} else {
		aliases.push(
			`export type ${names.response} = OperationResponse<${operationType}, ${operation.responseStatus}>;`,
		);
	}

	return aliases.join("\n");
}

function getMethodArguments(operation: GeneratedOperation): string[] {
	const names = getTypeNames(operation);
	const args = operation.pathParams.map((param) => `${param}: string`);

	if (operation.hasBody) {
		args.push(`body: ${names.params}`);
	} else if (operation.hasQuery) {
		args.push(`query${operation.queryRequired ? "" : "?"}: ${names.params}`);
	}

	args.push("options?: RequestOptions");
	return args;
}

function getForwardedArguments(operation: GeneratedOperation): string[] {
	const args = [...operation.pathParams];
	if (operation.hasBody) args.push("body");
	else if (operation.hasQuery) args.push("query");
	args.push("options");
	return args;
}

function renderMethod(operation: GeneratedOperation): string {
	const names = getTypeNames(operation);
	const requestFields = [
		`method: ${JSON.stringify(operation.method)}`,
		`path: ${renderPath(operation.path, operation.pathParams)}`,
	];

	if (operation.hasBody) {
		requestFields.push(
			`body: ${operation.config.prepareEmailBody ? "prepareEmailBody(body)" : "body"}`,
		);
	} else if (operation.hasQuery) {
		requestFields.push("query");
	}
	if (operation.responseType !== "json") {
		requestFields.push(
			`responseType: ${JSON.stringify(operation.responseType)}`,
		);
	}
	requestFields.push("options");

	const lines = [
		`\t${operation.config.method}(${getMethodArguments(operation).join(", ")}): APIPromise<${names.response}> {`,
		`\t\treturn this._client.request<${names.response}>({`,
		...requestFields.map((field) => `\t\t\t${field},`),
		"\t\t});",
		"\t}",
	];

	for (const alias of operation.config.aliases ?? []) {
		lines.push(
			"",
			`\t${alias}(${getMethodArguments(operation).join(", ")}): APIPromise<${names.response}> {`,
			`\t\treturn this.${operation.config.method}(${getForwardedArguments(operation).join(", ")});`,
			"\t}",
		);
	}

	return lines.join("\n");
}

function renderResources(operations: GeneratedOperation[]): string {
	const grouped = new Map<SdkResourceName, GeneratedOperation[]>();
	for (const operation of operations) {
		const existing = grouped.get(operation.config.resource) ?? [];
		existing.push(operation);
		grouped.set(operation.config.resource, existing);
	}

	const sections: string[] = [
		"import {",
		"\ttype APIPromise,",
		"\tAPIResource,",
		"\ttype OperationBody,",
		"\ttype OperationQuery,",
		"\ttype OperationResponse,",
		"\ttype RequestClient,",
		"\ttype RequestOptions,",
		'} from "../core.js";',
		'import { prepareEmailBody, type ReactEmailOptions } from "../email.js";',
		'import type { operations } from "./schema.js";',
		"",
	];

	for (const operation of operations) {
		sections.push(renderTypeAliases(operation), "");
	}

	for (const [resourceName, resourceOperations] of grouped) {
		const resource = SDK_RESOURCES[resourceName];
		sections.push(
			`export class ${resource.className} extends APIResource {`,
			resourceOperations.map(renderMethod).join("\n\n"),
			"}",
			"",
		);
	}

	sections.push("export interface GeneratedResources {");
	for (const [resourceName] of grouped) {
		sections.push(
			`\t${resourceName}: ${SDK_RESOURCES[resourceName].className};`,
		);
	}
	sections.push("}", "", "export function createGeneratedResources(");
	sections.push(
		"\tclient: RequestClient,",
		"): GeneratedResources {",
		"\treturn {",
	);
	for (const [resourceName] of grouped) {
		sections.push(
			`\t\t${resourceName}: new ${SDK_RESOURCES[resourceName].className}(client),`,
		);
	}
	sections.push("\t};", "}", "");

	return sections.join("\n");
}

export async function generateSDK(spec: OpenAPISpec): Promise<void> {
	const operations = getOperations(spec);
	if (operations.length !== Object.keys(SDK_OPERATIONS).length) {
		throw new Error(
			`Expected ${Object.keys(SDK_OPERATIONS).length} SDK operations, generated ${operations.length}`,
		);
	}

	const ast = await openapiTS(spec, { alphabetize: true });
	await mkdir(OUTPUT_DIR, { recursive: true });
	await Promise.all([
		writeFile(`${OUTPUT_DIR}/schema.d.ts`, astToString(ast), "utf-8"),
		writeFile(
			`${OUTPUT_DIR}/resources.ts`,
			renderResources(operations),
			"utf-8",
		),
	]);
	const formatter = Bun.spawn(
		["bunx", "biome", "format", "--write", `${OUTPUT_DIR}/resources.ts`],
		{ stdout: "inherit", stderr: "inherit" },
	);
	if ((await formatter.exited) !== 0) {
		throw new Error("Failed to format generated SDK resources");
	}
	console.log(`Generated TypeScript SDK for ${operations.length} operations`);
}

if (import.meta.main) {
	const spec = (await Bun.file("./public/openapi.json").json()) as OpenAPISpec;
	generateSDK(spec).catch((error: unknown) => {
		console.error(
			"Failed to generate SDK:",
			error instanceof Error ? error.message : error,
		);
		process.exit(1);
	});
}
