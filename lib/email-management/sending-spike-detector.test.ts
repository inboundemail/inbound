import { Database, type SQLQueryBindings } from "bun:sqlite";
import { afterEach, describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import * as orm from "drizzle-orm";
import { drizzle } from "drizzle-orm/pg-proxy";
import { ModuleKind, transpileModule } from "typescript";
import * as authSchema from "@/lib/db/auth-schema";
import * as schema from "@/lib/db/schema";

const NOW = Date.parse("2026-09-05T12:00:00.000Z");
const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;
const databases: Database[] = [];
const sources = Object.fromEntries(
	["email-blocking", "sending-spike-detector"].map((name) => [
		name,
		transpileModule(
			readFileSync(
				Bun.resolveSync(`@/lib/email-management/${name}.ts`, import.meta.dir),
				"utf8",
			),
			{ compilerOptions: { module: ModuleKind.CommonJS } },
		).outputText,
	]),
);

class FixedDate extends Date {
	constructor(value: string | number | Date = NOW) {
		super(value);
	}

	static now() {
		return NOW;
	}
}

function setup() {
	const sqlite = new Database(":memory:");
	databases.push(sqlite);
	sqlite.exec(`
		CREATE TABLE blocked_emails (email_address TEXT, domain_id TEXT);
		CREATE TABLE sent_emails (user_id TEXT, status TEXT, sent_at TEXT, created_at TEXT);
		CREATE TABLE user (id TEXT, email TEXT, name TEXT, created_at TEXT);
	`);
	const state = {
		queries: 0,
		returnedRows: 0,
		failDatabase: false,
		cooldown: false,
		failRedis: false,
		externalCalls: 0,
	};
	const db = drizzle(async (query, params: SQLQueryBindings[]) => {
		state.queries++;
		if (state.failDatabase) throw new Error("database unavailable");
		const rows = sqlite.query(query).values(...params);
		state.returnedRows += rows.length;
		return { rows };
	});
	const unexpectedCall = () => {
		state.externalCalls++;
		throw new Error("external calls forbidden");
	};
	const dependencies: Record<string, unknown> = {
		"drizzle-orm": orm,
		"@/lib/db": { db },
		"@/lib/db/schema": schema,
		"@/lib/db/auth-schema": authSchema,
		nanoid: { nanoid: unexpectedCall },
		"@/lib/aws-ses/aws-stats-core": { getAwsSesStats: unexpectedCall },
		"@/lib/notifications/hark": {
			quarterHourBucket: unexpectedCall,
			sendHarkNotification: unexpectedCall,
		},
		"@/lib/redis": {
			redis: {
				get: async () => {
					if (state.failRedis) throw new Error("redis unavailable");
					return state.cooldown ? NOW : null;
				},
				set: unexpectedCall,
			},
		},
	};
	function load<T>(name: string): T {
		const module = { exports: {} };
		new Function(
			"require",
			"module",
			"exports",
			"Date",
			"console",
			"process",
			"fetch",
			sources[name],
		)(
			(path: string) => {
				if (!(path in dependencies)) throw new Error(`Unexpected import: ${path}`);
				return dependencies[path];
			},
			module,
			module.exports,
			FixedDate,
			{ log() {}, warn() {}, error() {} },
			{ env: {} },
			unexpectedCall,
		);
		return module.exports as T;
	}
	const blocking = load<typeof import("@/lib/email-management/email-blocking")>(
		"email-blocking",
	);
	const spike = load<typeof import("@/lib/email-management/sending-spike-detector")>(
		"sending-spike-detector",
	);
	function addSent(
		sentAt: number | null,
		createdAt: number | null = NOW,
		status = "sent",
		userId = "target-user",
	) {
		sqlite
			.query("INSERT INTO sent_emails VALUES (?, ?, ?, ?)")
			.run(
				userId,
				status,
				sentAt === null ? null : new Date(sentAt).toISOString(),
				createdAt === null ? null : new Date(createdAt).toISOString(),
			);
	}
	return { sqlite, state, addSent, ...blocking, ...spike };
}

afterEach(() => {
	for (const database of databases.splice(0)) database.close();
});

describe("recipient blocklist query", () => {
	it("matches global mixed-case rows while preserving normalized duplicates and order", async () => {
		const test = setup();
		const insert = test.sqlite.query("INSERT INTO blocked_emails VALUES (?, ?)");
		insert.run("BLOCKED@Example.com", "another-users-domain");
		insert.run("Second@Example.com", "different-domain");
		insert.run("irrelevant@example.com", "another-users-domain");
		insert.run(" padded@example.com ", "different-domain");

		expect(
			await test.checkRecipientsAgainstBlocklist([
				"Display Name <Second@Example.com>",
				" BLOCKED@example.com ",
				"not-blocked@example.com",
				"Another Name <blocked@EXAMPLE.com>",
				"padded@example.com",
			]),
		).toEqual({
			hasBlockedRecipients: true,
			blockedAddresses: [
				"second@example.com",
				"blocked@example.com",
				"blocked@example.com",
			],
		});
		expect(test.state.queries).toBe(1);
		expect(test.state.returnedRows).toBe(2);
	});

	it("skips the database for empty recipients", async () => {
		const test = setup();
		expect(await test.checkRecipientsAgainstBlocklist([])).toEqual({
			hasBlockedRecipients: false,
			blockedAddresses: [],
		});
		expect(test.state.queries).toBe(0);
	});

	it("returns no blocked recipients for nonmatches and database errors", async () => {
		const test = setup();
		const expected = { hasBlockedRecipients: false, blockedAddresses: [] };
		expect(await test.checkRecipientsAgainstBlocklist(["none@example.com"])).toEqual(expected);
		test.state.failDatabase = true;
		expect(await test.checkRecipientsAgainstBlocklist(["none@example.com"])).toEqual(expected);
	});
});

describe("sending spike aggregate query", () => {
	const boundaries = [
		{ age: -MINUTE, current15m: 1, current1h: 1, currentCount: 1, historicalAverage: 0 },
		{ age: 15 * MINUTE - 1, current15m: 1, current1h: 1, currentCount: 1, historicalAverage: 0 },
		{ age: 15 * MINUTE, current15m: 1, current1h: 1, currentCount: 1, historicalAverage: 0 },
		{ age: 15 * MINUTE + 1, current15m: 0, current1h: 1, currentCount: 1, historicalAverage: 0 },
		{ age: 60 * MINUTE, current15m: 0, current1h: 1, currentCount: 1, historicalAverage: 0 },
		{ age: 60 * MINUTE + 1, current15m: 0, current1h: 0, currentCount: 1, historicalAverage: 0 },
		{ age: DAY, current15m: 0, current1h: 0, currentCount: 1, historicalAverage: 0 },
		{ age: DAY + 1, current15m: 0, current1h: 0, currentCount: 0, historicalAverage: 1 / 14 },
		{ age: 15 * DAY, current15m: 0, current1h: 0, currentCount: 0, historicalAverage: 1 / 14 },
		{ age: 15 * DAY + 1, current15m: 0, current1h: 0, currentCount: 0, historicalAverage: 0 },
	];

	for (const useFallback of [false, true]) {
		it.each(boundaries)(
			`uses ${useFallback ? "createdAt fallback" : "sentAt"} at age $age`,
			async ({ age, ...expected }) => {
				const test = setup();
				test.addSent(useFallback ? null : NOW - age, useFallback ? NOW - age : NOW);
				expect(await test.checkSendingSpike("target-user")).toMatchObject({
					...expected,
					isSpike: false,
					spikeMultiplier: null,
					alertSent: false,
				});
				expect(test.state.queries).toBe(2);
				expect(test.state.externalCalls).toBe(0);
			},
		);
	}

	it("counts only sent emails for this user and prioritizes non-null sentAt", async () => {
		const test = setup();
		test.addSent(NOW - 2 * DAY, NOW);
		test.addSent(NOW - 16 * DAY, NOW);
		test.addSent(NOW, NOW, "failed");
		test.addSent(null, NOW, "pending");
		test.addSent(NOW, NOW, "sent", "other-user");
		test.addSent(null, NOW, "sent", "other-user");
		test.addSent(null, null);
		expect(await test.checkSendingSpike("target-user")).toMatchObject({
			current15m: 0,
			current1h: 0,
			currentCount: 0,
			historicalAverage: 1 / 14,
		});
	});

	it("uses the entire fourteen-day denominator rather than active days", async () => {
		const test = setup();
		for (let index = 0; index < 700; index++) test.addSent(NOW - 2 * DAY);
		test.addSent(NOW);
		expect(await test.checkSendingSpike("target-user")).toMatchObject({
			current15m: 1,
			current1h: 1,
			currentCount: 1,
			historicalAverage: 50,
			spikeMultiplier: 0.02,
			isSpike: false,
		});
		expect(test.state.queries).toBe(2);
	});

	it("returns zero counts for an empty history", async () => {
		const test = setup();
		expect(await test.checkSendingSpike("target-user")).toEqual({
			isSpike: false,
			currentCount: 0,
			current1h: 0,
			current15m: 0,
			historicalAverage: 0,
			spikeMultiplier: null,
			alertSent: false,
			reason: "No spam-oriented spike thresholds exceeded",
		});
	});

	it("skips all database queries during cooldown", async () => {
		const test = setup();
		test.state.cooldown = true;
		expect(await test.checkSendingSpike("target-user")).toMatchObject({
			isSpike: false,
			currentCount: 0,
			alertSent: false,
			reason: "User in cooldown period",
		});
		expect(test.state.queries).toBe(0);
		expect(test.state.externalCalls).toBe(0);
	});

	it("continues checking when Redis fails and retains the database-error result", async () => {
		const test = setup();
		test.state.failRedis = true;
		test.addSent(NOW);
		expect(await test.checkSendingSpike("target-user")).toMatchObject({ currentCount: 1 });
		expect(test.state.queries).toBe(2);
		test.state.failDatabase = true;
		expect(await test.checkSendingSpike("target-user")).toEqual({
			isSpike: false,
			currentCount: 0,
			current1h: 0,
			current15m: 0,
			historicalAverage: 0,
			spikeMultiplier: null,
			alertSent: false,
			reason: "Error: database unavailable",
		});
		expect(test.state.externalCalls).toBe(0);
	});
});
