import { and, eq } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { nanoid } from "nanoid";
import { db } from "@/lib/db";
import type { WebhookFormat } from "@/lib/db/schema";
import { endpoints } from "@/lib/db/schema";
import { sanitizeHtml } from "@/lib/email-management/email-parser";
import type {
	InboundEmailAddress,
	InboundEmailHeaders,
	InboundWebhookPayload,
} from "@/lib/types/inbound-webhooks";
import {
	createWebhookSignature,
	getOrCreateVerificationToken,
} from "@/lib/webhooks/verification";
import { generateTestPayload } from "@/lib/webhooks/webhook-formats";
import { validateAndRateLimit } from "../lib/auth";

// Request/Response Types (OpenAPI-compatible)
const EndpointParamsSchema = t.Object({
	id: t.String(),
});

const TestEndpointBody = t.Object({
	webhookFormat: t.Optional(
		t.Union([t.Literal("inbound"), t.Literal("discord"), t.Literal("slack")]),
	),
	overrideUrl: t.Optional(t.String()),
});

const TestEndpointResponse = t.Object({
	success: t.Boolean(),
	message: t.String(),
	responseTime: t.Number(),
	statusCode: t.Optional(t.Number()),
	responseBody: t.Optional(t.String()),
	error: t.Optional(t.String()),
	testPayload: t.Optional(t.Any({ "x-stainless-any": true })),
	webhookFormat: t.Optional(
		t.Union([t.Literal("inbound"), t.Literal("discord"), t.Literal("slack")]),
	),
	urlTested: t.Optional(t.String()),
});

const ErrorResponse = t.Object({
	error: t.String(),
	message: t.String(),
	statusCode: t.Number(),
});

const NotFoundResponse = t.Object({
	error: t.String(),
});

const ValidationErrorResponse = t.Object({
	error: t.String(),
	validFormats: t.Optional(t.Array(t.String())),
});

// Response for disabled endpoint or other test failures that return 400
const TestFailureResponse = t.Object({
	success: t.Literal(false),
	message: t.String(),
	responseTime: t.Number(),
});

