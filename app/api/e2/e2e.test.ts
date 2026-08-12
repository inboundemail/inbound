/**
 * E2 API - End-to-end email flow tests
 * Covers outbound sending plus inbound parsing (text/html/attachments).
 */

// @ts-ignore - bun:test is a Bun-specific module not recognized by TypeScript
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { type ChildProcess, spawn } from "node:child_process";
import ngrok from "@ngrok/ngrok";
import dotenv from "dotenv";

dotenv.config();

function envString(name: string): string | null {
	const value = process.env[name];
	if (!value) {
		return null;
	}

	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

function envFlag(name: string): boolean {
	const value = envString(name);
	if (!value) {
		return false;
	}

	return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

const TEST_RUN_TOKEN = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

let API_URL =
	envString("INBOUND_E2_API_URL") || "https://dev.inbound.new/api/e2";
const API_KEY = process.env.INBOUND_API_KEY;

const LOCAL_PORT = 8778;
const LOCAL_BASE_URL = `http://127.0.0.1:${LOCAL_PORT}`;
const TUNNEL_DOMAIN =
	envString("INBOUND_E2_TUNNEL_DOMAIN") || "dev.inbound.new";
const E2_API_BASE_URL =
	envString("INBOUND_E2_PUBLIC_API_URL") || `https://${TUNNEL_DOMAIN}/api/e2`;
const TEST_WEBHOOK_PATH =
	envString("INBOUND_E2_TEST_WEBHOOK_PATH") || "/api/development/testing";
const TEST_WEBHOOK_URL =
	envString("INBOUND_E2_TEST_WEBHOOK_URL") ||
	`https://${TUNNEL_DOMAIN}${TEST_WEBHOOK_PATH}`;
const TEST_ENDPOINT_NAME =
	envString("INBOUND_E2_ENDPOINT_NAME") ||
	`e2e-dev-testing-webhook-${TEST_RUN_TOKEN}`;
const E2E_SENDER_ADDRESS =
	envString("INBOUND_E2_SENDER_ADDRESS") || "e2e-testing@inbound.new";
const E2E_RECIPIENT_ADDRESS =
	envString("INBOUND_E2_RECIPIENT_ADDRESS") || "e2e-receive@inbound.new";

if (!API_KEY) {
	console.error("❌ INBOUND_API_KEY not found in environment variables");
	process.exit(1);
}

const RATE_LIMIT_CONFIG = {
	maxRetries: 3,
	baseDelayMs: 150,
	retryDelayMs: 1000,
};

const POLL_CONFIG = {
	inboundTimeoutMs: 120000,
	threadTimeoutMs: 120000,
	intervalMs: 3000,
};

const TEST_TIMEOUT_MS = 180000;
const SHOW_LOCAL_SERVER_LOGS =
	process.argv.includes("--verbose") ||
	envFlag("INBOUND_E2_VERBOSE_SERVER_LOGS");

let lastRequestTime = 0;
let resolvedApiUrlPromise: Promise<string> | null = null;

type EmailAddressListItem = {
	id: string;
	address: string;
	isActive: boolean;
	isReceiptRuleConfigured: boolean;
	endpointId?: string | null;
	webhookId?: string | null;
};

type EmailAddressListResponse = {
	data: EmailAddressListItem[];
	pagination: {
		limit: number;
		offset: number;
		total: number;
		hasMore: boolean;
	};
};

type SendEmailResponse = {
	id: string;
	message_id?: string;
};

type EmailListItem = {
	id: string;
	type: "sent" | "received" | "scheduled";
	subject: string;
	from: string;
	to: string[];
	has_attachments: boolean;
	thread_id?: string | null;
};

type EmailListResponse = {
	data: EmailListItem[];
	pagination: {
		limit: number;
		offset: number;
		total: number;
		has_more: boolean;
	};
};

type EmailAttachment = {
	filename?: string;
	contentType?: string;
	content_type?: string;
	size?: number;
	downloadUrl?: string;
	download_url?: string;
};

type EmailDetailResponse = {
	object: "email";
	id: string;
	type: "sent" | "received" | "scheduled";
	from: string;
	to: string[];
	subject: string;
	html?: string | null;
	text?: string | null;
	status: string;
	has_attachments: boolean;
	attachments?: EmailAttachment[];
	thread_id?: string | null;
};

type ThreadSummary = {
	id: string;
	latest_message?: {
		id: string;
		type: "inbound" | "outbound";
		has_attachments: boolean;
	} | null;
};

type ThreadListResponse = {
	threads: ThreadSummary[];
};

type ThreadMessage = {
	id: string;
	type: "inbound" | "outbound";
	subject?: string | null;
	text_body?: string | null;
	html_body?: string | null;
	to: string[];
	has_attachments: boolean;
	attachments: EmailAttachment[];
};

type ThreadDetailResponse = {
	thread: { id: string; message_count: number };
	messages: ThreadMessage[];
	total_count: number;
};

type RoundTripState = {
	recipientAddress: string;
	subject: string;
	textMarker: string;
	htmlMarker: string;
	attachmentName: string;
	attachmentContent: string;
	sentEmailId: string;
	sentEmail: EmailDetailResponse;
	receivedEmailId: string;
	receivedEmail: EmailDetailResponse;
	threadId: string;
	thread: ThreadDetailResponse;
};

type EndpointWebhookConfig = {
	url?: string;
	timeout?: number;
	retryAttempts?: number;
	headers?: Record<string, string>;
};

type EndpointListItem = {
	id: string;
	name: string;
	type: "webhook" | "email" | "email_group";
	config: EndpointWebhookConfig;
};

type EndpointListResponse = {
	data: EndpointListItem[];
};

type EndpointDetailDelivery = {
	id: string;
	emailId: string | null;
	status: string;
	responseData: {
		url?: string;
	} | null;
};

type EndpointDetailResponse = {
	id: string;
	name: string;
	config: EndpointWebhookConfig;
	recentDeliveries: EndpointDetailDelivery[];
};

type DomainListItem = {
	id: string;
	domain: string;
};

type DomainListResponse = {
	data: DomainListItem[];
	pagination: {
		limit: number;
		offset: number;
		total: number;
		hasMore: boolean;
	};
};

type EmailAddressUpdateResponse = {
	id: string;
	address: string;
	endpointId: string | null;
	webhookId: string | null;
	isActive: boolean;
};

type EndpointMutationResponse = {
	id: string;
	name: string;
	type: "webhook" | "email" | "email_group";
	config: EndpointWebhookConfig;
	isActive: boolean;
	description?: string | null;
};

type EndpointDeleteResponse = {
	message: string;
};

type InboundWebhookResponse = {
	success: boolean;
	processedEmails: number;
	rejectedEmails: number;
};

const e2eCache: {
	recipientAddress: string | null;
	roundTripPromise: Promise<RoundTripState | null> | null;
} = {
	recipientAddress: null,
	roundTripPromise: null,
};

let localServerProcess: ChildProcess | null = null;
let ngrokListener: Awaited<ReturnType<typeof ngrok.forward>> | null = null;
let managedEndpointId: string | null = null;
let createdManagedEndpoint = false;
let managedEmailAddressId: string | null = null;
let originalRecipientEndpointId: string | null = null;
let originalRecipientWebhookId: string | null = null;
let originalRecipientIsActive: boolean | null = null;
let createdManagedRecipientAddress = false;

async function sleep(ms: number): Promise<void> {
	await new Promise((resolve) => setTimeout(resolve, ms));
}

async function resolveApiUrl(): Promise<string> {
	if (resolvedApiUrlPromise) {
		return resolvedApiUrlPromise;
	}

	resolvedApiUrlPromise = (async () => {
		const configuredApiUrl = envString("INBOUND_E2_API_URL");
		const candidates = configuredApiUrl
			? [configuredApiUrl]
			: ["https://dev.inbound.new/api/e2", "https://inbound.new/api/e2"];

		for (const candidate of candidates) {
			try {
				const response = await fetch(`${candidate}/openapi.json`);
				if (!response.ok) {
					continue;
				}

				const raw = await response.text();
				const parsed = JSON.parse(raw) as { openapi?: string };
				if (parsed.openapi) {
					API_URL = candidate;
					console.log(`🌐 Using E2 API base URL: ${API_URL}`);
					return candidate;
				}
			} catch {
				// Try next candidate URL
			}
		}

		if (configuredApiUrl) {
			throw new Error(
				`Configured INBOUND_E2_API_URL did not return a valid OpenAPI response: ${configuredApiUrl}`,
			);
		}

		throw new Error(
			"Could not resolve a working E2 API base URL. Set INBOUND_E2_API_URL to override.",
		);
	})();

	return resolvedApiUrlPromise;
}

async function apiRequest(
	endpoint: string,
	options: RequestInit = {},
	retryCount = 0,
): Promise<Response> {
	const baseUrl = await resolveApiUrl();
	const now = Date.now();
	const timeSinceLastRequest = now - lastRequestTime;
	if (timeSinceLastRequest < RATE_LIMIT_CONFIG.baseDelayMs) {
		await sleep(RATE_LIMIT_CONFIG.baseDelayMs - timeSinceLastRequest);
	}
	lastRequestTime = Date.now();

	const response = await fetch(`${baseUrl}${endpoint}`, {
		...options,
		headers: {
			Authorization: `Bearer ${API_KEY}`,
			"Content-Type": "application/json",
			...options.headers,
		},
	});

	if (response.status === 429 && retryCount < RATE_LIMIT_CONFIG.maxRetries) {
		const retryAfterDelayMs = parseRetryAfterDelayMs(
			response.headers.get("Retry-After"),
		);
		const delayMs =
			retryAfterDelayMs ?? RATE_LIMIT_CONFIG.retryDelayMs * 2 ** retryCount;

		console.log(
			`⏳ Rate limited, retrying in ${delayMs}ms (${retryCount + 1}/${RATE_LIMIT_CONFIG.maxRetries})`,
		);
		await sleep(delayMs);
		return apiRequest(endpoint, options, retryCount + 1);
	}

	if (response.status === 401 && retryCount < RATE_LIMIT_CONFIG.maxRetries) {
		const delayMs = 250 * (retryCount + 1);
		console.log(
			`🔁 Received 401, retrying in ${delayMs}ms (${retryCount + 1}/${RATE_LIMIT_CONFIG.maxRetries})`,
		);
		await sleep(delayMs);
		return apiRequest(endpoint, options, retryCount + 1);
	}

	return response;
}

async function apiJson<T>(
	endpoint: string,
	options: RequestInit = {},
): Promise<{ response: Response; data: T }> {
	const response = await apiRequest(endpoint, options);
	const raw = await response.text();

	let data: T;
	try {
		data = JSON.parse(raw) as T;
	} catch {
		throw new Error(
			`Non-JSON response from ${endpoint} (status ${response.status}): ${raw.slice(0, 300)}`,
		);
	}

	return { response, data };
}

async function apiRequestWithKey(
	endpoint: string,
	apiKey: string,
	options: RequestInit = {},
): Promise<Response> {
	const baseUrl = await resolveApiUrl();
	return fetch(`${baseUrl}${endpoint}`, {
		...options,
		headers: {
			Authorization: `Bearer ${apiKey}`,
			"Content-Type": "application/json",
			...options.headers,
		},
	});
}

async function apiJsonWithKey<T>(
	endpoint: string,
	apiKey: string,
	options: RequestInit = {},
): Promise<{ response: Response; data: T }> {
	const response = await apiRequestWithKey(endpoint, apiKey, options);
	const raw = await response.text();

	let data: T;
	try {
		data = JSON.parse(raw) as T;
	} catch {
		throw new Error(
			`Non-JSON response from ${endpoint} (status ${response.status}): ${raw.slice(0, 300)}`,
		);
	}

	return { response, data };
}

function normalizeMessageIdHeader(rawMessageId: string): string {
	const trimmed = rawMessageId.trim();
	if (trimmed.startsWith("<") && trimmed.endsWith(">")) {
		return trimmed;
	}
	return `<${trimmed}>`;
}

function buildRawEmailContent(options: {
	from: string;
	to: string;
	subject: string;
	messageId: string;
	text: string;
	html?: string;
	inReplyTo?: string;
	references?: string[];
}): string {
	const date = new Date().toUTCString();
	const messageIdHeader = normalizeMessageIdHeader(options.messageId);
	const headers = [
		`From: ${options.from}`,
		`To: ${options.to}`,
		`Subject: ${options.subject}`,
		`Date: ${date}`,
		`Message-ID: ${messageIdHeader}`,
		"MIME-Version: 1.0",
	];

	if (options.inReplyTo) {
		headers.push(`In-Reply-To: ${normalizeMessageIdHeader(options.inReplyTo)}`);
	}

	if (options.references && options.references.length > 0) {
		headers.push(
			`References: ${options.references
				.map((value) => normalizeMessageIdHeader(value))
				.join(" ")}`,
		);
	}

	if (options.html) {
		const boundary = `e2e-alt-${makeToken("mime")}`;
		headers.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);

		return `${headers.join("\r\n")}\r\n\r\n--${boundary}\r\nContent-Type: text/plain; charset=\"UTF-8\"\r\n\r\n${options.text}\r\n--${boundary}\r\nContent-Type: text/html; charset=\"UTF-8\"\r\n\r\n${options.html}\r\n--${boundary}--\r\n`;
	}

	headers.push('Content-Type: text/plain; charset="UTF-8"');
	headers.push("Content-Transfer-Encoding: 7bit");
	return `${headers.join("\r\n")}\r\n\r\n${options.text}\r\n`;
}

async function postSyntheticInboundRecord(options: {
	subject: string;
	messageId: string;
	recipient: string;
	text: string;
	html?: string;
	inReplyTo?: string;
	references?: string[];
	sesMessageId?: string;
	from?: string;
}): Promise<InboundWebhookResponse> {
	const serviceApiKey = process.env.SERVICE_API_KEY;
	if (!serviceApiKey) {
		throw new Error("SERVICE_API_KEY is required for synthetic inbound tests");
	}

	const nowIso = new Date().toISOString();
	const sender = options.from || "synthetic-sender@example.test";
	const sesMessageId = options.sesMessageId || `ses-${makeToken("inbound")}`;
	const commonHeaders: {
		from: string[];
		to: string[];
		subject: string;
		messageId: string;
		date: string;
	} = {
		from: [sender],
		to: [options.recipient],
		subject: options.subject,
		messageId: normalizeMessageIdHeader(options.messageId),
		date: new Date(nowIso).toUTCString(),
	};

	const payload = {
		type: "ses_event_with_content",
		timestamp: nowIso,
		originalEvent: {
			Records: [],
		},
		processedRecords: [
			{
				eventSource: "aws:ses",
				eventVersion: "1.0",
				ses: {
					mail: {
						timestamp: nowIso,
						source: sender,
						messageId: sesMessageId,
						destination: [options.recipient],
						headers: [
							{ name: "From", value: sender },
							{ name: "To", value: options.recipient },
							{ name: "Subject", value: options.subject },
							{
								name: "Message-ID",
								value: normalizeMessageIdHeader(options.messageId),
							},
						],
						commonHeaders,
					},
					receipt: {
						timestamp: nowIso,
						processingTimeMillis: 50,
						recipients: [options.recipient],
						spamVerdict: { status: "PASS" },
						virusVerdict: { status: "PASS" },
						spfVerdict: { status: "PASS" },
						dkimVerdict: { status: "PASS" },
						dmarcVerdict: { status: "PASS" },
						action: {
							type: "S3",
							bucketName: "",
							objectKey: "",
						},
					},
				},
				emailContent: buildRawEmailContent({
					from: sender,
					to: options.recipient,
					subject: options.subject,
					messageId: options.messageId,
					text: options.text,
					html: options.html,
					inReplyTo: options.inReplyTo,
					references: options.references,
				}),
			},
		],
		context: {
			functionName: "e2e-test",
			functionVersion: "1",
			requestId: `req-${makeToken("webhook")}`,
		},
	};

	const response = await fetch(`${LOCAL_BASE_URL}/api/inbound/webhook`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${serviceApiKey}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify(payload),
	});

	const raw = await response.text();
	let data: InboundWebhookResponse;
	try {
		data = JSON.parse(raw) as InboundWebhookResponse;
	} catch {
		throw new Error(
			`Non-JSON response from inbound webhook (status ${response.status}): ${raw.slice(0, 300)}`,
		);
	}

	expect(response.status).toBe(200);
	return data;
}

