export class InboundError extends Error {
	declare readonly status?: number;
	declare readonly code?: string;
	declare readonly body?: unknown;
}

const field = (value: unknown, key: string): unknown =>
	value && typeof value === "object" ? (value as Record<string, unknown>)[key] : undefined;
const text = (...values: unknown[]) => values.find((value): value is string => typeof value === "string" && value.length > 0);

export class APIError<S extends number | undefined = number | undefined, H extends Headers | undefined = Headers | undefined, E extends Object | undefined = Object | undefined> extends InboundError {
	readonly code?: string;
	readonly body: unknown;
	constructor(readonly status: S, readonly error: E, message: string | undefined, readonly headers: H) {
		const detail = field(error, "message");
		const reason = detail ? typeof detail === "string" ? detail : JSON.stringify(detail) : error ? JSON.stringify(error) : message;
		super(status ? `${status} ${reason || "status code (no body)"}` : reason || "(no status code or body)");
		this.code = text(field(field(error, "error"), "code"), field(error, "code"));
		this.body = error === undefined ? message : error;
	}
	static generate(status: number | undefined, body: Object | undefined, message: string | undefined, headers: Headers | undefined): APIError {
		if (!status || !headers) return new APIConnectionError({ message, cause: body instanceof Error ? body : new Error(JSON.stringify(body)) });
		switch (status) {
			case 400: return new BadRequestError(status, body, message, headers);
			case 401: return new AuthenticationError(status, body, message, headers);
			case 403: return new PermissionDeniedError(status, body, message, headers);
			case 404: return new NotFoundError(status, body, message, headers);
			case 409: return new ConflictError(status, body, message, headers);
			case 422: return new UnprocessableEntityError(status, body, message, headers);
			case 429: return new RateLimitError(status, body, message, headers);
			default: return status >= 500 ? new InternalServerError(status, body, message, headers) : new APIError(status, body, message, headers);
		}
	}
}
export class APIConnectionError extends APIError<undefined, undefined, undefined> {
	constructor({ message = "Connection error.", cause }: { message?: string; cause?: unknown } = {}) {
		super(undefined, undefined, message || "Connection error.", undefined);
		this.cause = cause;
	}
}
export class APIConnectionTimeoutError extends APIConnectionError {
	constructor({ message = "Request timed out." }: { message?: string } = {}) { super({ message }); }
}
export class APIUserAbortError extends APIError<undefined, undefined, undefined> {
	constructor({ message }: { message?: string } = {}) { super(undefined, undefined, message || "Request was aborted.", undefined); }
}
export class BadRequestError extends APIError<400, Headers> {}
export class AuthenticationError extends APIError<401, Headers> {}
export class PermissionDeniedError extends APIError<403, Headers> {}
export class NotFoundError extends APIError<404, Headers> {}
export class ConflictError extends APIError<409, Headers> {}
export class UnprocessableEntityError extends APIError<422, Headers> {}
export class RateLimitError extends APIError<429, Headers> {}
export class InternalServerError extends APIError<number, Headers> {}

export async function httpError(response: Response) {
	const raw = await response.text();
	let body: Object | undefined;
	try { body = JSON.parse(raw); } catch { /* Legacy .error is undefined for text. */ }
	return APIError.generate(response.status, body, body ? undefined : raw, response.headers);
}
