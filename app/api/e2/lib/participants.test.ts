import { describe, expect, test } from "bun:test";

type Row = Record<string, unknown>;
type Table = Record<string, string>;
type Predicate = (row: Row) => boolean;
type Fields = Record<string, string | symbol>;
type Ordering = string | { column: string; descending: true };
type ParticipantModule = typeof import("@/app/api/e2/lib/participants");
type ThreadResponse = {
	threads: { id: string; participant_names: string[]; has_unread: boolean }[];
	pagination: { limit: number; has_more: boolean; next_cursor: string | null };
};
type Handler = (context: {
	request: Request;
	query: Record<string, string>;
	set: { status?: number };
}) => Promise<ThreadResponse>;

const transpiler = new Bun.Transpiler({ loader: "ts" });
const compile = async (url: URL) =>
	transpiler.transformSync(
		(await Bun.file(url).text())
			.replace(/^import[\s\S]*?from "[^"]+";?\r?\n/gm, "")
			.replace(/export /g, ""),
	);
const participantSource = await compile(
	new URL("participants.ts", import.meta.url),
);
const threadSource = await compile(
	new URL("../mail/threads-list.ts", import.meta.url),
);
const addresses = (...values: unknown[]) =>
	JSON.stringify({ addresses: values });
const address = (email: string, name: string | null = null) => ({
	address: email,
	name,
});

function createHarness() {
	const makeTable = (): Table =>
		new Proxy({}, { get: (_target, key) => String(key) });
	const structuredEmails = makeTable();
	const sentEmails = makeTable();
	const emailThreads = makeTable();
	const rows = new Map<Table, Row[]>();
	const calls: { table: Table; fields: Fields; rows: Row[] }[] = [];
	const aggregate = Symbol("count");
	const select = (fields: Fields, distinct: string[] = []) => {
		let table: Table;
		let predicate: Predicate = () => true;
		let ordering: Ordering[] = [];
		let grouping: string | undefined;
		let limit = Number.POSITIVE_INFINITY;
		const run = () => {
			let result = (rows.get(table) ?? []).filter(predicate);
			result.sort((left, right) => {
				for (const order of ordering) {
					const column = typeof order === "string" ? order : order.column;
					const a = left[column];
					const b = right[column];
					const comparison =
						typeof a === "string" && typeof b === "string"
							? a.localeCompare(b)
							: Number(a) - Number(b);
					if (comparison)
						return typeof order === "string" ? comparison : -comparison;
				}
				return 0;
			});
			if (distinct.length) {
				const seen = new Set<string>();
				result = result.filter((row) => {
					const key = JSON.stringify(distinct.map((column) => row[column]));
					if (seen.has(key)) return false;
					seen.add(key);
					return true;
				});
			}
			calls.push({ table, fields, rows: result });
			if (grouping) {
				const counts = new Map<unknown, number>();
				for (const row of result)
					counts.set(row[grouping], (counts.get(row[grouping]) ?? 0) + 1);
				return Array.from(counts, ([threadId, count]) => ({ threadId, count }));
			}
			return result
				.slice(0, limit)
				.map((row) =>
					Object.fromEntries(
						Object.entries(fields).map(([alias, column]) => [
							alias,
							typeof column === "string" ? row[column] : 0,
						]),
					),
				);
		};
		const query = {
			from(value: Table) {
				table = value;
				return query;
			},
			where(value: Predicate) {
				predicate = value;
				return query;
			},
			orderBy(...value: Ordering[]) {
				ordering = value;
				return query;
			},
			groupBy(value: string) {
				grouping = value;
				return query;
			},
			limit(value: number) {
				limit = value;
				return query;
			},
			then(
				resolve: (value: Row[]) => unknown,
				reject: (error: unknown) => unknown,
			) {
				return Promise.resolve().then(run).then(resolve, reject);
			},
		};
		return query;
	};
	const bindings = {
		db: {
			select,
			selectDistinctOn: (distinct: string[], fields: Fields) =>
				select(fields, distinct),
		},
		structuredEmails,
		sentEmails,
		emailThreads,
		emailDomains: makeTable(),
		emailAddresses: makeTable(),
		eq:
			(column: string, value: unknown): Predicate =>
			(row) =>
				row[column] === value,
		inArray:
			(column: string, values: unknown[]): Predicate =>
			(row) =>
				values.includes(row[column]),
		and:
			(...predicates: Predicate[]): Predicate =>
			(row) =>
				predicates.every((predicate) => predicate(row)),
		or:
			(...predicates: Predicate[]): Predicate =>
			(row) =>
				predicates.some((predicate) => predicate(row)),
		like:
			(column: string, value: string): Predicate =>
			(row) =>
				String(row[column]).includes(value.replaceAll("%", "")),
		desc: (column: string): Ordering => ({ column, descending: true }),
		count: () => aggregate,
		sql:
			(_parts: TemplateStringsArray, column: string, value: Date): Predicate =>
			(row) =>
				Number(row[column]) < value.getTime(),
	};
	const participants = Function(
		...Object.keys(bindings),
		`${participantSource}; return { getThreadParticipantNames, getThreadParticipantNamesBatch };`,
	)(...Object.values(bindings)) as Pick<
		ParticipantModule,
		"getThreadParticipantNames" | "getThreadParticipantNamesBatch"
	>;
	const routeBindings = {
		...bindings,
		...participants,
		Elysia: class {
			get(_path: string, handler: Handler) {
				return handler;
			}
		},
		t: new Proxy({}, { get: () => () => ({}) }),
		validateAndRateLimit: async () => "user",
		console: { log() {}, error() {} },
	};
	const handler = Function(
		...Object.keys(routeBindings),
		`${threadSource}; return listThreads;`,
	)(...Object.values(routeBindings)) as Handler;
	return {
		...participants,
		rows,
		calls,
		structuredEmails,
		sentEmails,
		emailThreads,
		request: (query: Record<string, string> = {}) =>
			handler({
				request: new Request("http://localhost/mail/threads"),
				query,
				set: {},
			}),
		participantCalls: () =>
			calls.filter(
				(call) =>
					"ccData" in call.fields ||
					("from" in call.fields && "to" in call.fields),
			),
	};
}