// Build a mock payload that matches the exact real webhook payload structure
function buildMockInboundWebhookPayload(endpoint: {
	id: string;
	name: string;
	type: "webhook" | "email" | "email_group";
}): InboundWebhookPayload {
	const nowIso = new Date().toISOString();
	const structuredEmailId = nanoid();
	const msgId = `<test-${nanoid()}@mail.inbound.new>`;

	const fromAddress: InboundEmailAddress = {
		text: "Inbound Test <test@example.com>",
		addresses: [
			{
				name: "Inbound Test",
				address: "test@example.com",
			},
		],
	};

	const toAddress: InboundEmailAddress = {
		text: "Test Recipient <test@yourdomain.com>",
		addresses: [
			{
				name: null,
				address: "test@yourdomain.com",
			},
		],
	};

	const headers: InboundEmailHeaders = {
		"return-path": {
			value: [{ address: "test@example.com", name: "" }],
			html: '<span class="mp_address_group"><a href="mailto:test@example.com" class="mp_address_email">test@example.com</a></span>',
			text: "test@example.com",
		},
		received: [
			`from test-mta.inbound.new (test-mta.inbound.new [192.0.2.10]) by inbound-smtp.us-east-2.amazonaws.com with SMTP id ${nanoid(10)} for test@yourdomain.com; ${nowIso}`,
			`by test-mx.google.com with SMTP id ${nanoid(12)}; ${nowIso}`,
		],
		"received-spf":
			"pass (spfCheck: domain of example.com designates 192.0.2.10 as permitted sender) client-ip=192.0.2.10; envelope-from=test@example.com; helo=test-mta.inbound.new;",
		"authentication-results":
			"amazonses.com; spf=pass; dkim=pass header.i=@example.com; dmarc=pass header.from=example.com;",
		"x-ses-receipt": nanoid(64),
		"x-ses-dkim-signature":
			"a=rsa-sha256; q=dns/txt; s=20230601; d=amazonses.com; v=1;",
		"dkim-signature": {
			value: "v=1",
			params: {
				a: "rsa-sha256",
				c: "relaxed/relaxed",
				d: "example.com",
				s: "20230601",
				t: Date.now().toString(),
				x: (Date.now() + 3600_000).toString(),
				darn: "in.inbound.run",
				h: "to:subject:message-id:date:from:mime-version:reply-to",
				bh: nanoid(44),
				b: nanoid(128),
			},
		},
		"x-google-dkim-signature":
			"v=1; a=rsa-sha256; c=relaxed/relaxed; d=1e100.net; s=20230601;",
		"x-gm-message-state": nanoid(48),
		"x-gm-gg": nanoid(64),
		"x-google-smtp-source": nanoid(64),
		"x-received": `by 2002:a05:6402:1e8a:b0:61c:7160:73b2 with SMTP id ${nanoid(24)}; ${nowIso}`,
		"mime-version": "1.0",
		from: {
			value: [{ address: "test@example.com", name: "Inbound Test" }],
			html: '<span class="mp_address_group"><span class="mp_address_name">Inbound Test</span> &lt;<a href="mailto:test@example.com" class="mp_address_email">test@example.com</a>&gt;</span>',
			text: "Inbound Test <test@example.com>",
		},
		to: {
			value: [{ address: "test@yourdomain.com", name: "" }],
			html: '<span class="mp_address_group"><a href="mailto:test@yourdomain.com" class="mp_address_email">test@yourdomain.com</a></span>',
			text: "test@yourdomain.com",
		},
		subject: "Test Email - Inbound Email Service",
		"message-id": msgId,
		date: nowIso,
		"content-type": {
			value: "multipart/alternative",
			params: { boundary: `BOUNDARY-${nanoid(7)}` },
		},
	};

	const html =
		"<div><p>This is a test email.</p><p><strong>Rendered for webhook testing.</strong></p></div>";
	const text = "This is a test email.\nRendered for webhook testing.";

	const payload: InboundWebhookPayload = {
		event: "email.received",
		timestamp: nowIso,
		email: {
			id: structuredEmailId,
			messageId: msgId,
			from: fromAddress,
			to: toAddress,
			recipient: "test@yourdomain.com",
			subject: "Test Email - Inbound Email Service",
			receivedAt: nowIso,
			threadId: null,
			threadPosition: null,
			parsedData: {
				messageId: msgId,
				date: new Date(nowIso),
				subject: "Test Email - Inbound Email Service",
				from: fromAddress,
				to: toAddress,
				cc: null,
				bcc: null,
				replyTo: null,
				inReplyTo: undefined,
				references: undefined,
				textBody: text,
				htmlBody: html,
				raw: `From: Inbound Test <test@example.com>\r\nTo: test@yourdomain.com\r\nSubject: Test Email - Inbound Email Service\r\nMessage-ID: ${msgId}\r\nDate: ${nowIso}\r\nMIME-Version: 1.0\r\nContent-Type: multipart/alternative; boundary="${(headers["content-type"] as any).params.boundary}"\r\n\r\n--${(headers["content-type"] as any).params.boundary}\r\nContent-Type: text/plain; charset="UTF-8"\r\n\r\n${text}\r\n\r\n--${(headers["content-type"] as any).params.boundary}\r\nContent-Type: text/html; charset="UTF-8"\r\n\r\n${html}\r\n\r\n--${(headers["content-type"] as any).params.boundary}--`,
				attachments: [],
				headers,
				priority: undefined,
			},
			cleanedContent: {
				html: sanitizeHtml(html),
				text,
				hasHtml: true,
				hasText: true,
				attachments: [],
				headers,
			},
		},
		endpoint: {
			id: endpoint.id,
			name: endpoint.name,
			type: endpoint.type,
		},
	};

	return payload;
}

