import * as Errors from "./errors.js";
import { multipart, render, toFile } from "./helpers.js";
import { APIPromise, decode } from "./api-promise.js";
export { APIPromise } from "./api-promise.js";

type FetchInit = NonNullable<Parameters<typeof fetch>[1]>;
type FetchOptions = Omit<FetchInit, "method" | "headers" | "body" | "signal"> & { dispatcher?: unknown; agent?: unknown };
type HeaderValue = string | null | undefined;
type HeaderInput = Headers | readonly (readonly HeaderValue[])[] | Record<string, HeaderValue | readonly HeaderValue[]> | null;
type Method = "get" | "head" | "options" | "post" | "patch" | "put" | "delete";
export type Logger = Pick<Console, "debug" | "info" | "warn" | "error">;
export type LogLevel = "off" | "error" | "warn" | "info" | "debug";

export interface RequestOptions {
	headers?: HeaderInput;
	query?: object | null;
	body?: unknown;
	fetchOptions?: FetchOptions;
	idempotencyKey?: string;
	__binaryResponse?: boolean;
	stream?: boolean;
	defaultBaseURL?: string;
	signal?: AbortSignal | null;
	timeout?: number;
	maxRetries?: number;
}
export interface ClientOptions {
	apiKey?: string;
	baseURL?: string | null;
	fetch?: (input: Parameters<typeof fetch>[0], init?: FetchInit) => Promise<Response>;
	timeout?: number;
	maxRetries?: number;
	defaultHeaders?: HeaderInput;
	defaultQuery?: Record<string, string | undefined>;
	fetchOptions?: FetchOptions;
	logLevel?: LogLevel;
	logger?: Logger;
}

export type RawRequest = RequestOptions & { method: Method; path: string };
type MaybePromise<T> = T | Promise<T>;

function mergeHeaders(...layers: (HeaderInput | undefined)[]) {
	const headers = new Headers();
	for (const layer of layers) {
		if (!layer) continue;
		const seen = new Set<string>();
		const rows = layer instanceof Headers ? layer.entries() : Array.isArray(layer) ? layer : Object.entries(layer);
		for (const [name, entry] of rows) {
			for (const value of Array.isArray(entry) ? entry : [entry]) {
				if (value === undefined) continue;
				const key = name.toLowerCase();
				if (!seen.has(key) || value === null) headers.delete(key);
				seen.add(key);
				if (value !== null) headers.append(key, value);
			}
		}
	}
	return headers;
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
	idempotent?: "header";
}
function retryDelay(headers: Headers | undefined, attempt: number) {
	const ms = headers?.get("retry-after-ms");
	const after = headers?.get("retry-after");
	const delay = ms != null && Number.isFinite(Number(ms)) ? Number(ms) : after ? (/^\d+(\.\d+)?$/.test(after) ? Number(after) * 1000 : Date.parse(after) - Date.now()) : NaN;
	return Number.isFinite(delay) && delay >= 0 ? Math.min(delay, 60_000) : Math.min(500 * 2 ** attempt, 5000) * (1 - Math.random() / 4);
}

