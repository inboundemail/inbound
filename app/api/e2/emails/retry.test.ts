import {
	afterAll,
	beforeEach,
	describe,
	expect,
	mock,
	spyOn,
	test,
} from "bun:test";
import { createHash, createHmac } from "node:crypto";
import * as orm from "drizzle-orm";
import { getTableColumns, getTableName } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import {
	blockedEmails,
	emailAddresses,
	endpointDeliveries,
	endpoints,
	sesEvents,
	structuredEmails,
	webhookDeliveries,
	webhooks,
} from "@/lib/db/schema";

type Row = Record<string, unknown>;
type Column = { name: string; table: PgTable };
type Predicate = (row: Row) => boolean;
const rows = new Map<string, Row[]>();
const tableRows = (table: PgTable) => rows.get(getTableName(table)) ?? [];
const field = (column: Column) =>
	Object.entries(getTableColumns(column.table)).find(
		([, value]) => value.name === column.name,
	)?.[0] ?? column.name;
const equal = (left: unknown, right: unknown) =>
	left instanceof Date && right instanceof Date
		? left.getTime() === right.getTime()
		: left === right;
const project = (row: Row, fields?: Record<string, Column>) =>
	fields
		? Object.fromEntries(
				Object.entries(fields).map(([key, column]) => [
					key,
					row[field(column)],
				]),
			)
		: { ...row };
let beforeUpdate: ((table: PgTable, values: Row) => void) | undefined;
let beforeSelect: ((table: PgTable) => void) | undefined;

mock.module("drizzle-orm", () => ({
	...orm,
	eq:
		(column: Column, value: unknown): Predicate =>
		(row) =>
			equal(row[field(column)], value),
	gte:
		(column: Column, value: Date): Predicate =>
		(row) =>
			Number(row[field(column)]) >= value.getTime(),
	lt:
		(column: Column, value: Date): Predicate =>
		(row) =>
			Number(row[field(column)]) < value.getTime(),
	isNull:
		(column: Column): Predicate =>
		(row) =>
			row[field(column)] == null,
	ilike:
		(column: Column, value: string): Predicate =>
		(row) =>
			String(row[field(column)]).toLowerCase() === value.toLowerCase(),
	and:
		(...predicates: (Predicate | undefined)[]): Predicate =>
		(row) =>
			predicates.every((predicate) => !predicate || predicate(row)),
	or:
		(...predicates: Predicate[]): Predicate =>
		(row) =>
			predicates.some((predicate) => predicate(row)),
}));

mock.module("@/lib/db", () => ({
	db: {
		select: (fields?: Record<string, Column>) => ({
			from: (table: PgTable) => ({
				where: (predicate: Predicate) => {
					const query = {
						limit: async (limit: number) => {
							beforeSelect?.(table);
							return tableRows(table)
								.filter(predicate)
								.slice(0, limit)
								.map((row) =>
									project(
										{
											...row,
											...(typeof row.updatedAt === "number"
												? { updatedAt: new Date(row.updatedAt) }
												: {}),
										},
										fields,
									),
								);
						},
						orderBy: () => query,
					};
					return query;
				},
			}),
		}),
		insert: (table: PgTable) => ({
			values: (values: Row) => {
				const run = (ignoreConflict: boolean) => {
					const current = tableRows(table);
					if (
						current.some(
							(row) =>
								row.id === values.id ||
								(table === endpointDeliveries &&
									row.emailId === values.emailId &&
									row.endpointId === values.endpointId),
						)
					) {
						if (ignoreConflict) return [];
						throw Object.assign(new Error("duplicate key"), { code: "23505" });
					}
					current.push({ ...values });
					rows.set(getTableName(table), current);
					return [values];
				};
				return {
					then: (
						resolve: (value: Row[]) => unknown,
						reject: (error: unknown) => unknown,
					) =>
						Promise.resolve()
							.then(() => run(false))
							.then(resolve, reject),
					onConflictDoNothing: () => ({
						returning: async (fields: Record<string, Column>) =>
							run(true).map((row) => project(row, fields)),
					}),
				};
			},
		}),
		update: (table: PgTable) => ({
			set: (values: Row) => ({
				where: (predicate: Predicate) => {
					const run = () => {
						beforeUpdate?.(table, values);
						const matched = tableRows(table).filter(predicate);
						for (const row of matched) Object.assign(row, values);
						return matched;
					};
					return {
						then: (resolve: (value: Row[]) => unknown) =>
							Promise.resolve(run()).then(resolve),
						returning: async (fields: Record<string, Column>) =>
							run().map((row) => project(row, fields)),
					};
				},
			}),
		}),
	},
}));

