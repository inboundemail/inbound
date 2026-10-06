import { afterEach, describe, expect, it, mock, spyOn } from "bun:test";
import {
	InboundApiClient,
	SmtpRelayError,
	smtpFailureForApiStatus,
} from "./api-client.ts";
import { loadConfig } from "./config.ts";

const identity = {
	credentialId: "credential-id",
	userId: "user-id",
	loginAddress: "sender@example.com",
	type: "smtp" as const,
	accessMode: "read_write" as const,
	sendingMode: "identity" as const,
	sendingName: null,
	sendingAddress: "sender@example.com",
	allowedDomains: [],
};

function client(overrides: Partial<ReturnType<typeof loadConfig>> = {}) {
	return new InboundApiClient({
		...loadConfig(),
		apiBaseUrl: "https://example.com/api/e2",
		...overrides,
	});
}

const timedOutFetch = Object.assign(
	(
		_input: Parameters<typeof fetch>[0],
		options?: Parameters<typeof fetch>[1],
	) => {
		return new Promise<Response>((_resolve, reject) => {
			options?.signal?.addEventListener("abort", () => {
				reject(options.signal?.reason);
			});
		});
	},
	{ preconnect: globalThis.fetch.preconnect },
);

afterEach(() => mock.restore());

describe("smtpFailureForApiStatus", () => {
	it("maps authorization, size, rate-limit, validation, and upstream errors", () => {
		expect(smtpFailureForApiStatus(401, null).responseCode).toBe(550);
		expect(smtpFailureForApiStatus(403, "denied").message).toContain("denied");
		expect(smtpFailureForApiStatus(413, null).responseCode).toBe(552);
		expect(smtpFailureForApiStatus(429, null).responseCode).toBe(451);
		expect(smtpFailureForApiStatus(422, "invalid").message).toContain(
			"invalid",
		);
		expect(smtpFailureForApiStatus(500, null).responseCode).toBe(451);
		expect(smtpFailureForApiStatus(409, "in progress").responseCode).toBe(451);
	});

	it("keeps upstream messages on a single bounded SMTP reply line", () => {
		const { message } = smtpFailureForApiStatus(
			422,
			`Bad\r\n250 2.0.0 OK${"x".repeat(500)}`,
		);
		expect(message).not.toMatch(/[\r\n]/);
		expect(message.length).toBeLessThan(250);
	});
});

describe("InboundApiClient.authenticateSmtp", () => {
	it("posts managed credentials with an independent timeout signal", async () => {
		const fetchMock = spyOn(globalThis, "fetch").mockResolvedValue(
			Response.json(identity),
		);

		expect(
			await client().authenticateSmtp("sender@example.com", "secret", "203.0.113.7"),
		).toEqual(identity);
		const [url, options] = fetchMock.mock.calls[0] ?? [];
		expect(url).toBe("https://example.com/api/e2/mailboxes/authenticate-smtp");
		expect(options?.method).toBe("POST");
		expect(options?.body).toBe(
			JSON.stringify({
				loginAddress: "sender@example.com",
				password: "secret",
			}),
		);
		expect(options?.signal).toBeInstanceOf(AbortSignal);
	});

	it("omits the gateway secret header when not configured", async () => {
		const fetchMock = spyOn(globalThis, "fetch").mockResolvedValue(
			Response.json(identity),
		);

		await client({ gatewayAuthSecret: null }).authenticateSmtp(
			"sender@example.com",
			"secret",
			"203.0.113.7",
		);
		const [, options] = fetchMock.mock.calls[0] ?? [];
		expect(
			(options?.headers as Record<string, string>)["x-inbound-gateway-secret"],
		).toBeUndefined();
		expect(
			(options?.headers as Record<string, string>)["x-inbound-client-ip"],
		).toBeUndefined();
	});

	it("sends the shared gateway secret when configured", async () => {
		const fetchMock = spyOn(globalThis, "fetch").mockResolvedValue(
			Response.json(identity),
		);

		await client({ gatewayAuthSecret: "gateway-secret" }).authenticateSmtp(
			"sender@example.com",
			"secret",
			"203.0.113.7",
		);
		const [, options] = fetchMock.mock.calls[0] ?? [];
		expect(
			(options?.headers as Record<string, string>)["x-inbound-gateway-secret"],
		).toBe("gateway-secret");
		expect(
			(options?.headers as Record<string, string>)["x-inbound-client-ip"],
		).toBe("203.0.113.7");
	});

	it("treats unauthorized managed credentials as invalid", async () => {
		spyOn(globalThis, "fetch").mockResolvedValue(
			new Response(null, { status: 401 }),
		);
		expect(
			await client().authenticateSmtp("sender@example.com", "bad", "203.0.113.7"),
		).toBeNull();
	});

	it("treats credentials the API rejects as malformed as invalid", async () => {
		spyOn(globalThis, "fetch").mockResolvedValue(
			new Response(null, { status: 400 }),
		);
		expect(
			await client().authenticateSmtp("sender@example.com", "x".repeat(2000), "203.0.113.7"),
		).toBeNull();
	});

	it("maps authentication backend and gateway-secret failures to RFC 4954 temporary failures", async () => {
		for (const status of [403, 503]) {
			spyOn(globalThis, "fetch").mockResolvedValue(
				new Response(null, { status }),
			);
			await expect(
				client().authenticateSmtp("sender@example.com", "secret", "203.0.113.7"),
			).rejects.toMatchObject({ responseCode: 454 });
		}
	});

	it("aborts authentication requests at their configured timeout", async () => {
		spyOn(globalThis, "fetch").mockImplementation(timedOutFetch);

		await expect(
			client({ authRequestTimeoutMs: 5 }).authenticateSmtp(
				"sender@example.com",
				"secret",
				"203.0.113.7",
			),
		).rejects.toMatchObject({ responseCode: 454 });
	});
});

