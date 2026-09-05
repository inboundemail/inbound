import { Database, type SQLQueryBindings } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { Elysia, t } from "elysia";
import * as orm from "drizzle-orm";
import { drizzle } from "drizzle-orm/pg-proxy";
import type { PgTable } from "drizzle-orm/pg-core";
import {
	domainDnsRecords,
	emailAddresses,
	emailDomains,
	endpoints,
	webhooks,
} from "@/lib/db/schema";

const tables = {
	domainDnsRecords,
	emailAddresses,
	emailDomains,
	endpoints,
	webhooks,
};
const timestamp = new Date("2026-01-01T00:00:00Z");
const booleanNames = new Set(
	Object.values(tables).flatMap((table) =>
		Object.values(orm.getTableColumns(table))
			.filter((column) => column.dataType === "boolean")
			.map((column) => column.name),
	),
);
const timestampNames = new Set(
	Object.values(tables).flatMap((table) =>
		Object.values(orm.getTableColumns(table))
			.filter((column) => column.dataType === "date")
			.map((column) => column.name),
	),
);
const sources = await Promise.all(
	["domains", "email-addresses"].map(async (directory) => {
		const path = new URL(`../${directory}/list.ts`, import.meta.url);
		const source = (await Bun.file(path).text())
			.replace(/^import[\s\S]*?from ["'][^"']+["'];\n/gm, "")
			.replace(/export const /g, "const ");
		const exported =
			directory === "domains" ? "listDomains" : "listEmailAddresses";
		return new Bun.Transpiler({ loader: "ts" }).transformSync(
			`${source}\nreturn ${exported};`,
		);
	}),
);

function binding(value: unknown): SQLQueryBindings {
	if (typeof value === "boolean") return Number(value);
	if (
		value === null ||
		typeof value === "string" ||
		typeof value === "number"
	) {
		return value;
	}
	throw new Error("Unexpected test database binding");
}

function setup(
	options: {
		authorized?: boolean;
		sesStatus?: string;
		sesError?: boolean;
		dnsError?: boolean;
	} = {},
) {
	const sqlite = new Database(":memory:");
	for (const table of Object.values(tables)) {
		const columns = Object.values(orm.getTableColumns(table));
		sqlite.exec(
			`CREATE TABLE "${orm.getTableName(table)}" (${columns
				.map((column) => `"${column.name}" ${column.getSQLType()}`)
				.join(", ")})`,
		);
	}
	const queries: { sql: string; params: unknown[] }[] = [];
	const db = drizzle(async (sql, params) => {
		queries.push({ sql, params });
		const statement = sqlite.query(sql.replace(/\$\d+/g, "?"));
		const names = statement.columnNames;
		return {
			rows: (statement.values(...params.map(binding)) ?? []).map((row) =>
				row.map((value, index) => {
					if (value !== null && booleanNames.has(names[index]))
						return Boolean(value);
					if (typeof value === "string" && timestampNames.has(names[index])) {
						return value.replace(/Z$/, "");
					}
					return value;
				}),
			),
		};
	});
	const insertNullableRows = <T extends PgTable>(
		table: T,
		values: T["$inferInsert"][],
	) =>
		db
			.insert(table)
			.values(
				values.map(
					(row) =>
						Object.fromEntries(
							Object.keys(orm.getTableColumns(table)).map((key) => [
								key,
								(row as Record<string, unknown>)[key] ?? null,
							]),
						) as T["$inferInsert"],
				),
			);
	const dnsCalls: { type: string; name: string; value: string }[][] = [];
	const sesCalls: unknown[] = [];
	let authCalls = 0;
	const dependencies = {
		Elysia,
		t,
		db,
		...orm,
		...tables,
		validateAndRateLimit: async () => {
			authCalls++;
			if (options.authorized === false) throw new Error("Unauthorized");
			return "u";
		},
		verifyDnsRecords: async (
			records: { type: string; name: string; value: string }[],
		) => {
			dnsCalls.push(records);
			if (options.dnsError) throw new Error("DNS unavailable");
			return records.map((record) => ({
				...record,
				expectedValue: record.value,
				isVerified: true,
			}));
		},
		SESClient: class {
			async send(command: { input: { Identities: string[] } }) {
				sesCalls.push(command.input);
				if (options.sesError) throw new Error("SES unavailable");
				return {
					VerificationAttributes: Object.fromEntries(
						command.input.Identities.map((domain) => [
							domain,
							{ VerificationStatus: options.sesStatus },
						]),
					),
				};
			}
		},
		GetIdentityVerificationAttributesCommand: class {
			constructor(public input: { Identities: string[] }) {}
		},
		process: {
			env:
				options.sesStatus || options.sesError
					? {
							AWS_ACCESS_KEY_ID: "test-only",
							AWS_SECRET_ACCESS_KEY: "test-only",
						}
					: {},
		},
		console: { log() {}, error() {} },
	};
	const apps = sources.map(
		(source) =>
			new Function(...Object.keys(dependencies), source)(
				...Object.values(dependencies),
			) as Elysia,
	);
	const request = async (path: string) => {
		queries.length = 0;
		return apps[path.startsWith("/domains") ? 0 : 1].handle(
			new Request(`http://localhost${path}`),
		);
	};
	return {
		db,
		insertNullableRows,
		queries,
		dnsCalls,
		sesCalls,
		request,
		authCalls: () => authCalls,
		[Symbol.dispose]: () => sqlite.close(),
	};
}