function wait(ms: number, signal?: AbortSignal | null) {
	return new Promise<void>((resolve, reject) => {
		if (signal?.aborted) throw new Errors.APIUserAbortError();
		const abort = () => { clearTimeout(timer); reject(new Errors.APIUserAbortError()); };
		const timer = setTimeout(() => { signal?.removeEventListener("abort", abort); resolve(); }, ms);
		signal?.addEventListener("abort", abort, { once: true });
	});
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
	apiKey: string;
	baseURL: string;
	timeout: number;
	maxRetries: number;
	logger: Logger;
	logLevel: LogLevel;
	fetchOptions?: FetchOptions;
	private readonly fetcher: NonNullable<ClientOptions["fetch"]>;

	constructor(private readonly options: ClientOptions) {
		if (typeof window !== "undefined" && typeof window.document !== "undefined") throw new Errors.InboundError("Use Inbound on the server, not in a browser exposing a secret API key");
		const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
		const apiKey = options.apiKey ?? env?.INBOUND_API_KEY;
		if (!apiKey) throw new Errors.InboundError("Set apiKey or INBOUND_API_KEY");
		this.apiKey = apiKey;
		this.baseURL = ((options.baseURL ?? env?.INBOUND_BASE_URL) || "https://inbound.new").replace(/\/+$/, "");
		this.timeout = options.timeout ?? Transport.DEFAULT_TIMEOUT;
		this.maxRetries = options.maxRetries ?? 2;
		this.fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
		this.fetchOptions = options.fetchOptions;
		this.logger = options.logger ?? console;
		const log = env?.INBOUND_LOG;
		this.logLevel = options.logLevel ?? (["off", "error", "warn", "info", "debug"].includes(log ?? "") ? log as LogLevel : "warn");
	}

	withOptions(options: Partial<ClientOptions>): this {
		const Client = this.constructor as new (opts: ClientOptions) => this;
		return new Client({ ...this.options, apiKey: this.apiKey, baseURL: this.baseURL, timeout: this.timeout, maxRetries: this.maxRetries, fetchOptions: this.fetchOptions, logger: this.logger, logLevel: this.logLevel, ...options });
	}
	get<T>(path: string, opts?: MaybePromise<RequestOptions>) { return this.method<T>("get", path, opts); }
	post<T>(path: string, opts?: MaybePromise<RequestOptions>) { return this.method<T>("post", path, opts); }
	put<T>(path: string, opts?: MaybePromise<RequestOptions>) { return this.method<T>("put", path, opts); }
	patch<T>(path: string, opts?: MaybePromise<RequestOptions>) { return this.method<T>("patch", path, opts); }
	delete<T>(path: string, opts?: MaybePromise<RequestOptions>) { return this.method<T>("delete", path, opts); }
	private method<T>(method: Method, path: string, opts?: MaybePromise<RequestOptions>) {
		return this.request<T>(Promise.resolve(opts).then(options => ({ ...options, method, path })));
	}
	request<T>(input: MaybePromise<RawRequest>, remainingRetries?: number | null): APIPromise<T> {
		return this.execute<T>(input, remainingRetries);
	}
	private execute<T>(input: MaybePromise<RawRequest>, remainingRetries?: number | null, idempotent?: Layout["idempotent"]): APIPromise<T> {
		const options = Promise.resolve(input);
		return new APIPromise(options.then(o => this.send(o, remainingRetries, idempotent)), async response => decode<T>(response, (await options).__binaryResponse));
	}
	resourceRequest<T>(method: string, path: string, params: Record<string, unknown>, layout: Layout, options: RequestOptions = {}): APIPromise<T> {
		const body = { ...params };
		const query: Record<string, unknown> = {};
		for (const key of layout.query ?? []) {
			if (Object.hasOwn(params, key)) query[key] = params[key];
			delete body[key];
		}
		const headers: Record<string, string> = {};
		for (const [key, wire] of Object.entries(layout.headers ?? {})) {
			if (params[key] != null) headers[wire] = String(params[key]);
			delete body[key];
		}
		const prepare = async () => {
			if (layout.reactEmail && body.react != null) body.html = await render(body.react);
			if (layout.reactEmail) delete body.react;
			return { ...options, path, method: method.toLowerCase() as Method, query: { ...query, ...options.query },
				modeledHeaders: headers, body: layout.body ? body : undefined, __binaryResponse: layout.binary };
		};
		return this.execute<T>(prepare(), undefined, layout.idempotent);
	}
	private async send(options: RawRequest & { modeledHeaders?: HeaderInput }, remaining?: number | null, idempotent?: Layout["idempotent"]) {
		const method = options.method.toUpperCase();
		const timeout = options.timeout ?? this.timeout;
		const retries = remaining ?? options.maxRetries ?? this.maxRetries;
		if (!Number.isSafeInteger(timeout) || timeout < 1 || timeout > 2_147_483_647) throw new RangeError("Invalid timeout");
		if (!Number.isSafeInteger(retries) || retries < 0) throw new RangeError("Invalid maxRetries");
		const baseURL = this.baseURL === "https://inbound.new" ? options.defaultBaseURL ?? this.baseURL : this.baseURL;
		const url = new URL(/^https?:\/\//i.test(options.path) ? options.path : baseURL.replace(/\/+$/, "") + "/" + options.path.replace(/^\/+/, ""));
		for (const [k, v] of Object.entries({ ...this.options.defaultQuery, ...options.query })) {
			url.searchParams.delete(k);
			if (v != null) for (const item of Array.isArray(v) ? v : [v]) url.searchParams.append(k, String(item));
		}
		if (method === "GET" && /\/folders\/[^/]+\/messages$/.test(url.pathname) && Number(url.searchParams.get("offset")) && (url.searchParams.has("sinceUid") || url.searchParams.has("sinceModseq"))) throw new TypeError("Incremental folder listings cannot use a nonzero offset");
		const body = options.body;
		let payload: FetchInit["body"];
		let contentType: string | undefined;
		const streaming = body !== null && typeof body === "object" && !(body instanceof Blob) && (body instanceof ReadableStream || Symbol.asyncIterator in body);
		if (body != null) {
			if (streaming || body instanceof FormData || body instanceof Blob || body instanceof URLSearchParams || body instanceof ArrayBuffer || ArrayBuffer.isView(body)) payload = body as FetchInit["body"];
			else if (typeof body === "string" && mergeHeaders(options.headers).has("Content-Type")) payload = body;
			else {
				payload = typeof body === "object" ? await multipart(body) : undefined;
				if (!payload) { payload = JSON.stringify(body); contentType = "application/json"; }
			}
		}
		const headers = mergeHeaders({ Authorization: `Bearer ${this.apiKey}` }, this.options.defaultHeaders, { "Content-Type": contentType }, options.modeledHeaders, { "Idempotency-Key": options.idempotencyKey }, options.headers);
		const safe = !streaming && (["GET", "HEAD", "OPTIONS", "PUT", "DELETE"].includes(method) || (method === "POST" && idempotent === "header" && !!headers.get("Idempotency-Key")));
		for (let i = 0; ; i++) {
			if (options.signal?.aborted) throw new Errors.APIUserAbortError();
			const controller = new AbortController();
			const abort = () => controller.abort();
			const signal = options.signal && typeof AbortSignal.any === "function" ? AbortSignal.any([options.signal, controller.signal]) : controller.signal;
			if (signal === controller.signal) options.signal?.addEventListener("abort", abort, { once: true });
			const timer = setTimeout(abort, timeout);
			let res: Response | undefined;
			try {
				if (this.logLevel === "debug") this.logger.debug(`Inbound request ${method} ${url.pathname} (attempt ${i + 1})`);
				res = await this.fetcher.call(undefined, url, { ...this.fetchOptions, ...options.fetchOptions, ...(streaming && { duplex: "half" }), method, headers, body: payload, signal });
			} catch (cause) {
				if (options.signal?.aborted) throw new Errors.APIUserAbortError();
				if (!safe || i >= retries) {
					const timeout = controller.signal.aborted || (cause instanceof Error && (cause.name === "AbortError" || /timed? ?out/i.test(`${cause} ${cause.cause}`)));
					throw timeout ? new Errors.APIConnectionTimeoutError() : new Errors.APIConnectionError({ cause });
				}
			} finally {
				clearTimeout(timer);
				if (!res?.ok) options.signal?.removeEventListener("abort", abort);
			}
			if (res) {
				if (this.logLevel === "debug") this.logger.debug(`Inbound response ${method} ${url.pathname}: ${res.status}`);
				if (res.ok) return res;
				const hint = res.headers.get("x-should-retry");
				const retry = hint === "true" || (hint !== "false" && ([408, 409, 429].includes(res.status) || res.status >= 500));
				if (!safe || !retry || i >= retries) throw await Errors.httpError(res);
				await res.body?.cancel();
			}
			await wait(retryDelay(res?.headers, i), options.signal);
		}
	}
}
