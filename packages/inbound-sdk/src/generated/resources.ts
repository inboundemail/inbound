import {
	type APIPromise,
	APIResource,
	type OperationBody,
	type OperationQuery,
	type OperationResponse,
	type RequestClient,
	type RequestOptions,
} from "../core.js";
import { prepareEmailBody, type ReactEmailOptions } from "../email.js";
import type { operations } from "./schema.js";

export type DomainListParams = OperationQuery<operations["domains.list"]>;
export type DomainListResponse = OperationResponse<
	operations["domains.list"],
	200
>;

export type DomainCreateParams = OperationBody<operations["domains.create"]>;
export type DomainCreateResponse = OperationResponse<
	operations["domains.create"],
	201
>;

export type DomainRetrieveParams = OperationQuery<
	operations["domains.retrieve"]
>;
export type DomainRetrieveResponse = OperationResponse<
	operations["domains.retrieve"],
	200
>;

export type DomainUpdateParams = OperationBody<operations["domains.update"]>;
export type DomainUpdateResponse = OperationResponse<
	operations["domains.update"],
	200
>;

export type DomainDeleteResponse = OperationResponse<
	operations["domains.delete"],
	200
>;

export type EndpointListParams = OperationQuery<operations["endpoints.list"]>;
export type EndpointListResponse = OperationResponse<
	operations["endpoints.list"],
	200
>;

export type EndpointCreateParams = OperationBody<
	operations["endpoints.create"]
>;
export type EndpointCreateResponse = OperationResponse<
	operations["endpoints.create"],
	201
>;

export type EndpointRetrieveResponse = OperationResponse<
	operations["endpoints.retrieve"],
	200
>;

export type EndpointUpdateParams = OperationBody<
	operations["endpoints.update"]
>;
export type EndpointUpdateResponse = OperationResponse<
	operations["endpoints.update"],
	200
>;

export type EndpointDeleteResponse = OperationResponse<
	operations["endpoints.delete"],
	200
>;

export type EndpointTestParams = OperationBody<operations["endpoints.test"]>;
export type EndpointTestResponse = OperationResponse<
	operations["endpoints.test"],
	200
>;

export type EmailAddressListParams = OperationQuery<
	operations["emailAddresses.list"]
>;
export type EmailAddressListResponse = OperationResponse<
	operations["emailAddresses.list"],
	200
>;

export type EmailAddressCreateParams = OperationBody<
	operations["emailAddresses.create"]
>;
export type EmailAddressCreateResponse = OperationResponse<
	operations["emailAddresses.create"],
	201
>;

export type EmailAddressRetrieveResponse = OperationResponse<
	operations["emailAddresses.retrieve"],
	200
>;

export type EmailAddressUpdateParams = OperationBody<
	operations["emailAddresses.update"]
>;
export type EmailAddressUpdateResponse = OperationResponse<
	operations["emailAddresses.update"],
	200
>;

export type EmailAddressDeleteResponse = OperationResponse<
	operations["emailAddresses.delete"],
	200
>;

export type AttachmentRetrieveResponse = ArrayBuffer;

export type BlocklistUnblockParams = OperationBody<
	operations["blocklist.unblock"]
>;
export type BlocklistUnblockResponse = OperationResponse<
	operations["blocklist.unblock"],
	200
>;

export type EmailListParams = OperationQuery<operations["emails.list"]>;
export type EmailListResponse = OperationResponse<
	operations["emails.list"],
	200
>;

export type EmailSendParams = OperationBody<operations["emails.send"]> &
	ReactEmailOptions;
export type EmailSendResponse = OperationResponse<
	operations["emails.send"],
	200
>;

export type EmailRetrieveResponse = OperationResponse<
	operations["emails.retrieve"],
	200
>;

export type EmailUpdateParams = OperationBody<operations["emails.update"]>;
export type EmailUpdateResponse = OperationResponse<
	operations["emails.update"],
	200
>;

export type EmailCancelResponse = OperationResponse<
	operations["emails.cancel"],
	200
>;

export type EmailReplyParams = OperationBody<operations["emails.reply"]> &
	ReactEmailOptions;
export type EmailReplyResponse = OperationResponse<
	operations["emails.reply"],
	200
>;

export type EmailRetryParams = OperationBody<operations["emails.retry"]>;
export type EmailRetryResponse = OperationResponse<
	operations["emails.retry"],
	200
>;

export type MailListParams = OperationQuery<operations["mail.list"]>;
export type MailListResponse = OperationResponse<operations["mail.list"], 200>;

export type MailRetrieveResponse = OperationResponse<
	operations["mail.retrieve"],
	200
