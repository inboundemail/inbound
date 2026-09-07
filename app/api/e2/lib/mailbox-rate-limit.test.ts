import { spawnSync } from "node:child_process";
import { describe, expect, it } from "bun:test";

type MailboxEndpoint = "mailbox" | "smtp";

interface ScenarioRequest {
	endpoint: MailboxEndpoint;
	loginAddress: string;
	headers: Record<string, string>;
}

interface Scenario {
	requests: ScenarioRequest[];
	blockSource?: boolean;
	unavailable?: boolean;
	missingRedis?: boolean;
}

interface ScenarioResult {
	calls: Array<{ prefix: string; identifier: string }>;
	responses: Array<{
		status: number;
		retryAfter: string | null;
		limit: string | null;
		body: { error: string; message?: string; statusCode?: number };
	}>;
}

const scenarioScript = `
import { mock } from "bun:test";

const scenario = JSON.parse(process.env.MAILBOX_RATE_LIMIT_SCENARIO);
const calls = [];

class MockRatelimit {
  constructor(options) {
    this.prefix = options.prefix;
  }

  static slidingWindow() {
    return {};
  }

  async limit(identifier) {
    calls.push({ prefix: this.prefix, identifier });
    if (scenario.unavailable) throw new Error("Redis unavailable");

    const sourceLimiter = this.prefix.endsWith(":ip");
    const blocked = scenario.blockSource ? sourceLimiter : !sourceLimiter;
    return {
      success: !blocked,
      limit: sourceLimiter ? 3000 : 60,
      remaining: blocked ? 0 : sourceLimiter ? 2999 : 59,
      reset: Date.now() + 60000,
      pending: Promise.resolve(),
    };
  }
}

mock.module("@upstash/ratelimit", () => ({ Ratelimit: MockRatelimit }));

const { Elysia } = await import("elysia");
const { AuthError } = await import("./app/api/e2/lib/auth");
const { authenticateMailbox } = await import("./app/api/e2/mailboxes/authenticate");
const { authenticateSmtp } = await import("./app/api/e2/mailboxes/authenticate-smtp");
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
      body: JSON.stringify({ loginAddress: entry.loginAddress, password: "password" }),
    }),
  );
  responses.push({
    status: response.status,
    retryAfter: response.headers.get("Retry-After"),
    limit: response.headers.get("X-RateLimit-Limit"),
    body: await response.json(),
  });
}

console.log("MAILBOX_RATE_LIMIT_RESULT:" + JSON.stringify({ calls, responses }));
process.exit(0);
`;

function runScenario(scenario: Scenario): ScenarioResult {
	const result = spawnSync(process.execPath, ["-e", scenarioScript], {
		cwd: process.cwd(),
		encoding: "utf8",
		env: {
			...process.env,
			UPSTASH_REDIS_REST_URL: scenario.missingRedis
				? ""
				: "https://example.upstash.io",
			UPSTASH_REDIS_REST_TOKEN: scenario.missingRedis ? "" : "test-token",
			ALLOW_REQUESTS_WITHOUT_RATE_LIMIT: "false",
			MAILBOX_RATE_LIMIT_SCENARIO: JSON.stringify(scenario),
		},
		timeout: 10_000,
	});

	if (result.status !== 0) {
		throw new Error(result.stderr || result.stdout || "Scenario execution failed");
	}

	const output = result.stdout
		.split("\n")
		.find((line) => line.startsWith("MAILBOX_RATE_LIMIT_RESULT:"));
	if (!output) throw new Error("Scenario did not return rate limit results");

	return JSON.parse(output.slice("MAILBOX_RATE_LIMIT_RESULT:".length));
}

