import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// Files in host/ that never go into the bundle (and so not into the manifest).
export const hostBundleExclude = [".DS_Store"];

const safePath = /^[A-Za-z0-9._@-]+(\/[A-Za-z0-9._@-]+)*$/;

/**
 * SHA-256 manifest of every file in the host bundle directory, in `sha256sum` format
 * ("<hex>  <path>", one line per file, sorted by path in byte order). The host checks the
 * downloaded bundle against it (exact file list, then `sha256sum -c`) before running anything.
 */
export function hostBundleManifest(dir: string): string {
	const files: string[] = [];
	const walk = (rel: string) => {
		for (const entry of readdirSync(join(dir, rel), { withFileTypes: true })) {
			if (hostBundleExclude.includes(entry.name)) continue;
			const path = rel ? `${rel}/${entry.name}` : entry.name;
			if (entry.isDirectory()) walk(path);
			else if (entry.isFile()) files.push(path);
			else throw new Error(`host bundle: ${path} is not a regular file or directory`);
		}
	};
	walk("");
	files.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
	for (const path of files) {
		if (!safePath.test(path) || path.split("/").some((part) => part === "." || part === "..")) {
			throw new Error(`host bundle: unsupported file name ${JSON.stringify(path)}`);
		}
	}
	if (!files.includes("bootstrap.sh")) throw new Error("host bundle: bootstrap.sh missing");
	const manifest = files
		.map((path) => `${createHash("sha256").update(readFileSync(join(dir, path))).digest("hex")}  ${path}`)
		.join("\n");
	// Standard-tier SSM String parameters hold at most 4 KB.
	if (Buffer.byteLength(manifest) > 4096) {
		throw new Error(`host bundle manifest is ${Buffer.byteLength(manifest)} bytes, over the 4 KB SSM limit`);
	}
	return manifest;
}