function resolveEffectiveUrl(
	overrideUrl?: string,
	fallbackUrl?: string,
): string {
	const raw =
		(overrideUrl && overrideUrl.trim()) ||
		(fallbackUrl && String(fallbackUrl).trim()) ||
		"";
	if (!raw) throw new Error("No URL configured for webhook test");
	let u: URL;
	try {
		u = new URL(raw);
	} catch {
		throw new Error("Invalid URL");
	}
	if (u.protocol !== "http:" && u.protocol !== "https:")
		throw new Error("Only http/https URLs are allowed");
	const host = u.hostname.toLowerCase();
	if (
		host === "localhost" ||
		host === "127.0.0.1" ||
		host === "::1" ||
		host.endsWith(".local")
	) {
		throw new Error("Local addresses are not allowed");
	}
	const ipv4 = host.match(/^\d{1,3}(?:\.\d{1,3}){3}$/);
	if (ipv4) {
		const [a, b] = host.split(".").map(Number);
		if (
			a === 10 ||
			(a === 172 && b >= 16 && b <= 31) ||
			(a === 192 && b === 168) ||
			a === 127 ||
			(a === 169 && b === 254)
		) {
			throw new Error("Private IPs are not allowed");
		}
	}
	return u.toString();
}

function maskUrl(u: string): string {
	try {
		const url = new URL(u);
		url.username = "";
		url.password = "";
		url.search = "";
		return url.toString();
	} catch {
		return "[invalid URL]";
	}
}

