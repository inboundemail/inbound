import * as Errors from "./errors.js";
import { render, toFile } from "./helpers.js";

export interface RequestOptions {
	headers?: HeadersInit;
	signal?: AbortSignal | null;
	timeout?: number;
	maxRetries?: number;
}
export interface ClientOptions {
	apiKey?: string;
	baseURL?: string | null;
	fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
	timeout?: number;
	maxRetries?: number;
	defaultHeaders?: HeadersInit;
}

export class APIPromise<T> extends Promise<T> {
	private keepRaw = false;
	static get [Symbol.species]() { return Promise; }
	constructor(private readonly raw: Promise<Response>, parse: (r: Response) => Promise<T>, binary = false) {
		super((resolve, reject) => {
			raw.then(r => parse(this.keepRaw && !binary ? r.clone() : r)).then(resolve, reject);
		});
	}
	asResponse() {
		this.keepRaw = true;
		// A caller requesting only the wire response need not handle a JSON parse failure.
		this.catch(() => undefined);
		return this.raw;
	}
	async withResponse(): Promise<{ data: T; response: Response }> { return { data: await this, response: await this.raw }; }
}

export function segment(value: string | number): string {
	if (value === "." || value === ".." || value === "") throw new TypeError("Invalid empty or dot path segment");
	return encodeURIComponent(value);
}

type Page<T> = { data: T[]; pagination: { limit: number; offset: number; hasMore?: boolean; has_more?: boolean } };
export async function* paginate<T>(start: number, load: (offset: number) => Promise<Page<T>>, more: "hasMore" | "has_more"): AsyncIterableIterator<T> {
	let offset = start;
	while (true) {
		const page = await load(offset);
		yield* page.data;
		if (!page.pagination[more] || !page.data.length) return;
		const next = page.pagination.offset + page.pagination.limit;
		if (!Number.isSafeInteger(next) || next <= offset) throw new Errors.InboundError("Pagination offset did not advance");
		offset = next;
	}
}

interface Layout {
	body?: boolean;
	query?: string[];
	headers?: Record<string, string>;
	binary?: boolean;
	reactEmail?: boolean;
}
function retryDelay(value: string | null, attempt: number) {
	if (value !== null) {
		const ms = /^\d+(\.\d+)?$/.test(value) ? Number(value) * 1000 : Date.parse(value) - Date.now();
		if (!Number.isNaN(ms)) return Math.max(0, ms);
	}
	return Math.min(250 * 2 ** attempt, 8000);
}

function wait(ms: number, signal: AbortSignal) {
	return new Promise<void>((resolve, reject) => {
		signal.throwIfAborted();
		const abort = () => { clearTimeout(timer); reject(signal.reason); };
		const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, ms);
		signal.addEventListener("abort", abort, { once: true });
	});
}

function requestSignal(timeout: number, caller?: AbortSignal | null) {
	const deadline = AbortSignal.timeout(timeout);
	if (!caller) return deadline;
	if (caller.aborted) return caller;
	if (typeof AbortSignal.any === "function") return AbortSignal.any([caller, deadline]);
	const controller = new AbortController();
	const abort = () => {
		controller.abort(caller.aborted ? caller.reason : deadline.reason);
		caller.removeEventListener("abort", abort);
		deadline.removeEventListener("abort", abort);
	};
	caller.addEventListener("abort", abort, { once: true });
	deadline.addEventListener("abort", abort, { once: true });
	return controller.signal;
}

export class Transport {
	static readonly DEFAULT_TIMEOUT = 60_000;
	static readonly InboundError = Errors.InboundError;
	static readonly APIError = Errors.APIError;
	static readonly APIConnectionError = Errors.APIConnectionError;
	static readonly APIConnectionTimeoutError = Errors.APIConnectionTimeoutError;
	static readonly APIUserAbortError = Errors.APIUserAbortError;
	static readonly BadRequestError = Errors.BadRequestError;
	static readonly AuthenticationError = Errors.AuthenticationError;
	static readonly PermissionDeniedError = Errors.PermissionDeniedError;
	static readonly NotFoundError = Errors.NotFoundError;
	static readonly ConflictError = Errors.ConflictError;
	static readonly UnprocessableEntityError = Errors.UnprocessableEntityError;
	static readonly RateLimitError = Errors.RateLimitError;
	static readonly InternalServerError = Errors.InternalServerError;
	static readonly toFile = toFile;
	readonly apiKey: string;
	readonly baseURL: string;
	readonly timeout: number;
	readonly maxRetries: number;
	private readonly fetcher: NonNullable<ClientOptions["fetch"]>;
	private readonly defaultHeaders: Headers;

