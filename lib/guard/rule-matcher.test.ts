import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import type { ExplicitRuleConfig, GuardRule } from "@/features/guard/types";
import { guardRules, type structuredEmails } from "@/lib/db/schema";

type StructuredEmail = typeof structuredEmails.$inferSelect;

process.env.DATABASE_URL ??= "postgresql://user:password@example.com/database";

const { checkExplicitRule, checkRuleMatch, evaluateGuardRules } = await import(
	"@/lib/guard/rule-matcher"
);
const { db } = await import("@/lib/db");

function buildStructuredEmail(
	overrides: Partial<StructuredEmail>,
): StructuredEmail {
	return {
		id: "email_1",
		emailId: "email_1",
		sesEventId: "ses_1",
		messageId: "<message@example.com>",
		date: null,
		subject: "Hello",
		recipient: "inbox-b@example.com",
		envelopeRecipients: null,
		fromData: null,
		toData: null,
		ccData: null,
		bccData: null,
		replyToData: null,
		inReplyTo: null,
		references: null,
		textBody: null,
		htmlBody: null,
		rawContent: null,
		attachments: null,
		headers: null,
		priority: null,
		parseSuccess: true,
		parseError: null,
		isRead: false,
		readAt: null,
		isArchived: false,
		archivedAt: null,
		guardBlocked: false,
		guardReason: null,
		guardRuleId: null,
		guardAction: null,
		guardMetadata: null,
		userId: "user_1",
		createdAt: null,
		updatedAt: null,
		threadId: null,
		threadPosition: null,
		...overrides,
	};
}

describe("guard explicit To rules", () => {
	it("matches against the delivered recipient instead of every visible To header address", async () => {
		const config: ExplicitRuleConfig = {
			to: {
				operator: "OR",
				values: ["inbox-a@example.com"],
			},
		};
		const email = buildStructuredEmail({
			recipient: "inbox-b@example.com",
			toData: JSON.stringify({
				text: "inbox-a@example.com, inbox-b@example.com",
				addresses: [
					{ name: null, address: "inbox-a@example.com" },
					{ name: null, address: "inbox-b@example.com" },
				],
			}),
		});

		await expect(checkExplicitRule(config, email)).resolves.toMatchObject({
			matched: false,
		});
	});
});

function buildRule(overrides: Partial<GuardRule>): GuardRule {
	return {
		id: "rule_1",
		userId: "user_1",
		name: "Rule",
		description: null,
		type: "ai_prompt",
		config: JSON.stringify({ mode: "simple", prompt: "Cold sales outreach" }),
		isActive: true,
		priority: 0,
		triggerCount: 0,
		lastTriggeredAt: null,
		actions: JSON.stringify({ action: "block" }),
		createdAt: null,
		updatedAt: null,
		...overrides,
	};
}

type JevRequest = {
	model: string;
	state: { email: Record<string, unknown> };
	questions: Record<string, { type: string; instructions: string }>;
};

function jevResponse(answers: Record<string, number>, init: ResponseInit = {}) {
	return new Response(
		JSON.stringify({
			model: "jev-1.13.0",
			answers: Object.fromEntries(
				Object.entries(answers).map(([id, noul]) => [id, { noul }]),
			),
		}),
		{ status: 200, headers: { "content-type": "application/json" }, ...init },
	);
}

