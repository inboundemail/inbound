import {
	APIConnectionError,
	APIConnectionTimeoutError,
	APIError,
	APIPromise,
	APIUserAbortError,
	AuthenticationError,
	BadRequestError,
	ConflictError,
	type Fetch,
	InboundError,
	InternalServerError,
	NotFoundError,
	PermissionDeniedError,
	RateLimitError,
	type RequestClient,
	type RequestDescriptor,
	UnprocessableEntityError,
} from "./core.js";
import {
	createGeneratedResources,
	type GeneratedResources,
} from "./generated/resources.js";

export interface ClientOptions {
	apiKey?: string;
	baseURL?: string;
	timeout?: number;
	maxRetries?: number;
	fetch?: Fetch;
	fetchOptions?: RequestInit;
	defaultHeaders?: HeadersInit;
	defaultQuery?: Record<string, string | undefined>;
}

const RETRY_STATUSES = new Set([408, 409, 429]);

function readEnv(name: string): string | undefined {
	if (typeof process === "undefined") return undefined;
	const value = process.env[name]?.trim();
	return value || undefined;
}

function sleep(milliseconds: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function appendQueryValue(
	params: URLSearchParams,
	key: string,
	value: unknown,
): void {
	if (value === undefined || value === null) return;
	if (Array.isArray(value)) {
		for (const item of value) appendQueryValue(params, key, item);
		return;
	}
	params.append(key, String(value));
}

function getErrorMessage(payload: unknown, fallback: string): string {
	if (typeof payload === "string" && payload) return payload;
	if (typeof payload !== "object" || payload === null) return fallback;
	const record = payload as Record<string, unknown>;
	if (typeof record.message === "string") return record.message;
	if (typeof record.error === "string") return record.error;
	return fallback;
}

async function parseErrorResponse(response: Response): Promise<APIError> {
	const text = await response.text();
	let payload: unknown = text;
	if (text) {
		try {
			payload = JSON.parse(text);
		} catch {
			payload = text;
		}
	}
	const fallback =
		response.statusText || `Request failed with ${response.status}`;
	return APIError.generate(
		response.status,
		getErrorMessage(payload, fallback),
		payload,
		response.headers,
	);
}

export class Inbound implements RequestClient {
	static readonly Inbound = Inbound;
	static readonly DEFAULT_TIMEOUT = 60_000;
	static readonly InboundError = InboundError;
	static readonly APIError = APIError;
	static readonly APIConnectionError = APIConnectionError;
	static readonly APIConnectionTimeoutError = APIConnectionTimeoutError;
	static readonly APIUserAbortError = APIUserAbortError;
	static readonly BadRequestError = BadRequestError;
	static readonly AuthenticationError = AuthenticationError;
	static readonly PermissionDeniedError = PermissionDeniedError;
	static readonly NotFoundError = NotFoundError;
	static readonly ConflictError = ConflictError;
	static readonly UnprocessableEntityError = UnprocessableEntityError;
	static readonly RateLimitError = RateLimitError;
	static readonly InternalServerError = InternalServerError;

	readonly apiKey: string;
	readonly baseURL: string;
	readonly timeout: number;
	readonly maxRetries: number;
	private readonly fetchClient: Fetch;
	private readonly fetchOptions?: RequestInit;
	private readonly defaultHeaders: Headers;
	private readonly defaultQuery?: Record<string, string | undefined>;

	constructor(apiKeyOrOptions: string | ClientOptions = {}) {
		const options =
			typeof apiKeyOrOptions === "string"
				? { apiKey: apiKeyOrOptions }
				: apiKeyOrOptions;
		const apiKey = options.apiKey ?? readEnv("INBOUND_API_KEY");
		if (!apiKey) {
			throw new InboundError(
				"Missing API key. Pass it to new Inbound({ apiKey }) or set INBOUND_API_KEY.",
			);
		}
		if (typeof window !== "undefined" && typeof document !== "undefined") {
			throw new InboundError(
				"The Inbound SDK cannot run in a browser because it would expose your API key.",
			);
		}

		this.apiKey = apiKey;
		this.baseURL = (
			options.baseURL ??
			readEnv("INBOUND_BASE_URL") ??
			"https://inbound.new"
		).replace(/\/$/, "");
		this.timeout = options.timeout ?? Inbound.DEFAULT_TIMEOUT;
		this.maxRetries = options.maxRetries ?? 2;
		this.fetchClient = options.fetch ?? globalThis.fetch.bind(globalThis);
		this.fetchOptions = options.fetchOptions;
		this.defaultHeaders = new Headers(options.defaultHeaders);
		this.defaultQuery = options.defaultQuery;
		Object.assign(this, createGeneratedResources(this));
	}

	withOptions(options: Partial<ClientOptions>): Inbound {
		return new Inbound({
			apiKey: options.apiKey ?? this.apiKey,
			baseURL: options.baseURL ?? this.baseURL,
			timeout: options.timeout ?? this.timeout,
			maxRetries: options.maxRetries ?? this.maxRetries,
			fetch: options.fetch ?? this.fetchClient,
			fetchOptions: options.fetchOptions ?? this.fetchOptions,
			defaultHeaders: options.defaultHeaders ?? this.defaultHeaders,
			defaultQuery: options.defaultQuery ?? this.defaultQuery,
		});
	}

	request<T>(descriptor: RequestDescriptor): APIPromise<T> {
		const response = this.performRequest(descriptor);
		return new APIPromise(response, async (rawResponse) => {
			if (!rawResponse.ok) throw await parseErrorResponse(rawResponse);
			const responseType = descriptor.responseType ?? "json";
			if (responseType === "void" || rawResponse.status === 204) {
				return undefined as T;
			}
			if (responseType === "arrayBuffer") {
				return (await rawResponse.arrayBuffer()) as T;
			}

			const text = await rawResponse.text();
			if (!text) return undefined as T;
			return JSON.parse(text) as T;
		});
	}

	get<T>(path: string, options?: RequestDescriptor["options"]): APIPromise<T> {
		return this.request({ method: "GET", path, options });
	}

	post<T>(
		path: string,
		body?: unknown,
		options?: RequestDescriptor["options"],
	): APIPromise<T> {
		return this.request({ method: "POST", path, body, options });
	}

	patch<T>(
		path: string,
		body?: unknown,
		options?: RequestDescriptor["options"],
	): APIPromise<T> {
		return this.request({ method: "PATCH", path, body, options });
	}

	put<T>(
		path: string,
		body?: unknown,
		options?: RequestDescriptor["options"],
	): APIPromise<T> {
		return this.request({ method: "PUT", path, body, options });
	}

	delete<T>(
		path: string,
		options?: RequestDescriptor["options"],
	): APIPromise<T> {
		return this.request({ method: "DELETE", path, options });
	}

	private buildURL(path: string, query?: Record<string, unknown>): string {
		const url = new URL(path, `${this.baseURL}/`);
		for (const [key, value] of Object.entries(this.defaultQuery ?? {})) {
			appendQueryValue(url.searchParams, key, value);
		}
		for (const [key, value] of Object.entries(query ?? {})) {
			appendQueryValue(url.searchParams, key, value);
		}
		return url.toString();
	}

	private canRetry(method: string, idempotencyKey?: string): boolean {
		return method !== "POST" || Boolean(idempotencyKey);
	}

	private shouldRetry(response: Response): boolean {
		return RETRY_STATUSES.has(response.status) || response.status >= 500;
	}

	private getRetryDelay(
		response: Response | undefined,
		attempt: number,
	): number {
		const retryAfter = response?.headers.get("retry-after");
		if (retryAfter && /^\d+$/.test(retryAfter)) {
			return Number(retryAfter) * 1000;
		}
		return Math.min(500 * 2 ** attempt, 5_000);
	}

	private async performRequest(
		descriptor: RequestDescriptor,
	): Promise<Response> {
		const options = descriptor.options;
		const method = descriptor.method.toUpperCase();
		const body = await descriptor.body;
		const maxRetries = options?.maxRetries ?? this.maxRetries;
		const retryable = this.canRetry(method, options?.idempotencyKey);
		let lastError: APIConnectionError | undefined;

		for (let attempt = 0; attempt <= maxRetries; attempt++) {
			const controller = new AbortController();
			let timedOut = false;
			const timeout = options?.timeout ?? this.timeout;
			const timeoutId = setTimeout(() => {
				timedOut = true;
				controller.abort();
			}, timeout);
			const onAbort = () => controller.abort(options?.signal?.reason);
			options?.signal?.addEventListener("abort", onAbort, { once: true });

			const headers = new Headers(this.defaultHeaders);
			headers.set("Authorization", `Bearer ${this.apiKey}`);
			headers.set(
				"Accept",
				descriptor.responseType === "arrayBuffer" ? "*/*" : "application/json",
			);
			if (body !== undefined) headers.set("Content-Type", "application/json");
			if (attempt > 0) headers.set("X-Inbound-Retry-Count", String(attempt));
			if (options?.idempotencyKey) {
				headers.set("Idempotency-Key", options.idempotencyKey);
			}
			for (const [key, value] of new Headers(options?.headers).entries()) {
				headers.set(key, value);
			}

			try {
				const response = await this.fetchClient(
					this.buildURL(descriptor.path, descriptor.query),
					{
						...this.fetchOptions,
						...options?.fetchOptions,
						method,
						headers,
						signal: controller.signal,
						body: body === undefined ? undefined : JSON.stringify(body),
					},
				);

				if (retryable && attempt < maxRetries && this.shouldRetry(response)) {
					await response.body?.cancel();
					await sleep(this.getRetryDelay(response, attempt));
					continue;
				}
				return response;
			} catch (error) {
				if (timedOut) {
					lastError = new APIConnectionTimeoutError();
				} else if (options?.signal?.aborted) {
					throw new APIUserAbortError();
				} else {
					lastError = new APIConnectionError(
						"Unable to connect to the Inbound API",
						error instanceof Error ? error : undefined,
					);
				}

				if (!retryable || attempt >= maxRetries) throw lastError;
				await sleep(this.getRetryDelay(undefined, attempt));
			} finally {
				clearTimeout(timeoutId);
				options?.signal?.removeEventListener("abort", onAbort);
			}
		}

		throw lastError ?? new APIConnectionError("Request failed");
	}
}

export interface Inbound extends GeneratedResources {}