>;

export type OnboardingSendDemoParams = OperationBody<
	operations["onboarding.sendDemo"]
>;
export type OnboardingSendDemoResponse = OperationResponse<
	operations["onboarding.sendDemo"],
	201
>;

export type OnboardingCheckReplyResponse = OperationResponse<
	operations["onboarding.checkReply"],
	200
>;

export type GuardListParams = OperationQuery<operations["guard.list"]>;
export type GuardListResponse = OperationResponse<
	operations["guard.list"],
	200
>;

export type GuardCreateParams = OperationBody<operations["guard.create"]>;
export type GuardCreateResponse = OperationResponse<
	operations["guard.create"],
	201
>;

export type GuardRetrieveResponse = OperationResponse<
	operations["guard.retrieve"],
	200
>;

export type GuardUpdateParams = OperationBody<operations["guard.update"]>;
export type GuardUpdateResponse = OperationResponse<
	operations["guard.update"],
	200
>;

export type GuardDeleteResponse = OperationResponse<
	operations["guard.delete"],
	200
>;

export type GuardCheckParams = OperationBody<operations["guard.check"]>;
export type GuardCheckResponse = OperationResponse<
	operations["guard.check"],
	200
>;

export type GuardGenerateParams = OperationBody<operations["guard.generate"]>;
export type GuardGenerateResponse = OperationResponse<
	operations["guard.generate"],
	200
>;

export class Domains extends APIResource {
	list(
		query?: DomainListParams,
		options?: RequestOptions,
	): APIPromise<DomainListResponse> {
		return this._client.request<DomainListResponse>({
			method: "GET",
			path: `/api/e2/domains`,
			query,
			options,
		});
	}

	create(
		body: DomainCreateParams,
		options?: RequestOptions,
	): APIPromise<DomainCreateResponse> {
		return this._client.request<DomainCreateResponse>({
			method: "POST",
			path: `/api/e2/domains`,
			body: body,
			options,
		});
	}

	retrieve(
		id: string,
		query?: DomainRetrieveParams,
		options?: RequestOptions,
	): APIPromise<DomainRetrieveResponse> {
		return this._client.request<DomainRetrieveResponse>({
			method: "GET",
			path: `/api/e2/domains/${encodeURIComponent(String(id))}`,
			query,
			options,
		});
	}

	update(
		id: string,
		body: DomainUpdateParams,
		options?: RequestOptions,
	): APIPromise<DomainUpdateResponse> {
		return this._client.request<DomainUpdateResponse>({
			method: "PATCH",
			path: `/api/e2/domains/${encodeURIComponent(String(id))}`,
			body: body,
			options,
		});
	}

	delete(
		id: string,
		options?: RequestOptions,
	): APIPromise<DomainDeleteResponse> {
		return this._client.request<DomainDeleteResponse>({
			method: "DELETE",
			path: `/api/e2/domains/${encodeURIComponent(String(id))}`,
			options,
		});
	}
}

export class Endpoints extends APIResource {
	list(
		query?: EndpointListParams,
		options?: RequestOptions,
	): APIPromise<EndpointListResponse> {
		return this._client.request<EndpointListResponse>({
			method: "GET",
			path: `/api/e2/endpoints`,
			query,
			options,
		});
	}

	create(
		body: EndpointCreateParams,
		options?: RequestOptions,
	): APIPromise<EndpointCreateResponse> {
		return this._client.request<EndpointCreateResponse>({
			method: "POST",
			path: `/api/e2/endpoints`,
			body: body,
			options,
		});
	}

	retrieve(
		id: string,
		options?: RequestOptions,
	): APIPromise<EndpointRetrieveResponse> {
		return this._client.request<EndpointRetrieveResponse>({
			method: "GET",
			path: `/api/e2/endpoints/${encodeURIComponent(String(id))}`,
			options,
		});
	}

	update(
		id: string,
		body: EndpointUpdateParams,
		options?: RequestOptions,
	): APIPromise<EndpointUpdateResponse> {
		return this._client.request<EndpointUpdateResponse>({
			method: "PUT",
			path: `/api/e2/endpoints/${encodeURIComponent(String(id))}`,
			body: body,
			options,
		});
	}

	delete(
		id: string,
		options?: RequestOptions,
	): APIPromise<EndpointDeleteResponse> {
		return this._client.request<EndpointDeleteResponse>({
			method: "DELETE",
			path: `/api/e2/endpoints/${encodeURIComponent(String(id))}`,
			options,
		});
	}