const guardCheck = mock(async () => ({
	data: { allowed: false },
	error: null as string | null,
}));
const guardRules = mock(
	async (): Promise<{
		shouldBlock: boolean;
		action?: string;
		routeToEndpointId?: string;
	}> => ({ shouldBlock: false }),
);
const threading = mock(async () => ({
	threadId: "thread",
	threadPosition: 1,
	isNewThread: true,
}));
const blocklist = mock(async () => ({
	hasBlockedRecipients: false,
	blockedAddresses: [] as string[],
}));
const forward = mock(async () => undefined);
const { isEmailBlocked } = await import(
	"@/lib/email-management/email-blocking"
);
mock.module("autumn-js", () => ({ Autumn: { check: guardCheck } }));
mock.module("@/lib/guard/rule-matcher", () => ({
	evaluateGuardRules: guardRules,
}));
mock.module("@/lib/email-management/email-threader", () => ({
	EmailThreader: { processEmailForThreading: threading },
}));
mock.module("@/lib/email-management/email-blocking", () => ({
	checkRecipientsAgainstBlocklist: blocklist,
	isEmailBlocked,
}));
mock.module("@/lib/email-management/email-forwarder", () => ({
	EmailForwarder: class {
		forwardEmail = forward;
	},
}));
mock.module("@/lib/email-management/email-parser", () => ({
	sanitizeHtml: (html: string) => html,
}));
mock.module("@/lib/aws-ses/identity-arn-helper", () => ({
	getTenantSendingInfoForDomainOrParent: async () => ({
		identityArn: null,
		configurationSetName: null,
		tenantName: null,
	}),
}));
mock.module("@/lib/webhooks/verification", () => ({
	generateNewWebhookVerificationToken: () => "synthetic-token",
	getOrCreateVerificationToken: (config: { verificationToken: string }) =>
		config.verificationToken,
}));
mock.module("@/app/api/e2/lib/auth", () => ({
	validateAndRateLimit: async (request: Request) => {
		const userId = request.headers.get("x-test-user");
		if (!userId)
			throw Object.assign(new Error("Unauthorized"), { status: 401 });
		return userId;
	},
}));

const fetchTarget: {
	fetch: (...args: Parameters<typeof fetch>) => ReturnType<typeof fetch>;
} = globalThis;
const network = spyOn(fetchTarget, "fetch").mockImplementation(
	async () => new Response("accepted", { status: 200 }),
);
const log = spyOn(console, "log").mockImplementation(() => {});
const warn = spyOn(console, "warn").mockImplementation(() => {});
const error = spyOn(console, "error").mockImplementation(() => {});
const { retryEmail } = await import("@/app/api/e2/emails/retry");
const { routeEmail } = await import("@/lib/email-management/email-router");
const { triggerEmailAction } = await import(
	"@/lib/email-management/webhook-trigger"
);
const app = retryEmail.compile();

