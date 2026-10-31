import type { Schema } from "./schema";

export interface Parameter {
	name: string;
	in: string;
	option?: string;
	required?: boolean;
	schema: Schema;
}
interface Target {
	resource: string;
	method: string;
	binary?: boolean;
	legacyFilename?: boolean;
	reactEmail?: boolean;
	parameters?: Parameter[];
}
export type Mapping = Record<string, Target>;
type Content = { content?: Record<string, { schema?: Schema }> };
type Operation = { parameters?: Parameter[]; requestBody?: Content; responses: Record<string, Content> };
type Verb = "get" | "put" | "post" | "patch" | "delete" | "head" | "options" | "trace";
export interface Spec { paths: Record<string, Partial<Record<Verb, Operation>> & { parameters?: Parameter[] }> }
const verbs: Verb[] = ["get", "put", "post", "patch", "delete", "head", "options", "trace"];

export function operations(spec: Spec, mapping: Mapping) {
	const routes = Object.entries(spec.paths).flatMap(([path, item]) => verbs.flatMap(verb => {
		const op = item[verb];
		return op ? [{ key: `${verb.toUpperCase()} ${path}`, verb, path, op, shared: item.parameters ?? [] }] : [];
	}));
	const keys = new Set(routes.map(r => r.key));
	const unmapped = routes.map(r => r.key).filter(key => !mapping[key]);
	const stale = Object.keys(mapping).filter(key => !keys.has(key));
	if (unmapped.length || stale.length) throw new Error([
		unmapped.length && `Unmapped operations:\n  ${unmapped.join("\n  ")}`,
		stale.length && `Mapped operations missing from spec:\n  ${stale.join("\n  ")}`,
	].filter(Boolean).join("\n"));
	const ids = new Set<string>();
	return routes.map(({ key, verb, path, op, shared }) => {
		const target = mapping[key];
		const operationId = `${target.resource}.${target.method}`;
		if (ids.has(operationId)) throw new Error(`Duplicate SDK operationId: ${operationId}`);
		ids.add(operationId);
		const parameters = [...new Map([...shared, ...target.parameters ?? [], ...op.parameters ?? []].map(p => [`${p.in}:${p.name}`, p])).values()];
		const args = [...path.matchAll(/\{([^}]+)\}/g)].map(([, name]) => {
			const param = parameters.find(p => p.in === "path" && p.name === name);
			if (!param || !/^[A-Za-z_$][\w$]*$/.test(name)) throw new Error(`${key}: unsupported path parameter ${name}`);
			return param;
		});
		const body = op.requestBody?.content?.["application/json"]?.schema;
		if (op.requestBody && body?.type !== "object") throw new Error(`${key}: expected JSON object request body`);
		const options: Schema = { ...body, type: "object", properties: { ...body?.properties }, required: [...body?.required ?? []] };
		const props = options.properties!;
		const query: string[] = [];
		const headers: Record<string, string> = {};
		for (const p of parameters) {
			if (p.in === "path") continue;
			const name = p.option ?? p.name;
			if (Object.hasOwn(props, name)) throw new Error(`${key}: duplicate options field ${name}`);
			if (p.in === "query") query.push(p.name);
			else if (p.in === "header") headers[name] = p.name;
			else throw new Error(`${key}: unsupported ${p.in} parameter ${name}`);
			props[name] = p.in === "query" && ["limit", "offset"].includes(name) && p.schema.type === "string" ? { anyOf: [p.schema, { type: "integer" }] } : p.schema;
			if (p.required) options.required!.push(name);
		}
		if (target.reactEmail) props.react = {};
		const successes = Object.entries(op.responses).filter(([code]) => /^2(?:\d\d|XX)$/.test(code));
		const binary = target.binary || successes.some(([, r]) => Object.values(r.content ?? {}).some(x => x.schema?.format === "binary"));
		if (!successes.length && !binary) throw new Error(`${key}: missing success response`);
		const responses = successes.map(([status, r]) => {
			if (binary || status === "204" || !r.content) return undefined;
			const schema = r.content["application/json"]?.schema;
			if (!schema) throw new Error(`${key}: unsupported success content`);
			return schema;
		});
		const page = responses[0]?.properties;
		const paging = page?.pagination?.properties;
		const more = paging?.hasMore ? "hasMore" : "has_more";
		const paginated = verb === "get" && query.includes("offset") && page?.data?.type === "array" && paging?.[more]?.type === "boolean" && ["limit", "offset", "total"].every(k => paging[k]?.type === "number" || paging[k]?.type === "integer");
		return { ...target, operationId, verb: verb.toUpperCase(), path, args, query, headers, body: !!body, options, responses, binary: !!binary, more: paginated ? more : undefined };
	});
}
export type Route = ReturnType<typeof operations>[number];