async function listExactSubjectEmails(
	type: "sent" | "received",
	subject: string,
	limit = 20,
): Promise<EmailListItem[]> {
	const { response, data } = await apiJson<EmailListResponse>(
		`/emails${queryString({
			type,
			search: subject,
			time_range: "1h",
			limit,
			offset: 0,
		})}`,
	);

	if (response.status !== 200) {
		throw new Error(`Failed to list ${type} emails (${response.status})`);
	}

	return data.data.filter((email) => email.subject === subject);
}

async function waitForExactSubjectEmailCount(
	type: "sent" | "received",
	subject: string,
	minimumCount: number,
	timeoutMs = POLL_CONFIG.inboundTimeoutMs,
): Promise<EmailListItem[] | null> {
	return pollFor(
		`${type} email count >= ${minimumCount}`,
		timeoutMs,
		async () => {
			const matches = await listExactSubjectEmails(type, subject, 50);
			return matches.length >= minimumCount ? matches : null;
		},
	);
}

function queryString(
	params: Record<string, string | number | boolean | undefined>,
): string {
	const search = new URLSearchParams();
	for (const [key, value] of Object.entries(params)) {
		if (value !== undefined) {
			search.set(key, String(value));
		}
	}
	const query = search.toString();
	return query ? `?${query}` : "";
}

