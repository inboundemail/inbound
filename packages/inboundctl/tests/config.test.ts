import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	configHome,
	credentialsPath,
	loadCredentials,
	saveCredentials,
} from "../src/config";

const paths: string[] = [];

afterEach(async () => {
	await Promise.all(
		paths.splice(0).map((path) => rm(path, { recursive: true, force: true })),
	);
});

describe("global config", () => {
	it("uses the explicit config home", () => {
		expect(configHome({ INBOUNDCTL_CONFIG_HOME: "/tmp/inboundctl-test" })).toBe(
			"/tmp/inboundctl-test",
		);
	});

	it("stores credentials with user-only permissions", async () => {
		const root = await mkdtemp(join(tmpdir(), "inboundctl-"));
		paths.push(root);
		const env = { INBOUNDCTL_CONFIG_HOME: join(root, "config") };
		await saveCredentials({ version: 1, apiKey: "secret" }, env);
		expect(await loadCredentials(env)).toEqual({
			version: 1,
			apiKey: "secret",
		});
		expect(await readFile(credentialsPath(env), "utf8")).not.toContain(
			"undefined",
		);
		if (process.platform !== "win32") {
			expect((await stat(credentialsPath(env))).mode & 0o777).toBe(0o600);
		}
	});
});
