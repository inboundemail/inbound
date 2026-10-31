import { describe, expect, it } from "bun:test";
import { generate } from "./generate";
import { type Schema, typeOf } from "./schema";
import { operations, type Spec } from "./spec";

const str = { type: "string" };
const num = { type: "integer" };
const page: Schema = { type: "object", properties: {
	data: { type: "array", items: str },
	pagination: { type: "object", properties: { offset: num, total: num, limit: num, hasMore: { type: "boolean" } } },
} };
const path = "/boxes/{owner}/folders/{folder}";
const response = (schema: Schema) => ({ content: { "application/json": { schema } } });
const fixture: Spec = { paths: { [path]: {
	parameters: [{ name: "folder", in: "path", schema: str }, { name: "owner", in: "path", schema: str }],
	get: { parameters: [{ name: "offset", in: "query", schema: num }], responses: { 200: response(page) } },
	post: {
		parameters: [{ name: "mode", in: "query", schema: str }, { name: "If-Match", in: "header", schema: str, required: true }],
		requestBody: response({ type: "object", properties: { body: str }, required: ["body"] }),
		responses: { 201: response(str) },
	},
} } };
const mapping = { [`GET ${path}`]: { resource: "folders", method: "list" }, [`POST ${path}`]: { resource: "folders", method: "create" } };

describe("operation mapping", () => {
	it("owns stable names, orders path arguments by the template, and keeps query, header and body together", () => {
		const routes = operations(fixture, mapping);
		const create = routes.find(r => r.operationId === "folders.create")!;
		expect(create.args.map(p => p.name)).toEqual(["owner", "folder"]);
		expect(Object.keys(create.options.properties!)).toEqual(["body", "mode", "If-Match"]);
		expect(create.options.required).toEqual(["body", "If-Match"]);
		expect(create.query).toEqual(["mode"]);
		expect(create.headers).toEqual({ "If-Match": "If-Match" });
		expect(Object.keys(generate(fixture, mapping))).toEqual(["folders.ts", "index.ts"]);
	});
	it("requires a matching offset query and standard data/pagination response", () => {
		expect(operations(fixture, mapping).find(r => r.verb === "GET")?.more).toBe("hasMore");
		const cursor = structuredClone(fixture);
		cursor.paths[path].get!.parameters![0].name = "cursor";
		expect(operations(cursor, mapping).find(r => r.verb === "GET")?.more).toBeUndefined();
		const nonstandard = structuredClone(fixture);
		nonstandard.paths[path].get!.responses[200] = response({ properties: { messages: { type: "array" } } });
		expect(operations(nonstandard, mapping).find(r => r.verb === "GET")?.more).toBeUndefined();
	});
	it("reports every unmapped and stale entry together", () => {
		expect(() => generate(fixture, { "GET /removed": mapping[`GET ${path}`] })).toThrow(`Unmapped operations:\n  GET ${path}\n  POST ${path}\nMapped operations missing from spec:\n  GET /removed`);
	});
	it("rejects duplicate public names instead of overwriting a method", () => {
		expect(() => generate(fixture, { ...mapping, [`POST ${path}`]: mapping[`GET ${path}`] })).toThrow("Duplicate SDK operationId: folders.list");
	});
});

describe("inline JSON Schema to TypeScript", () => {
	for (const [schema, expected] of [
		[{ oneOf: [str, num] }, "string | number"],
		[{ anyOf: [str, { type: "null" }], nullable: true }, "string | null"],
		[{ type: ["string", "null"] }, "string | null"],
		[{ type: "array", items: { enum: [false, "x", null] } }, 'Array<false | "x" | null>'],
		[{ const: 0, nullable: true }, "0 | null"],
		[{ properties: { "a-b": str, n: num }, required: ["n"] }, '{\n\t"a-b"?: string;\n\tn: number;\n}'],
		[{ type: "object", additionalProperties: { type: "array", items: str } }, "Record<string, Array<string>>"],
		[{ type: "object", additionalProperties: false }, "Record<string, never>"],
		[{ type: "object", patternProperties: { "^(.*)$": num } }, "Record<string, number>"],
		[{ allOf: [str, { enum: ["x", "y"] }] }, '(string) & ("x" | "y")'],
		[{}, "unknown"],
	] satisfies [Schema, string][]) {
		it(`converts ${JSON.stringify(schema)}`, () => expect(typeOf(schema)).toBe(expected));
	}
	it("refuses unresolved schema references", () => expect(() => typeOf({ $ref: "#/not-inline" })).toThrow("$ref"));
});