function delivery(overrides: Row = {}) {
	return {
		id: "delivery",
		emailId: "email",
		endpointId: "chosen",
		deliveryType: "webhook",
		status: "failed",
		attempts: 2,
		updatedAt: new Date("2026-01-01"),
		responseData: '{"error":"previous failure"}',
		...overrides,
	};
}
function request(
	body: Row = {},
	userId: string | null = "owner",
	emailId = "structured",
) {
	return app.handle(
		new Request(`http://localhost/emails/${emailId}/retry`, {
			method: "POST",
			headers: {
				"content-type": "application/json",
				...(userId ? { "x-test-user": userId } : {}),
			},
			body: JSON.stringify(body),
		}),
	);
}
const storedDelivery = () => tableRows(endpointDeliveries)[0];
function configureLegacy(status = "failed") {
	Object.assign(tableRows(emailAddresses)[0], {
		endpointId: null,
		webhookId: "legacy",
	});
	rows.set(getTableName(webhooks), [
		{
			id: "legacy",
			userId: "owner",
			isActive: true,
			name: "Legacy",
			url: "https://legacy.example.test/hook",
			secret: "synthetic-hmac",
			headers: '{"X-Test-Custom":"preserved"}',
		},
	]);
	const row = {
		id: `whd_${createHash("sha256").update("structured:legacy").digest("hex").slice(0, 16)}`,
		emailId: "structured",
		webhookId: "legacy",
		status,
		attempts: 2,
		updatedAt: new Date("2026-01-01"),
		error: "previous failure",
	};
	rows.set(getTableName(webhookDeliveries), [row]);
	return row;
}

beforeEach(() => {
	rows.clear();
	rows.set(getTableName(structuredEmails), [
		{
			id: "structured",
			emailId: "email",
			sesEventId: "ses-event",
			userId: "owner",
			recipient: "inbox@example.test",
			parseSuccess: true,
			guardBlocked: false,
			threadId: "thread",
			threadPosition: 1,
			fromData:
				'{"text":"sender@example.test","addresses":[{"address":"sender@example.test","name":null}]}',
			toData: null,
			attachments: "[]",
			headers: "{}",
			textBody: "Synthetic content",
		},
	]);
	rows.set(getTableName(endpoints), [
		{
			id: "chosen",
			name: "Chosen",
			type: "webhook",
			userId: "owner",
			isActive: true,
			config: JSON.stringify({
				url: "https://chosen.example.test/hook",
				verificationToken: "synthetic-token",
				headers: { "X-Test-Custom": "preserved" },
			}),
		},
		{
			id: "configured",
			name: "Configured",
			type: "webhook",
			userId: "owner",
			isActive: true,
			config: JSON.stringify({
				url: "https://configured.example.test/hook",
				verificationToken: "synthetic-token",
			}),
		},
	]);
	rows.set(getTableName(emailAddresses), [
		{
			address: "inbox@example.test",
			userId: "owner",
			isActive: true,
			endpointId: "configured",
		},
	]);
	rows.set(getTableName(endpointDeliveries), [delivery()]);
	beforeUpdate = undefined;
	network.mockClear();
	network.mockImplementation(
		async () => new Response("accepted", { status: 200 }),
	);
	guardCheck.mockClear();
	guardCheck.mockImplementation(async () => ({
		data: { allowed: false },
		error: null,
	}));
	guardRules.mockClear();
	guardRules.mockImplementation(async () => ({ shouldBlock: false }));
	threading.mockClear();
	blocklist.mockClear();
	blocklist.mockImplementation(async () => ({
		hasBlockedRecipients: false,
		blockedAddresses: [],
	}));
	forward.mockClear();
	forward.mockImplementation(async () => undefined);
	beforeSelect = undefined;
	rows.set(getTableName(sesEvents), [
		{ id: "ses-event", source: "envelope@example.test" },
	]);
});
afterAll(() => {
	network.mockRestore();
	log.mockRestore();
	warn.mockRestore();
	error.mockRestore();
});

