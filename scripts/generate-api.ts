import { mkdir, writeFile } from "node:fs/promises";
import { generateOpenAPISpec } from "./generate-openapi";
import { generateSDK } from "./generate-sdk";
import { SDK_OPERATIONS } from "./sdk-operations";

async function generateAPIArtifacts() {
	const spec = await generateOpenAPISpec();
	await mkdir("./apps/fumadocs", { recursive: true });
	await Promise.all([
		writeFile(
			"./apps/fumadocs/openapi.json",
			`${JSON.stringify(spec, null, 2)}\n`,
			"utf-8",
		),
		writeFile(
			"./apps/fumadocs/sdk-operations.json",
			`${JSON.stringify(
				Object.entries(SDK_OPERATIONS).map(([key, operation]) => {
					const separator = key.indexOf(" ");
					return {
						method: key.slice(0, separator),
						path: key.slice(separator + 1),
						resource: operation.resource,
						sdkMethod: operation.method,
					};
				}),
				null,
				2,
			)}\n`,
			"utf-8",
		),
		generateSDK(spec),
	]);
	console.log("Generated SDK and Fumadocs API contract");
}

generateAPIArtifacts()
	.then(() => process.exit(0))
	.catch((error: unknown) => {
		console.error(
			"Failed to generate API artifacts:",
			error instanceof Error ? error.message : error,
		);
		process.exit(1);
	});
