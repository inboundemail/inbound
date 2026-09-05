import { describe, expect, it } from "bun:test";
import {
	diagnoseDelivery,
	getDeliveryDestination,
	getDeliveryResponse,
	type RecoveryDelivery,
} from "@/lib/email-management/delivery-diagnostics";

const delivery: RecoveryDelivery = {
	id: "delivery-example",
	status: "failed",
	attempts: 2,
	lastAttemptAt: "2026-09-05T12:00:00.000Z",
	updatedAt: "2026-09-05T12:00:00.000Z",
	endpoint: {
		id: "endpoint-example",
		name: "Support webhook",
		type: "webhook",
		isActive: true,
		available: true,
		destination: "https://example.com/email",
	},
	response: {
		statusCode: 500,
		durationMs: 250,
		error: null,
		body: "Unavailable",
	},
};

function withResponse(statusCode: number | null, error: string | null = null) {
	return { ...delivery, response: { ...delivery.response, statusCode, error } };
}

describe("delivery diagnostics", () => {
	it.each([
		[401, "Endpoint rejected authorization"],
		[403, "Endpoint rejected authorization"],
		[404, "Endpoint URL unavailable"],
		[410, "Endpoint URL unavailable"],
		[413, "Payload rejected as too large"],
		[429, "Endpoint rate limited"],
		[408, "Delivery timed out"],
		[503, "Endpoint returned a server error"],
	] as const)("explains HTTP %s with an actionable next step", (code, title) => {
		const result = diagnoseDelivery(withResponse(code));
		expect(result.title).toBe(title);
		expect(result.canRetry).toBe(true);
		expect(result.guidance.length).toBeGreaterThan(20);
	});

	it.each([
		["ENOTFOUND example.com", "Endpoint hostname could not be resolved"],
		["certificate has expired", "Secure connection failed"],
		["fetch failed", "Endpoint could not be reached"],
		["Request timed out", "Delivery timed out"],
		["ALL_RECIPIENTS_BLOCKED", "Forwarding recipients blocked"],
		["FORWARDING_LOOP_DETECTED", "Forwarding loop prevented"],
	] as const)("explains recorded failure %s", (error, title) => {
		expect(diagnoseDelivery(withResponse(null, error)).title).toBe(title);
	});

	it("does not infer success from HTTP code when the persisted delivery failed", () => {
		expect(diagnoseDelivery(withResponse(200)).title).toBe("Delivery failed");
	});

	it("distinguishes accepted webhook delivery from forwarding", () => {
		expect(diagnoseDelivery({ ...delivery, status: "success" })).toMatchObject({
			title: "Accepted by endpoint",
			canRetry: false,
		});
		const result = diagnoseDelivery({
			...delivery,
			status: "success",
			endpoint: { ...delivery.endpoint, type: "email" },
		});
		expect(result.title).toBe("Forwarded");
		expect(result.guidance).toContain("does not confirm inbox placement");
	});

	it("prevents retry to disabled or removed endpoints", () => {
		expect(
			diagnoseDelivery({
				...delivery,
				endpoint: { ...delivery.endpoint, isActive: false },
			}),
		).toMatchObject({ title: "Endpoint disabled", canRetry: false });
		expect(
			diagnoseDelivery({
				...delivery,
				endpoint: { ...delivery.endpoint, available: false },
			}),
		).toMatchObject({ title: "Endpoint removed", canRetry: false });
	});

	it("never offers a second attempt while processing, even after the stale threshold", () => {
		const processing = { ...delivery, status: "processing" };
		const now = Date.parse(delivery.updatedAt!);
		expect(diagnoseDelivery(processing, now + 1000)).toMatchObject({
			canRetry: false,
			stalled: false,
		});
		expect(diagnoseDelivery(processing, now + 300_000)).toMatchObject({
			canRetry: false,
			stalled: true,
		});
		expect(
			diagnoseDelivery({ ...processing, updatedAt: null }, now),
		).toMatchObject({ canRetry: false, stalled: false });
	});

	it("requires a valid endpoint destination and prioritizes an active delivery", () => {
		expect(
			diagnoseDelivery({
				...delivery,
				endpoint: { ...delivery.endpoint, destination: null },
			}),
		).toMatchObject({
			title: "Endpoint destination unavailable",
			canRetry: false,
		});
		expect(
			diagnoseDelivery({
				...delivery,
				status: "processing",
				updatedAt: null,
				endpoint: { ...delivery.endpoint, isActive: false },
			}),
		).toMatchObject({ title: "Delivery in progress", canRetry: false });
	});

	it("distinguishes pending attempts and unknown states", () => {
		expect(diagnoseDelivery({ ...delivery, status: "pending" })).toMatchObject({
			title: "No completed attempt",
			canRetry: true,
		});
		expect(
			diagnoseDelivery({ ...delivery, status: "unexpected" }).canRetry,
		).toBe(false);
	});
});

describe("safe diagnostic data", () => {
	it("only extracts recorded diagnostic fields", () => {
		expect(
			getDeliveryResponse(
				JSON.stringify({
					responseCode: 503,
					deliveryTime: 350,
					error: "Unavailable",
					responseBody: "Try later",
					responseHeaders: { authorization: "private" },
					token: "private",
				}),
			),
		).toEqual({
			statusCode: 503,
			durationMs: 350,
			error: "Unavailable",
			body: "Try later",
		});
	});

	it("handles legacy and malformed response data", () => {
		expect(
			getDeliveryResponse({ statusCode: 429, message: "Slow down" }),
		).toEqual({
			statusCode: 429,
			durationMs: null,
			error: "Slow down",
			body: null,
		});
		for (const data of [
			null,
			"not JSON",
			[],
			{ responseCode: 0 },
			{ responseCode: "500" },
		]) {
			expect(getDeliveryResponse(data)).toEqual({
				statusCode: null,
				durationMs: null,
				error: null,
				body: null,
			});
		}
		expect(
			getDeliveryResponse({ responseBody: "x".repeat(2500) }).body?.length,
		).toBe(2000);
	});

	it("removes URL credentials, query parameters, and fragments from display destinations", () => {
		expect(
			getDeliveryDestination("webhook", {
				url: "https://user:password@example.com/email?secret=value#token",
			}),
		).toBe("https://example.com/email");
		expect(
			getDeliveryDestination("webhook", { url: "javascript:alert(1)" }),
		).toBeNull();
		expect(getDeliveryDestination("webhook", "invalid JSON")).toBeNull();
	});

	it("formats forwarding destinations without exposing unrelated config", () => {
		expect(
			getDeliveryDestination("email", { forwardTo: "support@example.com" }),
		).toBe("support@example.com");
		expect(
			getDeliveryDestination("email_group", {
				emails: ["a@example.com", null, "b@example.com"],
			}),
		).toBe("a@example.com, b@example.com");
	});
});