	test(
		id: string,
		body: EndpointTestParams,
		options?: RequestOptions,
	): APIPromise<EndpointTestResponse> {
		return this._client.request<EndpointTestResponse>({
			method: "POST",
			path: `/api/e2/endpoints/${encodeURIComponent(String(id))}/test`,
			body: body,
			options,
		});
	}
}

export class EmailAddresses extends APIResource {
	list(
		query?: EmailAddressListParams,
		options?: RequestOptions,
	): APIPromise<EmailAddressListResponse> {
		return this._client.request<EmailAddressListResponse>({
			method: "GET",
			path: `/api/e2/email-addresses`,
			query,
			options,
		});
	}

	create(
		body: EmailAddressCreateParams,
		options?: RequestOptions,
	): APIPromise<EmailAddressCreateResponse> {
		return this._client.request<EmailAddressCreateResponse>({
			method: "POST",
			path: `/api/e2/email-addresses`,
			body: body,
			options,
		});
	}

	retrieve(
		id: string,
		options?: RequestOptions,
	): APIPromise<EmailAddressRetrieveResponse> {
		return this._client.request<EmailAddressRetrieveResponse>({
			method: "GET",
			path: `/api/e2/email-addresses/${encodeURIComponent(String(id))}`,
			options,
		});
	}

	update(
		id: string,
		body: EmailAddressUpdateParams,
		options?: RequestOptions,
	): APIPromise<EmailAddressUpdateResponse> {
		return this._client.request<EmailAddressUpdateResponse>({
			method: "PUT",
			path: `/api/e2/email-addresses/${encodeURIComponent(String(id))}`,
			body: body,
			options,
		});
	}

	delete(
		id: string,
		options?: RequestOptions,
	): APIPromise<EmailAddressDeleteResponse> {
		return this._client.request<EmailAddressDeleteResponse>({
			method: "DELETE",
			path: `/api/e2/email-addresses/${encodeURIComponent(String(id))}`,
			options,
		});
	}
}

export class Attachments extends APIResource {
	retrieve(
		id: string,
		filename: string,
		options?: RequestOptions,
	): APIPromise<AttachmentRetrieveResponse> {
		return this._client.request<AttachmentRetrieveResponse>({
			method: "GET",
			path: `/api/e2/attachments/${encodeURIComponent(String(id))}/${encodeURIComponent(String(filename))}`,
			responseType: "arrayBuffer",
			options,
		});
	}
}

export class Blocklist extends APIResource {
	unblock(
		body: BlocklistUnblockParams,
		options?: RequestOptions,
	): APIPromise<BlocklistUnblockResponse> {
		return this._client.request<BlocklistUnblockResponse>({
			method: "POST",
			path: `/api/e2/blocklist/unblock`,
			body: body,
			options,
		});
	}
}

export class Emails extends APIResource {
	list(
		query?: EmailListParams,
		options?: RequestOptions,
	): APIPromise<EmailListResponse> {
		return this._client.request<EmailListResponse>({
			method: "GET",
			path: `/api/e2/emails`,
			query,
			options,
		});
	}

	send(
		body: EmailSendParams,
		options?: RequestOptions,
	): APIPromise<EmailSendResponse> {
		return this._client.request<EmailSendResponse>({
			method: "POST",
			path: `/api/e2/emails`,
			body: prepareEmailBody(body),
			options,
		});
	}

	create(
		body: EmailSendParams,
		options?: RequestOptions,
	): APIPromise<EmailSendResponse> {
		return this.send(body, options);
	}

	retrieve(
		id: string,
		options?: RequestOptions,
	): APIPromise<EmailRetrieveResponse> {
		return this._client.request<EmailRetrieveResponse>({
			method: "GET",
			path: `/api/e2/emails/${encodeURIComponent(String(id))}`,
			options,
		});
	}

	update(
		id: string,
		body: EmailUpdateParams,
		options?: RequestOptions,
	): APIPromise<EmailUpdateResponse> {
		return this._client.request<EmailUpdateResponse>({
			method: "PATCH",
			path: `/api/e2/emails/${encodeURIComponent(String(id))}`,
			body: body,
			options,
		});
	}

	cancel(
		id: string,
		options?: RequestOptions,
	): APIPromise<EmailCancelResponse> {
		return this._client.request<EmailCancelResponse>({
			method: "DELETE",
			path: `/api/e2/emails/${encodeURIComponent(String(id))}`,
			options,
		});
	}

	delete(
		id: string,
		options?: RequestOptions,
	): APIPromise<EmailCancelResponse> {
		return this.cancel(id, options);
	}

