import { isDeepStrictEqual } from "node:util";
import { resources } from "./resources";
import type { Json, Schema } from "./schema";
import { type CodeSample, operations, type Route, type Spec } from "./spec";

export interface SampleSpec extends Spec {
	servers: { url: string }[];
}

const strings: Record<string, string> = {
	domain: "example.com", domainId: "dom_...", endpoint_id: "endpoint_...",
	address: "agent@example.com", from: "agent@example.com",
	to: "alex@example.com", loginAddress: "agent@example.com", sendingAddress: "agent@example.com",
	name: "Support", sendingName: "Support", subject: "Your support request", text: "How can we help?",
	url: "https://example.com/webhooks/inbound", description: "Route incoming support requests",
	flags: "\\Seen", folder: "INBOX", path: "Projects/Support", destination: "Archive",
	pattern: "agent@example.com", allow: "agent@example.com", block: "spam@example.org",
	ids: "<filterId>", search: "support", limit: "25", offset: "0", permanent: "false",
	prompt: "Flag messages asking for passwords or payment details.", password: "<mailboxPassword>",
};

const commonFields = ["text", "subject", "to", "name", "isActive", "isRead", "is_read", "enabled", "value", "limit", "includeSubdomains", "webhookFormat"];
function objectExample(schema: Schema, parent: string): Record<string, Json> {
	const props = schema.properties ?? {};
	const preset = specified(schema);
	const values = preset && typeof preset === "object" && !Array.isArray(preset) ? preset : {};
	const required = schema.required ?? [];
	const optional = (preset ? Object.keys(values) : commonFields).filter(k => k in props && !required.includes(k));
	if (!required.length && !optional.length) optional.push(...Object.keys(props).slice(0, 1));
	return Object.fromEntries([...required, ...optional.slice(0, 3)].map(k => [
		k, Object.hasOwn(values, k) ? values[k] : example(props[k], k, parent),
	]));
}

function specified(s: Schema) {
	return [s.examples?.[0], s.example, s.default, s.enum?.[0], s.const].find(v => v !== undefined);
}

function example(schema: Schema, key: string, parent = ""): Json {
	const preset = specified(schema);
	if (preset !== undefined) return preset;
	const variants = schema.anyOf ?? schema.oneOf;
	if (variants) {
		const variant = variants.find(s => s.type === "integer") ?? variants.find(s => s.type !== "null") ?? variants[0];
		return example(variant, key, parent);
	}
	switch (schema.type) {
		case "object": return objectExample(schema, key);
		case "array": return [example(schema.items ?? {}, key, parent)];
		case "number": case "integer": return Math.max(1, schema.minimum ?? 1);
		case "boolean": return true;
		case "null": return null;
		case "string": {
			const prefix = schema.description?.match(/\b([a-z]+_)xxx\b/i)?.[1];
			if (prefix) return `${prefix}...`;
			if (key === "value" && parent === "actions") return "Archive";
			if (key === "value" && parent === "conditions") return "agent@example.com";
			if (schema.format === "email") return "agent@example.com";
			return strings[key] ?? `<${key}>`;
		}
		default: throw new Error(`No sample value for ${key}: ${JSON.stringify(schema)}`);
	}
}

const idNames: Record<string, string> = {
	domains: "domainId", endpoints: "endpointId", "email-addresses": "emailAddressId", attachments: "emailId",
	emails: "emailId", threads: "threadId", mailboxes: "mailboxId", guard: "ruleId",
};
const quote = (s: string) => `'${s.replaceAll("'", "'\\''")}'`;
const tsLiteral = (v: Json) => JSON.stringify(v, null, 2).replace(/^(\s*)"([a-zA-Z_$][\w$]*)":/gm, "$1$2:");

function sdkNumbers(value: Json, schema: Schema): Json {
	const variants = schema.anyOf ?? schema.oneOf;
	if (variants) {
		for (const variant of variants) {
			const converted = sdkNumbers(value, variant);
			if (!isDeepStrictEqual(converted, value)) return converted;
		}
	} else if (typeof value === "string" && /^-?\d+(?:\.\d+)?(?:e[+-]?\d+)?$/i.test(value)) {
		const n = Number(value);
		const types = Array.isArray(schema.type) ? schema.type : [schema.type];
		const accepts = schema.const !== undefined ? schema.const === n : schema.enum ? schema.enum.includes(n) :
			types.includes("number") || (types.includes("integer") && Number.isInteger(n));
		if (accepts && Number.isFinite(n) && (!Number.isInteger(n) || Number.isSafeInteger(n))) return n;
	} else if (Array.isArray(value) && schema.items) {
		return value.map(item => sdkNumbers(item, schema.items!));
	} else if (value && typeof value === "object" && !Array.isArray(value) && schema.properties) {
		const props = schema.properties;
		if (Object.keys(value).every(k => Object.hasOwn(props, k))) {
			return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, sdkNumbers(v, props[k])]));
		}
	}
	return value;
}

function samples(route: Route, server: string): CodeSample[] {
	const args: Json[] = [];
	let path = route.path;
	for (const { name, schema } of route.args) {
		const token = `{${name}}`;
		const segment = path.split(`/${token}`)[0].split("/").at(-1) ?? "";
		const label = name === "id" ? idNames[segment] ?? name : name;
		const value = schema.type === "string" ? `<${label}>` : example(schema, name);
		args.push(value);
		path = path.replace(token, String(value));
	}
	const schema = route.operation.requestBody?.content?.["application/json"]?.schema;
	const body = schema ? objectExample(schema, "body") : undefined;
	const options: Record<string, Json> = { ...body };
	const query = new URLSearchParams();
	const params = route.parameters.filter(p => p.in === "query");
	const paging = params.filter(p => p.name === "limit" || p.name === "offset");
	for (const p of new Set([...params.filter(p => p.required), ...(paging.length ? paging : params.slice(0, 1))])) {
		const value = example(p.schema, p.name);
		options[p.option ?? p.name] = value;
		query.set(p.name, String(value));
	}
	const url = server.replace(/\/$/, "") + path + (query.size ? `?${query}` : "");
	const curl = [`curl -X ${route.verb} ${quote(url)}`, '-H "Authorization: Bearer $INBOUND_API_KEY"'];
	for (const p of route.parameters.filter(p => p.in === "header" && p.required)) {
		const value = example(p.schema, p.name);
		options[p.option ?? p.name] = value;
		curl.push(`-H ${quote(`${p.name}: ${value}`)}`);
	}
	if (body) curl.push("-H 'Content-Type: application/json'", `-d ${quote(JSON.stringify(body, null, 2))}`);
	if (body || Object.keys(options).length) args.push(sdkNumbers(options, route.options));
	return [
		{ lang: "typescript", label: "TypeScript", source: `import Inbound from "inboundemail";\n\nconst inbound = new Inbound();\nconst result = await inbound.${route.operationId}(${args.map(tsLiteral).join(", ")});` },
		{ lang: "curl", label: "cURL", source: curl.join(" \\\n  ") },
	];
}

export function addCodeSamples(spec: SampleSpec) {
	for (const route of operations(spec, resources)) {
		route.operation["x-codeSamples"] = samples(route, spec.servers[0].url);
	}
}
