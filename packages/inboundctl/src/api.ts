import { type JsonRecord, requestJson } from "./http";
import { type MailboxScope, mailboxQueries } from "./mailbox";

type ListResponse = {
	data?: JsonRecord[];
	pagination?: JsonRecord;
	filters?: JsonRecord;
};

export type InboxOptions = {
	status?: string;
	search?: string;
	timeRange?: string;
	limit: number;
};

export async function listInbox(input: {
	baseUrl: string;
	apiKey: string;
	scope: MailboxScope;
	options: InboxOptions;
}): Promise<JsonRecord> {
	const queries = mailboxQueries(input.scope);
	const responses = await Promise.all(
		queries.map((selector) =>
			requestJson<ListResponse>({
				baseUrl: input.baseUrl,
				path: "/api/e2/emails",
				token: input.apiKey,
				query: {
					type: "received",
					status: input.options.status,
					search: input.options.search,
					time_range: input.options.timeRange,
					limit: input.options.limit,
					...selector,
				},
			}),
		),
	);
	const byId = new Map<string, JsonRecord>();
	for (const item of responses.flatMap((response) => response.data || [])) {
		const id = typeof item.id === "string" ? item.id : JSON.stringify(item);
		byId.set(id, item);
	}
	const data = [...byId.values()]
		.sort((left, right) => timestamp(right) - timestamp(left))
		.slice(0, input.options.limit);

	return {
		data,
		pagination: {
			limit: input.options.limit,
			hasMore: responses.some(
				(response) => response.pagination?.has_more === true,
			),
		},
		context: {
			mailbox: input.scope.name,
			selectors: input.scope.selectors,
			status: input.options.status || "all",
		},
	};
}

export function getEmail(baseUrl: string, apiKey: string, id: string) {
	return requestJson<JsonRecord>({
		baseUrl,
		path: `/api/e2/emails/${encodeURIComponent(id)}`,
		token: apiKey,
	});
}

export function updateEmail(
	baseUrl: string,
	apiKey: string,
	id: string,
	body: { is_read?: boolean; is_archived?: boolean },
) {
	return requestJson<JsonRecord>({
		baseUrl,
		path: `/api/e2/emails/${encodeURIComponent(id)}`,
		method: "PATCH",
		token: apiKey,
		body,
	});
}

export function sendEmail(
	baseUrl: string,
	apiKey: string,
	body: Record<string, unknown>,
) {
	return requestJson<JsonRecord>({
		baseUrl,
		path: "/api/e2/emails",
		method: "POST",
		token: apiKey,
		body,
	});
}

export function replyToEmail(
	baseUrl: string,
	apiKey: string,
	id: string,
	body: Record<string, unknown>,
) {
	return requestJson<JsonRecord>({
		baseUrl,
		path: `/api/e2/emails/${encodeURIComponent(id)}/reply`,
		method: "POST",
		token: apiKey,
		body,
	});
}

export async function listThreads(input: {
	baseUrl: string;
	apiKey: string;
	scope: MailboxScope;
	limit: number;
	unread: boolean;
}) {
	const responses = await Promise.all(
		mailboxQueries(input.scope).map((selector) =>
			requestJson<JsonRecord>({
				baseUrl: input.baseUrl,
				path: "/api/e2/mail/threads",
				token: input.apiKey,
				query: {
					...selector,
					limit: input.limit,
					unread: input.unread || undefined,
				},
			}),
		),
	);
	const byId = new Map<string, JsonRecord>();
	for (const response of responses) {
		const threads = Array.isArray(response.threads) ? response.threads : [];
		for (const value of threads) {
			if (typeof value !== "object" || value === null) continue;
			const thread = value as JsonRecord;
			if (typeof thread.id === "string") byId.set(thread.id, thread);
		}
	}
	return {
		threads: [...byId.values()].slice(0, input.limit),
		context: { mailbox: input.scope.name, selectors: input.scope.selectors },
	};
}

export function getThread(baseUrl: string, apiKey: string, id: string) {
	return requestJson<JsonRecord>({
		baseUrl,
		path: `/api/e2/mail/threads/${encodeURIComponent(id)}`,
		token: apiKey,
	});
}

export function revokeApiKey(baseUrl: string, apiKey: string) {
	return requestJson<{ success: true }>({
		baseUrl,
		path: "/api/e2/auth/revoke-key",
		method: "POST",
		token: apiKey,
		body: {},
	});
}

function timestamp(value: JsonRecord): number {
	const raw = value.created_at;
	return typeof raw === "string" ? new Date(raw).getTime() : 0;
}
