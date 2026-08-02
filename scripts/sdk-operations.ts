export const HTTP_METHODS = ["get", "post", "put", "patch", "delete"] as const;

export type HttpMethod = (typeof HTTP_METHODS)[number];

export const SDK_RESOURCES = {
	attachments: { className: "Attachments", typePrefix: "Attachment" },
	blocklist: { className: "Blocklist", typePrefix: "Blocklist" },
	domains: { className: "Domains", typePrefix: "Domain" },
	emailAddresses: {
		className: "EmailAddresses",
		typePrefix: "EmailAddress",
	},
	emails: { className: "Emails", typePrefix: "Email" },
	endpoints: { className: "Endpoints", typePrefix: "Endpoint" },
	guard: { className: "Guard", typePrefix: "Guard" },
	mail: { className: "Mail", typePrefix: "Mail" },
	onboarding: { className: "Onboarding", typePrefix: "Onboarding" },
} as const;

export type SdkResourceName = keyof typeof SDK_RESOURCES;

export interface SdkOperationConfig {
	resource: SdkResourceName;
	method: string;
	aliases?: readonly string[];
	responseType?: "arrayBuffer" | "json";
	prepareEmailBody?: boolean;
}

export const SDK_OPERATIONS = {
	"GET /api/e2/attachments/{id}/{filename}": {
		resource: "attachments",
		method: "retrieve",
		responseType: "arrayBuffer",
	},
	"POST /api/e2/blocklist/unblock": {
		resource: "blocklist",
		method: "unblock",
	},
	"GET /api/e2/domains": { resource: "domains", method: "list" },
	"POST /api/e2/domains": { resource: "domains", method: "create" },
	"GET /api/e2/domains/{id}": {
		resource: "domains",
		method: "retrieve",
	},
	"PATCH /api/e2/domains/{id}": {
		resource: "domains",
		method: "update",
	},
	"DELETE /api/e2/domains/{id}": {
		resource: "domains",
		method: "delete",
	},
	"GET /api/e2/endpoints": { resource: "endpoints", method: "list" },
	"POST /api/e2/endpoints": { resource: "endpoints", method: "create" },
	"GET /api/e2/endpoints/{id}": {
		resource: "endpoints",
		method: "retrieve",
	},
	"PUT /api/e2/endpoints/{id}": {
		resource: "endpoints",
		method: "update",
	},
	"DELETE /api/e2/endpoints/{id}": {
		resource: "endpoints",
		method: "delete",
	},
	"POST /api/e2/endpoints/{id}/test": {
		resource: "endpoints",
		method: "test",
	},
	"GET /api/e2/email-addresses": {
		resource: "emailAddresses",
		method: "list",
	},
	"POST /api/e2/email-addresses": {
		resource: "emailAddresses",
		method: "create",
	},
	"GET /api/e2/email-addresses/{id}": {
		resource: "emailAddresses",
		method: "retrieve",
	},
	"PUT /api/e2/email-addresses/{id}": {
		resource: "emailAddresses",
		method: "update",
	},
	"DELETE /api/e2/email-addresses/{id}": {
		resource: "emailAddresses",
		method: "delete",
	},
	"POST /api/e2/emails": {
		resource: "emails",
		method: "send",
		aliases: ["create"],
		prepareEmailBody: true,
	},
	"GET /api/e2/emails": { resource: "emails", method: "list" },
	"GET /api/e2/emails/{id}": {
		resource: "emails",
		method: "retrieve",
	},
	"PATCH /api/e2/emails/{id}": {
		resource: "emails",
		method: "update",
	},
	"DELETE /api/e2/emails/{id}": {
		resource: "emails",
		method: "cancel",
		aliases: ["delete"],
	},
	"POST /api/e2/emails/{id}/reply": {
		resource: "emails",
		method: "reply",
		prepareEmailBody: true,
	},
	"POST /api/e2/emails/{id}/retry": {
		resource: "emails",
		method: "retry",
	},
	"GET /api/e2/mail/threads": { resource: "mail", method: "list" },
	"GET /api/e2/mail/threads/{id}": {
		resource: "mail",
		method: "retrieve",
	},
	"POST /api/e2/onboarding/demo": {
		resource: "onboarding",
		method: "sendDemo",
	},
	"GET /api/e2/onboarding/check-reply": {
		resource: "onboarding",
		method: "checkReply",
	},
	"GET /api/e2/guard": { resource: "guard", method: "list" },
	"POST /api/e2/guard": { resource: "guard", method: "create" },
	"GET /api/e2/guard/{id}": { resource: "guard", method: "retrieve" },
	"PUT /api/e2/guard/{id}": { resource: "guard", method: "update" },
	"DELETE /api/e2/guard/{id}": { resource: "guard", method: "delete" },
	"POST /api/e2/guard/{id}/check": {
		resource: "guard",
		method: "check",
	},
	"POST /api/e2/guard/generate": {
		resource: "guard",
		method: "generate",
	},
} as const satisfies Record<string, SdkOperationConfig>;

export function getSdkOperationKey(method: string, path: string): string {
	return `${method.toUpperCase()} ${path}`;
}

export function getSdkOperationId(config: SdkOperationConfig): string {
	return `${config.resource}.${config.method}`;
}
