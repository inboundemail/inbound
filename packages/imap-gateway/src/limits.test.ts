import { describe, expect, it } from "bun:test";
import { ConnectionLimits } from "./limits.ts";

describe("ConnectionLimits", () => {
	it("enforces and releases per-IP connections", () => {
		const limits = new ConnectionLimits(2, 3, 60_000);
		const first = { remoteAddress: "192.0.2.1" };
		const second = { remoteAddress: "192.0.2.1" };
		const third = { remoteAddress: "192.0.2.1" };

		expect(limits.onConnect(first)).toBeNull();
		expect(limits.onConnect(second)).toBeNull();
		expect(limits.onConnect(third)).toBeInstanceOf(Error);
		limits.onClose(first);
		expect(limits.onConnect(third)).toBeNull();
	});

	it("blocks username spraying after the higher aggregate IP threshold", () => {
		const limits = new ConnectionLimits(2, 2, 60_000);
		for (let index = 0; index < 9; index++) {
			limits.recordAuthFailure("192.0.2.3", `user-${index}@example.com`);
		}
		expect(
			limits.assertAuthAllowed("192.0.2.3", "fresh@example.com"),
		).toBeNull();
		limits.recordAuthFailure("192.0.2.3", "last@example.com");
		expect(
			limits.assertAuthAllowed("192.0.2.3", "fresh@example.com"),
		).toBeInstanceOf(Error);
		limits.recordAuthSuccess("192.0.2.3", "last@example.com");
		expect(
			limits.assertAuthAllowed("192.0.2.3", "fresh@example.com"),
		).toBeInstanceOf(Error);
		expect(
			limits.assertAuthAllowed("192.0.2.4", "fresh@example.com"),
		).toBeNull();
	});

	it("expires account and aggregate failure windows", async () => {
		const limits = new ConnectionLimits(2, 1, 1);
		for (let index = 0; index < 5; index++) {
			limits.recordAuthFailure("192.0.2.5", `user-${index}@example.com`);
		}
		expect(
			limits.assertAuthAllowed("192.0.2.5", "fresh@example.com"),
		).toBeInstanceOf(Error);
		await Bun.sleep(5);
		expect(
			limits.assertAuthAllowed("192.0.2.5", "fresh@example.com"),
		).toBeNull();
		expect(
			limits.assertAuthAllowed("192.0.2.5", "user-0@example.com"),
		).toBeNull();
	});

	it("preserves blocked account records and fails closed at capacity", () => {
		const limits = new ConnectionLimits(2, 2, 60_000, 3);
		limits.recordAuthFailure("192.0.2.10", "blocked@example.com");
		limits.recordAuthFailure("192.0.2.10", "blocked@example.com");
		limits.recordAuthFailure("192.0.2.11", "first@example.com");
		limits.recordAuthFailure("192.0.2.12", "second@example.com");
		limits.recordAuthFailure("192.0.2.13", "attacker@example.com");

		expect(
			limits.assertAuthAllowed("192.0.2.10", "blocked@example.com"),
		).toBeInstanceOf(Error);
		expect(
			limits.assertAuthAllowed("192.0.2.13", "attacker@example.com"),
		).toBeInstanceOf(Error);
		const records = limits as unknown as {
			failures: Map<string, unknown>;
			ipFailures: Map<string, unknown>;
		};
		expect(records.failures.has("192.0.2.10\0blocked@example.com")).toBe(true);
		expect(records.failures.size).toBe(3);
		expect(records.ipFailures.size).toBe(3);
	});

	it("preserves blocked aggregate IP records when the IP map is full", () => {
		const limits = new ConnectionLimits(2, 1, 60_000, 3);
		for (let index = 0; index < 5; index++) {
			limits.recordAuthFailure("192.0.2.20", "blocked@example.com");
		}
		limits.recordAuthFailure("192.0.2.21", "first@example.com");
		limits.recordAuthFailure("192.0.2.22", "second@example.com");
		limits.recordAuthFailure("192.0.2.23", "attacker@example.com");

		expect(
			limits.assertAuthAllowed("192.0.2.20", "fresh@example.com"),
		).toBeInstanceOf(Error);
		expect(
			limits.assertAuthAllowed("192.0.2.23", "attacker@example.com"),
		).toBeInstanceOf(Error);
	});

	it("reuses expired failure slots without evicting active records", async () => {
		const limits = new ConnectionLimits(2, 2, 1, 1);
		limits.recordAuthFailure("192.0.2.30", "expired@example.com");
		expect(
			limits.assertAuthAllowed("192.0.2.31", "fresh@example.com"),
		).toBeInstanceOf(Error);
		await Bun.sleep(5);
		expect(
			limits.assertAuthAllowed("192.0.2.31", "fresh@example.com"),
		).toBeNull();
		limits.recordAuthFailure("192.0.2.31", "fresh@example.com");
		const records = limits as unknown as { failures: Map<string, unknown> };
		expect(records.failures.has("192.0.2.31\0fresh@example.com")).toBe(true);
	});

	it("rejects failure-map capacities above the hard maximum", () => {
		expect(() => new ConnectionLimits(2, 2, 60_000, 10_001)).toThrow();
	});

	it("bounds account and IP failure maps to 10,000 entries", () => {
		const limits = new ConnectionLimits(2, 2, 60_000);
		for (let index = 0; index < 10_005; index++) {
			limits.recordAuthFailure(`192.0.2.${index}`, `user-${index}@example.com`);
		}
		const records = limits as unknown as {
			failures: Map<string, unknown>;
			ipFailures: Map<string, unknown>;
		};
		expect(records.failures.size).toBe(10_000);
		expect(records.ipFailures.size).toBe(10_000);
	});

	it("isolates authentication failures by IP and username", () => {
		const limits = new ConnectionLimits(2, 2, 60_000);
		limits.recordAuthFailure("192.0.2.2", "first@example.com");
		expect(
			limits.assertAuthAllowed("192.0.2.2", "first@example.com"),
		).toBeNull();
		limits.recordAuthFailure("192.0.2.2", "first@example.com");
		expect(
			limits.assertAuthAllowed("192.0.2.2", "first@example.com"),
		).toBeInstanceOf(Error);
		expect(
			limits.assertAuthAllowed("192.0.2.2", "second@example.com"),
		).toBeNull();
		limits.recordAuthSuccess("192.0.2.2", "second@example.com");
		expect(
			limits.assertAuthAllowed("192.0.2.2", "first@example.com"),
		).toBeInstanceOf(Error);
		limits.recordAuthSuccess("192.0.2.2", "first@example.com");
		expect(
			limits.assertAuthAllowed("192.0.2.2", "first@example.com"),
		).toBeNull();
	});
});
