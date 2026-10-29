import { describe, expect, it } from "bun:test";
import { SmtpRelayError } from "./api-client.ts";
import {
	countMimeParts,
	idempotencyKeyFor,
	mapRawMessage,
	mapRawMessageInWorker,
} from "./mapper.ts";

function message(headers: string[], body = "Hello"): Buffer {
	return Buffer.from([...headers, "", body].join("\r\n"));
}

const envelope = {
	mailFrom: "sender@example.com",
	rcptTo: ["recipient@example.com"],
};

function base64Lines(bytes: number): string {
	return Buffer.alloc(bytes, 7).toString("base64").replace(/.{76}/g, "$&\r\n");
}

// HTML with `references` cid: links to one inline image of `imageBytes`.
function inlineImageMessage(references: number, imageBytes: number): Buffer {
	return message(
		[
			"From: sender@example.com",
			"To: recipient@example.com",
			"Subject: Inline",
			'Content-Type: multipart/related; boundary="rel"',
		],
		[
			"--rel",
			"Content-Type: text/html; charset=utf-8",
			"",
			`<p>Logo</p>${'<img src="cid:logo@example.com">'.repeat(references)}`,
			"--rel",
			'Content-Type: image/png; name="logo.png"',
			"Content-ID: <logo@example.com>",
			"Content-Disposition: inline; filename=logo.png",
			"Content-Transfer-Encoding: base64",
			"",
			base64Lines(imageBytes),
			"--rel--",
			"",
		].join("\r\n"),
	);
}