function inbound(threadId: string, fields: Row = {}): Row {
	return {
		id: `in-${threadId}`,
		threadId,
		userId: "user",
		fromData: null,
		toData: null,
		ccData: null,
		isRead: false,
		threadPosition: 1,
		date: new Date(1700000000000),
		...fields,
	};
}

function outbound(threadId: string, fields: Row = {}): Row {
	return { threadId, userId: "user", from: "", to: null, ...fields };
}

function thread(index: number, fields: Row = {}): Row {
	return {
		id: `thread-${index}`,
		userId: "user",
		rootMessageId: `root-${index}`,
		normalizedSubject: "Subject",
		participantEmails: "[]",
		messageCount: 1,
		lastMessageAt: new Date(1700000000000 - index * 1000),
		createdAt: new Date(1600000000000),
		...fields,
	};
}

describe("batched thread participants", () => {
	test("preserves inbound precedence, case deduplication, CC, and insertion order", async () => {
		const h = createHarness();
		h.rows.set(h.structuredEmails, [
			inbound("one", {
				fromData: addresses(address("A@EXAMPLE.COM")),
				toData: addresses(address("b@example.com", "Bee")),
				ccData: addresses(
					address("a@example.com", "First"),
					address("cc@example.com", "CC"),
				),
			}),
			inbound("two", {
				fromData: addresses(address("other@example.com", "Other")),
			}),
			inbound("one", {
				fromData: addresses(address("a@example.com", "Second")),
				toData: addresses(address("b@example.com", "Later Bee")),
			}),
		]);
		h.rows.set(h.sentEmails, [
			outbound("one", {
				from: "A@example.com",
				to: JSON.stringify([
					"b@example.com",
					"ONLYSENT@example.com",
					{ address: "onlysent@example.com" },
				]),
			}),
		]);
		const result = await h.getThreadParticipantNamesBatch(
			["one", "two"],
			"user",
		);
		expect(result.get("one")).toEqual([
			"First <a@example.com>",
			"Bee <b@example.com>",
			"CC <cc@example.com>",
			"ONLYSENT@example.com",
		]);
		expect(result.get("two")).toEqual(["Other <other@example.com>"]);
		expect(h.calls).toHaveLength(2);
		expect(await h.getThreadParticipantNames("one", "user")).toEqual(
			result.get("one") ?? [],
		);
		expect(h.calls).toHaveLength(4);
	});

	test("keeps first-name winners dependent on supplied row order, not an invented SQL order", async () => {
		const h = createHarness();
		const first = inbound("one", {
			fromData: addresses(address("a@example.com", "First")),
		});
		const second = inbound("one", {
			fromData: addresses(address("A@example.com", "Second")),
		});
		h.rows.set(h.structuredEmails, [first, second]);
		expect(
			(await h.getThreadParticipantNamesBatch(["one"], "user")).get("one"),
		).toEqual(["First <a@example.com>"]);
		h.rows.set(h.structuredEmails, [second, first]);
		expect(
			(await h.getThreadParticipantNamesBatch(["one"], "user")).get("one"),
		).toEqual(["Second <A@example.com>"]);
	});

	test("retains partial progress and field-local aborts for malformed JSON and address values", async () => {
		const h = createHarness();
		h.rows.set(h.structuredEmails, [
			inbound("one", {
				fromData: "{",
				toData: "null",
				ccData: addresses(address("cc@example.com", "CC")),
			}),
			inbound("one", {
				fromData: addresses(
					address("before@example.com"),
					null,
					address("ignored@example.com"),
				),
				toData: addresses(address("to@example.com", "To")),
				ccData: addresses(
					{ address: "bad@example.com", name: 7 },
					address("also-ignored@example.com"),
				),
			}),
			inbound("one", {
				fromData: addresses(address("BEFORE@example.com", " ")),
				toData: addresses(address("before@example.com", "Named")),
				ccData: "[]",
			}),
		]);
		h.rows.set(h.sentEmails, [
			outbound("one", { from: "FROM@example.com", to: "{" }),
			outbound("one", {
				to: JSON.stringify([
					"prefix@example.com",
					null,
					"ignored-outbound@example.com",
				]),
			}),
			outbound("one", {
				to: JSON.stringify([
					{ address: "object@example.com", name: "Ignored Name" },
					{},
					"ignored-object@example.com",
				]),
			}),
			outbound("one", { to: "null" }),
		]);
		expect(
			(await h.getThreadParticipantNamesBatch(["one"], "user")).get("one"),
		).toEqual([
			"CC <cc@example.com>",
			"Named <before@example.com>",
			"To <to@example.com>",
			"FROM@example.com",
			"prefix@example.com",
			"object@example.com",
		]);
	});

	test("scopes both queries to requested IDs and tenant", async () => {
		const h = createHarness();
		h.rows.set(h.structuredEmails, [
			inbound("one", { fromData: addresses(address("own@example.com")) }),
			inbound("one", {
				userId: "other",
				fromData: addresses(address("foreign@example.com")),
			}),
			inbound("excluded", {
				fromData: addresses(address("excluded@example.com")),
			}),
		]);
		h.rows.set(h.sentEmails, [
			outbound("one", { from: "sent@example.com" }),
			outbound("one", { userId: "other", from: "foreign-sent@example.com" }),
			outbound("excluded", { from: "excluded-sent@example.com" }),
		]);
		expect(
			(await h.getThreadParticipantNamesBatch(["one"], "user")).get("one"),
		).toEqual(["own@example.com", "sent@example.com"]);
		expect(h.calls).toHaveLength(2);
		for (const call of h.calls)
			expect(call.rows.map((row) => [row.threadId, row.userId])).toEqual([
				["one", "user"],
			]);
	});

	test("issues no queries for empty IDs and two queries for requested threads without messages", async () => {
		const h = createHarness();
		expect(await h.getThreadParticipantNamesBatch([], "user")).toEqual(
			new Map(),
		);
		expect(h.calls).toHaveLength(0);
		expect(
			await h.getThreadParticipantNamesBatch(["empty", "also-empty"], "user"),
		).toEqual(
			new Map([
				["empty", []],
				["also-empty", []],
			]),
		);
		expect(h.calls).toHaveLength(2);
	});
});