type Context = ReturnType<typeof setup>;
type ListBody = {
	data: Record<string, unknown>[];
	pagination: {
		limit: number;
		offset: number;
		total: number;
		hasMore: boolean;
	};
	capabilities?: { envelopeRecipients: boolean };
};
async function json(response: Response): Promise<ListBody> {
	const text = await response.text();
	expect(response.status, text).toBe(200);
	return JSON.parse(text);
}

async function seed(context: Context) {
	await context.insertNullableRows(emailDomains, [
		{
			id: "d1",
			domain: "one.example",
			userId: "u",
			status: "pending",
			catchAllEndpointId: "e1",
			isCatchAllEnabled: false,
			canReceiveEmails: true,
			createdAt: timestamp,
			updatedAt: timestamp,
		},
		{
			id: "d2",
			domain: "two.example",
			userId: "u",
			status: "verified",
			catchAllEndpointId: "missing",
			canReceiveEmails: false,
			createdAt: new Date(timestamp.getTime() - 1000),
			updatedAt: timestamp,
		},
		{
			id: "d3",
			domain: "three.example",
			userId: "u",
			status: "pending",
			catchAllEndpointId: "foreign",
			canReceiveEmails: null,
			createdAt: new Date(timestamp.getTime() - 2000),
			updatedAt: timestamp,
		},
		{
			id: "d4",
			domain: "four.example",
			userId: "u",
			status: "pending",
			catchAllEndpointId: null,
			createdAt: new Date(timestamp.getTime() - 3000),
			updatedAt: timestamp,
		},
		{
			id: "other",
			domain: "other.example",
			userId: "other",
			status: "pending",
			createdAt: timestamp,
		},
	]);
	await context.insertNullableRows(endpoints, [
		{
			id: "e1",
			name: "Local endpoint",
			userId: "u",
			type: "webhook",
			config: '{"url":"https://example.invalid"}',
			isActive: null,
		},
		{
			id: "foreign",
			name: "Foreign endpoint",
			userId: "other",
			type: "webhook",
			config: "invalid",
			isActive: true,
		},
	]);
	await context.insertNullableRows(webhooks, [
		{
			id: "w1",
			name: "Local webhook",
			userId: "u",
			url: "https://example.invalid",
			isActive: null,
		},
		{
			id: "foreign",
			name: "Foreign webhook",
			userId: "other",
			url: "https://other.invalid",
			isActive: true,
		},
	]);
	await context.insertNullableRows(
		emailAddresses,
		[
			{
				id: "a1",
				domainId: "d1",
				endpointId: "e1",
				webhookId: "w1",
				isActive: true,
				isReceiptRuleConfigured: true,
			},
			{
				id: "a2",
				domainId: "d1",
				endpointId: "missing",
				webhookId: "w1",
				isActive: false,
				isReceiptRuleConfigured: false,
			},
			{
				id: "a3",
				domainId: "d1",
				webhookId: "w1",
				isActive: null,
				isReceiptRuleConfigured: null,
			},
			{
				id: "a4",
				domainId: "d2",
				endpointId: "foreign",
				webhookId: "w1",
				isActive: true,
			},
			{ id: "a5", domainId: "d2", webhookId: "foreign", isActive: false },
			{ id: "a6", domainId: "d2", webhookId: "missing", isActive: true },
			{ id: "a7", domainId: "d2", isActive: false },
			{ id: "orphan", domainId: "missing", isActive: true },
		].map((row, index) => ({
			...row,
			address: `${row.id}@example.invalid`,
			userId: "u",
			createdAt: new Date(timestamp.getTime() - index * 1000),
			updatedAt: timestamp,
		})),
	);
	await context.insertNullableRows(emailAddresses, [
		{
			id: "foreign-address",
			address: "foreign@other.invalid",
			domainId: "other",
			userId: "other",
			isActive: true,
		},
	]);
}

