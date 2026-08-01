export type JsonRecord = Record<string, unknown>;

export class HttpError extends Error {
	constructor(
		message: string,
		readonly status: number,
		readonly body: unknown,
	) {
		super(message);
	}
}

export async function requestJson<T>(input: {
	baseUrl: string;
	path: string;
	method?: "GET" | "POST" | "PATCH" | "DELETE";
	token?: string;
	query?: Record<string, string | number | boolean | undefined>;
	body?: unknown;
	request?: typeof fetch;
}): Promise<T> {
	const url = new URL(input.path, `${input.baseUrl.replace(/\/$/, "")}/`);
	for (const [key, value] of Object.entries(input.query || {})) {
		if (value !== undefined) url.searchParams.set(key, String(value));
	}
	const response = await (input.request || fetch)(url, {
		method: input.method || "GET",
		headers: {
			Accept: "application/json",
			...(input.body === undefined
				? {}
				: { "Content-Type": "application/json" }),
			...(input.token ? { Authorization: `Bearer ${input.token}` } : {}),
			"User-Agent": "inboundctl/0.1.0",
		},
		body: input.body === undefined ? undefined : JSON.stringify(input.body),
	});
	const text = await response.text();
	const payload = text ? parseJson(text) : null;
	if (!response.ok) {
		throw new HttpError(
			errorMessage(payload, response.status),
			response.status,
			payload,
		);
	}
	return payload as T;
}

function parseJson(value: string): unknown {
	try {
		return JSON.parse(value);
	} catch {
		return value;
	}
}

function errorMessage(payload: unknown, status: number): string {
	if (typeof payload === "string" && payload) return payload;
	if (typeof payload === "object" && payload !== null) {
		for (const key of ["message", "error_description", "error"]) {
			const value = (payload as JsonRecord)[key];
			if (typeof value === "string" && value) return value;
		}
	}
	return `Request failed with status ${status}`;
}
