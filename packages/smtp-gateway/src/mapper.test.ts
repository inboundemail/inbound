import { describe, expect, it } from "bun:test";
import { SmtpRelayError } from "./api-client.ts";
import { idempotencyKeyFor, mapRawMessage } from "./mapper.ts";

function message(headers: string[], body = "Hello"): Buffer {
	return Buffer.from([...headers, "", body].join("\r\n"));
}

describe("mapRawMessage", () => {
	it("limits visible recipients to accepted envelope recipients", async () => {
		const mapped = await mapRawMessage(
			message([
				"From: Sender <sender@example.com>",
				"To: Allowed Person <ALLOWED@example.com>, Intruder <intruder@example.com>",
				"Cc: Other Person <other@example.com>, Extra <extra@example.com>",
				"Subject: Envelope authority",
			]),
			{
				mailFrom: "sender@example.com",
				rcptTo: [
					"allowed@example.com",
					"OTHER@example.com",
					"hidden@example.com",
				],
			},
		);

		expect(mapped.fromAddress).toBe("sender@example.com");
		expect(mapped.payload.to).toEqual(["Allowed Person <ALLOWED@example.com>"]);
		expect(mapped.payload.cc).toEqual(["Other Person <other@example.com>"]);
		expect(mapped.payload.bcc).toEqual(["hidden@example.com"]);
		expect(JSON.stringify(mapped.payload)).not.toContain(
			"intruder@example.com",
		);
		expect(JSON.stringify(mapped.payload)).not.toContain("extra@example.com");
	});

	it("deduplicates recipients case-insensitively while preserving names and visibility", async () => {
		const mapped = await mapRawMessage(
			message([
				"From: sender@example.com",
				"To: Primary Name <primary@example.com>, Duplicate <PRIMARY@example.com>",
				"Cc: Wrong Visibility <primary@example.com>, Copy Name <copy@example.com>",
			]),
			{
				mailFrom: "sender@example.com",
				rcptTo: [
					"PRIMARY@example.com",
					"primary@example.com",
					"COPY@example.com",
					"Hidden@example.com",
					"hidden@example.com",
				],
			},
		);

		expect(mapped.payload.to).toEqual(["Primary Name <primary@example.com>"]);
		expect(mapped.payload.cc).toEqual(["Copy Name <copy@example.com>"]);
		expect(mapped.payload.bcc).toEqual(["Hidden@example.com"]);
	});

	it("keeps BCC-only recipients hidden", async () => {
		const mapped = await mapRawMessage(
			message([
				"From: sender@example.com",
				"To: undisclosed-recipients:;",
				"Bcc: Hidden Name <hidden@example.com>",
			]),
			{
				mailFrom: "sender@example.com",
				rcptTo: ["hidden@example.com"],
			},
		);

		expect(mapped.payload.to).toEqual([]);
		expect(mapped.payload.bcc).toEqual(["hidden@example.com"]);
		expect(mapped.payload.cc).toBeUndefined();
	});

	it("supports CC-only messages without converting recipients to To", async () => {
		const mapped = await mapRawMessage(
			message(["From: sender@example.com", "Cc: Copy Name <copy@example.com>"]),
			{
				mailFrom: "sender@example.com",
				rcptTo: ["copy@example.com"],
			},
		);

		expect(mapped.payload.to).toEqual([]);
		expect(mapped.payload.cc).toEqual(["Copy Name <copy@example.com>"]);
		expect(mapped.payload.bcc).toBeUndefined();
	});

	it("classifies accepted recipients as BCC when visible headers were not accepted", async () => {
		const mapped = await mapRawMessage(
			message([
				"From: sender@example.com",
				"To: rejected@example.com",
				"Cc: also-rejected@example.com",
			]),
			{
				mailFrom: "sender@example.com",
				rcptTo: ["actual@example.com"],
			},
		);

		expect(mapped.payload.to).toEqual([]);
		expect(mapped.payload.cc).toBeUndefined();
		expect(mapped.payload.bcc).toEqual(["actual@example.com"]);
	});

	it("rejects messages without accepted envelope recipients", async () => {
		const result = mapRawMessage(
			message(["From: sender@example.com", "To: header@example.com"]),
			{ mailFrom: "sender@example.com", rcptTo: [] },
		);

		await expect(result).rejects.toBeInstanceOf(SmtpRelayError);
		await expect(result).rejects.toMatchObject({ responseCode: 550 });
	});

	it("rejects messages without a header or envelope sender", async () => {
		await expect(
			mapRawMessage(message(["To: recipient@example.com"]), {
				mailFrom: null,
				rcptTo: ["recipient@example.com"],
			}),
		).rejects.toMatchObject({ responseCode: 550 });
	});

	it("retains reply-to and permitted custom headers", async () => {
		const mapped = await mapRawMessage(
			message([
				"From: sender@example.com",
				"To: recipient@example.com",
				"Reply-To: Reply Name <reply@example.com>",
				"X-Custom: custom value",
				"In-Reply-To: <parent@example.com>",
			]),
			{
				mailFrom: "sender@example.com",
				rcptTo: ["recipient@example.com"],
			},
		);

		expect(mapped.payload.reply_to).toEqual(["Reply Name <reply@example.com>"]);
		expect(mapped.payload.headers).toMatchObject({
			"x-custom": "custom value",
			"in-reply-to": "<parent@example.com>",
		});
	});
});

describe("idempotencyKeyFor", () => {
	const raw = message(["From: sender@example.com", "To: one@example.com"]);

	it("uses the complete stable credential identity instead of a shared prefix", () => {
		const envelope = {
			mailFrom: "sender@example.com",
			rcptTo: ["one@example.com"],
		};

		expect(
			idempotencyKeyFor(raw, "same-prefix-different-one", envelope),
		).not.toBe(idempotencyKeyFor(raw, "same-prefix-different-two", envelope));
	});

	it("normalizes sender case and recipient ordering, casing, and duplicates", () => {
		expect(
			idempotencyKeyFor(raw, "credential", {
				mailFrom: " Sender@Example.com ",
				rcptTo: ["TWO@example.com", "one@example.com", "ONE@example.com"],
			}),
		).toBe(
			idempotencyKeyFor(raw, "credential", {
				mailFrom: "sender@example.com",
				rcptTo: ["one@example.com", "two@example.com"],
			}),
		);
	});

	it("changes when the accepted sender, recipients, or message changes", () => {
		const envelope = {
			mailFrom: "sender@example.com",
			rcptTo: ["one@example.com"],
		};
		const baseline = idempotencyKeyFor(raw, "credential", envelope);

		expect(
			idempotencyKeyFor(raw, "credential", {
				...envelope,
				mailFrom: "other@example.com",
			}),
		).not.toBe(baseline);
		expect(
			idempotencyKeyFor(raw, "credential", {
				...envelope,
				rcptTo: ["other@example.com"],
			}),
		).not.toBe(baseline);
		expect(
			idempotencyKeyFor(Buffer.from("different"), "credential", envelope),
		).not.toBe(baseline);
	});
});
