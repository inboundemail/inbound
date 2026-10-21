// app/api/autumn/[...all]/route.ts

import { autumnHandler } from "autumn-js/next";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";

const autumn = autumnHandler({
	identify: async (request) => {
		const session = await auth.api.getSession({
			headers: request.headers,
		});

		// Only include customerId if user is authenticated to prevent 500 errors
		// When customerId is omitted, Autumn treats the request as unauthenticated
		if (!session?.user?.id) {
			return {};
		}

		return {
			customerId: session.user.id,
			customerData: {
				name: session.user.name,
				email: session.user.email,
			},
		};
	},
});

const BASE_PATH = "/api/autumn";

const PLAN_PRODUCT_IDS = new Set(["inbound_default_test", "pro", "growth", "scale"]);

const ADDON_PRODUCTS: Record<string, { features: string[]; unit: number }> = {
	extra_domains: { features: ["domains"], unit: 1 },
	"50k_email_blocks": { features: ["inbound_triggers", "emails_sent"], unit: 50000 },
};

const CLIENT_ONLY_KEYS = new Set(["customer_data", "customerData", "openInNewTab", "dialog"]);

type JsonObject = Record<string, unknown>;
type Validation = { ok: true; body: JsonObject } | { ok: false; status: number; message: string };

const reject = (status: number, message: string): Validation => ({ ok: false, status, message });

const isObject = (value: unknown): value is JsonObject =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const unknownKeys = (body: JsonObject, allowed: string[]) =>
	Object.keys(body).filter((key) => !allowed.includes(key) && !CLIENT_ONLY_KEYS.has(key));

const isHttpUrl = (value: unknown) => {
	if (typeof value !== "string") return false;
	try {
		const { protocol } = new URL(value);
		return protocol === "https:" || protocol === "http:";
	} catch {
		return false;
	}
};

function validateCustomers(body: JsonObject): Validation {
	const extra = unknownKeys(body, ["errorOnNotFound", "expand"]);
	if (extra.length) return reject(400, `Unsupported fields: ${extra.join(", ")}`);
	const result: JsonObject = {};
	if (body.errorOnNotFound !== undefined) {
		if (typeof body.errorOnNotFound !== "boolean") return reject(400, "Invalid errorOnNotFound");
		result.errorOnNotFound = body.errorOnNotFound;
	}
	if (body.expand !== undefined) {
		if (!Array.isArray(body.expand) || !body.expand.every((item) => typeof item === "string")) {
			return reject(400, "Invalid expand");
		}
		result.expand = body.expand;
	}
	return { ok: true, body: result };
}

function validateBillingPortal(body: JsonObject): Validation {
	const extra = unknownKeys(body, ["returnUrl"]);
	if (extra.length) return reject(400, `Unsupported fields: ${extra.join(", ")}`);
	if (body.returnUrl === undefined) return { ok: true, body: {} };
	if (!isHttpUrl(body.returnUrl)) return reject(400, "Invalid returnUrl");
	return { ok: true, body: { returnUrl: body.returnUrl } };
}

function validateAddonOptions(options: unknown, addon: { features: string[]; unit: number }) {
	if (!Array.isArray(options) || options.length !== addon.features.length) return null;
	const seen = new Set<string>();
	const result: { featureId: string; quantity: number }[] = [];
	for (const option of options) {
		if (!isObject(option) || Object.keys(option).some((key) => key !== "featureId" && key !== "quantity")) {
			return null;
		}
		const { featureId, quantity } = option;
		if (typeof featureId !== "string" || !addon.features.includes(featureId) || seen.has(featureId)) return null;
		if (typeof quantity !== "number" || !Number.isSafeInteger(quantity) || quantity <= 0 || quantity % addon.unit !== 0) {
			return null;
		}
		seen.add(featureId);
		result.push({ featureId, quantity });
	}
	return result;
}

function validateAttach(body: JsonObject): Validation {
	const extra = unknownKeys(body, ["productId", "successUrl", "options"]);
	if (extra.length) return reject(400, `Unsupported fields: ${extra.join(", ")}`);
	const { productId, successUrl, options } = body;
	if (typeof productId !== "string") return reject(400, "productId is required");
	if (successUrl !== undefined && !isHttpUrl(successUrl)) return reject(400, "Invalid successUrl");

	const result: JsonObject = { productId };
	if (successUrl !== undefined) result.successUrl = successUrl;

	if (PLAN_PRODUCT_IDS.has(productId)) {
		if (options !== undefined && !(Array.isArray(options) && options.length === 0)) {
			return reject(400, "Options are not supported for this product");
		}
		return { ok: true, body: result };
	}

	const addon = Object.hasOwn(ADDON_PRODUCTS, productId) ? ADDON_PRODUCTS[productId] : undefined;
	if (!addon) return reject(403, "Product is not available");
	const validOptions = validateAddonOptions(options, addon);
	if (!validOptions) return reject(400, "Invalid options for this product");
	result.options = validOptions;
	return { ok: true, body: result };
}

const POST_ROUTES: Record<string, (body: JsonObject) => Validation> = {
	cors: () => ({ ok: true, body: {} }),
	customers: validateCustomers,
	attach: validateAttach,
	billing_portal: validateBillingPortal,
};

const GET_ROUTES = new Set(["products"]);

const notFound = () => NextResponse.json({ error: "Not found" }, { status: 404 });

function resolveRoute(request: Request) {
	const { pathname } = new URL(request.url);
	if (!pathname.startsWith(`${BASE_PATH}/`)) return null;
	return pathname.slice(BASE_PATH.length + 1);
}

const canonicalUrl = (route: string, request: Request) => new URL(`${BASE_PATH}/${route}`, request.url);

export async function GET(request: Request) {
	const route = resolveRoute(request);
	if (!route || !GET_ROUTES.has(route)) return notFound();
	return autumn.GET(new Request(canonicalUrl(route, request), { method: "GET", headers: request.headers }));
}

export async function POST(request: Request) {
	const route = resolveRoute(request);
	const validate = route && Object.hasOwn(POST_ROUTES, route) ? POST_ROUTES[route] : undefined;
	if (!route || !validate) return notFound();

	if (request.headers.get("sec-fetch-site") === "cross-site") {
		return NextResponse.json({ error: "Forbidden" }, { status: 403 });
	}
	if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
		return NextResponse.json({ error: "Expected application/json" }, { status: 415 });
	}

	let parsed: unknown;
	try {
		parsed = await request.json();
	} catch {
		return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
	}
	if (!isObject(parsed)) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });

	const result = validate(parsed);
	if (!result.ok) return NextResponse.json({ error: result.message }, { status: result.status });

	const headers = new Headers(request.headers);
	headers.delete("content-length");
	headers.set("content-type", "application/json");
	return autumn.POST(
		new Request(canonicalUrl(route, request), {
			method: "POST",
			headers,
			body: JSON.stringify(result.body),
		}),
	);
}
