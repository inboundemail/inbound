import { describe, expect, it } from "bun:test";
import { spawnSync } from "node:child_process";

type MailboxEndpoint = "mailbox" | "smtp";

interface ScenarioRequest {
	endpoint: MailboxEndpoint;
	headers: Record<string, string>;
}

interface Scenario {
	secret: string;
	blocked?: boolean;
	requests: ScenarioRequest[];
}

interface ScenarioResult {
	responses: Array<{
		status: number;
		body: { error: string; message?: string; statusCode?: number };
	}>;
}

const scenarioScript = `
import { mock, spyOn } from "bun:test";

const scenario = JSON.parse(process.env.MAILBOX_GATEWAY_SCENARIO);

class MockRatelimit {
  constructor(options) {
    this.prefix = options.prefix;
  }

  static slidingWindow() {
    return {};
  }

  async limit() {
    return {
      success: !scenario.blocked,
      limit: 60,
      remaining: scenario.blocked ? 0 : 59,
      reset: Date.now() + 60000,
      pending: Promise.resolve(),
    };
  }
}

mock.module("@upstash/ratelimit", () => ({ Ratelimit: MockRatelimit }));

const { Elysia } = await import("elysia");
const { AuthError } = await import("./app/api/e2/lib/auth");
const { auth } = await import("./lib/auth/auth");
const { authenticateMailbox } = await import("./app/api/e2/mailboxes/authenticate");
const { authenticateSmtp } = await import("./app/api/e2/mailboxes/authenticate-smtp");

spyOn(auth.api, "verifyApiKey").mockResolvedValue({
  valid: false,
  error: { message: "Invalid API key" },
  key: null,
});

const app = new Elysia()
  .onError(({ error }) => {
    if (error instanceof AuthError) return error.response;
  })
  .use(authenticateMailbox)
  .use(authenticateSmtp);
const responses = [];

for (const entry of scenario.requests) {
  const smtp = entry.endpoint === "smtp";
  const path = smtp ? "/mailboxes/authenticate-smtp" : "/mailboxes/authenticate";
  const response = await app.handle(
    new Request("http://localhost" + path, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...entry.headers },
      body: JSON.stringify({ loginAddress: "user@example.com", password: "password" }),
    }),
  );
  responses.push({ status: response.status, body: await response.json() });
}

console.log("MAILBOX_GATEWAY_RESULT:" + JSON.stringify({ responses }));
process.exit(0);
`;

function runScenario(scenario: Scenario): ScenarioResult {
	const result = spawnSync(process.execPath, ["-e", scenarioScript], {
		cwd: process.cwd(),
		encoding: "utf8",
		env: {
			...process.env,
			UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
			UPSTASH_REDIS_REST_TOKEN: "test-token",
			ALLOW_REQUESTS_WITHOUT_RATE_LIMIT: "false",
			MAILBOX_GATEWAY_AUTH_SECRET: scenario.secret,
			MAILBOX_GATEWAY_SCENARIO: JSON.stringify(scenario),
		},
		timeout: 10_000,
	});

	if (result.status !== 0) {
		throw new Error(
			result.stderr || result.stdout || "Scenario execution failed",
		);
	}

	const output = result.stdout
		.split("\n")
		.find((line) => line.startsWith("MAILBOX_GATEWAY_RESULT:"));
	if (!output) throw new Error("Scenario did not return gateway results");

	return JSON.parse(output.slice("MAILBOX_GATEWAY_RESULT:".length));
}

describe("mailbox gateway authorization", () => {
	it("rejects authentication without the gateway secret on both endpoints", () => {
		const result = runScenario({
			secret: "test-gateway-secret",
			requests: [
				{ endpoint: "mailbox", headers: {} },
				{ endpoint: "smtp", headers: {} },
			],
		});

		for (const response of result.responses) {
			expect(response.status).toBe(403);
			expect(response.body).toEqual({
				error: "Forbidden",
				message: "Gateway authorization required.",
				statusCode: 403,
			});
		}
	});

	it("rejects an incorrect gateway secret", () => {
		const result = runScenario({
			secret: "test-gateway-secret",
			requests: [
				{
					endpoint: "mailbox",
					headers: { "x-inbound-gateway-secret": "wrong-secret" },
				},
				{
					endpoint: "smtp",
					headers: { "x-inbound-gateway-secret": "wrong-secret" },
				},
			],
		});

		expect(result.responses.map(({ status }) => status)).toEqual([403, 403]);
	});

	it("proceeds to credential verification with the correct gateway secret", () => {
		const result = runScenario({
			secret: "test-gateway-secret",
			requests: [
				{
					endpoint: "mailbox",
					headers: { "x-inbound-gateway-secret": "test-gateway-secret" },
				},
				{
					endpoint: "smtp",
					headers: { "x-inbound-gateway-secret": "test-gateway-secret" },
				},
			],
		});

		expect(result.responses).toEqual([
			{ status: 401, body: { error: "Invalid mailbox credentials" } },
			{ status: 401, body: { error: "Invalid mail credentials" } },
		]);
	});

	it("skips enforcement when no gateway secret is configured", () => {
		const result = runScenario({
			secret: "",
			requests: [
				{ endpoint: "mailbox", headers: {} },
				{ endpoint: "smtp", headers: {} },
			],
		});

		expect(result.responses).toEqual([
			{ status: 401, body: { error: "Invalid mailbox credentials" } },
			{ status: 401, body: { error: "Invalid mail credentials" } },
		]);
	});

	it("rate limits gateway secret probing before checking the secret", () => {
		const result = runScenario({
			secret: "test-gateway-secret",
			blocked: true,
			requests: [
				{
					endpoint: "mailbox",
					headers: { "x-inbound-gateway-secret": "wrong-secret" },
				},
			],
		});

		expect(result.responses[0].status).toBe(429);
		expect(result.responses[0].body.error).toBe("Too Many Requests");
	});
});
