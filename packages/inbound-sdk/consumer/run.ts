import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import manifest from "../package.json";

const root = resolve(import.meta.dir, "..");
const dir = await mkdtemp(join(tmpdir(), "inbound-packed-consumer-"));
function run(cmd: string[], cwd = dir) {
	const result = Bun.spawnSync(cmd, { cwd, stdout: "inherit", stderr: "inherit" });
	if (result.exitCode !== 0) throw new Error(`${cmd.join(" ")} exited ${result.exitCode}`);
}
try {
	run(["bun", "--no-env-file", "pm", "pack", "--quiet", "--destination", dir], root);
	await Bun.write(join(dir, "package.json"), JSON.stringify({ private: true, dependencies: {
		inboundemail: `file:./inboundemail-${manifest.version}.tgz`,
	}, devDependencies: { typescript: "5.9.3", "@types/node": "20.19.24" } }));
	for (const file of ["tsconfig.json", "contract.ts", "check.mjs"]) await cp(join(import.meta.dir, file), join(dir, file));
	run(["bun", "--no-env-file", "install", "--ignore-scripts"]);
	run(["node", "./check.mjs"]);
	run(["node", "node_modules/typescript/bin/tsc", "-p", "tsconfig.json"]);
	console.log("TS 5.9.3 + @types/node 20.19.24, ES2022 only, moduleResolution=node, skipLibCheck=false: passed");
	// Only install the baseline after the new tarball has passed completely on its own.
	run(["bun", "--no-env-file", "add", "--dev", "--ignore-scripts", "published-inboundemail@npm:inboundemail@0.20.0"]);
	const checks: string[] = [];
	for (const resource of ["attachments", "domains", "emails", "endpoints", "email-addresses", "mail"]) {
		const sub = `resources/${resource}`;
		const dts = await Bun.file(join(dir, `node_modules/published-inboundemail/${sub}.d.ts`)).text();
		for (const [, name] of dts.matchAll(/^export interface (\w+Params)\b/gm)) {
			checks.push(`type ${name} = Accepts<import("inboundemail/${sub}").${name}, import("published-inboundemail/${sub}").${name}>;`);
		}
	}
	if (checks.length !== 17) throw new Error(`Expected 17 published input interfaces, found ${checks.length}`);
	await Bun.write(join(dir, "subpaths.ts"), ["type Accepts<New, Old extends New> = Old;", ...checks,
		'type ClientOptions = Accepts<import("inboundemail").ClientOptions, import("published-inboundemail").ClientOptions>;',
		'type RequestOptions = Accepts<import("inboundemail").RequestOptions, import("published-inboundemail").Inbound.RequestOptions>;',
	].join("\n"));
	run(["node", "node_modules/typescript/bin/tsc", "-p", "tsconfig.json"]);
	console.log(`${checks.length}/${checks.length} published 0.20 input interfaces assignable to packed 0.21 inputs`);
	console.log("Published ClientOptions and RequestOptions assignable with exactOptionalPropertyTypes=true");
} finally { await rm(dir, { recursive: true, force: true }); }