export const testEndpoint = new Elysia().post(
	"/endpoints/:id/test",
	async ({ request, params, body, set }) => {
		const { id } = params;
		console.log(
			"🧪 POST /api/e2/endpoints/:id/test - Starting test for endpoint:",
			id,
		);

		// Auth & rate limit validation - throws on error
		const userId = await validateAndRateLimit(request, set);
		console.log("✅ Authentication successful for userId:", userId);

		const preferredFormat = body.webhookFormat || "inbound";
		console.log("📋 Using webhook format preference:", preferredFormat);

		// Validate webhook format
		if (!["inbound", "discord", "slack"].includes(preferredFormat)) {
			console.log("❌ Invalid webhook format:", preferredFormat);
			set.status = 400;
			return {
				error: "Invalid webhook format",
				validFormats: ["inbound", "discord", "slack"],
			};
		}

		// Check if endpoint exists and belongs to user
		console.log("🔍 Checking if endpoint exists and belongs to user");
		const endpointResult = await db
			.select()
			.from(endpoints)
			.where(and(eq(endpoints.id, id), eq(endpoints.userId, userId)))
			.limit(1);

		if (!endpointResult[0]) {
			console.log("❌ Endpoint not found for user:", userId, "endpoint:", id);
			set.status = 404;
			return { error: "Endpoint not found or access denied" };
		}

		const endpoint = endpointResult[0];
		console.log("✅ Found endpoint:", endpoint.name, "type:", endpoint.type);

		if (!endpoint.isActive) {
			console.log("❌ Endpoint is disabled:", id);
			set.status = 400;
			return {
				success: false,
				message: "Endpoint is disabled",
				responseTime: 0,
			};
		}

		const config = JSON.parse(endpoint.config);
		const startTime = Date.now();

		let testResult: any = {
			success: false,
			message: "Test not implemented for this endpoint type",
			responseTime: 0,
		};

		switch (endpoint.type) {
			case "webhook":
				try {
					const effectiveUrl = resolveEffectiveUrl(
						body.overrideUrl,
						config.url,
					);
					console.log(
						"🔗 Testing webhook endpoint:",
						maskUrl(effectiveUrl),
						body.overrideUrl ? "(override)" : "",
					);
					console.log("📋 Using webhook format:", preferredFormat);

					// Parse custom headers safely (applies to all formats)
					let customHeaders: Record<string, string> = {};
					if (config.headers) {
						try {
							customHeaders =
								typeof config.headers === "string"
									? JSON.parse(config.headers)
									: config.headers;
						} catch (headerError) {
							console.warn(
								"⚠️ Invalid custom headers for endpoint",
								id,
								":",
								headerError,
							);
							customHeaders = {};
						}
					}

					if (preferredFormat === "inbound") {
						// Build a payload that matches real production webhooks
						const testPayload = buildMockInboundWebhookPayload({
							id: endpoint.id,
							name: endpoint.name,
							type: endpoint.type as any,
						});
						const testPayloadString = JSON.stringify(testPayload);

						// Get or create verification token for this endpoint
						const hadToken = !!config.verificationToken;
						const verificationToken = getOrCreateVerificationToken(config);
						const signature = createWebhookSignature(
							testPayloadString,
							verificationToken,
						);

						// Save token if it was newly generated
						if (!hadToken) {
							await db
								.update(endpoints)
								.set({
									config: JSON.stringify(config),
									updatedAt: new Date(),
								})
								.where(eq(endpoints.id, endpoint.id));
						}

						const requestHeaders = {
							"Content-Type": "application/json",
							"User-Agent": "InboundEmail-Webhook/1.0",
							"X-Webhook-Event": "email.received",
							"X-Endpoint-ID": endpoint.id,
							"X-Webhook-Timestamp": testPayload.timestamp,
							"X-Email-ID": testPayload.email.id,
							"X-Message-ID": testPayload.email.messageId || "",
							"X-Webhook-Verification-Token": verificationToken,
							"X-Webhook-Signature": signature,
							"X-Inbound-Signature": signature,
							...customHeaders,
						};

						console.log(
							"📤 Sending test payload to webhook (inbound):",
							maskUrl(effectiveUrl),
						);

						const timeoutMs =
							(Number.isFinite(Number(config.timeout))
								? Math.max(1, Math.min(120, Number(config.timeout)))
								: 30) * 1000;
						const response = await fetch(effectiveUrl, {
							method: "POST",
							headers: requestHeaders,
							body: testPayloadString,
							redirect: "error",
							referrerPolicy: "no-referrer",
							signal: AbortSignal.timeout(timeoutMs),
						});

						const responseTime = Date.now() - startTime;
						let responseBody = "";
						try {
							responseBody = await response.text();
						} catch {
							responseBody = "Unable to read response body";
						}

						testResult = {
							success: response.ok,
							message: response.ok
								? `Webhook responded successfully (${response.status})`
								: `Webhook returned error (${response.status})`,
							responseTime,
							statusCode: response.status,
							responseBody: responseBody.substring(0, 1000),
							testPayload,
							webhookFormat: preferredFormat as WebhookFormat,
							urlTested: effectiveUrl,
						};

						console.log(
							`${response.ok ? "✅" : "❌"} Webhook test ${response.ok ? "passed" : "failed"}: ${response.status} in ${responseTime}ms`,
						);
					} else {
						// Keep existing behavior for discord/slack formats
						const testPayload = generateTestPayload(
							preferredFormat as WebhookFormat,
							{
								messageId: `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
								from: "test@example.com",
								to: ["test@yourdomain.com"],
								subject: "Test Email - Inbound Email Service",
								recipient: "test@yourdomain.com",
							},
						);
						const testPayloadString = JSON.stringify(testPayload);

						// Get or create verification token for this endpoint
						const hadToken2 = !!config.verificationToken;
						const verificationToken2 = getOrCreateVerificationToken(config);
						const signature = createWebhookSignature(
							testPayloadString,
							verificationToken2,
						);

						// Save token if it was newly generated
						if (!hadToken2) {
							await db
								.update(endpoints)
								.set({
									config: JSON.stringify(config),
									updatedAt: new Date(),
								})
								.where(eq(endpoints.id, endpoint.id));
						}

						const requestHeaders = {
							"Content-Type": "application/json",
							"User-Agent": "InboundEmail-Test/2.0",
							"X-Test-Request": "true",
							"X-Endpoint-ID": endpoint.id,
							"X-Webhook-Format": preferredFormat,
							"X-Webhook-Verification-Token": verificationToken2,
							"X-Webhook-Signature": signature,
							"X-Inbound-Signature": signature,
							...customHeaders,
						};

						console.log(
							"📤 Sending test payload to webhook (discord/slack):",
							maskUrl(effectiveUrl),
						);

						const timeoutMs2 =
							(Number.isFinite(Number(config.timeout))
								? Math.max(1, Math.min(120, Number(config.timeout)))
								: 30) * 1000;
						const response = await fetch(effectiveUrl, {
							method: "POST",
							headers: requestHeaders,
							body: testPayloadString,
							redirect: "error",
							referrerPolicy: "no-referrer",
							signal: AbortSignal.timeout(timeoutMs2),
						});

						const responseTime = Date.now() - startTime;
						let responseBody = "";
						try {
							responseBody = await response.text();
						} catch {
							responseBody = "Unable to read response body";
						}

						testResult = {
							success: response.ok,
							message: response.ok
								? `Webhook responded successfully (${response.status})`
								: `Webhook returned error (${response.status})`,
							responseTime,
							statusCode: response.status,
							responseBody: responseBody.substring(0, 1000),
							testPayload,
							webhookFormat: preferredFormat as WebhookFormat,
							urlTested: effectiveUrl,
						};

						console.log(
							`${response.ok ? "✅" : "❌"} Webhook test ${response.ok ? "passed" : "failed"}: ${response.status} in ${responseTime}ms`,
						);
					}
				} catch (error) {
					const responseTime = Date.now() - startTime;
					let errorMessage = "Unknown error";

					if (error instanceof Error) {
						if (error.name === "AbortError") {
							errorMessage = `Request timeout after ${config.timeout || 30}s`;
						} else {
							errorMessage = error.message;
						}
					}

					testResult = {
						success: false,
						message: `Webhook test failed: ${errorMessage}`,
						responseTime,
						error: errorMessage,
						webhookFormat: preferredFormat as WebhookFormat,
					};

					console.error("❌ Webhook test failed:", errorMessage);
				}
				break;

			case "email":
				// For email endpoints, we simulate the forwarding process
				try {
					console.log(
						"📧 Testing email forwarding endpoint to:",
						config.forwardTo,
					);

					const responseTime = Date.now() - startTime;
					testResult = {
						success: true,
						message: `Email forwarding endpoint configured to forward to: ${config.forwardTo}`,
						responseTime,
						testPayload: {
							type: "email_forward_test",
							forwardTo: config.forwardTo,
							preserveHeaders: config.preserveHeaders || false,
							subject: "Test Email - Inbound Email Service",
							from: "test@example.com",
							timestamp: new Date().toISOString(),
						},
					};

					console.log("✅ Email endpoint test completed successfully");
				} catch (error) {
					const responseTime = Date.now() - startTime;
					testResult = {
						success: false,
						message: "Email endpoint test failed",
						responseTime,
						error: error instanceof Error ? error.message : "Unknown error",
					};

					console.error("❌ Email endpoint test failed:", error);
				}
				break;

			case "email_group":
				// For email group endpoints, we simulate the group forwarding process
				try {
					console.log(
						"📧 Testing email group endpoint with",
						config.emails?.length || 0,
						"recipients",
					);

					const responseTime = Date.now() - startTime;
					testResult = {
						success: true,
						message: `Email group endpoint configured to forward to ${config.emails?.length || 0} recipients`,
						responseTime,
						testPayload: {
							type: "email_group_test",
							groupEmails: config.emails || [],
							preserveHeaders: config.preserveHeaders || false,
							subject: "Test Email - Inbound Email Service",
							from: "test@example.com",
							timestamp: new Date().toISOString(),
						},
					};

					console.log("✅ Email group endpoint test completed successfully");
				} catch (error) {
					const responseTime = Date.now() - startTime;
					testResult = {
						success: false,
						message: "Email group endpoint test failed",
						responseTime,
						error: error instanceof Error ? error.message : "Unknown error",
					};

					console.error("❌ Email group endpoint test failed:", error);
				}
				break;

			default: {
				const responseTime = Date.now() - startTime;
				testResult = {
					success: false,
					message: `Unknown endpoint type: ${endpoint.type}`,
					responseTime,
					error: `Unsupported endpoint type: ${endpoint.type}`,
				};
				console.log("❌ Unknown endpoint type:", endpoint.type);
				break;
			}
		}

		console.log(
			`${testResult.success ? "✅" : "❌"} Test ${testResult.success ? "passed" : "failed"} for endpoint ${id} (${endpoint.type})`,
		);

		return testResult;
	},
	{
		params: EndpointParamsSchema,
		body: TestEndpointBody,
		response: {
			200: TestEndpointResponse,
			400: t.Union([ValidationErrorResponse, TestFailureResponse]),
			401: ErrorResponse,
			404: NotFoundResponse,
			500: ErrorResponse,
		},
		detail: {
			tags: ["Endpoints"],
			summary: "Test endpoint",
			description:
				"Test an endpoint by sending a test payload. For webhooks, supports inbound, discord, and slack formats. For email endpoints, simulates the forwarding process.",
		},
	},
);
