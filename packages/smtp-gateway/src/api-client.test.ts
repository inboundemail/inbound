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
	});
});

describe("InboundApiClient.authenticateSmtp", () => {
	it("posts managed credentials with an independent timeout signal", async () => {
		const fetchMock = spyOn(globalThis, "fetch").mockResolvedValue(
			Response.json(identity),
		);

		expect(
			await client().authenticateSmtp("sender@example.com", "secret"),
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

	it("treats unauthorized managed credentials as invalid", async () => {
		spyOn(globalThis, "fetch").mockResolvedValue(
			new Response(null, { status: 401 }),
		);
		expect(
			await client().authenticateSmtp("sender@example.com", "bad"),
		).toBeNull();
	});

	it("maps authentication backend failures to temporary SMTP failures", async () => {
		spyOn(globalThis, "fetch").mockResolvedValue(
			new Response(null, { status: 503 }),
		);

		await expect(
			client().authenticateSmtp("sender@example.com", "secret"),
		).rejects.toMatchObject({ responseCode: 451 });
	});

	it("aborts authentication requests at their configured timeout", async () => {
		spyOn(globalThis, "fetch").mockImplementation(timedOutFetch);

		await expect(
			client({ authRequestTimeoutMs: 5 }).authenticateSmtp(
				"sender@example.com",
				"secret",
			),
		).rejects.toMatchObject({ responseCode: 451 });
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
