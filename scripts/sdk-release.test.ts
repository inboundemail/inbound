import { describe, expect, it } from "bun:test";
import { getNextSdkVersion } from "./bump-sdk-version";
import { classifySdkChange } from "./classify-sdk-change";

describe("SDK release classification", () => {
	it("does not release an identical contract", () => {
		const spec = { openapi: "3.1.0", paths: {} };
		expect(classifySdkChange(spec, structuredClone(spec))).toBe("none");
	});

	it("uses a patch for documentation-only changes", () => {
		const base = {
			openapi: "3.1.0",
			info: { title: "Inbound", version: "1" },
			paths: { "/emails": { get: { description: "Old" } } },
		};
		const revision = structuredClone(base);
		revision.paths["/emails"].get.description = "New";
		expect(classifySdkChange(base, revision)).toBe("patch");
	});

	it("uses a minor for additive contract changes", () => {
		const base = { openapi: "3.1.0", paths: {} };
		const revision = {
			...base,
			paths: { "/emails": { post: { responses: { 200: {} } } } },
		};
		expect(classifySdkChange(base, revision)).toBe("minor");
	});
});

describe("SDK version bumps", () => {
	it("increments patch versions", () => {
		expect(getNextSdkVersion("1.2.3", "patch")).toBe("1.2.4");
	});

	it("increments minor versions and resets patch", () => {
		expect(getNextSdkVersion("1.2.3", "minor")).toBe("1.3.0");
	});
});
