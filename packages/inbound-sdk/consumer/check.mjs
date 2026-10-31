import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { setImmediate } from "node:timers/promises";
import { mock } from "node:test";
import { writeFile } from "node:fs/promises";
import { createElement } from "react";
import Inbound, { Inbound as Named, render } from "inboundemail";

const require = createRequire(import.meta.url);
const paths = {
	"": "Inbound", index: "Inbound", client: "Inbound", version: "VERSION", error: "APIError",
	resource: "APIResource", resources: "Domains", uploads: "toFile", "api-promise": "APIPromise",
	"core/error": "APIError", "core/resource": "APIResource", "core/uploads": "toFile", "core/api-promise": "APIPromise",
	"lib/webhooks": "verifyWebhookFromHeaders", "lib/render": "render", "resources/index": "Domains",
	"resources/domains": "Domains", "resources/attachments": "Attachments", "resources/emails": "Emails",
	"resources/endpoints": "Endpoints", "resources/mail": "Mail", "resources/email-addresses": "EmailAddresses",
};
const declarations = [];
for (const [path, symbol] of Object.entries(paths)) {
	for (const ext of path ? ["", ".js", ".mjs"] : [""]) {
		const id = `inboundemail${path ? `/${path}${ext}` : ""}`;
		assert.ok((await import(id))[symbol], `import ${id}.${symbol}`);
		assert.ok(require(id)[symbol], `require ${id}.${symbol}`);
		declarations.push(`export * as M${declarations.length} from ${JSON.stringify(id)};`);
	}
}
assert.equal(declarations.length, 64);
await writeFile("subpaths.ts", declarations.join("\n"));
console.log(`${declarations.length}/64 published entry points: ESM import and CJS require passed`);

const bodies = [];
const options = { apiKey: "fixture", fetch: async (_url, init) => {
	if (init.body) bodies.push(JSON.parse(init.body));
	return Response.json({ id: "fixture" });
} };
const CJS = require("inboundemail");
assert.equal(Inbound, Named);
for (const [ctor, client] of [[Inbound, new Inbound(options)], [CJS, CJS(options)], [CJS, new CJS(options)]]) {
	assert.ok(client instanceof ctor);
	for (const [key, name] of Object.entries({ domains: "Domains", endpoints: "Endpoints", emailAddresses: "EmailAddresses", emails: "Emails", attachments: "Attachments", mail: "Mail" })) {
		assert.ok(client[key] instanceof ctor[name]);
	}
}
console.log("Default/named ESM, callable/constructable CommonJS and resource statics passed");

const client = new Inbound(options);
const react = createElement("p", null, "isolated-render");
assert.match(await render(react), /<p>isolated-render<\/p>/);
await client.emails.send({ from: "a", to: "b", subject: "test", react });
await client.emails.reply("id", { from: "a", react });
for (const body of bodies) { assert.match(body.html, /<p>isolated-render<\/p>/); assert.ok(!("react" in body)); }
assert.equal(bodies.length, 2);
console.log("Clean-install React rendering: render(), send(), reply() passed");

const p = client.get("/fixture");
await setImmediate();
const raw = await p.asResponse();
assert.equal(raw.bodyUsed, false);
assert.deepEqual(await Promise.all([p, p]), [{ id: "fixture" }, { id: "fixture" }]);
assert.equal((await p.withResponse()).response, raw);
console.log("Lazy APIPromise raw response and memoized parsed body passed");

const now = Date.UTC(2026, 0, 1);
for (const hint of [{ "Retry-After": "120" }, { "retry-after-ms": "120000" }, { "Retry-After": new Date(now + 120_000).toUTCString() }]) {
	mock.timers.enable({ apis: ["setTimeout", "Date"], now });
	try {
		let attempts = 0;
		const c = new Inbound({ apiKey: "fixture", fetch: async () => ++attempts === 1 ? new Response(null, { status: 429, headers: hint }) : Response.json({}) });
		const pending = c.spamFilter.retrieve();
		await setImmediate();
		mock.timers.tick(59_999);
		await setImmediate();
		assert.equal(attempts, 1);
		mock.timers.tick(1);
		await setImmediate();
		assert.equal(attempts, 2);
		await pending;
	} finally { mock.timers.reset(); }
}
console.log("Retry-After: seconds, milliseconds and HTTP-date honored to the 60-second cap");
