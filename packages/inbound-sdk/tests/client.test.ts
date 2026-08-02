import { describe, expect, it } from "bun:test";
import { APIError, APIPromise, Inbound, Resend } from "../src/index.js";

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
	return new Response(JSON.stringify(body), {
		status: init.status ?? 200,
		headers: {
			"Content-Type": "application/json",
			...init.headers,
		},
	});
}

describe("Inbound", () => {
	it("generates resource requests from the E2 contract", async () => {
		let requestUrl = "";
		let requestInit: RequestInit | undefined;
		const client = new Inbound({
			apiKey: "test-key",
			baseURL: "https://example.test",
			fetch: async (input, init) => {
				requestUrl = String(input);
				requestInit = init;
				return jsonResponse(
					{ id: "email_123", message_id: "message_123" },
					{ headers: { "X-Request-ID": "request_123" } },
				);
			},
		});

		const responsePromise = client.emails.send({
			from: "sender@example.com",
			to: "recipient@example.com",
			subject: "Hello",
			html: "<p>Hello</p>",
		});

		expect(responsePromise).toBeInstanceOf(APIPromise);
		const { data, response } = await responsePromise.withResponse();
		expect(data.id).toBe("email_123");
		expect(response.headers.get("x-request-id")).toBe("request_123");
		expect(requestUrl).toBe("https://example.test/api/e2/emails");
		expect(requestInit?.method).toBe("POST");
		expect(new Headers(requestInit?.headers).get("authorization")).toBe(
			"Bearer test-key",
		);
		expect(JSON.parse(String(requestInit?.body))).toEqual({
			from: "sender@example.com",
			to: "recipient@example.com",
			subject: "Hello",
			html: "<p>Hello</p>",
		});
	});

	it("serializes query parameters and path parameters", async () => {
		let requestUrl = "";
		const client = new Inbound({
			apiKey: "test-key",
			baseURL: "https://example.test",
			fetch: async (input) => {
				requestUrl = String(input);
				return jsonResponse({ data: [], pagination: {} });
			},
		});

		await client.domains.list({ limit: "25", status: "verified" });
		expect(requestUrl).toBe(
			"https://example.test/api/e2/domains?limit=25&status=verified",
		);

		await client.domains.retrieve("domain/with slash");
		expect(requestUrl).toBe(
			"https://example.test/api/e2/domains/domain%2Fwith%20slash",
		);
	});

	it("unblocks an email through the blocklist resource", async () => {
		let requestUrl = "";
		let requestInit: RequestInit | undefined;
		const client = new Inbound({
			apiKey: "test-key",
			baseURL: "https://example.test",
			fetch: async (input, init) => {
				requestUrl = String(input);
				requestInit = init;
				return jsonResponse({
					message: "Email address unblocked successfully",
					emailAddress: "recipient@example.com",
					domain: "sender.example",
				});
			},
		});

		await client.blocklist.unblock({
			emailAddress: "recipient@example.com",
		});

		expect(requestUrl).toBe("https://example.test/api/e2/blocklist/unblock");
		expect(requestInit?.method).toBe("POST");
		expect(JSON.parse(String(requestInit?.body))).toEqual({
			emailAddress: "recipient@example.com",
		});
	});

	it("throws typed API errors for the native client", async () => {
		const client = new Inbound({
			apiKey: "bad-key",
			baseURL: "https://example.test",
			maxRetries: 0,
			fetch: async () =>
				jsonResponse(
					{ error: "Unauthorized", message: "Invalid API key" },
					{ status: 401 },
				),
		});

		try {
			await client.domains.list();
			throw new Error("Expected request to fail");
		} catch (error) {
			expect(error).toBeInstanceOf(APIError);
			expect((error as APIError).status).toBe(401);
			expect((error as APIError).message).toBe("Invalid API key");
		}
	});

	it("exposes every generated resource", () => {
		const client = new Inbound({
			apiKey: "test-key",
			fetch: async () => jsonResponse({}),
		});
		expect(Object.keys(client).sort()).toEqual(
			expect.arrayContaining([
				"attachments",
				"blocklist",
				"domains",
				"emailAddresses",
				"emails",
				"endpoints",
				"guard",
				"mail",
				"onboarding",
			]),
		);
	});
});

describe("Resend compatibility", () => {
	it("matches Resend send payload and response semantics", async () => {
		let requestInit: RequestInit | undefined;
		const resend = new Resend("inbound-key", {
			baseUrl: "https://example.test",
			fetch: async (_input, init) => {
				requestInit = init;
				return jsonResponse(
					{ id: "email_123", message_id: "message_123" },
					{ headers: { "X-Request-ID": "request_123" } },
				);
			},
		});

		const result = await resend.emails.send(
			{
				from: "sender@example.com",
				to: "recipient@example.com",
				subject: "Hello",
				html: "<p>Hello</p>",
				replyTo: "reply@example.com",
				scheduledAt: "2026-07-13T15:00:00Z",
				attachments: [
					{
						content: new Uint8Array([104, 105]),
						filename: "hello.txt",
						contentType: "text/plain",
						contentId: "hello",
					},
				],
			},
			{ idempotencyKey: "send-once" },
		);

		expect(result).toEqual({
			data: { id: "email_123" },
			error: null,
			headers: expect.objectContaining({ "x-request-id": "request_123" }),
		});
		expect(new Headers(requestInit?.headers).get("idempotency-key")).toBe(
			"send-once",
		);
		expect(JSON.parse(String(requestInit?.body))).toEqual({
			from: "sender@example.com",
			to: "recipient@example.com",
			subject: "Hello",
			html: "<p>Hello</p>",
			reply_to: "reply@example.com",
			scheduled_at: "2026-07-13T15:00:00Z",
			attachments: [
				{
					content: "aGk=",
					filename: "hello.txt",
					content_type: "text/plain",
					content_id: "hello",
				},
			],
		});
	});

	it("returns Resend-shaped errors instead of throwing", async () => {
		const resend = new Resend("bad-key", {
			baseUrl: "https://example.test",
			fetch: async () =>
				jsonResponse(
					{ error: "Unauthorized", message: "Invalid API key" },
					{ status: 401, headers: { "X-Request-ID": "request_401" } },
				),
		});

		const result = await resend.emails.send({
			from: "sender@example.com",
			to: "recipient@example.com",
			subject: "Hello",
			text: "Hello",
		});

		expect(result.data).toBeNull();
		expect(result.error).toEqual({
			message: "Invalid API key",
			statusCode: 401,
			name: "invalid_api_key",
		});
		expect(result.headers?.["x-request-id"]).toBe("request_401");
	});
});