describe("InboundApiClient.sendEmail", () => {
	const payload = {
		from: "sender@example.com",
		to: [] as string[],
		bcc: ["hidden@example.com"],
		subject: "Private delivery",
	};

	it("sends BCC-only payloads unchanged with authorization and idempotency", async () => {
		const fetchMock = spyOn(globalThis, "fetch").mockResolvedValue(
			Response.json({ id: "message-id" }),
		);

		expect(await client().sendEmail("secret", payload, "smtp-key")).toEqual({
			id: "message-id",
		});
		const [url, options] = fetchMock.mock.calls[0] ?? [];
		expect(url).toBe("https://example.com/api/e2/emails");
		expect(options?.headers).toEqual({
			Authorization: "Bearer secret",
			"Content-Type": "application/json",
			"Idempotency-Key": "smtp-key",
		});
		expect(options?.body).toBe(JSON.stringify(payload));
		expect(options?.signal).toBeInstanceOf(AbortSignal);
	});

	it("includes upstream rejection details in SMTP failures", async () => {
		spyOn(globalThis, "fetch").mockResolvedValue(
			Response.json({ error: "Recipient blocked" }, { status: 422 }),
		);

		await expect(
			client().sendEmail("secret", payload, "key"),
		).rejects.toMatchObject({
			responseCode: 550,
			message: "5.6.0 Message rejected: Recipient blocked",
		});
	});

	it("maps network failures to temporary SMTP failures", async () => {
		spyOn(globalThis, "fetch").mockRejectedValue(
			new Error("network unavailable"),
		);

		const result = client().sendEmail("secret", payload, "key");
		await expect(result).rejects.toBeInstanceOf(SmtpRelayError);
		await expect(result).rejects.toMatchObject({ responseCode: 451 });
	});

	it("aborts send requests independently of authentication requests", async () => {
		spyOn(globalThis, "fetch").mockImplementation(timedOutFetch);

		await expect(
			client({
				authRequestTimeoutMs: 60_000,
				sendRequestTimeoutMs: 5,
			}).sendEmail("secret", payload, "key"),
		).rejects.toMatchObject({ responseCode: 451 });
	});
});

describe("InboundApiClient.sendRawEmail", () => {
	const payload = {
		raw: Buffer.from("From: sender@example.com\r\n\r\nHello").toString(
			"base64",
		),
		recipients: ["recipient@example.com"],
	};

	it("posts the raw message with authorization, idempotency and the gateway secret", async () => {
		const fetchMock = spyOn(globalThis, "fetch").mockResolvedValue(
			Response.json({ id: "message-id" }),
		);

		expect(
			await client({ gatewayAuthSecret: "gateway-secret" }).sendRawEmail(
				"secret",
				payload,
				"smtp-key",
			),
		).toEqual({ id: "message-id" });
		const [url, options] = fetchMock.mock.calls[0] ?? [];
		expect(url).toBe("https://example.com/api/e2/emails/raw");
		expect(options?.headers).toEqual({
			Authorization: "Bearer secret",
			"Content-Type": "application/json",
			"Idempotency-Key": "smtp-key",
			"x-inbound-gateway-secret": "gateway-secret",
		});
		expect(options?.body).toBe(JSON.stringify(payload));
	});

	it("reports an API without raw relay so the caller can fall back", async () => {
		spyOn(globalThis, "fetch").mockResolvedValue(
			new Response("Not Found", { status: 404 }),
		);

		expect(await client().sendRawEmail("secret", payload, "key")).toBeNull();
	});

	it("maps raw relay rejections to SMTP failures", async () => {
		spyOn(globalThis, "fetch").mockResolvedValue(
			Response.json(
				{ error: "Duplicate from header" },
				{ status: 400 },
			),
		);

		await expect(
			client().sendRawEmail("secret", payload, "key"),
		).rejects.toMatchObject({
			responseCode: 550,
			message: "5.6.0 Message rejected: Duplicate from header",
		});
	});
});
