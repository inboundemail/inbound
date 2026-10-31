import { mkdir, readdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { resources } from "./resources";
import { operations, type Spec } from "./spec";

const marker = "{/* generated, do not edit */}";
export const snippetDir = resolve(import.meta.dir, "../../docs/snippets/sdk");

export function snippets(spec: Spec) {
	const files = new Map<string, string>();
	for (const { operation, path, verb } of operations(spec, resources)) {
		const id = operation.operationId;
		if (!id || !/^[a-zA-Z0-9][\w.-]*$/.test(id) || files.has(`${id}.mdx`)) throw new Error(`Invalid or duplicate OpenAPI operationId for ${verb} ${path}: ${id}`);
		const samples = operation["x-codeSamples"];
		if (!samples?.length) throw new Error(`Missing x-codeSamples for ${id}`);
		const blocks = samples.map(s => `\`\`\`${s.lang === "curl" ? "bash" : s.lang} ${s.label}\n${s.source}\n\`\`\``);
		files.set(`${id}.mdx`, `${marker}\n\n<CodeGroup>\n\n${blocks.join("\n\n")}\n\n</CodeGroup>\n`);
	}
	return files;
}

if (import.meta.main) {
	const spec: Spec = await Bun.file(resolve(import.meta.dir, "../../public/openapi.json")).json();
	const files = snippets(spec);
	await mkdir(snippetDir, { recursive: true });
	for (const name of await readdir(snippetDir)) {
		const path = join(snippetDir, name);
		if (!(await readFile(path, "utf8")).startsWith(marker)) throw new Error(`Refusing to overwrite non-generated snippet: ${name}`);
		if (!files.has(name)) await unlink(path);
	}
	for (const [name, content] of files) await writeFile(join(snippetDir, name), content);
	console.log(`Generated ${files.size} SDK guide snippets.`);
}