describe("domain and address list query regressions", () => {
	test("domains retain stats, nullable defaults, catch-all IDs and tenant isolation in four reads", async () => {
		using context = setup();
		await seed(context);
		const body = await json(await context.request("/domains"));
		expect(context.queries).toHaveLength(4);
		expect(body.capabilities).toEqual({ envelopeRecipients: true });
		expect(body.pagination).toEqual({
			limit: 50,
			offset: 0,
			total: 4,
			hasMore: false,
		});
		expect(body.data.map((row) => row.id)).toEqual(["d1", "d2", "d3", "d4"]);
		expect(body.data[0]).toMatchObject({
			stats: {
				totalEmailAddresses: 3,
				activeEmailAddresses: 1,
				hasCatchAll: true,
			},
			isCatchAllEnabled: false,
			hasMxRecords: false,
			receiveDmarcEmails: false,
			lastDnsCheck: null,
			lastSesCheck: null,
			domainProvider: null,
			catchAllEndpoint: {
				id: "e1",
				name: "Local endpoint",
				type: "webhook",
				isActive: false,
			},
			createdAt: timestamp.toISOString(),
			updatedAt: timestamp.toISOString(),
		});
		for (const row of body.data.slice(1, 3)) {
			expect(row).toMatchObject({
				catchAllEndpoint: null,
				stats: { hasCatchAll: true },
			});
		}
		expect(body.data[3]).toMatchObject({
			catchAllEndpoint: null,
			stats: {
				totalEmailAddresses: 0,
				activeEmailAddresses: 0,
				hasCatchAll: false,
			},
		});
		expect(body.data[0]).not.toHaveProperty("verificationCheck");
		expect(context.dnsCalls).toHaveLength(0);
		expect(context.sesCalls).toHaveLength(0);
	});

	test("domain counts retain domain ownership semantics for mismatched address owners", async () => {
		using context = setup();
		await seed(context);
		await context.insertNullableRows(emailAddresses, [
			{
				id: "mismatch",
				address: "mismatch@example.invalid",
				domainId: "d1",
				userId: "other",
				isActive: null,
			},
		]);
		const body = await json(await context.request("/domains?limit=1"));
		expect(body.data[0]).toMatchObject({
			stats: { totalEmailAddresses: 4, activeEmailAddresses: 1 },
		});
	});

	test("domain filtering, pagination and empty pages retain counts and ordering", async () => {
		using context = setup();
		await seed(context);
		const page = await json(
			await context.request("/domains?status=pending&limit=1&offset=1"),
		);
		expect(page.data.map((row) => row.id)).toEqual(["d3"]);
		expect(page.pagination).toEqual({
			limit: 1,
			offset: 1,
			total: 3,
			hasMore: true,
		});
		for (const [value, id] of [
			["true", "d1"],
			["false", "d2"],
		]) {
			const filtered = await json(
				await context.request(`/domains?canReceive=${value}`),
			);
			expect(filtered.data.map((row) => row.id)).toEqual([id]);
		}
		const empty = await json(await context.request("/domains?offset=100"));
		expect(empty.data).toEqual([]);
		expect(empty.pagination).toEqual({
			limit: 50,
			offset: 100,
			total: 4,
			hasMore: false,
		});
		expect(context.queries).toHaveLength(2);
	});

	test("addresses preserve routing precedence, missing/foreign associations and nullable defaults", async () => {
		using context = setup();
		await seed(context);
		const body = await json(await context.request("/email-addresses"));
		expect(context.queries).toHaveLength(4);
		expect(body.pagination).toEqual({
			limit: 50,
			offset: 0,
			total: 8,
			hasMore: true,
		});
		expect(body.data.map((row) => row.id)).toEqual([
			"a1",
			"a2",
			"a3",
			"a4",
			"a5",
			"a6",
			"a7",
		]);
		expect(body.data[0]).toMatchObject({
			domain: { id: "d1", name: "one.example", status: "pending" },
			routing: {
				type: "endpoint",
				id: "e1",
				name: "Local endpoint",
				config: { url: "https://example.invalid" },
				isActive: false,
			},
		});
		expect(body.data[2]).toMatchObject({
			isActive: false,
			isReceiptRuleConfigured: false,
			receiptRuleName: null,
			routing: {
				type: "webhook",
				id: "w1",
				config: { url: "https://example.invalid" },
				isActive: false,
			},
		});
		for (const index of [1, 3, 4, 5, 6]) {
			expect(body.data[index].routing).toEqual({
				type: "none",
				id: null,
				name: null,
				isActive: false,
			});
		}
	});

	test("address filters, page boundaries and tenant scoping are unchanged", async () => {
		using context = setup();
		await seed(context);
		for (const [query, ids] of [
			["domainId=d1&isActive=true", ["a1"]],
			["domainId=d1&isActive=false", ["a2"]],
			["isReceiptRuleConfigured=true", ["a1"]],
			["isReceiptRuleConfigured=false", ["a2"]],
			["domainId=other", []],
			["limit=2&offset=2", ["a3", "a4"]],
		] as const) {
			const body = await json(
				await context.request(`/email-addresses?${query}`),
			);
			expect(body.data.map((row) => row.id)).toEqual([...ids]);
			expect(context.queries.length).toBeLessThanOrEqual(4);
		}
		const empty = await json(
			await context.request("/email-addresses?offset=100"),
		);
		expect(empty.data).toEqual([]);
		expect(empty.pagination.total).toBe(8);
		expect(context.queries).toHaveLength(2);
	});

	test("query counts stay bounded at full page size", async () => {
		using context = setup();
		await seed(context);
		await context.insertNullableRows(
			emailDomains,
			Array.from({ length: 60 }, (_, index) => ({
				id: `extra-${index}`,
				domain: `extra-${index}.example`,
				userId: "u",
				status: "pending",
				catchAllEndpointId: "e1",
				createdAt: timestamp,
			})),
		);
		await context.insertNullableRows(
			emailAddresses,
			Array.from({ length: 60 }, (_, index) => ({
				id: `extra-${index}`,
				address: `extra-${index}@example.invalid`,
				domainId: "d1",
				userId: "u",
				endpointId: index % 2 ? "e1" : null,
				webhookId: "w1",
				createdAt: timestamp,
			})),
		);
		for (const path of ["/domains", "/email-addresses"]) {
			const body = await json(await context.request(`${path}?limit=50`));
			expect(body.data).toHaveLength(50);
			expect(body.pagination.hasMore).toBe(true);
			expect(context.queries).toHaveLength(4);
		}
	});

	test("malformed selected endpoint config retains the handler error response", async () => {
		using context = setup();
		await seed(context);
		await context.db
			.update(endpoints)
			.set({ config: "invalid" })
			.where(orm.eq(endpoints.id, "e1"));
		expect((await context.request("/email-addresses")).status).toBe(500);
		expect(context.queries).toHaveLength(4);
	});

	test("authentication failure prevents all list reads", async () => {
		using context = setup({ authorized: false });
		for (const path of ["/domains", "/email-addresses"]) {
			expect((await context.request(path)).status).not.toBe(200);
			expect(context.queries).toHaveLength(0);
		}
		expect(context.authCalls()).toBe(2);
	});

	for (const sesStatus of ["Success", "Failed"]) {
		test(`check=true preserves DNS/SES verification and ${sesStatus} status updates`, async () => {
			using context = setup({ sesStatus });
			await seed(context);
			await context.insertNullableRows(domainDnsRecords, [
				{
					id: "dns1",
					domainId: "d1",
					recordType: "TXT",
					name: "one.example",
					value: "synthetic-token",
				},
			]);
			const body = await json(
				await context.request("/domains?limit=1&check=true"),
			);
			expect(body.data[0]).toMatchObject({
				status: sesStatus === "Success" ? "verified" : "failed",
				verificationCheck: {
					dnsRecords: [
						{
							type: "TXT",
							name: "one.example",
							value: "synthetic-token",
							isVerified: true,
						},
					],
					sesStatus,
					isFullyVerified: sesStatus === "Success",
				},
			});
			expect(context.dnsCalls).toEqual([
				[{ type: "TXT", name: "one.example", value: "synthetic-token" }],
			]);
			expect(context.sesCalls).toEqual([{ Identities: ["one.example"] }]);
			const [record] = await context.db.select().from(domainDnsRecords);
			expect(record.isVerified).toBe(true);
			expect(record.lastChecked).toBeInstanceOf(Date);
			const [domain] = await context.db
				.select()
				.from(emailDomains)
				.where(orm.eq(emailDomains.id, "d1"));
			expect(domain.status).toBe(
				sesStatus === "Success" ? "verified" : "failed",
			);
			expect(domain.lastSesCheck).toBeInstanceOf(Date);
		});
	}

	test("verification without credentials or records remains Unknown and unverified", async () => {
		using context = setup();
		await seed(context);
		const body = await json(
			await context.request("/domains?limit=1&check=true"),
		);
		expect(body.data[0]).toMatchObject({
			verificationCheck: {
				dnsRecords: [],
				sesStatus: "Unknown",
				isFullyVerified: false,
			},
		});
		expect(context.dnsCalls).toHaveLength(0);
		expect(context.sesCalls).toHaveLength(0);
	});

	for (const failure of ["dnsError", "sesError"] as const) {
		test(`verification ${failure} remains isolated to verificationCheck`, async () => {
			using context = setup({ [failure]: true });
			await seed(context);
			await context.insertNullableRows(domainDnsRecords, [
				{
					id: "dns1",
					domainId: "d1",
					recordType: "TXT",
					name: "one.example",
					value: "synthetic-token",
				},
			]);
			const body = await json(
				await context.request("/domains?limit=1&check=true"),
			);
			expect(body.data[0]).toMatchObject({
				status: "pending",
				verificationCheck: { sesStatus: "Error", isFullyVerified: false },
			});
		});
	}
});
