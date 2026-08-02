export type Fetch = (
	input: string | URL | Request,
	init?: RequestInit,
) => Promise<Response>;

export interface RequestOptions {
	headers?: HeadersInit;
	signal?: AbortSignal;
	timeout?: number;
	maxRetries?: number;
	idempotencyKey?: string;
	fetchOptions?: Omit<RequestInit, "body" | "headers" | "method" | "signal">;
}

export interface RequestDescriptor {
	method: string;
	path: string;
	query?: Record<string, unknown>;
	body?: unknown | Promise<unknown>;
	responseType?: "arrayBuffer" | "json" | "void";
	options?: RequestOptions;
}

export interface RequestClient {
	request<T>(descriptor: RequestDescriptor): APIPromise<T>;
}

export type OperationBody<Operation> = Operation extends {
	requestBody: { content: { "application/json": infer Body } };
}
	? Body
	: never;

export type OperationQuery<Operation> = Operation extends {
	parameters: { query?: infer Query };
}
	? NonNullable<Query>
	: never;

export type OperationResponse<
	Operation,
	Status extends PropertyKey,
> = Operation extends { responses: infer Responses }
	? Status extends keyof Responses
		? Responses[Status] extends {
				content: { "application/json": infer Body };
			}
			? Body
			: never
		: never
	: never;

export class InboundError extends Error {}

export class APIError extends InboundError {
	readonly status: number;
	readonly headers: Headers;
	readonly error: unknown;

	constructor(
		status: number,
		message: string,
		error: unknown,
		headers: Headers,
	) {
		super(message);
		this.name = "APIError";
		this.status = status;
		this.error = error;
		this.headers = headers;
	}

	static generate(
		status: number,
		message: string,
		error: unknown,
		headers: Headers,
	): APIError {
		const ErrorClass =
			status === 400
				? BadRequestError
				: status === 401
					? AuthenticationError
					: status === 403
						? PermissionDeniedError
						: status === 404
							? NotFoundError
							: status === 409
								? ConflictError
								: status === 422
									? UnprocessableEntityError
									: status === 429
										? RateLimitError
										: status >= 500
											? InternalServerError
											: APIError;
		const instance = new ErrorClass(status, message, error, headers);
		instance.name = ErrorClass.name;
		return instance;
	}
}

export class BadRequestError extends APIError {}
export class AuthenticationError extends APIError {}
export class PermissionDeniedError extends APIError {}
export class NotFoundError extends APIError {}
export class ConflictError extends APIError {}
export class UnprocessableEntityError extends APIError {}
export class RateLimitError extends APIError {}
export class InternalServerError extends APIError {}

export class APIConnectionError extends InboundError {
	readonly cause?: Error;

	constructor(message: string, cause?: Error) {
		super(message);
		this.name = "APIConnectionError";
		this.cause = cause;
	}
}

export class APIConnectionTimeoutError extends APIConnectionError {
	constructor(message = "Request timed out") {
		super(message);
		this.name = "APIConnectionTimeoutError";
	}
}

export class APIUserAbortError extends APIConnectionError {
	constructor(message = "Request was aborted") {
		super(message);
		this.name = "APIUserAbortError";
	}
}

export class APIPromise<T> implements PromiseLike<T> {
	readonly [Symbol.toStringTag] = "Promise";
	private readonly parsed: Promise<T>;

	constructor(
		private readonly response: Promise<Response>,
		parse: (response: Response) => Promise<T>,
	) {
		this.parsed = response.then((value) => parse(value.clone()));
	}

	then<TResult1 = T, TResult2 = never>(
		onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null,
		onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
	): Promise<TResult1 | TResult2> {
		return this.parsed.then(onfulfilled, onrejected);
	}

	catch<TResult = never>(
		onrejected?: ((reason: unknown) => TResult | PromiseLike<TResult>) | null,
	): Promise<T | TResult> {
		return this.parsed.catch(onrejected);
	}

	finally(onfinally?: (() => void) | null): Promise<T> {
		return this.parsed.finally(onfinally ?? undefined);
	}

	async asResponse(): Promise<Response> {
		return (await this.response).clone();
	}

	async withResponse(): Promise<{ data: T; response: Response }> {
		const [data, response] = await Promise.all([
			this.parsed,
			this.response.then((value) => value.clone()),
		]);
		return { data, response };
	}
}

export class APIResource {
	constructor(protected readonly _client: RequestClient) {}
}
