export class InboundError extends Error {
	constructor(message: string, readonly status?: number, readonly code?: string, readonly body?: unknown) {
		super(message);
		this.name = new.target.name;
	}
}

const field = (value: unknown, key: string): unknown =>
	value && typeof value === "object" ? (value as Record<string, unknown>)[key] : undefined;
const text = (...values: unknown[]) => values.find((value): value is string => typeof value === "string" && value.length > 0);

export class APIError extends InboundError {
	constructor(status: number | undefined, readonly error: unknown, message: string | undefined, readonly headers?: Headers) {
		const inner = field(error, "error");
		const reason = text(field(inner, "message"), field(error, "message"), inner, error, message);
		super([status, reason].filter(Boolean).join(" ") || "API error", status, text(field(inner, "code"), field(error, "code")), error);
	}
}
export class APIConnectionError extends APIError {
	constructor({ message = "Connection error.", cause }: { message?: string; cause?: unknown } = {}) {
		super(undefined, undefined, message);
		this.cause = cause;
	}
}
export class APIConnectionTimeoutError extends APIConnectionError {
	constructor({ message = "Request timed out." }: { message?: string } = {}) { super({ message }); }
}
export class APIUserAbortError extends APIError {
	constructor({ message = "Request was aborted." }: { message?: string } = {}) { super(undefined, undefined, message); }
}
export class BadRequestError extends APIError {}
export class AuthenticationError extends APIError {}
export class PermissionDeniedError extends APIError {}
export class NotFoundError extends APIError {}
export class ConflictError extends APIError {}
export class UnprocessableEntityError extends APIError {}
export class RateLimitError extends APIError {}
export class InternalServerError extends APIError {}

export async function httpError(response: Response) {
	const raw = await response.text();
	let body: unknown = raw;
	try { body = JSON.parse(raw); } catch { /* Non-JSON errors retain their original body. */ }
	const classes: Record<number, typeof APIError> = { 400: BadRequestError, 401: AuthenticationError, 403: PermissionDeniedError, 404: NotFoundError, 409: ConflictError, 422: UnprocessableEntityError, 429: RateLimitError };
	const ErrorClass = classes[response.status] ?? (response.status >= 500 ? InternalServerError : APIError);
	return new ErrorClass(response.status, body, response.statusText, response.headers);
}
