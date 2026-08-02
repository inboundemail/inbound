import { describe, expect, it } from "bun:test";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/mail/send/route";

describe("mail send proxy", () => {
	it("rejects malformed input without calling the upstream API", async () => {
		const response = await POST(new NextRequest("http://localhost:3010/api/mail/send", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ to: "not-an-array" }),
		}));

		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({
			error: "From, recipient, subject, and message are required",
		});
	});

	it("returns an authentication error before proxying a valid message", async () => {
		process.env.INBOUND_MAIL_SESSION_SECRET = "test-session-secret-with-at-least-32-characters";
		const response = await POST(new NextRequest("http://localhost:3010/api/mail/send", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				from: "ryan@inbound.new",
				to: ["team@example.com"],
				cc: [],
				bcc: [],
				subject: "Hello",
				html: "<p>Hello</p>",
				text: "Hello",
			}),
		}));

		expect(response.status).toBe(401);
		expect(await response.json()).toEqual({ error: "Not authenticated" });
	});
});