	constructor(options: ClientOptions) {
		if (typeof window !== "undefined" && typeof window.document !== "undefined") throw new Errors.InboundError("Use Inbound on the server, not in a browser exposing a secret API key");
		const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
		const apiKey = options.apiKey ?? env?.INBOUND_API_KEY;
		if (!apiKey) throw new Errors.InboundError("Set apiKey or INBOUND_API_KEY");
		this.apiKey = apiKey;
		this.baseURL = (options.baseURL ?? env?.INBOUND_BASE_URL ?? "https://inbound.new").replace(/\/+$/, "");
		this.timeout = options.timeout ?? Transport.DEFAULT_TIMEOUT;
		this.maxRetries = options.maxRetries ?? 2;
		this.fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
		this.defaultHeaders = new Headers(options.defaultHeaders);
	}

	request<T>(method: string, path: string, params: Record<string, unknown>, layout: Layout, options: RequestOptions = {}): APIPromise<T> {
		const timeout = options.timeout ?? this.timeout;
		const retries = options.maxRetries ?? this.maxRetries;
		if (!Number.isSafeInteger(timeout) || timeout < 1 || timeout > 2_147_483_647) throw new RangeError("Invalid timeout");
		if (!Number.isSafeInteger(retries) || retries < 0) throw new RangeError("Invalid maxRetries");
		const signal = requestSignal(timeout, options.signal);
		const expires = Date.now() + timeout;
		const url = new URL(this.baseURL + path);
		const headers = new Headers(this.defaultHeaders);
		headers.set("Authorization", `Bearer ${this.apiKey}`);
		new Headers(options.headers).forEach((v, k) => headers.set(k, v));
		const body = { ...params };
		for (const key of layout.query ?? []) {
			const value = params[key];
			delete body[key];
			if (value == null) continue;
			for (const item of Array.isArray(value) ? value : [value]) url.searchParams.append(key, String(item));
		}
		for (const [key, wire] of Object.entries(layout.headers ?? {})) {
			if (params[key] != null) headers.set(wire, String(params[key]));
			delete body[key];
		}
		const aborted = () => options.signal?.aborted ? new Errors.APIUserAbortError() : new Errors.APIConnectionTimeoutError();
		const send = async (): Promise<Response> => {
			if (layout.reactEmail && body.react !== undefined) {
				if (body.react != null) body.html = await render(body.react);
				delete body.react;
			}
			if (layout.body) headers.set("Content-Type", "application/json");
			const payload = layout.body ? JSON.stringify(body) : undefined;
			const replayable = ["GET", "HEAD", "PUT", "DELETE"].includes(method) || (layout.reactEmail && !!headers.get("Idempotency-Key"));
			try {
				for (let i = 0; ; i++) {
					signal.throwIfAborted();
					const res = await this.fetcher(url, { method, headers, body: payload, signal });
					if (res.ok) return res;
					const retry = res.status === 429 || (res.status >= 500 && res.status <= 599);
					const delay = retryDelay(res.headers.get("Retry-After"), i);
					if (!replayable || !retry || i >= retries || delay >= expires - Date.now()) throw await Errors.httpError(res);
					await res.body?.cancel();
					await wait(delay, signal);
				}
			} catch (cause) {
				if (signal.aborted) throw aborted();
				if (cause instanceof Errors.InboundError) throw cause;
				throw new Errors.APIConnectionError({ cause });
			}
		};
		return new APIPromise(send(), async response => {
			if (layout.binary) return response as T;
			if (response.status === 204 || response.status === 205) return undefined as T;
			try { return await response.json() as T; }
			catch (error) { if (signal.aborted) throw aborted(); throw error; }
		}, layout.binary);
	}
}