	reply(
		id: string,
		body: EmailReplyParams,
		options?: RequestOptions,
	): APIPromise<EmailReplyResponse> {
		return this._client.request<EmailReplyResponse>({
			method: "POST",
			path: `/api/e2/emails/${encodeURIComponent(String(id))}/reply`,
			body: prepareEmailBody(body),
			options,
		});
	}

	retry(
		id: string,
		body: EmailRetryParams,
		options?: RequestOptions,
	): APIPromise<EmailRetryResponse> {
		return this._client.request<EmailRetryResponse>({
			method: "POST",
			path: `/api/e2/emails/${encodeURIComponent(String(id))}/retry`,
			body: body,
			options,
		});
	}
}

export class Mail extends APIResource {
	list(
		query?: MailListParams,
		options?: RequestOptions,
	): APIPromise<MailListResponse> {
		return this._client.request<MailListResponse>({
			method: "GET",
			path: `/api/e2/mail/threads`,
			query,
			options,
		});
	}

	retrieve(
		id: string,
		options?: RequestOptions,
	): APIPromise<MailRetrieveResponse> {
		return this._client.request<MailRetrieveResponse>({
			method: "GET",
			path: `/api/e2/mail/threads/${encodeURIComponent(String(id))}`,
			options,
		});
	}
}

export class Onboarding extends APIResource {
	sendDemo(
		body: OnboardingSendDemoParams,
		options?: RequestOptions,
	): APIPromise<OnboardingSendDemoResponse> {
		return this._client.request<OnboardingSendDemoResponse>({
			method: "POST",
			path: `/api/e2/onboarding/demo`,
			body: body,
			options,
		});
	}

	checkReply(
		options?: RequestOptions,
	): APIPromise<OnboardingCheckReplyResponse> {
		return this._client.request<OnboardingCheckReplyResponse>({
			method: "GET",
			path: `/api/e2/onboarding/check-reply`,
			options,
		});
	}
}

export class Guard extends APIResource {
	list(
		query?: GuardListParams,
		options?: RequestOptions,
	): APIPromise<GuardListResponse> {
		return this._client.request<GuardListResponse>({
			method: "GET",
			path: `/api/e2/guard`,
			query,
			options,
		});
	}

	create(
		body: GuardCreateParams,
		options?: RequestOptions,
	): APIPromise<GuardCreateResponse> {
		return this._client.request<GuardCreateResponse>({
			method: "POST",
			path: `/api/e2/guard`,
			body: body,
			options,
		});
	}

	retrieve(
		id: string,
		options?: RequestOptions,
	): APIPromise<GuardRetrieveResponse> {
		return this._client.request<GuardRetrieveResponse>({
			method: "GET",
			path: `/api/e2/guard/${encodeURIComponent(String(id))}`,
			options,
		});
	}

	update(
		id: string,
		body: GuardUpdateParams,
		options?: RequestOptions,
	): APIPromise<GuardUpdateResponse> {
		return this._client.request<GuardUpdateResponse>({
			method: "PUT",
			path: `/api/e2/guard/${encodeURIComponent(String(id))}`,
			body: body,
			options,
		});
	}

	delete(
		id: string,
		options?: RequestOptions,
	): APIPromise<GuardDeleteResponse> {
		return this._client.request<GuardDeleteResponse>({
			method: "DELETE",
			path: `/api/e2/guard/${encodeURIComponent(String(id))}`,
			options,
		});
	}

	check(
		id: string,
		body: GuardCheckParams,
		options?: RequestOptions,
	): APIPromise<GuardCheckResponse> {
		return this._client.request<GuardCheckResponse>({
			method: "POST",
			path: `/api/e2/guard/${encodeURIComponent(String(id))}/check`,
			body: body,
			options,
		});
	}

	generate(
		body: GuardGenerateParams,
		options?: RequestOptions,
	): APIPromise<GuardGenerateResponse> {
		return this._client.request<GuardGenerateResponse>({
			method: "POST",
			path: `/api/e2/guard/generate`,
			body: body,
			options,
		});
	}
}

export interface GeneratedResources {
	domains: Domains;
	endpoints: Endpoints;
	emailAddresses: EmailAddresses;
	attachments: Attachments;
	blocklist: Blocklist;
	emails: Emails;
	mail: Mail;
	onboarding: Onboarding;
	guard: Guard;
}

export function createGeneratedResources(
	client: RequestClient,
): GeneratedResources {
	return {
		domains: new Domains(client),
		endpoints: new Endpoints(client),
		emailAddresses: new EmailAddresses(client),
		attachments: new Attachments(client),
		blocklist: new Blocklist(client),
		emails: new Emails(client),
		mail: new Mail(client),
		onboarding: new Onboarding(client),
		guard: new Guard(client),
	};
}
