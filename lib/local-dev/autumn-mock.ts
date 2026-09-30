const AUTUMN_HOST = "api.useautumn.com";

function localCustomer(customerId: string) {
	return {
		id: customerId,
		name: "Local Developer",
		email: null,
		env: "sandbox",
		stripe_id: null,
		products: [
			{
				id: "inbound_default_test",
				name: "Local Dev",
				group: null,
				status: "active",
				canceled_at: null,
				started_at: Date.now(),
				is_default: false,
				is_add_on: false,
				items: [],
			},
		],
		features: {},
		invoices: [],
	};
}

function customerIdFrom(path: string, body: Record<string, unknown>) {
	const fromPath = path.match(/^\/v1\/customers\/([^/?]+)/)?.[1];
	if (fromPath) return decodeURIComponent(fromPath);
	return typeof body.customer_id === "string" ? body.customer_id : typeof body.id === "string" ? body.id : "local";
}

function respond(path: string, body: Record<string, unknown>) {
	if (path.startsWith("/v1/check")) {
		return {
			allowed: true,
			unlimited: true,
			balance: null,
			customer_id: customerIdFrom(path, body),
			feature_id: body.feature_id ?? null,
			product_id: body.product_id ?? null,
			code: "feature_found",
		};
	}
	if (path.startsWith("/v1/track") || path.startsWith("/v1/usage")) {
		return { id: "local_event", code: "event_received", customer_id: customerIdFrom(path, body) };
	}
	if (path.startsWith("/v1/customers")) {
		return localCustomer(customerIdFrom(path, body));
	}
	if (path.startsWith("/v1/attach") || path.startsWith("/v1/checkout")) {
		return { success: true, code: "local_mock", checkout_url: null, customer_id: customerIdFrom(path, body) };
	}
	return { success: true, code: "local_mock" };
}

export function installAutumnMock() {
	const realFetch = globalThis.fetch;
	const mockedFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
		const request = new Request(input, init);
		const url = new URL(request.url);
		if (url.hostname !== AUTUMN_HOST) return realFetch(input, init);

		const text = request.method === "GET" ? "" : await request.text();
		let body: Record<string, unknown> = {};
		try {
			body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
		} catch {
			body = {};
		}
		return Response.json(respond(url.pathname, body));
	};
	globalThis.fetch = Object.assign(mockedFetch, realFetch);
	console.log("🧪 [local dev] Autumn API calls are served by a local mock");
}