describe("thread-list participant batching", () => {
	test("loads names for returned page IDs only, excluding sentinel and other tenants", async () => {
		const h = createHarness();
		h.rows.set(h.emailThreads, [
			thread(-1, { userId: "other" }),
			thread(0),
			thread(1),
			thread(2),
		]);
		h.rows.set(h.structuredEmails, [
			inbound("thread-0", {
				fromData: addresses(address("zero@example.com", "Zero")),
			}),
			inbound("thread-1", {
				fromData: addresses(address("one@example.com", "One")),
			}),
			Object.defineProperty(
				inbound("thread-2", {
					fromData: addresses(address("sentinel@example.com")),
				}),
				"ccData",
				{
					get() {
						throw new Error("Nonreturned participant data must not be loaded");
					},
				},
			),
			inbound("thread-0", {
				userId: "other",
				fromData: addresses(address("foreign@example.com")),
			}),
		]);
		const result = await h.request({ limit: "2" });
		expect(
			result.threads.map((item) => [item.id, item.participant_names]),
		).toEqual([
			["thread-0", ["Zero <zero@example.com>"]],
			["thread-1", ["One <one@example.com>"]],
		]);
		expect(result.pagination).toEqual({
			limit: 2,
			has_more: true,
			next_cursor: "thread-1",
		});
		expect(h.calls).toHaveLength(6);
		expect(h.participantCalls()).toHaveLength(2);
		expect(h.participantCalls()[0].rows.map((row) => row.threadId)).toEqual([
			"thread-0",
			"thread-1",
		]);
	});

	test("applies unread filtering before participant reads without changing existing partial-batch pagination", async () => {
		const h = createHarness();
		h.rows.set(h.emailThreads, [thread(0), thread(1), thread(2), thread(3)]);
		h.rows.set(h.structuredEmails, [
			inbound("thread-0", { isRead: true }),
			inbound("thread-1", {
				ccData: addresses(address("cc@example.com", "CC")),
			}),
			inbound("thread-2"),
			inbound("thread-3"),
		]);
		const result = await h.request({ limit: "2", unread: "true" });
		expect(
			result.threads.map((item) => [
				item.id,
				item.has_unread,
				item.participant_names,
			]),
		).toEqual([
			["thread-1", true, ["CC <cc@example.com>"]],
			["thread-2", true, []],
		]);
		expect(result.pagination).toEqual({
			limit: 2,
			has_more: false,
			next_cursor: null,
		});
		expect(h.participantCalls()).toHaveLength(2);
		expect(h.participantCalls()[0].rows.map((row) => row.threadId)).toEqual([
			"thread-1",
			"thread-2",
		]);
	});

	test("skips participant queries for noncontributing unread batches and continues with the existing cursor", async () => {
		const h = createHarness();
		h.rows.set(
			h.emailThreads,
			Array.from({ length: 52 }, (_, index) => thread(index)),
		);
		h.rows.set(
			h.structuredEmails,
			Array.from({ length: 52 }, (_, index) =>
				inbound(`thread-${index}`, { isRead: index < 50 }),
			),
		);
		const result = await h.request({ limit: "2", unread: "true" });
		expect(result.threads.map((item) => item.id)).toEqual([
			"thread-50",
			"thread-51",
		]);
		expect(result.pagination).toEqual({
			limit: 2,
			has_more: false,
			next_cursor: null,
		});
		expect(h.calls).toHaveLength(11);
		expect(h.participantCalls()).toHaveLength(2);
		expect(h.participantCalls()[0].rows.map((row) => row.threadId)).toEqual([
			"thread-50",
			"thread-51",
		]);
	});

	test("uses two participant queries per contributing batch, not per returned thread", async () => {
		const h = createHarness();
		h.rows.set(
			h.emailThreads,
			Array.from({ length: 53 }, (_, index) => thread(index)),
		);
		h.rows.set(
			h.structuredEmails,
			Array.from({ length: 53 }, (_, index) =>
				inbound(`thread-${index}`, { isRead: index > 0 && index < 50 }),
			),
		);
		const result = await h.request({ limit: "3", unread: "true" });
		expect(result.threads.map((item) => item.id)).toEqual([
			"thread-0",
			"thread-50",
			"thread-51",
		]);
		expect(h.calls).toHaveLength(13);
		expect(h.participantCalls()).toHaveLength(4);
		expect(
			h
				.participantCalls()
				.flatMap((call) => call.rows.map((row) => row.threadId)),
		).toEqual(["thread-0", "thread-50", "thread-51"]);
	});

	test("returns an empty page without participant queries when no threads or no unread threads exist", async () => {
		for (const populated of [false, true]) {
			const h = createHarness();
			if (populated) {
				h.rows.set(h.emailThreads, [thread(0)]);
				h.rows.set(h.structuredEmails, [inbound("thread-0", { isRead: true })]);
			}
			const result = await h.request({ unread: "true" });
			expect(result.threads).toEqual([]);
			expect(result.pagination).toEqual({
				limit: 25,
				has_more: false,
				next_cursor: null,
			});
			expect(h.participantCalls()).toHaveLength(0);
			expect(h.calls).toHaveLength(populated ? 4 : 1);
		}
	});
});
