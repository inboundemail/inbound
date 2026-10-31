export interface Schema {
	type?: string | string[];
	nullable?: boolean;
	const?: string | number | boolean | null;
	enum?: (string | number | boolean | null)[];
	properties?: Record<string, Schema>;
	required?: string[];
	additionalProperties?: Schema | boolean;
	patternProperties?: Record<string, Schema>;
	items?: Schema;
	anyOf?: Schema[];
	oneOf?: Schema[];
	allOf?: Schema[];
	format?: string;
	$ref?: string;
}

export const property = (key: string) => /^[a-zA-Z_$][\w$]*$/.test(key) ? key : JSON.stringify(key);
const union = (types: string[]) => [...new Set(types)].join(" | ") || "never";

export function typeOf(schema: Schema, depth = 0): string {
	if (schema.$ref) throw new Error(`Expected inline schema, found $ref: ${schema.$ref}`);
	if (schema.nullable) {
		const base = typeOf({ ...schema, nullable: false }, depth);
		return (schema.anyOf ?? schema.oneOf)?.some(s => s.type === "null") || schema.enum?.includes(null) || base === "null" ? base : `${base} | null`;
	}
	if (schema.const !== undefined) return JSON.stringify(schema.const);
	if (schema.enum) return union(schema.enum.map(x => JSON.stringify(x)));
	const variants = schema.anyOf ?? schema.oneOf;
	if (variants) return union(variants.map(s => typeOf(s, depth)));
	if (schema.allOf) return schema.allOf.map(s => `(${typeOf(s, depth)})`).join(" & ");
	if (Array.isArray(schema.type)) return union(schema.type.map(type => typeOf({ ...schema, type }, depth)));
	switch (schema.type ?? (schema.properties || schema.additionalProperties !== undefined ? "object" : undefined)) {
		case "integer": case "number": return "number";
		case "string": case "boolean": case "null": return schema.type as string;
		case "array": return `Array<${typeOf(schema.items ?? {}, depth)}>`;
		case "object": {
			const fields = Object.entries(schema.properties ?? {}).map(([key, value]) =>
				`${property(key)}${schema.required?.includes(key) ? "" : "?"}: ${typeOf(value, depth + 1)};`);
			const patterns = Object.entries(schema.patternProperties ?? {});
			if (patterns.some(([k]) => k !== "^(.*)$" && k !== ".*")) throw new Error("Unsupported patternProperties constraint");
			const extra = patterns[0]?.[1] ?? schema.additionalProperties;
			const dict = `Record<string, ${typeof extra === "object" ? typeOf(extra, depth) : extra === false ? "never" : "unknown"}>`;
			if (!fields.length) return dict;
			const pad = "\t".repeat(depth);
			const object = `{\n${fields.map(line => `${pad}\t${line}`).join("\n")}\n${pad}}`;
			return extra ? `${object} & ${dict}` : object;
		}
		case undefined: return "unknown";
		default: throw new Error(`Unsupported JSON schema type: ${schema.type}`);
	}
}
