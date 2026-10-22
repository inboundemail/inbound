import { describe, expect, it } from "bun:test";
import { EventEmitter } from "node:events";
import { ConnectionLimits, ContentBudget, ContentBudgetError } from "./limits.ts";

function fakeSocket(remoteAddress: string) {
	return Object.assign(new EventEmitter(), { remoteAddress });
}

describe("ConnectionLimits", () => {
	it("enforces and releases per-IP connections at TCP accept", () => {
		const limits = new ConnectionLimits(2, 3, 60_000);
		const first = fakeSocket("192.0.2.1");
		const second = fakeSocket("::ffff:192.0.2.1");
		const third = fakeSocket("192.0.2.1");

		expect(limits.acceptSocket(first)).toBe(true);
		expect(limits.acceptSocket(second)).toBe(true);
		expect(limits.acceptSocket(third)).toBe(false);
		expect(limits.acceptSocket(fakeSocket("192.0.2.2"))).toBe(true);
		first.emit("close");
		first.emit("close");
		expect(limits.openConnections("192.0.2.1")).toBe(1);
		expect(limits.acceptSocket(third)).toBe(true);
		expect(limits.openConnections("192.0.2.1")).toBe(2);
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

	it("evicts the oldest failure records when the table is full instead of denying", () => {
		const limits = new ConnectionLimits(2, 2, 60_000, 3);
		limits.recordAuthFailure("192.0.2.10", "oldest@example.com");
		limits.recordAuthFailure("192.0.2.11", "first@example.com");
		limits.recordAuthFailure("192.0.2.12", "second@example.com");
		limits.recordAuthFailure("192.0.2.12", "second@example.com");

		expect(
			limits.assertAuthAllowed("192.0.2.13", "fresh@example.com"),
		).toBeNull();
		limits.recordAuthFailure("192.0.2.13", "fresh@example.com");

		const records = limits as unknown as {
			failures: Map<string, unknown>;
			ipFailures: Map<string, unknown>;
		};
		expect(records.failures.size).toBe(3);
		expect(records.ipFailures.size).toBe(3);
		expect(records.failures.has("192.0.2.10\0oldest@example.com")).toBe(false);
		expect(records.failures.has("192.0.2.13\0fresh@example.com")).toBe(true);
		expect(
			limits.assertAuthAllowed("192.0.2.12", "second@example.com"),
		).toBeInstanceOf(Error);
	});

	it("prunes expired failure records before inserting", async () => {
		const limits = new ConnectionLimits(2, 2, 1, 10);
		limits.recordAuthFailure("192.0.2.30", "expired@example.com");
		await Bun.sleep(5);
		limits.recordAuthFailure("192.0.2.31", "fresh@example.com");
		const records = limits as unknown as { failures: Map<string, unknown> };
		expect([...records.failures.keys()]).toEqual([
			"192.0.2.31\0fresh@example.com",
		]);
	});

	it("counts malformed logins against the IP without per-account records", () => {
		const limits = new ConnectionLimits(2, 1, 60_000, 10);
		for (let index = 0; index < 4; index++) {
			limits.recordMalformedAuth("192.0.2.40");
		}
		const records = limits as unknown as { failures: Map<string, unknown> };
		expect(records.failures.size).toBe(0);
		expect(
			limits.assertAuthAllowed("192.0.2.40", "user@example.com"),
		).toBeNull();
		limits.recordMalformedAuth("192.0.2.40");
		expect(
			limits.assertAuthAllowed("192.0.2.40", "user@example.com"),
		).toBeInstanceOf(Error);
		expect(
			limits.assertAuthAllowed("192.0.2.41", "user@example.com"),
		).toBeNull();
	});

	it("rejects failure-map capacities above the hard maximum", () => {
		expect(() => new ConnectionLimits(2, 2, 60_000, 1_000_001)).toThrow();
	});

	it("bounds account and IP failure maps to the configured cap (default 100,000)", () => {
		const limits = new ConnectionLimits(2, 2, 60_000);
		for (let index = 0; index < 100_005; index++) {
			limits.recordAuthFailure(`ip-${index}`, `user-${index}@example.com`);
		}
		const records = limits as unknown as {
			failures: Map<string, unknown>;
			ipFailures: Map<string, unknown>;
		};
		expect(records.failures.size).toBe(100_000);
		expect(records.ipFailures.size).toBe(100_000);
		expect(
			limits.assertAuthAllowed("ip-new", "user-new@example.com"),
		).toBeNull();
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

describe("ContentBudget", () => {
	it("admits fetches within the budget and queues the rest until released", async () => {
		const budget = new ContentBudget(100, 1_000);
		const first = await budget.acquire(60);
		let secondAcquired = false;
		const second = budget.acquire(60).then((release) => {
			secondAcquired = true;
			return release;
		});
		await Bun.sleep(5);
		expect(secondAcquired).toBe(false);
		first();
		first();
		const releaseSecond = await second;
		expect(budget.used).toBe(60);
		releaseSecond();
		expect(budget.used).toBe(0);
	});

	it("fails with NO [LIMIT] after the bounded wait", async () => {
		const budget = new ContentBudget(100, 10);
		const held = await budget.acquire(100);
		const error = await budget.acquire(1).catch((err: unknown) => err);
		expect(error).toBeInstanceOf(ContentBudgetError);
		expect((error as ContentBudgetError).imapCode).toBe("LIMIT");
		held();
		expect(budget.used).toBe(0);
	});

	it("caps one credential at half the budget without blocking other credentials", async () => {
		const budget = new ContentBudget(100, 1_000);
		expect(budget.ownerCapacity).toBe(50);
		const first = await budget.acquire(40, "greedy");
		let greedyAcquired = false;
		const greedy = budget.acquire(40, "greedy").then((release) => {
			greedyAcquired = true;
			return release;
		});
		const other = await budget.acquire(50, "other");
		await Bun.sleep(5);
		expect(greedyAcquired).toBe(false);
		expect(budget.usedBy("greedy")).toBe(40);
		expect(budget.used).toBe(90);

		first();
		const releaseGreedy = await greedy;
		expect(budget.usedBy("greedy")).toBe(40);
		releaseGreedy();
		other();
		expect(budget.used).toBe(0);
		expect(budget.usedBy("greedy")).toBe(0);
	});

	it("admits a single message above the per-credential share alone", async () => {
		const budget = new ContentBudget(100, 10);
		const release = await budget.acquire(10_000, "owner");
		expect(budget.used).toBe(50);
		const error = await budget.acquire(1, "owner").catch((err: unknown) => err);
		expect(error).toBeInstanceOf(ContentBudgetError);
		release();
		expect(budget.used).toBe(0);
	});

	it("lets a message larger than the whole budget through alone", async () => {
		const budget = new ContentBudget(100, 1_000);
		const release = await budget.acquire(10_000);
		expect(budget.used).toBe(100);
		release();
	});
});
