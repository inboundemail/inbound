import { Inbound } from "./client.js";
import {
	APIConnectionError,
	APIError,
	type Fetch,
	type RequestOptions,
} from "./core.js";
import type { EmailSendParams } from "./generated/resources.js";

export type ResendErrorCode =
	| "application_error"
	| "daily_quota_exceeded"
	| "internal_server_error"
	| "invalid_access"
	| "invalid_api_key"
	| "invalid_attachment"
	| "invalid_from_address"
	| "invalid_idempotency_key"
	| "invalid_parameter"
	| "missing_api_key"
	| "missing_required_field"
	| "not_found"
	| "rate_limit_exceeded"
	| "validation_error";

export interface ErrorResponse {
	message: string;
	statusCode: number | null;
	name: ResendErrorCode;
}

export type Response<Data> = (
	| { data: Data; error: null }
	| { data: null; error: ErrorResponse }
) & { headers: Record<string, string> | null };

export interface Attachment {
	content?: string | Uint8Array;
	filename?: string | false;
	path?: string;
	contentType?: string;
	contentId?: string;
}

export interface Tag {
	name: string;
	value: string;
}

interface EmailRenderOptions {
	react: unknown;
	html: string;
	text: string;
}

type RequireAtLeastOne<Value> = {
	[Key in keyof Value]: Required<Pick<Value, Key>> & Partial<Omit<Value, Key>>;
}[keyof Value];

export interface CreateEmailBaseOptions {
	attachments?: Attachment[];
	bcc?: string | string[];
	cc?: string | string[];
	from: string;
	headers?: Record<string, string>;
	replyTo?: string | string[];
	scheduledAt?: string;
	subject: string;
	tags?: Tag[];
	to: string | string[];
	template?: never;
	topicId?: never;
}

export type CreateEmailOptions = RequireAtLeastOne<EmailRenderOptions> &
	CreateEmailBaseOptions;

export interface CreateEmailRequestOptions {
	idempotencyKey?: string;
	headers?: HeadersInit;
	signal?: AbortSignal;
}

export interface CreateEmailResponseSuccess {
	id: string;
}

export type CreateEmailResponse = Response<CreateEmailResponseSuccess>;

export interface ResendOptions {
	baseUrl?: string;
	fetch?: Fetch;
	userAgent?: string;
}

function headersToRecord(headers: Headers): Record<string, string> {
	return Object.fromEntries(headers.entries());
}

function getAttachmentFilename(attachment: Attachment): string {
	if (typeof attachment.filename === "string") return attachment.filename;
	if (attachment.path) {
		try {
			const filename = new URL(attachment.path).pathname.split("/").pop();
			if (filename) return decodeURIComponent(filename);
		} catch {
			const filename = attachment.path.split("/").pop();
			if (filename) return filename;
		}
	}
	return "attachment";
}

function encodeAttachmentContent(
	content: string | Uint8Array | undefined,
): string | undefined {
	if (content === undefined || typeof content === "string") return content;
	return Buffer.from(content).toString("base64");
}

function toInboundPayload(payload: CreateEmailOptions): EmailSendParams {
	return {
		from: payload.from,
		to: payload.to,
		subject: payload.subject,
		html: payload.html,
		text: payload.text,
		react: payload.react,
		cc: payload.cc,
		bcc: payload.bcc,
		reply_to: payload.replyTo,
		scheduled_at: payload.scheduledAt,
		headers: payload.headers,
		tags: payload.tags,
		attachments: payload.attachments?.map((attachment) => ({
			filename: getAttachmentFilename(attachment),
			content: encodeAttachmentContent(attachment.content),
			path: attachment.path,
			content_type: attachment.contentType,
			content_id: attachment.contentId,
		})),
	};
}

function getErrorName(status: number | null): ResendErrorCode {
	if (status === 400 || status === 422) return "validation_error";
	if (status === 401) return "invalid_api_key";
	if (status === 403) return "invalid_access";
	if (status === 404) return "not_found";
	if (status === 429) return "rate_limit_exceeded";
	if (status !== null && status >= 500) return "internal_server_error";
	return "application_error";
}

class ResendEmails {
	constructor(private readonly inbound: Inbound) {}

	send(
		payload: CreateEmailOptions,
		options: CreateEmailRequestOptions = {},
	): Promise<CreateEmailResponse> {
		return this.create(payload, options);
	}

	async create(
		payload: CreateEmailOptions,
		options: CreateEmailRequestOptions = {},
	): Promise<CreateEmailResponse> {
		const requestOptions: RequestOptions = {
			idempotencyKey: options.idempotencyKey,
			headers: options.headers,
			signal: options.signal,
		};

		try {
			const { data, response } = await this.inbound.emails
				.send(toInboundPayload(payload), requestOptions)
				.withResponse();
			return {
				data: { id: data.id },
				error: null,
				headers: headersToRecord(response.headers),
			};
		} catch (error) {
			if (error instanceof APIError) {
				return {
					data: null,
					error: {
						message: error.message,
						statusCode: error.status,
						name: getErrorName(error.status),
					},
					headers: headersToRecord(error.headers),
				};
			}

			return {
				data: null,
				error: {
					message:
						error instanceof APIConnectionError
							? error.message
							: "Unable to send email",
					statusCode: null,
					name: "application_error",
				},
				headers: null,
			};
		}
	}
}

export class Resend {
	readonly key: string;
	readonly baseUrl: string;
	readonly userAgent: string;
	readonly emails: ResendEmails;

	constructor(key?: string, options: ResendOptions = {}) {
		const apiKey =
			key ||
			(typeof process === "undefined"
				? undefined
				: process.env.INBOUND_API_KEY || process.env.RESEND_API_KEY);
		if (!apiKey) {
			throw new Error(
				'Missing API key. Pass it to the constructor `new Resend("key")`.',
			);
		}

		this.key = apiKey;
		this.baseUrl = options.baseUrl ?? "https://inbound.new";
		this.userAgent = options.userAgent ?? "inboundemail-resend-compat";
		const inbound = new Inbound({
			apiKey,
			baseURL: this.baseUrl,
			defaultHeaders: { "User-Agent": this.userAgent },
			fetch: options.fetch,
		});
		this.emails = new ResendEmails(inbound);
	}
}