describe("guard AI prompt rules (Jev)", () => {
	let rules: GuardRule[] = [];
	let email: StructuredEmail;
	let responses: Array<(request: JevRequest) => Response>;
	let requests: JevRequest[];
	let fetchSpy: ReturnType<typeof spyOn>;
	let selectSpy: ReturnType<typeof spyOn>;
	let updateSpy: ReturnType<typeof spyOn>;
	let errorSpy: ReturnType<typeof spyOn>;
	let logSpy: ReturnType<typeof spyOn>;

	beforeEach(() => {
		process.env.TYPESAFE_API_KEY = "test-key";
		delete process.env.TYPESAFE_MODEL;
		rules = [];
		requests = [];
		responses = [];
		email = buildStructuredEmail({
			subject: "Quick question about your growth plans",
			fromData: JSON.stringify({
				addresses: [{ name: "Sam Seller", address: "sam@vendor.example" }],
			}),
			textBody: "Hi there,\n\n  Would you like a demo of our product?",
		});
		fetchSpy = spyOn(globalThis, "fetch").mockImplementation((async (
			_input: unknown,
			init?: RequestInit,
		) => {
			const request = JSON.parse(String(init?.body)) as JevRequest;
			requests.push(request);
			const next = responses.shift();
			if (!next) throw new Error("unexpected Jev request");
			return next(request);
		}) as typeof fetch);
		selectSpy = spyOn(db, "select").mockImplementation((() => ({
			from: (table: unknown) => ({
				where: () => ({
					orderBy: async () =>
						[...rules].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0)),
					limit: async () =>
						table === guardRules ? rules.slice(0, 1) : [email],
				}),
			}),
		})) as unknown as typeof db.select);
		updateSpy = spyOn(db, "update").mockImplementation((() => ({
			set: () => ({ where: () => Promise.resolve() }),
		})) as unknown as typeof db.update);
		errorSpy = spyOn(console, "error").mockImplementation(() => {});
		logSpy = spyOn(console, "log").mockImplementation(() => {});
	});

	afterEach(() => {
		fetchSpy.mockRestore();
		selectSpy.mockRestore();
		updateSpy.mockRestore();
		errorSpy.mockRestore();
		logSpy.mockRestore();
		delete process.env.TYPESAFE_API_KEY;
	});

	it("matches a single rule at or above the threshold and sends only the email state", async () => {
		rules = [buildRule({ id: "rule_ai" })];
		responses.push(() => jevResponse({ rule_0: 0.87 }));

		await expect(
			checkRuleMatch("rule_ai", "email_1", "user_1"),
		).resolves.toEqual({
			matched: true,
			reason: "Jev: 87% match",
			matchDetails: [{ criteria: "ai_prompt", value: "0.87" }],
		});
		expect(requests).toHaveLength(1);
		expect(requests[0].model).toBe("jev-1.13.0");
		expect(requests[0].questions.rule_0.type).toBe("noul");
		expect(requests[0].questions.rule_0.instructions).toContain(
			"“Cold sales outreach”",
		);
		expect(requests[0].state.email).toEqual({
			from: "Sam Seller <sam@vendor.example>",
			to: ["inbox-b@example.com"],
			subject: "Quick question about your growth plans",
			has_attachments: false,
			body: "Hi there, Would you like a demo of our product?",
		});
	});

	it("does not match below the threshold", async () => {
		rules = [buildRule({ id: "rule_ai" })];
		responses.push(() => jevResponse({ rule_0: 0.59 }));

		await expect(
			checkRuleMatch("rule_ai", "email_1", "user_1"),
		).resolves.toMatchObject({
			matched: false,
			reason: "Jev: 59% match",
		});
	});

	it("asks every AI rule in one request and keeps priority order with explicit rules", async () => {
		rules = [
			buildRule({
				id: "ai_low",
				priority: 1,
				actions: JSON.stringify({ action: "block" }),
			}),
			buildRule({
				id: "explicit_mid",
				type: "explicit",
				priority: 5,
				config: JSON.stringify({
					subject: { operator: "OR", values: ["invoice"] },
				}),
				actions: JSON.stringify({ action: "allow" }),
			}),
			buildRule({
				id: "ai_high",
				priority: 10,
				config: JSON.stringify({
					mode: "simple",
					prompt: "A personal note from a friend",
				}),
				actions: JSON.stringify({ action: "allow" }),
			}),
		];
		responses.push(() => jevResponse({ rule_0: 0.1, rule_1: 0.92 }));

		const result = await evaluateGuardRules("email_1", "user_1");

		expect(requests).toHaveLength(1);
		expect(Object.keys(requests[0].questions)).toEqual(["rule_0", "rule_1"]);
		expect(requests[0].questions.rule_0.instructions).toContain(
			"A personal note from a friend",
		);
		expect(result).toMatchObject({
			shouldBlock: true,
			action: "block",
			reason: "Jev: 92% match",
			metadata: {
				ruleType: "ai_prompt",
				jevModel: "jev-1.13.0",
				jevProbability: 0.92,
			},
		});
		expect(result.matchedRule?.id).toBe("ai_low");
	});

	it("does not call Jev when a higher-priority explicit rule matches first", async () => {
		rules = [
			buildRule({ id: "ai", priority: 1 }),
			buildRule({
				id: "explicit",
				type: "explicit",
				priority: 5,
				config: JSON.stringify({
					subject: { operator: "OR", values: ["growth"] },
				}),
				actions: JSON.stringify({ action: "allow" }),
			}),
		];

		const result = await evaluateGuardRules("email_1", "user_1");

		expect(requests).toHaveLength(0);
		expect(result.matchedRule?.id).toBe("explicit");
	});

	it("fails open without an API key while explicit rules still match", async () => {
		delete process.env.TYPESAFE_API_KEY;
		rules = [
			buildRule({ id: "ai", priority: 10 }),
			buildRule({
				id: "explicit",
				type: "explicit",
				priority: 1,
				config: JSON.stringify({
					subject: { operator: "OR", values: ["growth"] },
				}),
				actions: JSON.stringify({ action: "route", endpointId: "ep_1" }),
			}),
		];

		const result = await evaluateGuardRules("email_1", "user_1");

		expect(requests).toHaveLength(0);
		expect(result).toMatchObject({
			action: "route",
			routeToEndpointId: "ep_1",
		});
		expect(result.matchedRule?.id).toBe("explicit");
	});

	it("records an error and allows the email when Jev rejects the request, without retrying 400", async () => {
		rules = [buildRule({ id: "rule_ai" })];
		responses.push(() => new Response("bad", { status: 400 }));

		await expect(
			checkRuleMatch("rule_ai", "email_1", "user_1"),
		).resolves.toEqual({
			matched: false,
			error: "AI prompt evaluation failed",
		});
		expect(requests).toHaveLength(1);

		responses.push(() => new Response("bad", { status: 400 }));
		await expect(evaluateGuardRules("email_1", "user_1")).resolves.toEqual({
			shouldBlock: false,
			action: "allow",
		});
		expect(requests).toHaveLength(2);
	});

	it("retries 429 and 529 before answering", async () => {
		rules = [buildRule({ id: "rule_ai" })];
		responses.push(
			() =>
				new Response(null, { status: 429, headers: { "retry-after": "0" } }),
			() =>
				new Response(null, { status: 529, headers: { "retry-after": "0" } }),
			() => jevResponse({ rule_0: 0.75 }),
		);

		await expect(
			checkRuleMatch("rule_ai", "email_1", "user_1"),
		).resolves.toMatchObject({
			matched: true,
		});
		expect(requests).toHaveLength(3);
	});

	it("gives up after three attempts on repeated server errors", async () => {
		rules = [buildRule({ id: "rule_ai" })];
		for (let i = 0; i < 3; i++) {
			responses.push(
				() =>
					new Response(null, { status: 503, headers: { "retry-after": "0" } }),
			);
		}

		await expect(evaluateGuardRules("email_1", "user_1")).resolves.toEqual({
			shouldBlock: false,
			action: "allow",
		});
		expect(requests).toHaveLength(3);
	});
});