describe("mailbox authentication rate limiting", () => {
	it("isolates the same mailbox login across different trusted source IPs", () => {
		const result = runScenario({
			requests: [
				{
					endpoint: "mailbox",
					loginAddress: "User@Example.com",
					headers: { "x-real-ip": "203.0.113.10" },
				},
				{
					endpoint: "mailbox",
					loginAddress: "user@example.com",
					headers: { "x-real-ip": "203.0.113.20" },
				},
			],
		});

		const loginKeys = result.calls
			.filter(({ prefix }) => prefix === "e2:mailbox-auth:login")
			.map(({ identifier }) => identifier);
		expect(loginKeys).toEqual([
			"203.0.113.10:user@example.com",
			"203.0.113.20:user@example.com",
		]);
		expect(result.responses.map(({ status }) => status)).toEqual([429, 429]);
	});

	it("shares a source-plus-login budget across mailbox and SMTP authentication", () => {
		const result = runScenario({
			requests: [
				{
					endpoint: "mailbox",
					loginAddress: " USER@Example.COM ",
					headers: {
						"x-real-ip": "203.0.113.30",
						"x-forwarded-for": "198.51.100.10, 10.0.0.1",
					},
				},
				{
					endpoint: "smtp",
					loginAddress: "user@example.com",
					headers: {
						"x-real-ip": "203.0.113.30",
						"x-forwarded-for": "198.51.100.20, 10.0.0.1",
					},
				},
			],
		});

		expect(result.calls).toEqual([
			{
				prefix: "e2:mailbox-auth:login",
				identifier: "203.0.113.30:user@example.com",
			},
			{ prefix: "e2:mailbox-auth:ip", identifier: "203.0.113.30" },
			{
				prefix: "e2:mailbox-auth:login",
				identifier: "203.0.113.30:user@example.com",
			},
			{ prefix: "e2:mailbox-auth:ip", identifier: "203.0.113.30" },
		]);
		for (const response of result.responses) {
			expect(response.status).toBe(429);
			expect(response.retryAfter).toBe("60");
			expect(response.limit).toBe("60");
			expect(response.body).toEqual({
				error: "Too Many Requests",
				message: "Too many authentication attempts. Please try again later.",
				statusCode: 429,
			});
		}
	});

	it("ignores forged real IPs when Cloudflare supplies the client address", () => {
		const result = runScenario({
			requests: [
				{
					endpoint: "mailbox",
					loginAddress: "user@example.com",
					headers: {
						"cf-connecting-ip": "203.0.113.50",
						"x-real-ip": "198.51.100.30",
						"x-forwarded-for": "198.51.100.31, 10.0.0.1",
					},
				},
				{
					endpoint: "smtp",
					loginAddress: "user@example.com",
					headers: {
						"cf-connecting-ip": "203.0.113.50",
						"x-real-ip": "198.51.100.40",
						"x-forwarded-for": "198.51.100.41, 10.0.0.1",
					},
				},
			],
		});

		expect(result.calls.map(({ identifier }) => identifier)).toEqual([
			"203.0.113.50:user@example.com",
			"203.0.113.50",
			"203.0.113.50:user@example.com",
			"203.0.113.50",
		]);
	});

	it("ignores forged Cloudflare and real IP headers when Vercel supplies the client address", () => {
		const result = runScenario({
			requests: [
				{
					endpoint: "mailbox",
					loginAddress: "user@example.com",
					headers: {
						"x-vercel-forwarded-for": "203.0.113.51, 10.0.0.1",
						"cf-connecting-ip": "198.51.100.50",
						"x-real-ip": "198.51.100.51",
						"x-forwarded-for": "198.51.100.52, 10.0.0.2",
					},
				},
				{
					endpoint: "smtp",
					loginAddress: "user@example.com",
					headers: {
						"x-vercel-forwarded-for": "203.0.113.51, 10.0.0.3",
						"cf-connecting-ip": "198.51.100.60",
						"x-real-ip": "198.51.100.61",
						"x-forwarded-for": "198.51.100.62, 10.0.0.4",
					},
				},
			],
		});

		expect(result.calls.map(({ identifier }) => identifier)).toEqual([
			"203.0.113.51:user@example.com",
			"203.0.113.51",
			"203.0.113.51:user@example.com",
			"203.0.113.51",
		]);
	});

	it("retains forwarded client addresses when trusted platform headers are absent", () => {
		const result = runScenario({
			requests: [
				{
					endpoint: "smtp",
					loginAddress: "user@example.com",
					headers: { "x-forwarded-for": "203.0.113.55, 10.0.0.1" },
				},
			],
		});

		expect(result.calls[0].identifier).toBe(
			"203.0.113.55:user@example.com",
		);
		expect(result.calls[1].identifier).toBe("203.0.113.55");
	});

	it("preserves the aggregate source budget across different logins and routes", () => {
		const result = runScenario({
			blockSource: true,
			requests: [
				{
					endpoint: "mailbox",
					loginAddress: "first@example.com",
					headers: { "x-real-ip": "203.0.113.60" },
				},
				{
					endpoint: "smtp",
					loginAddress: "second@example.com",
					headers: { "x-real-ip": "203.0.113.60" },
				},
			],
		});

		expect(
			result.calls
				.filter(({ prefix }) => prefix === "e2:mailbox-auth:ip")
				.map(({ identifier }) => identifier),
		).toEqual(["203.0.113.60", "203.0.113.60"]);
		for (const response of result.responses) {
			expect(response.status).toBe(429);
			expect(response.limit).toBe("3000");
			expect(response.retryAfter).toBe("60");
		}
	});

	it("fails closed with Retry-After when the distributed limiter fails", () => {
		const result = runScenario({
			unavailable: true,
			requests: [
				{
					endpoint: "mailbox",
					loginAddress: "user@example.com",
					headers: { "x-real-ip": "203.0.113.70" },
				},
			],
		});

		expect(result.responses).toEqual([
			{
				status: 503,
				retryAfter: "60",
				limit: null,
				body: {
					error: "Service Unavailable",
					message:
						"Rate limiting service is temporarily unavailable. Please try again later.",
					statusCode: 503,
				},
			},
		]);
	});

	it("fails closed when Redis is not configured", () => {
		const result = runScenario({
			missingRedis: true,
			requests: [
				{
					endpoint: "smtp",
					loginAddress: "user@example.com",
					headers: { "x-real-ip": "203.0.113.80" },
				},
			],
		});

		expect(result.calls).toEqual([]);
		expect(result.responses[0].status).toBe(503);
		expect(result.responses[0].retryAfter).toBe("60");
	});
});
