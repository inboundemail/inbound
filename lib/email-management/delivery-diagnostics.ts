import type { Endpoint, EndpointDelivery } from "@/lib/db/schema";

export type RecoveryDelivery = Pick<
	EndpointDelivery,
	"id" | "status" | "attempts"
> & {
	lastAttemptAt: string | null;
	updatedAt: string | null;
	endpoint: Pick<Endpoint, "id" | "name" | "type" | "isActive"> & {
		available: boolean;
		destination: string | null;
	};
	response: {
		statusCode: number | null;
		durationMs: number | null;
		error: string | null;
		body: string | null;
	};
};

export interface DeliveryDiagnosis {
	title: string;
	guidance: string;
	canRetry: boolean;
	stalled: boolean;
}

function record(value: unknown): Record<string, unknown> {
	if (typeof value === "string") {
		try {
			return record(JSON.parse(value));
		} catch {
			return {};
		}
	}
	return value !== null && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}

function text(value: unknown): string | null {
	return typeof value === "string" && value.trim() ? value : null;
}

function number(value: unknown): number | null {
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function getDeliveryResponse(
	value: unknown,
): RecoveryDelivery["response"] {
	const data = record(value);
	const statusCode = number(data.responseCode) ?? number(data.statusCode);
	return {
		statusCode:
			statusCode && statusCode >= 100 && statusCode <= 599 ? statusCode : null,
		durationMs: number(data.deliveryTime),
		error: text(data.error) || text(data.message),
		body: text(data.responseBody)?.slice(0, 2000) || null,
	};
}

export function getDeliveryDestination(
	type: string,
	value: unknown,
): string | null {
	const config = record(value);
	if (type === "webhook") {
		try {
			const url = new URL(String(config.url));
			if (url.protocol !== "https:" && url.protocol !== "http:") return null;
			url.username = "";
			url.password = "";
			url.search = "";
			url.hash = "";
			return url.toString();
		} catch {
			return null;
		}
	}
	if (type === "email") return text(config.forwardTo);
	if (type === "email_group" && Array.isArray(config.emails)) {
		return (
			config.emails
				.filter((email): email is string => typeof email === "string")
				.join(", ") || null
		);
	}
	return null;
}

export function diagnoseDelivery(
	delivery: RecoveryDelivery,
	now = Date.now(),
): DeliveryDiagnosis {
	const diagnosis = (
		title: string,
		guidance: string,
		canRetry = false,
		stalled = false,
	) => ({
		title,
		guidance,
		canRetry,
		stalled,
	});
	if (delivery.status === "success") {
		return diagnosis(
			delivery.endpoint.type === "webhook"
				? "Accepted by endpoint"
				: "Forwarded",
			delivery.endpoint.type === "webhook"
				? "The endpoint returned a successful response."
				: "The forwarding service accepted this email. This does not confirm inbox placement.",
		);
	}
	if (delivery.status === "processing") {
		const updatedAt = delivery.updatedAt ? Date.parse(delivery.updatedAt) : NaN;
		if (Number.isFinite(updatedAt) && now - updatedAt >= 5 * 60 * 1000) {
			return diagnosis(
				"Delivery appears stalled",
				"No result was recorded for at least five minutes. The destination may already have received this email. Check receiver logs and contact support before another attempt.",
				false,
				true,
			);
		}
		return diagnosis(
			"Delivery in progress",
			"Refresh to check the result before starting another attempt.",
		);
	}
	if (!delivery.endpoint.available) {
		return diagnosis(
			"Endpoint removed",
			"Choose another active endpoint to deliver this email.",
		);
	}
	if (!delivery.endpoint.isActive) {
		return diagnosis(
			"Endpoint disabled",
			"Enable this endpoint in its settings, then refresh and retry.",
		);
	}
	if (!delivery.endpoint.destination) {
		return diagnosis(
			"Endpoint destination unavailable",
			"Set a valid destination in endpoint settings, then refresh and retry.",
		);
	}
	if (delivery.status !== "failed" && delivery.status !== "pending") {
		return diagnosis(
			"Delivery status unavailable",
			"Refresh to check the latest delivery state.",
		);
	}
	const code = delivery.response.statusCode;
	const error = delivery.response.error || "";
	if (delivery.status === "pending") {
		return diagnosis(
			"No completed attempt",
			"No successful delivery has been recorded. Retry to this endpoint after checking its settings.",
			true,
		);
	}
	if (error.includes("FORWARDING_LOOP_DETECTED")) {
		return diagnosis(
			"Forwarding loop prevented",
			"Change the forwarding destination so it differs from the address that received this email, then retry.",
			true,
		);
	}
	if (error.includes("ALL_RECIPIENTS_BLOCKED")) {
		return diagnosis(
			"Forwarding recipients blocked",
			"Review the recipient blocklist and correct the forwarding destination before retrying.",
			true,
		);
	}
	if (code === 401 || code === 403) {
		return diagnosis(
			"Endpoint rejected authorization",
			"Check the endpoint's authentication headers and webhook verification settings, then retry.",
			true,
		);
	}
	if (code === 404 || code === 410) {
		return diagnosis(
			"Endpoint URL unavailable",
			"Check the webhook URL and route in endpoint settings, then retry.",
			true,
		);
	}
	if (code === 413) {
		return diagnosis(
			"Payload rejected as too large",
			"Increase the receiver's request-size limit or choose an endpoint that accepts this payload, then retry.",
			true,
		);
	}
	if (code === 429) {
		return diagnosis(
			"Endpoint rate limited",
			"Wait for the receiver's rate limit to clear before retrying.",
			true,
		);
	}
	if (code === 408 || /timeout|timed out|abort/i.test(error)) {
		return diagnosis(
			"Delivery timed out",
			"Check receiver logs before retrying: a timeout does not establish whether the receiver processed the email.",
			true,
		);
	}
	if (code !== null && code >= 500) {
		return diagnosis(
			"Endpoint returned a server error",
			"Check the receiver's logs and availability, then retry after resolving the error.",
			true,
		);
	}
	if (/ENOTFOUND|EAI_AGAIN|getaddrinfo/i.test(error)) {
		return diagnosis(
			"Endpoint hostname could not be resolved",
			"Check the webhook hostname and DNS records, then retry.",
			true,
		);
	}
	if (/certificate|SSL|TLS/i.test(error)) {
		return diagnosis(
			"Secure connection failed",
			"Check the receiver's TLS certificate and certificate chain before retrying.",
			true,
		);
	}
	if (/ECONNREFUSED|fetch failed|network/i.test(error)) {
		return diagnosis(
			"Endpoint could not be reached",
			"Check the receiver's availability, firewall, and webhook URL, then retry.",
			true,
		);
	}
	return diagnosis(
		"Delivery failed",
		"Review the recorded response and endpoint settings, resolve the cause, then retry.",
		true,
	);
}
