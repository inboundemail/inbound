import { expect, test } from "bun:test";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import ts from "typescript";
import { resources } from "./resources";
import { addCodeSamples, type SampleSpec } from "./samples";
import { snippetDir, snippets } from "./snippets";
import { operations } from "./spec";

const root = resolve(import.meta.dir, "../..");
const spec: SampleSpec = await Bun.file(join(root, "public/openapi.json")).json();
const routes = operations(spec, resources);
const samples = routes.map(({ operation }) => {
	const pair = operation["x-codeSamples"] ?? [];
	expect(pair.map(s => s.lang), operation.operationId).toEqual(["typescript", "curl"]);
	return { id: operation.operationId, typescript: pair[0].source, curl: pair[1].source };
});

test(`compile all ${samples.length} TypeScript samples against the generated SDK`, async () => {
	const sdkImport = 'import Inbound from "inboundemail";';
	const functions = samples.map(({ id, typescript }) => {
		const [first, ...body] = typescript.split("\n");
		expect(first, id).toBe(sdkImport);
		return `async function sample_${id?.replace(/\W/g, "_")}() {\n${body.join("\n")}\n}`;
	});
	const dir = await mkdtemp(join(tmpdir(), "inbound-samples-"));
	try {
		const file = join(dir, "samples.ts");
		await writeFile(file, [sdkImport, ...functions].join("\n\n"));
		const program = ts.createProgram([file], {
			strict: true, noEmit: true, skipLibCheck: true, types: [], target: ts.ScriptTarget.ES2022,
			module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler,
			paths: { inboundemail: [join(root, "packages/inbound-sdk/src/generated/index.ts")] },
		});
		const diagnostics = ts.getPreEmitDiagnostics(program);
		expect(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
			getCurrentDirectory: () => root, getCanonicalFileName: f => f, getNewLine: () => "\n",
		})).toBe("");
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
}, 30_000);

function unquote(value: string) {
	expect(value).toMatch(/^'(?:[^']|'\\'')*'$/s);
	return value.slice(1, -1).replaceAll("'\\''", "'");
}

test(`parse all ${samples.length} curl commands without executing them`, () => {
	const syntax = Bun.spawnSync(["sh", "-n"], { stdin: Buffer.from(samples.map(s => s.curl).join("\n")) });
	expect(syntax.exitCode, syntax.stderr.toString()).toBe(0);
	for (const [i, { curl, id }] of samples.entries()) {
		const route = routes[i];
		const [command, ...flags] = curl.split(" \\\n  ");
		const match = /^curl -X ([A-Z]+) (.+)$/.exec(command);
		expect(match?.[1], id).toBe(route.verb);
		const url = new URL(unquote(match![2]));
		expect(url.origin, id).toBe(spec.servers[0].url);
		const parts = url.pathname.split("/").map(decodeURIComponent);
		const template = route.path.split("/");
		expect(parts.length, id).toBe(template.length);
		for (const [j, part] of template.entries()) {
			if (part.startsWith("{")) expect(parts[j], id).toMatch(/^<\w+>$|^\d+$/);
			else expect(parts[j], id).toBe(part);
		}
		for (const k of url.searchParams.keys()) expect(route.query, id).toContain(k);
		const headers = flags.filter(f => f.startsWith("-H "));
		expect(headers, id).toContain('-H "Authorization: Bearer $INBOUND_API_KEY"');
		const data = flags.filter(f => f.startsWith("-d "));
		expect(headers.length + data.length, id).toBe(flags.length);
		expect(data.length, id).toBe(route.body ? 1 : 0);
		if (route.body) {
			expect(headers, id).toContain("-H 'Content-Type: application/json'");
			const body = JSON.parse(unquote(data[0].slice(3)));
			const schema = route.operation.requestBody?.content?.["application/json"].schema;
			const required = schema?.required ?? [];
			for (const k of required) expect(body, id).toHaveProperty(k);
			expect(Object.keys(body).length, id).toBeLessThanOrEqual(required.length + 3);
		}
	}
});

test(`all ${samples.length} committed guide snippets match the served samples`, async () => {
	const files = snippets(spec);
	expect((await readdir(snippetDir)).sort(), "Run bun run generate:samples").toEqual(routes.map(r => `${r.operationId}.mdx`).sort());
	for (const [name, expected] of files) {
		expect(await readFile(join(snippetDir, name), "utf8"), `${name}: run bun run generate:samples`).toBe(expected);
	}
});

test("public samples use intentional update bodies and leave DNS verification opt-in", () => {
	const sample = (id: string) => samples[routes.findIndex(route => route.operationId === id)];
	const body = (id: string) => JSON.parse(unquote(sample(id).curl.split("-d ")[1]));
	expect(body("spamFilter.update")).toEqual({ level: "standard" });
	expect(body("spam.update")).toEqual({ level: "strict", allow: ["@partner.example.com"], block: [] });
	expect(sample("spam.update").typescript).toContain("replace the existing lists");
	expect(body("emails.reply")).toEqual({ from: expect.any(String), text: expect.any(String) });
	expect(body("mailboxes.update")).toEqual({ dailySendLimit: 500 });
	expect(sample("domains.retrieve").curl).not.toContain("?");
	expect(sample("domains.retrieve").typescript).not.toContain("check:");
});

test("prefer schema examples over defaults and escape shell quotes without changing JSON", () => {
	const copy = structuredClone(spec);
	const op = copy.paths["/api/e2/domains"].post!;
	const field = op.requestBody!.content!["application/json"].schema!.properties!.domain;
	Object.assign(field, { examples: ["reader's example"], example: "not first", default: "not first" });
	addCodeSamples(copy);
	const [sdk, curl] = op["x-codeSamples"]!;
	expect(sdk.source).toContain('domain: "reader\'s example"');
	expect(JSON.parse(unquote(curl.source.split("-d ")[1]))).toEqual({ domain: "reader's example" });
});

test("use SDK numeric inputs without changing string-only fields or curl bodies", () => {
	const copy = structuredClone(spec);
	const op = copy.paths["/api/e2/mailboxes/{id}/filters/apply"].post!;
	const body = { folder: "42", afterUid: "7", limit: "25" };
	op.requestBody!.content!["application/json"].schema!.examples = [body];
	const expunge = copy.paths["/api/e2/mailboxes/{id}/folders/{folder}/expunge"].post!;
	expunge.requestBody!.content!["application/json"].schema!.examples = [{ uids: ["42"] }];
	addCodeSamples(copy);
	const [sdk, curl] = op["x-codeSamples"]!;
	expect(sdk.source).toContain('folder: "42"');
	expect(sdk.source).toContain("afterUid: 7");
	expect(sdk.source).toContain("limit: 25");
	expect(JSON.parse(unquote(curl.source.split("-d ")[1]))).toEqual(body);
	expect(expunge["x-codeSamples"]![0].source).toMatch(/uids: \[\s*42\s*\]/);
	expect(copy.paths["/api/e2/mail/threads"].get!["x-codeSamples"]![0].source).toContain("limit: 25");
});
