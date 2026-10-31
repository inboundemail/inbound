import type { Inbound } from "./generated/index.js";
import type { RawRequest } from "./runtime.js";

interface ResponseContext {
	response: Response;
	options: RawRequest;
	controller: AbortController;
	requestLogID: string;
	retryOfRequestLogID: string | undefined;
	startTime: number;
}
export async function decode<T>(response: Response, binary?: boolean): Promise<T> {
	if (response.status === 204) return null as T;
	if (binary) return response as T;
	const media = response.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase();
	return (media === "application/json" || media?.endsWith("+json") ? await response.json() : await response.text()) as T;
}
export class APIPromise<T> extends Promise<T> {
	private parsed?: Promise<T>;
	private readonly raw: Promise<Response>;
	private readonly parse: () => Promise<T>;
	constructor(raw: Promise<Response>, parse: (r: Response) => Promise<T>);
	constructor(client: Inbound, props: Promise<ResponseContext>, parse?: (client: Inbound, context: ResponseContext) => T | Promise<T>);
	constructor(client: Inbound | Promise<Response>, props: Promise<ResponseContext> | ((r: Response) => Promise<T>), parse?: (client: Inbound, context: ResponseContext) => T | Promise<T>) {
		super(resolve => resolve(undefined as T));
		if (typeof props === "function") {
			this.raw = client as Promise<Response>;
			this.parse = () => this.raw.then(props);
		} else {
			this.raw = props.then(p => p.response);
			this.parse = () => props.then(p => parse ? parse(client as Inbound, p) : decode<T>(p.response, p.options.__binaryResponse));
		}
		// The response may arrive before the caller chooses a body reader.
		this.raw.catch(() => undefined);
	}
	private data() { this.parsed ??= this.parse(); return this.parsed; }
	asResponse() { return this.raw; }
	async withResponse(): Promise<{ data: T; response: Response }> { return { data: await this.data(), response: await this.raw }; }
	override then<A = T, B = never>(ok?: ((v: T) => A | PromiseLike<A>) | null, fail?: ((reason: unknown) => B | PromiseLike<B>) | null) { return this.data().then(ok, fail); }
	override catch<B = never>(fail?: ((reason: unknown) => B | PromiseLike<B>) | null) { return this.data().catch(fail); }
	override finally(cb?: (() => void) | null) { return this.data().finally(cb); }
}
