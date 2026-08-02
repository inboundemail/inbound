import { appendFile } from "node:fs/promises";

export type SdkChange = "minor" | "none" | "patch";

const documentationKeys = new Set([
	"description",
	"example",
	"examples",
	"externalDocs",
	"summary",
	"title",
]);

function normalize(value: unknown, key?: string): unknown {
	if (key === "info") return undefined;
	if (key && documentationKeys.has(key)) return undefined;
	if (key?.startsWith("x-code")) return undefined;

	if (Array.isArray(value)) {
		return value.map((item) => normalize(item));
	}

	if (typeof value !== "object" || value === null) return value;

	return Object.fromEntries(
		Object.entries(value)
			.sort(([left], [right]) => left.localeCompare(right))
			.flatMap(([childKey, childValue]) => {
				const normalized = normalize(childValue, childKey);
				return normalized === undefined ? [] : [[childKey, normalized]];
			}),
	);
}

export function classifySdkChange(base: unknown, revision: unknown): SdkChange {
	const exactMatch = JSON.stringify(base) === JSON.stringify(revision);
	const semanticMatch =
		JSON.stringify(normalize(base)) === JSON.stringify(normalize(revision));
	return exactMatch ? "none" : semanticMatch ? "patch" : "minor";
}

async function main() {
	const [basePath, revisionPath] = Bun.argv.slice(2);
	if (!basePath || !revisionPath) {
		throw new Error(
			"Usage: bun run scripts/classify-sdk-change.ts <base-spec> <revision-spec>",
		);
	}

	const [base, revision] = await Promise.all([
		Bun.file(basePath).json(),
		Bun.file(revisionPath).json(),
	]);
	const bump = classifySdkChange(base, revision);
	console.log(bump);

	if (process.env.GITHUB_OUTPUT) {
		await appendFile(process.env.GITHUB_OUTPUT, `bump=${bump}\n`, "utf-8");
	}
}

if (import.meta.main) {
	await main();
}
