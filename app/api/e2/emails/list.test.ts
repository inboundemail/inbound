import { beforeEach, describe, expect, test } from "bun:test";
import * as orm from "drizzle-orm";
import { drizzle } from "drizzle-orm/pg-proxy";
import { Elysia, t } from "elysia";
import * as schema from "@/lib/db/schema";

if (process.env.EMAIL_LIST_TEST_WORKER !== "1") {
  test("public email list regressions in an isolated runtime", async () => {
    const child = Bun.spawn([process.execPath, "--no-env-file", "test", import.meta.path], {
      env: { ...process.env, EMAIL_LIST_TEST_WORKER: "1" },
      stdout: "pipe",
      stderr: "pipe",
    });
    const [exitCode, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    expect(exitCode, `${stdout}\n${stderr}`).toBe(0);
  }, 30_000);
} else {
  type Value = string | number | boolean | null;
  type Email = {
    id: string;
    type: string;
    created_at: string;
    status: string;
    preview: string | null;
    subject: string;
    from: string;
    from_name?: string | null;
    to: string[];
    cc: string[];
    has_attachments: boolean;
    attachment_count: number;
  };
  type Result = {
    data: Email[];
    pagination: { limit: number; offset: number; total: number; has_more: boolean };
    filters: Record<string, string | undefined>;
    error?: string;
  };
  type Handler = (context: {
    request: Request;
    query: Record<string, string>;
    set: { status?: number };
  }) => Promise<Result>;
  const now = "2026-09-05T12:00:00.000Z";
  const timestamp = "2026-09-04 12:00:00.123456";
  class FixedDate extends Date {
    constructor(value?: string | number) {
      super(value ?? now);
    }
  }
  const source = await Bun.file(new URL("./list.ts", import.meta.url)).text();
  const code = new Bun.Transpiler({ loader: "ts" }).transformSync(
    source.replace(/^import[\s\S]*?;\n/gm, "").replace("export const listEmails", "const listEmails"),
  );
  const createHandler = new Function(
    "Elysia", "t", "db", "schema", "orm", "validateAndRateLimit", "Date", "console",
    `const {sentEmails, structuredEmails, scheduledEmails, emailDomains, emailAddresses} = schema;
     const {eq, and, desc, sql, or, like, gte, inArray} = orm;
     ${code}
     return listEmails.routes[0].handler;`,
  ) as (...dependencies: unknown[]) => Handler;
  let handler: Handler;
  let authFailure: Error | undefined;
  let databaseFailure: Error | undefined;
  let authCalls: number;
  let results: Value[][][];
  let queries: { params: unknown[]; rows: number }[];

  function received(id: string, createdAt: string | null = timestamp): Value[] {
    return [id, "in@example.com", "message", '{"addresses":[{"address":"from@example.com","name":"Sender"}]}', '{"addresses":[{"address":"in@example.com"}]}', "broken", "", `${"x".repeat(199)}\ny`, "broken", true, createdAt, null, null, null, "thread"];
  }

  function sent(id: string, createdAt: string | null = timestamp): Value[] {
    return [id, "message", "Sender <from@example.com>", '["in@example.com"]', '["cc@example.com"]', "Sent", " hi\nthere ", '[{"filename":"file"}]', "sent", createdAt, null, "sent-thread"];
  }

  function scheduled(id: string, createdAt: string | null = timestamp): Value[] {
    return [id, "from@example.com", '["in@example.com"]', "Scheduled", "scheduled", createdAt, null, "2026-09-06 12:00:00.000000", "broken"];
  }

  function domainRow(id: string, domain: string): Value[] {
    return Object.keys(orm.getTableColumns(schema.emailDomains)).map((key) =>
      ({ id, domain, userId: "tenant" })[key as "id" | "domain" | "userId"] ?? null,
    );
  }

  function addressRow(id: string, address: string): Value[] {
    return Object.keys(orm.getTableColumns(schema.emailAddresses)).map((key) =>
      ({ id, address, userId: "tenant" })[key as "id" | "address" | "userId"] ?? null,
    );
  }

  async function invoke(query: Record<string, string> = {}, set: { status?: number } = {}) {
    return handler({ request: new Request("http://localhost/emails"), query: { time_range: "all", ...query }, set });
  }

  beforeEach(() => {
    authFailure = undefined;
    databaseFailure = undefined;
    authCalls = 0;
    results = [];
    queries = [];
    const db = drizzle(async (_sql, params) => {
      if (databaseFailure) throw databaseFailure;
      const rows = results.shift();
      if (!rows) throw new Error("Unexpected database read");
      queries.push({ params, rows: rows.length });
      return { rows };
    });
    handler = createHandler(Elysia, t, db, schema, orm, async () => {
      authCalls++;
      if (authFailure) throw authFailure;
      return "tenant";
    }, FixedDate, { log: () => {} });
  });

  describe("public email list handler contract with stubbed database results", () => {
    test("passes deep offsets to the database and hydrates only returned page IDs", async () => {
      results = [[[20003]], [["second", 0, timestamp], ["first", 0, timestamp]], [received("first"), received("second")]];
      const result = await invoke({ offset: "10001", limit: "2" });
      expect(result.data.map((email) => email.id)).toEqual(["second", "first"]);
      expect(result.pagination).toEqual({ limit: 2, offset: 10001, total: 20003, has_more: true });
      expect(queries).toHaveLength(3);
      expect(queries[1].params.slice(-2)).toEqual([2, 10001]);
      expect(queries[2].params).toEqual(["tenant", "second", "first", 2]);
      expect(queries[2].rows).toBe(2);
      expect(results).toEqual([]);
    });

    test("retains exact counts and has_more for last and beyond-total pages", async () => {
      results = [[[20003]], [["last", 2, timestamp]], [scheduled("last")]];
      const last = await invoke({ offset: "20002", limit: "50" });
      expect(last.data.map((email) => email.id)).toEqual(["last"]);
      expect(last.pagination).toEqual({ limit: 50, offset: 20002, total: 20003, has_more: false });
      queries = [];
      results = [[[20003]]];
      const empty = await invoke({ offset: "30000" });
      expect(empty.data).toEqual([]);
      expect(empty.pagination.total).toBe(20003);
      expect(empty.pagination.has_more).toBe(false);
      expect(queries).toHaveLength(1);
    });

    test("preserves database page order with source-colliding IDs and millisecond output", async () => {
      results = [[[4]], [["later", 0, "2026-09-04 12:00:00.123002"], ["shared", 0, "2026-09-04 12:00:00.123001"], ["shared", 1, "2026-09-04 12:00:00.123999"], ["shared", 2, "2026-09-04 12:00:00.123999"]], [received("shared"), received("later")], [sent("shared")], [scheduled("shared")]];
      const result = await invoke();
      expect(result.data.map((email) => `${email.type}:${email.id}`)).toEqual([
        "received:later", "received:shared", "sent:shared", "scheduled:shared",
      ]);
      expect(new Set(result.data.map((email) => email.created_at))).toEqual(new Set(["2026-09-04T12:00:00.123Z"]));
      expect(queries).toHaveLength(5);
      for (const query of queries.slice(2)) expect(query.params[0]).toBe("tenant");
    });

    test("forwards one request timestamp and normalizes null output", async () => {
      results = [[[3]], [["null", 0, null], ["null", 1, null], ["null", 2, null]], [received("null", null)], [sent("null", null)], [scheduled("null", null)]];
      const result = await invoke();
      expect(result.data.map((email) => [email.type, email.created_at])).toEqual([
        ["received", now], ["sent", now], ["scheduled", now],
      ]);
      expect(queries[1].params).toContain(now);
    });

    test("passes status parameters and skips database reads for unsupported single-source statuses", async () => {
      const cases = [
        { status: "unread", values: [false, false] },
        { status: "read", values: [true] },
        { status: "archived", values: [true] },
        { status: "delivered", values: [true, "sent"] },
        { status: "pending", values: ["pending", "processing"] },
        { status: "failed", values: [false, "failed", "failed"] },
        { status: "bounced", values: ["bounced"] },
        { status: "scheduled", values: ["scheduled"] },
        { status: "cancelled", values: ["cancelled"] },
        { status: "paused", values: ["paused"] },
      ];
      for (const { status, values } of cases) {
        queries = [];
        results = [[[0]]];
        const result = await invoke({ status });
        expect(result.data, status).toEqual([]);
        expect(result.pagination.total, status).toBe(0);
        expect(result.pagination.has_more, status).toBe(false);
        expect(queries, status).toHaveLength(1);
        expect(queries[0].params.filter((value) => value !== "tenant"), status).toEqual(values);
      }
      queries = [];
      for (const [type, statuses] of [
        ["sent", ["unread", "read", "archived", "scheduled", "cancelled", "paused"]],
        ["scheduled", ["unread", "read", "archived", "delivered", "bounced"]],
      ] as const) {
        for (const status of statuses) {
          const result = await invoke({ type, status });
          expect(result.data).toEqual([]);
          expect(result.pagination.total).toBe(0);
          expect(result.pagination.has_more).toBe(false);
        }
      }
      expect(queries).toEqual([]);
    });

    test("shares resolved domain, address, time and search parameters across count and page", async () => {
      results = [[domainRow("domain", "example.com")], [addressRow("address", "in@example.com")], [[1]], [["match", 0, timestamp]], [received("match")]];
      const result = await invoke({ domain: "domain", address: "address", time_range: "7d", search: " nEeDlE " });
      expect(result.filters).toMatchObject({ domain: "example.com", address: "in@example.com", search: "nEeDlE", time_range: "7d" });
      expect(result.pagination.total).toBe(1);
      expect(queries[0].params).toEqual(["tenant", "domain", "domain", 1]);
      expect(queries[1].params).toEqual(["tenant", "address", "address", 1]);
      const filters = queries[2].params;
      expect(queries[3].params.slice(0, filters.length)).toEqual(filters);
      expect(filters.filter((value) => value === "tenant")).toHaveLength(3);
      expect(filters.filter((value) => value === "%nEeDlE%")).toHaveLength(9);
      expect(filters).toContain("%@example.com");
      expect(filters).toContain("%in@example.com%");
      expect(filters.filter((value) => value === "2026-08-29T12:00:00.000Z")).toHaveLength(3);
    });

    test("falls back to raw filters when tenant-parameterized lookups return no records", async () => {
      results = [[], [], [[0]]];
      const result = await invoke({ domain: "foreign-domain", address: "foreign-address" });
      expect(result.data).toEqual([]);
      expect(result.filters).toMatchObject({ domain: "foreign-domain", address: "foreign-address" });
      expect(queries[0].params[0]).toBe("tenant");
      expect(queries[1].params[0]).toBe("tenant");
      expect(queries[2].params).toContain("%@foreign-domain");
      expect(queries[2].params).toContain("%foreign-address%");
    });

    test("formats all three sources and hydrates only the supplied page", async () => {
      results = [[[3]], [["r", 0, timestamp], ["s", 1, timestamp], ["q", 2, timestamp]], [received("r")], [sent("s")], [scheduled("q")]];
      const result = await invoke();
      expect(result.data[0]).toMatchObject({ subject: "No Subject", preview: `${"x".repeat(199)}...`, from: "from@example.com", from_name: "Sender", to: ["in@example.com"], cc: [], has_attachments: false, attachment_count: 0, envelope_recipient: "in@example.com", is_read: false, is_archived: false, thread_id: "thread", status: "delivered" });
      expect(result.data[1]).toMatchObject({ preview: "hi there", cc: ["cc@example.com"], has_attachments: true, attachment_count: 1, status: "delivered", thread_id: "sent-thread" });
      expect(result.data[2]).toMatchObject({ preview: null, cc: [], has_attachments: false, status: "scheduled" });
      expect(result.data).toHaveLength(3);
      expect(result.pagination.total).toBe(3);
      expect(queries).toHaveLength(5);
      expect(queries.slice(2).reduce((total, query) => total + query.rows, 0)).toBe(3);
      expect(results).toEqual([]);
    });

    test("retains single-source pagination and passes tenant parameters to data and count reads", async () => {
      for (const [type, row] of [["received", received("r")], ["sent", sent("s")], ["scheduled", scheduled("q")]] as const) {
        queries = [];
        results = [[row], [[3]]];
        const result = await invoke({ type, limit: "1", offset: "1" });
        expect(result.data[0].type).toBe(type);
        expect(result.pagination).toEqual({ limit: 1, offset: 1, total: 3, has_more: true });
        expect(queries).toHaveLength(2);
        expect(queries[0].params).toEqual(["tenant", 1, 1]);
        expect(queries[1].params).toEqual(["tenant"]);
      }
    });

    test("caps limits and preserves empty/invalid pagination behavior", async () => {
      results = [[[0]]];
      expect((await invoke({ limit: "999" })).pagination.limit).toBe(100);
      results = [[[3]]];
      const invalid = await invoke({ limit: "invalid", offset: "NaN" });
      expect(invalid.data).toEqual([]);
      expect(invalid.pagination.has_more).toBe(false);
      const invalidQueries: Record<string, string>[] = [{ limit: "0" }, { offset: "-1" }];
      for (const query of invalidQueries) {
        const set: { status?: number } = {};
        expect((await invoke(query, set)).error).toBeString();
        expect(set.status).toBe(400);
      }
    });

    test("propagates auth/database errors without returning partial success", async () => {
      authFailure = new Error("unauthorized");
      await expect(invoke()).rejects.toThrow("unauthorized");
      expect(authCalls).toBe(1);
      expect(queries).toEqual([]);
      authFailure = undefined;
      databaseFailure = new Error("database unavailable");
      await expect(invoke()).rejects.toThrow("database unavailable");
      expect(authCalls).toBe(2);
    });
  });
}
