export { type ClientOptions, Inbound as default, Inbound } from "./client.js";
export {
	APIConnectionError,
	APIConnectionTimeoutError,
	APIError,
	APIPromise,
	APIUserAbortError,
	AuthenticationError,
	BadRequestError,
	ConflictError,
	InboundError,
	InternalServerError,
	NotFoundError,
	PermissionDeniedError,
	RateLimitError,
	type RequestOptions,
	UnprocessableEntityError,
} from "./core.js";
export { render } from "./email.js";
export * from "./generated/resources.js";
export {
	type Attachment as ResendAttachment,
	type CreateEmailOptions,
	type CreateEmailRequestOptions,
	type CreateEmailResponse,
	type CreateEmailResponseSuccess,
	type ErrorResponse as ResendErrorResponse,
	Resend,
	type ResendOptions,
	type Response as ResendResponse,
	type Tag as ResendTag,
} from "./resend.js";
export {
	type InboundWebhookPayload,
	isInboundWebhookPayload,
	verifyWebhookFromHeaders,
} from "./webhooks.js";