describe("email recovery", () => {
	test("delivery retry sends only to its selected endpoint and preserves webhook payload and headers", async () => {
		const response = await request({ delivery_id: "delivery" });
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			success: true,
			message: "Webhook delivered successfully",
			delivery_id: "delivery",
		});
		expect(network).toHaveBeenCalledTimes(1);
		const [url, options] = network.mock.calls[0];
		expect(url).toBe("https://chosen.example.test/hook");
		expect(options?.headers).toMatchObject({
			"X-Webhook-Verification-Token": "synthetic-token",
			"X-Test-Custom": "preserved",
			"X-Email-ID": "structured",
			"X-Endpoint-ID": "chosen",
			"X-Webhook-Event": "email.received",
		});
		expect(JSON.parse(String(options?.body))).toMatchObject({
			event: "email.received",
			email: {
				id: "structured",
				threadId: "thread",
				threadPosition: 1,
				parsedData: { textBody: "Synthetic content" },
			},
			endpoint: { id: "chosen" },
		});
		expect(storedDelivery()).toMatchObject({ status: "success", attempts: 3 });
		expect(threading).not.toHaveBeenCalled();
	});

	test.each([
		400, 500,
	])("receiver HTTP %i records failure once and returns success:false", async (status) => {
		network.mockImplementation(
			async () => new Response("receiver rejected", { status }),
		);
		const response = await request({ delivery_id: "delivery" });
		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			success: false,
			delivery_id: "delivery",
			message: `Webhook delivery failed with HTTP ${status}`,
		});
		expect(storedDelivery()).toMatchObject({ status: "failed", attempts: 3 });
		expect(JSON.parse(String(storedDelivery().responseData))).toMatchObject({
			responseCode: status,
			responseBody: "receiver rejected",
		});
	});

	test("timeout records its error and increments only once", async () => {
		network.mockImplementation(async () => {
			throw new DOMException("synthetic timeout", "TimeoutError");
		});
		const response = await request({ delivery_id: "delivery" });
		expect(await response.json()).toMatchObject({
			success: false,
			delivery_id: "delivery",
			message: "synthetic timeout",
		});
		expect(storedDelivery()).toMatchObject({ status: "failed", attempts: 3 });
		expect(JSON.parse(String(storedDelivery().responseData))).toMatchObject({
			error: "synthetic timeout",
		});
	});

	test.each([
		"success",
		"processing",
	])("delivery retry cannot resend %s", async (status) => {
		Object.assign(storedDelivery(), { status });
		const response = await request({ delivery_id: "delivery" });
		expect(response.status).toBe(400);
		expect(network).not.toHaveBeenCalled();
		expect(storedDelivery()).toMatchObject({ status, attempts: 2 });
	});

	test("explicit endpoint resend permits success but never processing, including stale", async () => {
		Object.assign(storedDelivery(), { status: "success" });
		expect(
			await (await request({ endpoint_id: "chosen" })).json(),
		).toMatchObject({ success: true, delivery_id: "delivery" });
		expect(storedDelivery().attempts).toBe(3);
		Object.assign(storedDelivery(), {
			status: "processing",
			updatedAt: new Date("2020-01-01"),
		});
		expect(
			await (await request({ endpoint_id: "chosen" })).json(),
		).toMatchObject({ success: false, delivery_id: "delivery" });
		expect(network).toHaveBeenCalledTimes(1);
		expect(storedDelivery().attempts).toBe(3);
	});

	test("new endpoint resend creates exactly one processing claim", async () => {
		rows.set(getTableName(endpointDeliveries), []);
		const result = await (await request({ endpoint_id: "chosen" })).json();
		expect(result.success).toBe(true);
		expect(storedDelivery()).toMatchObject({
			id: result.delivery_id,
			endpointId: "chosen",
			status: "success",
			attempts: 1,
		});
	});

	test("two concurrent retries send only once and preserve prior diagnostics until completion", async () => {
		let release: (() => void) | undefined;
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		let sent: (() => void) | undefined;
		const started = new Promise<void>((resolve) => {
			sent = resolve;
		});
		network.mockImplementation(async () => {
			sent?.();
			await gate;
			return new Response("accepted");
		});
		const first = request({ delivery_id: "delivery" });
		await started;
		expect(storedDelivery()).toMatchObject({
			status: "processing",
			attempts: 3,
			responseData: '{"error":"previous failure"}',
		});
		expect((await request({ endpoint_id: "chosen" })).status).toBe(200);
		release?.();
		expect(await (await first).json()).toMatchObject({ success: true });
		expect(network).toHaveBeenCalledTimes(1);
		expect(storedDelivery().attempts).toBe(3);
	});

	test.each([
		"parseSuccess",
		"guardBlocked",
	])("unsafe email state %s prevents delivery", async (fieldName) => {
		tableRows(structuredEmails)[0][fieldName] = fieldName === "guardBlocked";
		expect((await request({ endpoint_id: "chosen" })).status).toBe(400);
		expect(network).not.toHaveBeenCalled();
		expect(storedDelivery().attempts).toBe(2);
	});

	test.each([
		"raw",
		"headers",
	])("stored DSN %s suppresses manual endpoint and legacy retry", async (source) => {
		Object.assign(
			tableRows(structuredEmails)[0],
			source === "raw"
				? {
						rawContent:
							"Content-Type: multipart/report; report-type=delivery-status",
					}
				: {
						headers:
							'{"content-type":{"value":"multipart/report","params":{"report-type":"delivery-status"}}}',
					},
		);
		expect((await request({ endpoint_id: "chosen" })).status).toBe(400);
		configureLegacy();
		expect((await request()).status).toBe(400);
		expect(network).not.toHaveBeenCalled();
		expect(storedDelivery().attempts).toBe(2);
	});

	test("sender blocklist uses the SES envelope source, not header From", async () => {
		rows.set(getTableName(blockedEmails), [
			{ id: "blocked", emailAddress: "envelope@example.test" },
		]);
		expect((await request({ delivery_id: "delivery" })).status).toBe(400);
		expect(network).not.toHaveBeenCalled();
		rows.set(getTableName(blockedEmails), [
			{ id: "header-only", emailAddress: "sender@example.test" },
		]);
		expect(
			await (await request({ delivery_id: "delivery" })).json(),
		).toMatchObject({ success: true });
		expect(network).toHaveBeenCalledTimes(1);
	});

	test("missing SES source and blocklist lookup errors fail closed", async () => {
		rows.set(getTableName(sesEvents), []);
		expect((await request({ endpoint_id: "chosen" })).status).toBe(400);
		rows.set(getTableName(sesEvents), [
			{ id: "ses-event", source: "envelope@example.test" },
		]);
		beforeSelect = (table) => {
			if (table === blockedEmails)
				throw new Error("synthetic blocklist outage");
		};
		expect((await request({ endpoint_id: "chosen" })).status).toBe(500);
		expect(await isEmailBlocked("envelope@example.test")).toBe(false);
		expect(network).not.toHaveBeenCalled();
		expect(storedDelivery().attempts).toBe(2);
	});

	test("current Guard blocks and route restrictions cannot be bypassed", async () => {
		guardCheck.mockImplementation(async () => ({
			data: { allowed: true },
			error: null,
		}));
		guardRules.mockImplementation(async () => ({ shouldBlock: true }));
		expect(
			await (await request({ endpoint_id: "chosen" })).json(),
		).toMatchObject({ success: false });
		tableRows(structuredEmails)[0].guardBlocked = false;
		guardRules.mockImplementation(async () => ({
			shouldBlock: false,
			action: "route",
			routeToEndpointId: "configured",
		}));
		expect((await request({ endpoint_id: "chosen" })).status).toBe(400);
		expect(network).not.toHaveBeenCalled();
	});

	test("Guard feature lookup errors fail closed for manual retry", async () => {
		guardCheck.mockImplementation(async () => ({
			data: { allowed: false },
			error: "unavailable",
		}));
		expect((await request({ endpoint_id: "chosen" })).status).toBe(400);
		expect(network).not.toHaveBeenCalled();
	});

	test("missing authentication and foreign email, endpoint, delivery are rejected", async () => {
		expect((await request({ endpoint_id: "chosen" }, null)).status).toBe(401);
		expect((await request({ endpoint_id: "chosen" }, "other")).status).toBe(
			404,
		);
		tableRows(endpoints)[0].userId = "other";
		expect((await request({ endpoint_id: "chosen" })).status).toBe(404);
		tableRows(endpoints)[0].userId = "owner";
		storedDelivery().emailId = "other-email";
		expect((await request({ delivery_id: "delivery" })).status).toBe(404);
		expect(network).not.toHaveBeenCalled();
	});

	test("inactive endpoints and ambiguous selectors are rejected", async () => {
		tableRows(endpoints)[0].isActive = false;
		expect((await request({ delivery_id: "delivery" })).status).toBe(404);
		expect(
			(await request({ delivery_id: "delivery", endpoint_id: "chosen" }))
				.status,
		).toBe(400);
		expect((await request({ endpoint_id: "" })).status).toBe(400);
		expect(network).not.toHaveBeenCalled();
	});

	test("no-selector uses configured routing without threading and preserves legacy fallback", async () => {
		expect(await (await request()).json()).toMatchObject({ success: true });
		expect(network.mock.calls[0][0]).toBe(
			"https://configured.example.test/hook",
		);
		rows.set(getTableName(emailAddresses), []);
		expect(await (await request()).json()).toMatchObject({ success: false });
		expect(network).toHaveBeenCalledTimes(1);
		expect(threading).not.toHaveBeenCalled();
	});

	test.each([
		"success",
		"processing",
	])("actual legacy no-selector skips %s, including stale processing", async (status) => {
		const row = configureLegacy(status);
		expect(await (await request()).json()).toMatchObject({
			success: status === "success",
			delivery_id: row.id,
		});
		expect(row.attempts).toBe(2);
		expect(network).not.toHaveBeenCalled();
		expect(threading).not.toHaveBeenCalled();
	});

	test.each([
		200, 500,
	])("actual legacy retry records HTTP %i once and preserves payload/signature", async (status) => {
		const row = configureLegacy();
		network.mockImplementation(
			async () => new Response("synthetic receiver response", { status }),
		);
		expect(await (await request()).json()).toMatchObject({
			success: status === 200,
			delivery_id: row.id,
		});
		expect(row).toMatchObject({
			status: status === 200 ? "success" : "failed",
			attempts: 3,
		});
		expect(network).toHaveBeenCalledTimes(1);
		const [url, options] = network.mock.calls[0];
		expect(url).toBe("https://legacy.example.test/hook");
		expect(options?.headers).toMatchObject({
			"X-Test-Custom": "preserved",
			"X-Email-ID": "structured",
			"X-Webhook-ID": "legacy",
			"X-Webhook-Signature": `sha256=${createHmac("sha256", "synthetic-hmac").update(String(options?.body)).digest("hex")}`,
		});
		expect(JSON.parse(String(options?.body))).toMatchObject({
			event: "email.received",
			email: {
				id: "structured",
				parsedData: { textBody: "Synthetic content" },
			},
			webhook: { id: "legacy" },
		});
	});

	test("legacy automatic stale reclaim remains supported and fences old completion", async () => {
		const row = configureLegacy("processing");
		network.mockImplementation(async () => {
			Object.assign(row, {
				attempts: 4,
				updatedAt: new Date(),
				error: "newer attempt",
			});
			return new Response("accepted");
		});
		expect(await triggerEmailAction("structured")).toMatchObject({
			success: false,
			deliveryId: row.id,
		});
		expect(network).toHaveBeenCalledTimes(1);
		expect(row).toMatchObject({
			status: "processing",
			attempts: 4,
			error: "newer attempt",
		});
	});

	test("legacy stale claim cannot replace a renewed lease", async () => {
		const row = configureLegacy("processing");
		beforeUpdate = (table, values) => {
			if (table === webhookDeliveries && values.status === "processing")
				row.updatedAt = new Date();
		};
		await triggerEmailAction("structured");
		expect(network).not.toHaveBeenCalled();
		expect(row).toMatchObject({ status: "processing", attempts: 2 });
	});

	test("concurrent actual legacy manual retries send once", async () => {
		const row = configureLegacy();
		let release: (() => void) | undefined;
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		let sent: (() => void) | undefined;
		const started = new Promise<void>((resolve) => {
			sent = resolve;
		});
		network.mockImplementation(async () => {
			sent?.();
			await gate;
			return new Response("accepted");
		});
		const first = request();
		await started;
		expect(await (await request()).json()).toMatchObject({
			success: false,
			delivery_id: row.id,
		});
		expect(row).toMatchObject({
			status: "processing",
			attempts: 3,
			error: "previous failure",
		});
		release?.();
		expect(await (await first).json()).toMatchObject({
			success: true,
			delivery_id: row.id,
		});
		expect(network).toHaveBeenCalledTimes(1);
	});

	test("forwarding retries use the selected target and blocklist, counting once", async () => {
		Object.assign(tableRows(endpoints)[0], {
			type: "email",
			config: JSON.stringify({ forwardTo: "destination@example.test" }),
		});
		blocklist.mockImplementation(async () => ({
			hasBlockedRecipients: true,
			blockedAddresses: ["destination@example.test"],
		}));
		expect(
			await (await request({ delivery_id: "delivery" })).json(),
		).toMatchObject({ success: false, delivery_id: "delivery" });
		expect(storedDelivery()).toMatchObject({ attempts: 3, status: "failed" });
		expect(forward).not.toHaveBeenCalled();
		blocklist.mockImplementation(async () => ({
			hasBlockedRecipients: false,
			blockedAddresses: [],
		}));
		expect(
			await (await request({ delivery_id: "delivery" })).json(),
		).toMatchObject({ success: true, delivery_id: "delivery" });
		expect(forward).toHaveBeenCalledTimes(1);
		expect(storedDelivery()).toMatchObject({ attempts: 4, status: "success" });
		expect(network).not.toHaveBeenCalled();
	});

	test("forwarding provider errors remain failed and return useful outcome", async () => {
		Object.assign(tableRows(endpoints)[0], {
			type: "email_group",
			config: JSON.stringify({ emails: ["destination@example.test"] }),
		});
		forward.mockImplementation(async () => {
			throw new Error("synthetic provider failure");
		});
		expect(
			await (await request({ delivery_id: "delivery" })).json(),
		).toMatchObject({
			success: false,
			delivery_id: "delivery",
			message: "synthetic provider failure",
		});
		expect(storedDelivery()).toMatchObject({ attempts: 3, status: "failed" });
	});

	test("stale processing CAS cannot reclaim a lease renewed since observation", async () => {
		Object.assign(storedDelivery(), {
			endpointId: "configured",
			status: "processing",
		});
		beforeUpdate = (table, values) => {
			if (table === endpointDeliveries && values.status === "processing") {
				storedDelivery().updatedAt = new Date();
				beforeUpdate = undefined;
			}
		};
		await routeEmail("email");
		expect(network).not.toHaveBeenCalled();
		expect(storedDelivery()).toMatchObject({
			status: "processing",
			attempts: 2,
		});
	});

	test.each([
		"unified",
		"legacy",
	])("%s failed delivery with database microsecond timestamp remains retryable", async (kind) => {
		const row: Row = kind === "legacy" ? configureLegacy() : storedDelivery();
		row.updatedAt = new Date("2026-01-01").getTime() + 0.456;
		expect(
			await (
				await request(kind === "legacy" ? {} : { delivery_id: "delivery" })
			).json(),
		).toMatchObject({ success: true });
		expect(row).toMatchObject({ attempts: 3, status: "success" });
	});

	test.each([
		"unified",
		"legacy",
	])("%s automatic stale reclaim handles microseconds without losing fencing", async (kind) => {
		const row: Row =
			kind === "legacy" ? configureLegacy("processing") : storedDelivery();
		Object.assign(row, {
			status: "processing",
			updatedAt: new Date("2026-01-01").getTime() + 0.456,
		});
		if (kind === "legacy") await triggerEmailAction("structured");
		else {
			row.endpointId = "configured";
			await routeEmail("email");
		}
		expect(row).toMatchObject({ attempts: 3, status: "success" });
		expect(network).toHaveBeenCalledTimes(1);
	});

	test("a replaced claim fences the old worker's completion", async () => {
		network.mockImplementation(async () => {
			Object.assign(storedDelivery(), {
				attempts: 4,
				updatedAt: new Date(Date.now() + 1000),
				responseData: '{"newer":true}',
			});
			return new Response("accepted");
		});
		expect(
			await (await request({ delivery_id: "delivery" })).json(),
		).toMatchObject({ success: false, delivery_id: "delivery" });
		expect(storedDelivery()).toMatchObject({
			status: "processing",
			attempts: 4,
			responseData: '{"newer":true}',
		});
	});
});