// A large message whose parse takes hundreds of milliseconds.
function slowMessage(): Buffer {
	return message(
		[
			"From: sender@example.com",
			"To: recipient@example.com",
			'Content-Type: multipart/mixed; boundary="mix"',
		],
		[
			"--mix",
			"Content-Type: text/html",
			"",
			"<p>hello</p>\n".repeat(60_000),
			"--mix",
			"Content-Type: application/octet-stream",
			"Content-Transfer-Encoding: base64",
			"",
			base64Lines(1_500_000),
			"--mix--",
		].join("\r\n"),
	);
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
		expect(mapped.relayRaw).toBe(false);
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

	it("passes the original Message-ID as message_id, never as a custom header", async () => {
		const mapped = await mapRawMessage(
			message([
				"From: sender@example.com",
				"To: recipient@example.com",
				"Message-ID: <ABC.123@client.example.com>",
				"Subject: Sent copy",
			]),
			envelope,
		);

		expect(mapped.payload.message_id).toBe("<ABC.123@client.example.com>");
		expect(JSON.stringify(mapped.payload.headers ?? {})).not.toMatch(
			/message-id/i,
		);
	});

	it("drops malformed or missing Message-IDs so the API generates one", async () => {
		for (const header of [
			"Message-ID: <x@y> <z@w>",
			"Message-ID: <weird id@example.com>",
			"Message-ID: =?utf-8?Q?a=0D=0AX-Evil=3A_1?=@example.com",
			`Message-ID: <${"a".repeat(500)}@example.com>`,
			null,
		]) {
			const mapped = await mapRawMessage(
				message([
					"From: sender@example.com",
					"To: recipient@example.com",
					...(header ? [header] : []),
				]),
				envelope,
			);
			expect(mapped.payload.message_id).toBeUndefined();
		}
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

	it("keeps decoded header values from injecting headers or redirecting recipients", async () => {
		const mapped = await mapRawMessage(
			message([
				"From: =?UTF-8?Q?Evil=0D=0ABcc=3A_leak@example.com?= <sender@example.com>",
				'To: "Name <attacker@example.net>" <to@example.com>, "Doe, John" <cc@example.com>',
				"Subject: =?UTF-8?Q?Hi=0D=0AContent-Type=3A_text/html?=",
				"X-Custom: value",
				"X-SES-CONFIGURATION-SET: other-tenant",
			]),
			{
				mailFrom: "sender@example.com",
				rcptTo: ["to@example.com", "cc@example.com"],
			},
		);

		expect(mapped.payload.from).toBe(
			'"Evil Bcc: leak@example.com" <sender@example.com>',
		);
		expect(mapped.payload.to).toEqual([
			'"Name  attacker@example.net" <to@example.com>',
			'"Doe, John" <cc@example.com>',
		]);
		expect(mapped.payload.subject).toBe("Hi Content-Type: text/html");
		expect(mapped.payload.headers).toEqual({ "x-custom": "value" });
	});

	it("drops detached S/MIME signatures but keeps real attachments", async () => {
		const mapped = await mapRawMessage(
			message(
				[
					"From: sender@example.com",
					"To: recipient@example.com",
					"MIME-Version: 1.0",
					'Content-Type: multipart/signed; boundary="sig"; protocol="application/pkcs7-signature"; micalg=sha-256',
				],
				[
					"--sig",
					'Content-Type: multipart/mixed; boundary="mix"',
					"",
					"--mix",
					"Content-Type: text/plain",
					"",
					"Signed body",
					"--mix",
					'Content-Type: application/pdf; name="file.pdf"',
					'Content-Disposition: attachment; filename="file.pdf"',
					"Content-Transfer-Encoding: base64",
					"",
					"JVBERi0xLjQ=",
					"--mix--",
					"--sig",
					'Content-Type: application/pkcs7-signature; name="smime.p7s"',
					'Content-Disposition: attachment; filename="smime.p7s"',
					"Content-Transfer-Encoding: base64",
					"",
					"MIAGCSqGSIb3DQEHAqCAMIACAQExDzANBglghkgBZQMEAgEFADCABgkqhkiG9w0BBwEAAA==",
					"--sig--",
				].join("\r\n"),
			),
			{
				mailFrom: "sender@example.com",
				rcptTo: ["recipient@example.com"],
			},
		);

		expect(mapped.relayRaw).toBe(true);
		expect(mapped.payload.text?.trim()).toBe("Signed body");
		expect(mapped.payload.attachments).toEqual([
			{
				filename: "file.pdf",
				content: "JVBERi0xLjQ=",
				content_type: "application/pdf",
			},
		]);
	});
	it("only selects S/MIME detached signatures for raw relay", async () => {
		const envelope = {
			mailFrom: "sender@example.com",
			rcptTo: ["recipient@example.com"],
		};
		const signed = (protocol: string) =>
			mapRawMessage(
				message(
					[
						"From: sender@example.com",
						"To: recipient@example.com",
						`Content-Type: multipart/signed; boundary="sig"; protocol="${protocol}"`,
					],
					"--sig\r\nContent-Type: text/plain\r\n\r\nBody\r\n--sig--",
				),
				envelope,
			);

		expect((await signed("application/x-pkcs7-signature")).relayRaw).toBe(true);
		expect((await signed("application/pgp-signature")).relayRaw).toBe(false);
	});

	it("rejects header blocks over the parser limit permanently instead of failing internally", async () => {
		const padding = Array.from(
			{ length: 1_100 },
			(_unused, index) => `X-Pad-${index}: ${"a".repeat(1_000)}`,
		);
		await expect(
			mapRawMessage(
				message(["From: sender@example.com", "To: to@example.com", ...padding]),
				{ mailFrom: "sender@example.com", rcptTo: ["to@example.com"] },
			),
		).rejects.toMatchObject({
			responseCode: 554,
			message: "5.6.0 Message header block is too large",
		});
	});

	it("rejects messages with too many MIME parts before parsing", async () => {
		const parts = Array.from({ length: 501 }, () =>
			["--b", "Content-Type: text/plain", "", "x"].join("\r\n"),
		);
		const raw = message(
			[
				"From: sender@example.com",
				"To: to@example.com",
				'Content-Type: multipart/mixed; boundary="b"',
			],
			[...parts, "--b--"].join("\r\n"),
		);

		await expect(
			mapRawMessage(raw, {
				mailFrom: "sender@example.com",
				rcptTo: ["to@example.com"],
			}),
		).rejects.toMatchObject({
			responseCode: 554,
			message: "5.6.0 Message has too many MIME parts",
		});
		await expect(
			mapRawMessage(
				raw,
				{ mailFrom: "sender@example.com", rcptTo: ["to@example.com"] },
				{ maxMimeParts: 600 },
			),
		).resolves.toBeDefined();
	});

	it("counts lines that may be delimiters and encapsulated messages, but not dash-only rules", () => {
		const rules = Array.from({ length: 50 }, () => "--------\r\n-- ").join(
			"\r\n",
		);
		expect(countMimeParts(message(["From: a@example.com"], rules))).toBe(0);
		expect(
			countMimeParts(
				message(
					["Content-Type: multipart/mixed; boundary=b"],
					[
						"--b",
						"Content-Type: message/rfc822",
						"",
						"Subject: inner",
						"",
						"\r--b  \t",
						"CONTENT-TYPE:   Message/Partial",
						"",
						"--not-declared",
						"-- -",
						"--b--",
					].join("\n"),
				),
			),
		).toBe(7);
	});

	it("counts long dash lines in linear time", () => {
		const started = performance.now();
		for (const size of [1024 * 1024, 4 * 1024 * 1024]) {
			expect(countMimeParts(Buffer.from(`--${" ".repeat(size)}x\r\n`))).toBe(1);
			expect(countMimeParts(Buffer.from(`--${" ".repeat(size)}\r\n`))).toBe(0);
			expect(countMimeParts(Buffer.from(`--${"-".repeat(size)}x`))).toBe(1);
		}
		expect(performance.now() - started).toBeLessThan(1_000);
	});

	it("keeps cid links and sends inline images as attachments with their content ID", async () => {
		const mapped = await mapRawMessage(inlineImageMessage(1, 1_024), envelope);

		expect(mapped.payload.html).toBe(
			'<p>Logo</p><img src="cid:logo@example.com">',
		);
		expect(mapped.payload.text).toBeUndefined();
		expect(mapped.payload.attachments).toEqual([
			{
				filename: "logo.png",
				content: Buffer.alloc(1_024, 7).toString("base64"),
				content_type: "image/png",
				content_id: "logo@example.com",
			},
		]);
	});

	it("does not multiply an inline image referenced many times", async () => {
		const mapped = await mapRawMessage(
			inlineImageMessage(3_000, 256 * 1024),
			envelope,
		);

		expect(mapped.payload.html?.length).toBeLessThan(100_000);
		expect(mapped.payload.html).not.toContain("data:");
		expect(mapped.payload.attachments).toHaveLength(1);
	});

	it("parses deeply nested HTML quickly without converting it to text", async () => {
		const html = "<div>".repeat((3 * 1024 * 1024) / 5);
		const started = performance.now();
		const mapped = await mapRawMessage(
			message(
				[
					"From: sender@example.com",
					"To: recipient@example.com",
					"Content-Type: text/html",
				],
				html,
			),
			envelope,
		);

		expect(performance.now() - started).toBeLessThan(2_000);
		expect(mapped.payload.html?.length).toBe(html.length);
		expect(mapped.payload.text).toBeUndefined();
	});

	it("keeps the text part next to HTML and an empty text for empty messages", async () => {
		const alternative = await mapRawMessage(
			message(
				[
					"From: sender@example.com",
					"To: recipient@example.com",
					'Content-Type: multipart/alternative; boundary="alt"',
				],
				[
					"--alt",
					"Content-Type: text/plain",
					"",
					"Plain body",
					"--alt",
					"Content-Type: text/html",
					"",
					"<p>HTML body</p>",
					"--alt--",
				].join("\r\n"),
			),
			envelope,
		);
		expect(alternative.payload.text?.trim()).toBe("Plain body");
		expect(alternative.payload.html?.trim()).toBe("<p>HTML body</p>");

		const empty = await mapRawMessage(
			message(["From: sender@example.com", "To: recipient@example.com"], ""),
			envelope,
		);
		expect(empty.payload.text).toBe("");
		expect(empty.payload.html).toBeUndefined();
		expect(empty.payload.subject).toBe("");
	});
});

describe("mapRawMessageInWorker", () => {
	const limits = { timeoutMs: 15_000, heapMb: 64 };

	it("maps messages exactly like the in-process parser", async () => {
		const raw = inlineImageMessage(2, 4_096);

		expect(await mapRawMessageInWorker(raw, envelope, limits)).toEqual(
			await mapRawMessage(raw, envelope),
		);
	});

	it("returns permanent mapping failures from the worker", async () => {
		await expect(
			mapRawMessageInWorker(
				message(["To: recipient@example.com"]),
				{ mailFrom: null, rcptTo: ["recipient@example.com"] },
				limits,
			),
		).rejects.toMatchObject({
			responseCode: 550,
			message: "5.1.7 Missing sender address",
		});
	});

	it("refuses too many MIME parts without starting a worker", async () => {
		const raw = message(
			["From: sender@example.com", "To: recipient@example.com"],
			"--a\r\n--b\r\n--c",
		);

		await expect(
			mapRawMessageInWorker(raw, envelope, { ...limits, maxMimeParts: 2 }),
		).rejects.toMatchObject({
			responseCode: 554,
			message: "5.6.0 Message has too many MIME parts",
		});
	});

	it("terminates a parse at its deadline without blocking the event loop", async () => {
		let ticks = 0;
		const ticker = setInterval(() => ticks++, 5);
		const started = performance.now();
		try {
			await expect(
				mapRawMessageInWorker(slowMessage(), envelope, {
					...limits,
					timeoutMs: 50,
				}),
			).rejects.toMatchObject({
				responseCode: 554,
				message: "5.6.0 Message could not be parsed in time",
			});
		} finally {
			clearInterval(ticker);
		}
		expect(performance.now() - started).toBeLessThan(1_000);
		expect(ticks).toBeGreaterThan(2);
		await expect(
			mapRawMessageInWorker(inlineImageMessage(1, 16), envelope, limits),
		).resolves.toBeDefined();
	});

	it("cancels the parse when the SMTP session goes away", async () => {
		const controller = new AbortController();
		const pending = mapRawMessageInWorker(slowMessage(), envelope, {
			...limits,
			signal: controller.signal,
		});
		controller.abort();

		await expect(pending).rejects.toMatchObject({ responseCode: 451 });
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