function parseRetryAfterDelayMs(retryAfterHeader: string | null): number | null {
	if (!retryAfterHeader) {
		return null;
	}

	const seconds = Number.parseInt(retryAfterHeader, 10);
	if (Number.isFinite(seconds) && seconds >= 0) {
		return seconds * 1000;
	}

	const retryAtMs = Date.parse(retryAfterHeader);
	if (!Number.isNaN(retryAtMs)) {
		return Math.max(0, retryAtMs - Date.now());
	}

	return null;
}

function makeToken(prefix: string): string {
	return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function waitForHttpOk(
	url: string,
	label: string,
	timeoutMs = 90000,
): Promise<void> {
	const startedAt = Date.now();

	while (Date.now() - startedAt < timeoutMs) {
		try {
			const response = await fetch(url);
			if (response.ok) {
				console.log(`✅ ${label} is ready: ${url}`);
				return;
			}
		} catch {
			// Keep polling until timeout
		}

		await sleep(1000);
	}

	throw new Error(`Timed out waiting for ${label}: ${url}`);
}

async function startLocalServer(): Promise<void> {
	if (localServerProcess) {
		return;
	}

	console.log(
		`🚀 Starting local Next.js server on port ${LOCAL_PORT} (${SHOW_LOCAL_SERVER_LOGS ? "verbose" : "quiet"} logs)`,
	);
	localServerProcess = spawn(
		"bunx",
		["next", "dev", "--port", String(LOCAL_PORT), "--hostname", "127.0.0.1"],
		{
			env: {
				...process.env,
				PORT: String(LOCAL_PORT),
				INBOUND_E2E_TEST_MODE: "true",
			},
			stdio: SHOW_LOCAL_SERVER_LOGS ? "inherit" : "ignore",
		},
	);
}

async function stopLocalServer(): Promise<void> {
	if (!localServerProcess) {
		return;
	}

	console.log("🛑 Stopping local Next.js server");
	try {
		const exited = new Promise<void>((resolve) => {
			if (!localServerProcess) {
				resolve();
				return;
			}
			localServerProcess.once("exit", () => resolve());
		});
		localServerProcess.kill("SIGTERM");
		await Promise.race([exited, sleep(5000)]);
	} catch {
		// Best effort shutdown
	}
	localServerProcess = null;
}

async function startNgrokTunnel(): Promise<void> {
	if (ngrokListener) {
		return;
	}

	const authtoken =
		process.env.NGROK_AUTHTOKEN?.trim() ||
		process.env.NGROK_AUTH_TOKEN?.trim() ||
		process.env.NGROK_TOKEN?.trim();

	if (!authtoken) {
		throw new Error(
			"NGROK_AUTHTOKEN (or NGROK_AUTH_TOKEN / NGROK_TOKEN) is required to start the reserved dev.inbound.new tunnel",
		);
	}

	console.log(`🌐 Starting ngrok tunnel for ${TUNNEL_DOMAIN} -> ${LOCAL_PORT}`);
	ngrokListener = await ngrok.forward({
		addr: LOCAL_PORT,
		domain: TUNNEL_DOMAIN,
		proto: "http",
		authtoken,
	});

	console.log(`🌐 ngrok public URL: ${ngrokListener.url()}`);
}

async function stopNgrokTunnel(): Promise<void> {
	console.log("🧹 Stopping ngrok tunnel");
	try {
		if (ngrokListener) {
			await ngrokListener.close();
		}
	} catch {
		// Best effort close
	}

	try {
		await ngrok.disconnect();
	} catch {
		// Best effort disconnect
	}

	ngrokListener = null;
}

function normalizeWebhookConfig(
	config: EndpointWebhookConfig,
): EndpointWebhookConfig {
	return {
		url: TEST_WEBHOOK_URL,
		timeout:
			typeof config.timeout === "number" && config.timeout >= 1
				? config.timeout
				: 30,
		retryAttempts:
			typeof config.retryAttempts === "number" && config.retryAttempts >= 0
				? config.retryAttempts
				: 3,
		headers: config.headers,
	};
}

async function ensureTestingEndpoint(): Promise<string> {
	const { response, data } = await apiJson<EndpointListResponse>(
		`/endpoints${queryString({
			type: "webhook",
			search: TEST_ENDPOINT_NAME,
			limit: 100,
			offset: 0,
		})}`,
	);

	if (response.status !== 200) {
		throw new Error(`Failed to list endpoints (${response.status})`);
	}

	const existing = data.data.find(
		(endpoint) => endpoint.name === TEST_ENDPOINT_NAME,
	);
	if (existing) {
		managedEndpointId = existing.id;
		const expectedConfig = normalizeWebhookConfig(existing.config || {});
		const needsUpdate =
			existing.config?.url !== expectedConfig.url ||
			existing.config?.timeout !== expectedConfig.timeout ||
			existing.config?.retryAttempts !== expectedConfig.retryAttempts;

		if (needsUpdate) {
			const updated = await apiJson<EndpointListItem>(
				`/endpoints/${existing.id}`,
				{
					method: "PUT",
					body: JSON.stringify({ config: expectedConfig }),
				},
			);

			if (updated.response.status !== 200) {
				throw new Error(
					`Failed to update webhook endpoint (${updated.response.status})`,
				);
			}
		}

		return existing.id;
	}

	const created = await apiJson<EndpointListItem>("/endpoints", {
		method: "POST",
		body: JSON.stringify({
			name: TEST_ENDPOINT_NAME,
			type: "webhook",
			config: normalizeWebhookConfig({}),
			description: "E2E local ngrok webhook for app/api/e2/e2e.test.ts",
		}),
	});

	if (created.response.status !== 201) {
		throw new Error(
			`Failed to create webhook endpoint (${created.response.status})`,
		);
	}

	managedEndpointId = created.data.id;
	createdManagedEndpoint = true;
	return created.data.id;
}

async function listAllEmailAddresses(
	isActive?: boolean,
): Promise<EmailAddressListItem[]> {
	const all: EmailAddressListItem[] = [];
	let offset = 0;
	const limit = 100;

	while (true) {
		const { response, data } = await apiJson<EmailAddressListResponse>(
			`/email-addresses${queryString({ limit, offset, isActive })}`,
		);

		if (response.status !== 200) {
			throw new Error(`Failed to list email addresses (${response.status})`);
		}

		all.push(...data.data);
		if (!data.pagination.hasMore) {
			break;
		}

		offset += data.pagination.limit;
	}

	return all;
}

async function findDomainIdByAddress(address: string): Promise<string> {
	const at = address.lastIndexOf("@");
	if (at === -1 || at === address.length - 1) {
		throw new Error(`Invalid recipient address: ${address}`);
	}

	const domainName = address.slice(at + 1).toLowerCase();
	let offset = 0;
	const limit = 100;

	while (true) {
		const { response, data } = await apiJson<DomainListResponse>(
			`/domains${queryString({ limit, offset })}`,
		);

		if (response.status !== 200) {
			throw new Error(`Failed to list domains (${response.status})`);
		}

		const match = data.data.find(
			(item) => item.domain.toLowerCase() === domainName,
		);
		if (match) {
			return match.id;
		}

		if (!data.pagination.hasMore) {
			break;
		}

		offset += data.pagination.limit;
	}

	throw new Error(`Domain not found for recipient address: ${domainName}`);
}

async function ensureRecipientAddressRouting(
	endpointId: string,
): Promise<void> {
	const allAddresses = await listAllEmailAddresses();
	const recipient = allAddresses.find(
		(item) =>
			item.address.toLowerCase() === E2E_RECIPIENT_ADDRESS.toLowerCase(),
	);

	if (!recipient) {
		const domainId = await findDomainIdByAddress(E2E_RECIPIENT_ADDRESS);
		const created = await apiJson<EmailAddressUpdateResponse>(
			"/email-addresses",
			{
				method: "POST",
				body: JSON.stringify({
					address: E2E_RECIPIENT_ADDRESS,
					domainId,
					endpointId,
					isActive: true,
				}),
			},
		);

		if (created.response.status !== 201) {
			throw new Error(
				`Failed to create recipient address ${E2E_RECIPIENT_ADDRESS} (${created.response.status})`,
			);
		}

		managedEmailAddressId = created.data.id;
		originalRecipientEndpointId = null;
		originalRecipientWebhookId = null;
		originalRecipientIsActive = null;
		createdManagedRecipientAddress = true;
		return;
	}

	managedEmailAddressId = recipient.id;
	originalRecipientEndpointId = recipient.endpointId || null;
	originalRecipientWebhookId = recipient.webhookId || null;
	originalRecipientIsActive = recipient.isActive;

	if (
		recipient.endpointId === endpointId &&
		!recipient.webhookId &&
		recipient.isActive
	) {
		return;
	}

	const updated = await apiJson<EmailAddressUpdateResponse>(
		`/email-addresses/${recipient.id}`,
		{
			method: "PUT",
			body: JSON.stringify({ endpointId, isActive: true }),
		},
	);

	if (updated.response.status !== 200) {
		throw new Error(
			`Failed to update recipient routing for ${E2E_RECIPIENT_ADDRESS} (${updated.response.status})`,
		);
	}
}

async function restoreRecipientRouting(): Promise<void> {
	if (!managedEmailAddressId) {
		return;
	}

	if (createdManagedRecipientAddress) {
		const response = await apiRequest(
			`/email-addresses/${managedEmailAddressId}`,
			{
				method: "DELETE",
			},
		);
		if (response.status !== 200 && response.status !== 404) {
			console.warn(
				`⚠️ Failed to delete created recipient address ${managedEmailAddressId} (${response.status})`,
			);
		}
		return;
	}

	const body: {
		endpointId?: string | null;
		webhookId?: string | null;
		isActive?: boolean;
	} = originalRecipientWebhookId
		? { webhookId: originalRecipientWebhookId }
		: { endpointId: originalRecipientEndpointId };

	if (typeof originalRecipientIsActive === "boolean") {
		body.isActive = originalRecipientIsActive;
	}

	const response = await apiRequest(
		`/email-addresses/${managedEmailAddressId}`,
		{
			method: "PUT",
			body: JSON.stringify(body),
		},
	);

	if (response.status !== 200) {
		console.warn(
			`⚠️ Failed to restore recipient routing (${response.status}) for ${E2E_RECIPIENT_ADDRESS}`,
		);
	}
}

async function ensureWebhookDelivery(receivedEmailId: string): Promise<void> {
	if (!managedEndpointId) {
		throw new Error(
			"Managed endpoint ID is missing during webhook delivery verification",
		);
	}
	const endpointId = managedEndpointId;

	const delivery = await pollFor(
		"webhook delivery",
		POLL_CONFIG.inboundTimeoutMs,
		async () => {
			const endpoint = await apiJson<EndpointDetailResponse>(
				`/endpoints/${endpointId}`,
			);

			if (endpoint.response.status !== 200) {
				throw new Error(
					`Failed to fetch endpoint detail (${endpoint.response.status})`,
				);
			}

			return (
				endpoint.data.recentDeliveries.find(
					(item) =>
						item.emailId === receivedEmailId &&
						item.status === "success" &&
						(item.responseData?.url || "").includes(TEST_WEBHOOK_PATH),
				) || null
			);
		},
	);

	expect(delivery).toBeDefined();
}

async function pollFor<T>(
	label: string,
	timeoutMs: number,
	fn: () => Promise<T | null>,
): Promise<T | null> {
	const startedAt = Date.now();

	while (Date.now() - startedAt < timeoutMs) {
		const result = await fn();
		if (result) {
			return result;
		}

		console.log(`⏳ Waiting for ${label}...`);
		await sleep(POLL_CONFIG.intervalMs);
	}

	return null;
}

async function findReceivableAddress(): Promise<string | null> {
	e2eCache.recipientAddress = E2E_RECIPIENT_ADDRESS;
	return e2eCache.recipientAddress;
}

async function findEmailBySubject(
	type: "sent" | "received",
	subject: string,
): Promise<EmailListItem | null> {
	const { response, data } = await apiJson<EmailListResponse>(
		`/emails${queryString({
			type,
			search: subject,
			time_range: "1h",
			limit: 20,
			offset: 0,
		})}`,
	);

	if (response.status !== 200) {
		throw new Error(`Failed to list ${type} emails (${response.status})`);
	}

	return data.data.find((email) => email.subject === subject) || null;
}

async function getEmailDetail(emailId: string): Promise<EmailDetailResponse> {
	const { response, data } = await apiJson<EmailDetailResponse>(
		`/emails/${emailId}`,
	);
	expect(response.status).toBe(200);
	return data;
}

function attachmentFilename(attachment: EmailAttachment): string {
	const name = attachment.filename;
	if (!name) {
		throw new Error("Attachment missing filename");
	}
	return name;
}

function attachmentContentType(attachment: EmailAttachment): string {
	return (
		attachment.contentType ||
		attachment.content_type ||
		"application/octet-stream"
	);
}

async function ensureRoundTrip(): Promise<RoundTripState | null> {
	if (e2eCache.roundTripPromise) {
		return e2eCache.roundTripPromise;
	}

	e2eCache.roundTripPromise = (async () => {
		const recipientAddress = await findReceivableAddress();
		if (!recipientAddress) {
			console.log(
				"⚠️ No active receiving email address found; skipping roundtrip E2E tests",
			);
			return null;
		}

		const token = makeToken("e2e");
		const subject = `[[[DEV||| E2E Roundtrip ${token}`;
		const textMarker = `TEXT_MARKER_${token}`;
		const htmlMarker = `HTML_MARKER_${token}`;
		const attachmentName = `e2e-${token}.txt`;
		const attachmentContent = `ATTACHMENT_MARKER_${token}`;

		const sendPayload = {
			from: E2E_SENDER_ADDRESS,
			to: recipientAddress,
			subject,
			text: `Hello from E2E. ${textMarker}`,
			html: `<p>Hello from E2E.</p><p><strong>${htmlMarker}</strong></p>`,
			attachments: [
				{
					filename: attachmentName,
					content: Buffer.from(attachmentContent, "utf-8").toString("base64"),
					content_type: "text/plain",
				},
			],
		};

		const idempotencyKey = `e2e-roundtrip-${token}`;
		const sendResponse = await apiRequest("/emails", {
			method: "POST",
			headers: {
				"Idempotency-Key": idempotencyKey,
			},
			body: JSON.stringify(sendPayload),
		});

		const sendData = (await sendResponse.json()) as
			| SendEmailResponse
			| { error: string };
		expect(sendResponse.status).toBe(200);
		expect("id" in sendData).toBe(true);

		const sentEmailId = (sendData as SendEmailResponse).id;
		console.log("✅ Sent roundtrip email", {
			sentEmailId,
			recipientAddress,
			subject,
		});

		const sentEmail = await getEmailDetail(sentEmailId);

		const receivedListItem = await pollFor(
			"inbound delivery",
			POLL_CONFIG.inboundTimeoutMs,
			async () => findEmailBySubject("received", subject),
		);

		expect(receivedListItem).toBeDefined();
		if (!receivedListItem) {
			return null;
		}

		const receivedEmail = await getEmailDetail(receivedListItem.id);
		await ensureWebhookDelivery(receivedListItem.id);

		const resolvedThreadId =
			receivedEmail.thread_id ||
			receivedListItem.thread_id ||
			sentEmail.thread_id ||
			null;

		const threadSummary = await pollFor(
			"thread creation",
			POLL_CONFIG.threadTimeoutMs,
			async () => {
				const { response, data } = await apiJson<ThreadListResponse>(
					`/mail/threads${queryString({ search: subject, limit: 10 })}`,
				);

				if (response.status !== 200) {
					throw new Error(`Failed to list threads (${response.status})`);
				}

				if (resolvedThreadId) {
					return (
						data.threads.find((thread) => thread.id === resolvedThreadId) ||
						null
					);
				}

				return data.threads[0] || null;
			},
		);

		expect(threadSummary).toBeDefined();
		if (!threadSummary) {
			return null;
		}

		const { response: threadResponse, data: thread } =
			await apiJson<ThreadDetailResponse>(`/mail/threads/${threadSummary.id}`);
		expect(threadResponse.status).toBe(200);

		return {
			recipientAddress,
			subject,
			textMarker,
			htmlMarker,
			attachmentName,
			attachmentContent,
			sentEmailId,
			sentEmail,
			receivedEmailId: receivedListItem.id,
			receivedEmail,
			threadId: threadSummary.id,
			thread,
		};
	})();

	return e2eCache.roundTripPromise;
}

describe("E2 API - Email E2E", () => {
	beforeAll(async () => {
		process.env.INBOUND_E2_API_URL = E2_API_BASE_URL;
		API_URL = E2_API_BASE_URL;
		resolvedApiUrlPromise = null;

		await startLocalServer();
		await waitForHttpOk(
			`${LOCAL_BASE_URL}/api/e2/openapi.json`,
			"local API server",
		);

		await startNgrokTunnel();
		await waitForHttpOk(`${E2_API_BASE_URL}/openapi.json`, "public ngrok API");

		const endpointId = await ensureTestingEndpoint();
		await ensureRecipientAddressRouting(endpointId);

		e2eCache.recipientAddress = E2E_RECIPIENT_ADDRESS;
		console.log("📬 E2E recipient address:", e2eCache.recipientAddress);
		console.log("📮 E2E sender address:", E2E_SENDER_ADDRESS);
		console.log("🔗 E2E webhook URL:", TEST_WEBHOOK_URL);
	}, TEST_TIMEOUT_MS);

	afterAll(async () => {
		await restoreRecipientRouting();

		if (managedEndpointId && createdManagedEndpoint) {
			const response = await apiRequest(`/endpoints/${managedEndpointId}`, {
				method: "DELETE",
			});
			if (response.status !== 200 && response.status !== 404) {
				console.warn(
					`⚠️ Failed to delete managed endpoint ${managedEndpointId} (${response.status})`,
				);
			}
		}

		await stopNgrokTunnel();
		await stopLocalServer();
	}, TEST_TIMEOUT_MS);

	it(
		"sends an email and stores outbound plain/html/attachment content",
		async () => {
			const result = await ensureRoundTrip();
			expect(result).toBeDefined();
			if (!result) {
				return;
			}

			const {
				sentEmail,
				recipientAddress,
				subject,
				textMarker,
				htmlMarker,
				attachmentName,
			} = result;

			expect(sentEmail.object).toBe("email");
			expect(sentEmail.type).toBe("sent");
			expect(sentEmail.subject).toBe(subject);
			expect(sentEmail.to.map((address) => address.toLowerCase())).toContain(
				recipientAddress.toLowerCase(),
			);
			expect(sentEmail.text).toContain(textMarker);
			expect(sentEmail.html).toContain(htmlMarker);
			expect(["pending", "delivered", "sent"]).toContain(sentEmail.status);
			expect(sentEmail.has_attachments).toBe(true);
			expect((sentEmail.attachments || []).length).toBeGreaterThan(0);
			expect(
				(sentEmail.attachments || []).some(
					(att) => att.filename === attachmentName,
				),
			).toBe(true);
		},
		TEST_TIMEOUT_MS,
	);

	it(
		"parses inbound plain/html/attachment content and allows attachment download",
		async () => {
			const result = await ensureRoundTrip();
			expect(result).toBeDefined();
			if (!result) {
				return;
			}

			const {
				receivedEmail,
				recipientAddress,
				subject,
				textMarker,
				htmlMarker,
				attachmentName,
				attachmentContent,
				receivedEmailId,
			} = result;

			expect(receivedEmail.object).toBe("email");
			expect(receivedEmail.type).toBe("received");
			expect(receivedEmail.subject).toBe(subject);
			expect(
				receivedEmail.to.map((address) => address.toLowerCase()),
			).toContain(recipientAddress.toLowerCase());
			expect(receivedEmail.text).toContain(textMarker);
			expect(receivedEmail.html).toContain(htmlMarker);
			expect(receivedEmail.has_attachments).toBe(true);

			const inboundAttachments = receivedEmail.attachments || [];
			expect(inboundAttachments.length).toBeGreaterThan(0);

			const targetAttachment = inboundAttachments.find(
				(att) => att.filename === attachmentName,
			);
			expect(targetAttachment).toBeDefined();
			if (!targetAttachment) {
				return;
			}

			expect(attachmentContentType(targetAttachment)).toContain("text/plain");

			const attachmentResponse = await fetch(
				`${API_URL}/attachments/${receivedEmailId}/${encodeURIComponent(attachmentFilename(targetAttachment))}`,
				{
					headers: {
						Authorization: `Bearer ${API_KEY}`,
					},
				},
			);

			expect(attachmentResponse.status).toBe(200);
			expect(attachmentResponse.headers.get("Content-Type") || "").toContain(
				"text/plain",
			);

			const attachmentText = await attachmentResponse.text();
			expect(attachmentText).toContain(attachmentContent);
		},
		TEST_TIMEOUT_MS,
	);

	it(
		"shows the roundtrip in thread APIs with inbound and outbound messages",
		async () => {
			const result = await ensureRoundTrip();
			expect(result).toBeDefined();
			if (!result) {
				return;
			}

			const {
				threadId,
				subject,
				textMarker,
				htmlMarker,
				attachmentName,
				recipientAddress,
				sentEmailId,
				receivedEmailId,
			} = result;

			const thread = await pollFor(
				"thread hydration with inbound and outbound messages",
				POLL_CONFIG.threadTimeoutMs,
				async () => {
					const detail = await apiJson<ThreadDetailResponse>(
						`/mail/threads/${threadId}`,
					);

					if (detail.response.status !== 200) {
						return null;
					}

					const hasInbound = detail.data.messages.some(
						(message) => message.id === receivedEmailId,
					);
					const hasOutbound = detail.data.messages.some(
						(message) => message.id === sentEmailId,
					);

					return hasInbound && hasOutbound ? detail.data : null;
				},
			);

			expect(thread).toBeDefined();
			if (!thread) {
				return;
			}

			expect(thread.thread.id).toBe(threadId);
			expect(thread.messages.length).toBeGreaterThanOrEqual(2);

			const outbound = thread.messages.find(
				(message) => message.id === sentEmailId,
			);
			const inbound = thread.messages.find(
				(message) => message.id === receivedEmailId,
			);

			expect(inbound).toBeDefined();
			expect(outbound).toBeDefined();

			if (!inbound || !outbound) {
				return;
			}

			expect(inbound.type).toBe("inbound");
			expect(inbound.subject).toBe(subject);
			expect(inbound.to.map((address) => address.toLowerCase())).toContain(
				recipientAddress.toLowerCase(),
			);
			expect(inbound.text_body).toContain(textMarker);
			expect(inbound.html_body).toContain(htmlMarker);
			expect(inbound.has_attachments).toBe(true);
			expect(
				inbound.attachments.some((att) => att.filename === attachmentName),
			).toBe(true);

			expect(outbound.type).toBe("outbound");
			expect(outbound.subject).toBe(subject);
			expect(outbound.text_body).toContain(textMarker);
			expect(outbound.html_body).toContain(htmlMarker);
			expect(outbound.has_attachments).toBe(true);
			expect(
				outbound.attachments.some((att) => att.filename === attachmentName),
			).toBe(true);
		},
		TEST_TIMEOUT_MS,
	);

	it(
		"supports list filters for the roundtrip email in both sent and received views",
		async () => {
			const result = await ensureRoundTrip();
			expect(result).toBeDefined();
			if (!result) {
				return;
			}

			const sentList = await apiJson<EmailListResponse>(
				`/emails${queryString({ type: "sent", search: result.subject, time_range: "1h", limit: 10 })}`,
			);
			const receivedList = await apiJson<EmailListResponse>(
				`/emails${queryString({ type: "received", search: result.subject, time_range: "1h", limit: 10 })}`,
			);

			expect(sentList.response.status).toBe(200);
			expect(receivedList.response.status).toBe(200);

			const sentMatch = sentList.data.data.find(
				(email) => email.id === result.sentEmailId,
			);
			const receivedMatch = receivedList.data.data.find(
				(email) => email.id === result.receivedEmailId,
			);

			expect(sentMatch).toBeDefined();
			expect(receivedMatch).toBeDefined();
			expect(sentList.data.pagination.total).toBeGreaterThanOrEqual(1);
			expect(receivedList.data.pagination.total).toBeGreaterThanOrEqual(1);
		},
		TEST_TIMEOUT_MS,
	);

	it(
		"applies idempotency keys and prevents duplicate outbound records",
		async () => {
			const token = makeToken("idem");
			const subject = `[[[DEV||| E2E Idempotency ${token}`;
			const idempotencyKey = `e2e-idempotency-${token}`;
			const payload = {
				from: E2E_SENDER_ADDRESS,
				to: E2E_RECIPIENT_ADDRESS,
				subject,
				text: `Idempotency text marker ${token}`,
				html: `<p>Idempotency html marker <strong>${token}</strong></p>`,
			};

			const firstSend = await apiJson<SendEmailResponse | { error: string }>(
				"/emails",
				{
					method: "POST",
					headers: {
						"Idempotency-Key": idempotencyKey,
					},
					body: JSON.stringify(payload),
				},
			);
			const secondSend = await apiJson<SendEmailResponse | { error: string }>(
				"/emails",
				{
					method: "POST",
					headers: {
						"Idempotency-Key": idempotencyKey,
					},
					body: JSON.stringify(payload),
				},
			);

			expect(firstSend.response.status).toBe(200);
			expect(secondSend.response.status).toBe(200);
			expect("id" in firstSend.data).toBe(true);
			expect("id" in secondSend.data).toBe(true);

			const firstId = (firstSend.data as SendEmailResponse).id;
			const secondId = (secondSend.data as SendEmailResponse).id;
			expect(firstId).toBe(secondId);

			const sentMatches = await waitForExactSubjectEmailCount(
				"sent",
				subject,
				1,
			);
			expect(sentMatches).toBeDefined();
			if (!sentMatches) {
				return;
			}

			expect(sentMatches.length).toBe(1);
			expect(sentMatches[0]?.id).toBe(firstId);
		},
		TEST_TIMEOUT_MS,
	);

	it(
		"deduplicates repeated inbound webhook payloads for the same message",
		async () => {
			const token = makeToken("dedupe");
			const subject = `[[[DEV||| E2E Inbound Dedupe ${token}`;
			const messageId = `${token}@inbound.new`;
			const sesMessageId = `${token}-ses`;

			const firstWebhook = await postSyntheticInboundRecord({
				subject,
				messageId,
				sesMessageId,
				recipient: E2E_RECIPIENT_ADDRESS,
				text: `Inbound dedupe primary payload ${token}`,
				html: `<p>Inbound dedupe primary payload <strong>${token}</strong></p>`,
			});
			expect(firstWebhook.success).toBe(true);
			expect(firstWebhook.processedEmails).toBeGreaterThanOrEqual(1);

			const secondWebhook = await postSyntheticInboundRecord({
				subject,
				messageId,
				sesMessageId,
				recipient: E2E_RECIPIENT_ADDRESS,
				text: `Inbound dedupe replay payload ${token}`,
				html: `<p>Inbound dedupe replay payload <strong>${token}</strong></p>`,
			});
			expect(secondWebhook.success).toBe(true);

			const receivedMatches = await waitForExactSubjectEmailCount(
				"received",
				subject,
				1,
			);
			expect(receivedMatches).toBeDefined();
			if (!receivedMatches) {
				return;
			}

			expect(receivedMatches.length).toBe(1);
		},
		TEST_TIMEOUT_MS,
	);

	it(
		"enforces auth boundaries and blocks unauthorized reads",
		async () => {
			const result = await ensureRoundTrip();
			expect(result).toBeDefined();
			if (!result) {
				return;
			}

			const invalid = await apiRequestWithKey(
				`/emails/${result.sentEmailId}`,
				"invalid-api-key",
			);
			expect(invalid.status).toBe(401);

			const alternateApiKey = process.env.INBOUND_API_KEY_ALT?.trim();
			if (alternateApiKey && alternateApiKey !== API_KEY) {
				const crossTenantRead = await apiRequestWithKey(
					`/emails/${result.sentEmailId}`,
					alternateApiKey,
				);
				expect([401, 404]).toContain(crossTenantRead.status);
			} else {
				console.log(
					"ℹ️ INBOUND_API_KEY_ALT not set; skipping secondary-tenant assertion",
				);
			}
		},
		TEST_TIMEOUT_MS,
	);

	it(
		"threads replies together using In-Reply-To and References headers",
		async () => {
			const token = makeToken("threading");
			const subject = `[[[DEV||| E2E Threading ${token}`;
			const firstMessageId = `${token}-first@inbound.new`;
			const replyMessageId = `${token}-reply@inbound.new`;

			const first = await postSyntheticInboundRecord({
				subject,
				messageId: firstMessageId,
				sesMessageId: `${token}-ses-1`,
				recipient: E2E_RECIPIENT_ADDRESS,
				text: `Threading root message ${token}`,
			});
			expect(first.success).toBe(true);

			const reply = await postSyntheticInboundRecord({
				subject,
				messageId: replyMessageId,
				sesMessageId: `${token}-ses-2`,
				recipient: E2E_RECIPIENT_ADDRESS,
				text: `Threading reply message ${token}`,
				inReplyTo: firstMessageId,
				references: [firstMessageId],
			});
			expect(reply.success).toBe(true);

			const threaded = await pollFor(
				"threaded inbound replies",
				POLL_CONFIG.threadTimeoutMs,
				async () => {
					const threadList = await apiJson<ThreadListResponse>(
						`/mail/threads${queryString({ search: subject, limit: 10 })}`,
					);
					if (threadList.response.status !== 200) {
						throw new Error(
							`Failed to list threads (${threadList.response.status})`,
						);
					}

					const target = threadList.data.threads[0];
					if (!target) {
						return null;
					}

					const detail = await apiJson<ThreadDetailResponse>(
						`/mail/threads/${target.id}`,
					);
					if (detail.response.status !== 200) {
						return null;
					}

					const inboundMatches = detail.data.messages.filter(
						(message) =>
							message.type === "inbound" && message.subject === subject,
					);

					if (inboundMatches.length < 2) {
						return null;
					}

					return { detail: detail.data, inboundMatches };
				},
			);

			expect(threaded).toBeDefined();
			if (!threaded) {
				return;
			}

			expect(threaded.detail.thread.message_count).toBeGreaterThanOrEqual(2);
			expect(threaded.inboundMatches.length).toBeGreaterThanOrEqual(2);
		},
		TEST_TIMEOUT_MS,
	);

	it(
		"handles multiple attachment edge cases across inbound parsing",
		async () => {
			const token = makeToken("attachments");
			const subject = `[[[DEV||| E2E Attachment Edge Cases ${token}`;
			const attachmentTextName = `edge-${token}.txt`;
			const attachmentJsonName = `edge-${token}.json`;
			const attachmentBinName = `edge-${token}.bin`;

			const sendResponse = await apiJson<SendEmailResponse | { error: string }>(
				"/emails",
				{
					method: "POST",
					body: JSON.stringify({
						from: E2E_SENDER_ADDRESS,
						to: E2E_RECIPIENT_ADDRESS,
						subject,
						text: `Attachment edge case TEXT ${token}`,
						html: `<p>Attachment edge case HTML <strong>${token}</strong></p>`,
						attachments: [
							{
								filename: attachmentTextName,
								content: Buffer.from(
									`TEXT_ATTACHMENT_${token}`,
									"utf-8",
								).toString("base64"),
								content_type: "text/plain",
							},
							{
								filename: attachmentJsonName,
								content: Buffer.from(
									JSON.stringify({ marker: token, type: "json" }),
									"utf-8",
								).toString("base64"),
								content_type: "application/json",
							},
							{
								filename: attachmentBinName,
								content: Buffer.from([0, 1, 2, 3, 4, 5]).toString("base64"),
								content_type: "application/octet-stream",
							},
						],
					}),
				},
			);

			expect(sendResponse.response.status).toBe(200);
			expect("id" in sendResponse.data).toBe(true);

			const receivedListItem = await pollFor(
				"inbound attachment edge-case email",
				POLL_CONFIG.inboundTimeoutMs,
				async () => findEmailBySubject("received", subject),
			);
			expect(receivedListItem).toBeDefined();
			if (!receivedListItem) {
				return;
			}

			const receivedDetail = await getEmailDetail(receivedListItem.id);
			expect(receivedDetail.has_attachments).toBe(true);

			const names = (receivedDetail.attachments || []).map(
				(att) => att.filename,
			);
			expect(names).toContain(attachmentTextName);
			expect(names).toContain(attachmentJsonName);
			expect(names).toContain(attachmentBinName);
		},
		TEST_TIMEOUT_MS,
	);

	it(
		"supports endpoint lifecycle updates and cleanup semantics",
		async () => {
			const token = makeToken("endpoint-lifecycle");
			const endpointName = `e2e-endpoint-${token}`;
			const address = `e2e-endpoint-${token}@inbound.new`;
			let endpointId: string | null = null;
			let emailAddressId: string | null = null;

			try {
				const createdEndpoint = await apiJson<EndpointMutationResponse>(
					"/endpoints",
					{
						method: "POST",
						body: JSON.stringify({
							name: endpointName,
							type: "webhook",
							config: {
								url: TEST_WEBHOOK_URL,
								timeout: 30,
								retryAttempts: 3,
							},
							description: "Temporary E2E endpoint lifecycle test",
						}),
					},
				);

				expect(createdEndpoint.response.status).toBe(201);
				endpointId = createdEndpoint.data.id;

				const updatedEndpoint = await apiJson<EndpointMutationResponse>(
					`/endpoints/${endpointId}`,
					{
						method: "PUT",
						body: JSON.stringify({
							config: {
								url: TEST_WEBHOOK_URL,
								timeout: 45,
								retryAttempts: 2,
							},
						}),
					},
				);

				expect(updatedEndpoint.response.status).toBe(200);
				expect(updatedEndpoint.data.config.url).toBe(TEST_WEBHOOK_URL);

				const domainId = await findDomainIdByAddress(address);
				const createdAddress = await apiJson<EmailAddressUpdateResponse>(
					"/email-addresses",
					{
						method: "POST",
						body: JSON.stringify({
							address,
							domainId,
							endpointId,
							isActive: true,
						}),
					},
				);

				expect(createdAddress.response.status).toBe(201);
				emailAddressId = createdAddress.data.id;

				const deletedEndpoint = await apiJson<EndpointDeleteResponse>(
					`/endpoints/${endpointId}`,
					{
						method: "DELETE",
					},
				);
				expect(deletedEndpoint.response.status).toBe(200);
				endpointId = null;

				const deletedGet = await apiRequest(
					`/endpoints/${createdEndpoint.data.id}`,
				);
				expect(deletedGet.status).toBe(404);

				const detachedAddress = await pollFor(
					"email-address endpoint cleanup",
					POLL_CONFIG.threadTimeoutMs,
					async () => {
						if (!emailAddressId) {
							return null;
						}

						const detail = await apiJson<EmailAddressUpdateResponse>(
							`/email-addresses/${emailAddressId}`,
						);
						if (detail.response.status !== 200) {
							return null;
						}

						return detail.data.endpointId === null ? detail.data : null;
					},
				);

				expect(detachedAddress).toBeDefined();
			} finally {
				if (emailAddressId) {
					const deleteAddress = await apiRequest(
						`/email-addresses/${emailAddressId}`,
						{
							method: "DELETE",
						},
					);
					if (deleteAddress.status !== 200 && deleteAddress.status !== 404) {
						console.warn(
							`⚠️ Failed to cleanup lifecycle test email address ${emailAddressId} (${deleteAddress.status})`,
						);
					}
				}

				if (endpointId) {
					const deleteEndpoint = await apiRequest(`/endpoints/${endpointId}`, {
						method: "DELETE",
					});
					if (deleteEndpoint.status !== 200 && deleteEndpoint.status !== 404) {
						console.warn(
							`⚠️ Failed to cleanup lifecycle test endpoint ${endpointId} (${deleteEndpoint.status})`,
						);
					}
				}
			}
		},
		TEST_TIMEOUT_MS,
	);

	it(
		"returns 429 responses when burst traffic exceeds rate limits",
		async () => {
			let sawRateLimit = false;

			for (let attempt = 0; attempt < 3 && !sawRateLimit; attempt += 1) {
				const responses = await Promise.all(
					Array.from({ length: 25 }, () =>
						apiRequestWithKey(
							`/endpoints${queryString({ limit: 1, offset: 0 })}`,
							API_KEY,
						),
					),
				);

				sawRateLimit = responses.some((response) => response.status === 429);
				await Promise.all(
					responses.map(async (response) => {
						try {
							await response.arrayBuffer();
						} catch {
							// Ignore body parse failures for non-critical response assertions
						}
					}),
				);

				if (!sawRateLimit) {
					await sleep(1200);
				}
			}

			expect(sawRateLimit).toBe(true);
		},
		TEST_TIMEOUT_MS,
	);
});

console.log("\n" + "=".repeat(60));
console.log("E2 API - Email E2E Tests");
console.log("=".repeat(60));
console.log("✅ Coverage:");
console.log("  - Send email (plain + html + attachment)");
console.log("  - Inbound parsing validation (plain/html/attachments)");
console.log("  - Attachment download via authenticated API");
console.log("  - Thread API roundtrip verification");
console.log("  - Sent/received list filtering by unique subject");
console.log("  - Idempotency-key dedupe for outbound send");
console.log("  - Inbound webhook message-id dedupe");
console.log("  - Auth boundary enforcement (invalid API key)");
console.log("  - Reply threading via In-Reply-To/References");
console.log("  - Multi-attachment parsing edge cases");
console.log("  - Endpoint lifecycle update + cleanup behavior");
console.log("  - Rate-limit 429 behavior under burst traffic");
console.log("=".repeat(60) + "\n");
