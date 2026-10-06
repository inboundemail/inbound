/**
 * E2 API - End-to-end email flow tests
 *
 * Self-contained: runs against the local Docker services from `bun run dev:local`
 * (Postgres, Neon HTTP proxy, Redis REST), a fresh `inbound_e2e` database, a
 * local SES stub that loops sent mail back into /api/inbound/webhook, and a local
 * webhook receiver. No production database, AWS, ngrok, or real API keys.
 *
 * Run with: bun run test:e2e
 */

// @ts-ignore - bun:test is a Bun-specific module not recognized by TypeScript
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	buildLocalEnv,
	LOCAL_SERVICE_API_KEY,
} from "@/scripts/local-dev/env";
import { deliverInbound, startLocalMailServer } from "@/scripts/local-dev/mail-server";
import {
	flushRedis,
	psql,
	recreateDatabase,
	runSeed,
	startServices,
} from "@/scripts/local-dev/services";

const TEST_RUN_TOKEN = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const E2E_DATABASE = "inbound_e2e";
const LOCAL_PORT = 8778;
const WEBHOOK_PORT = 8779;
const MAIL_PORT = 8781;
const LOCAL_BASE_URL = `http://127.0.0.1:${LOCAL_PORT}`;
const API_URL = `${LOCAL_BASE_URL}/api/e2`;
const TEST_WEBHOOK_PATH = "/api/development/testing";
const TEST_WEBHOOK_URL = `http://hooks.localtest.me:${WEBHOOK_PORT}${TEST_WEBHOOK_PATH}`;
const TEST_ENDPOINT_NAME = `e2e-local-webhook-${TEST_RUN_TOKEN}`;
const E2E_DOMAIN = "e2e.inbound.test";
const E2E_SENDER_ADDRESS = `e2e-sender@${E2E_DOMAIN}`;
const E2E_RECIPIENT_ADDRESS = `e2e-receive@${E2E_DOMAIN}`;
const E2E_RATE_LIMIT_PER_SECOND = 20;
const E2E_GATEWAY_SECRET = "e2e-gateway-secret";

let API_KEY = "";
let ALT_API_KEY = "";
let PRIMARY_USER_ID = "";
let E2E_DOMAIN_ID = "";

type E2ESeed = {
	domain: string;
	domainId: string;
	primary: { userId: string; apiKey: string };
	secondary: { userId: string; apiKey: string };
};

type ReceivedWebhook = {
	path: string;
	body: string;
	receivedAt: number;
};

const receivedWebhooks: ReceivedWebhook[] = [];

const RATE_LIMIT_CONFIG = {
	maxRetries: 3,
	baseDelayMs: 60,
	retryDelayMs: 1000,
};

const POLL_CONFIG = {
	inboundTimeoutMs: 60000,
	threadTimeoutMs: 60000,
	intervalMs: 1000,
};

const TEST_TIMEOUT_MS = 180000;
const SETUP_TIMEOUT_MS = 300000;
const SHOW_LOCAL_SERVER_LOGS =
	process.argv.includes("--verbose") ||
	process.env.INBOUND_E2E_VERBOSE === "true";

let lastRequestTime = 0;

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
	envelope_recipients?: string[] | null;
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
let mailServer: ReturnType<typeof startLocalMailServer> | null = null;
let webhookServer: ReturnType<typeof Bun.serve> | null = null;
let managedEndpointId: string | null = null;

async function sleep(ms: number): Promise<void> {
	await new Promise((resolve) => setTimeout(resolve, ms));
}

async function apiRequest(
	endpoint: string,
	options: RequestInit = {},
	retryCount = 0,
): Promise<Response> {
	const now = Date.now();
	const timeSinceLastRequest = now - lastRequestTime;
	if (timeSinceLastRequest < RATE_LIMIT_CONFIG.baseDelayMs) {
		await sleep(RATE_LIMIT_CONFIG.baseDelayMs - timeSinceLastRequest);
	}
	lastRequestTime = Date.now();

	const response = await fetch(`${API_URL}${endpoint}`, {
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
	return fetch(`${API_URL}${endpoint}`, {
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
	recipients?: string[];
	text: string;
	html?: string;
	inReplyTo?: string;
	references?: string[];
	sesMessageId?: string;
	from?: string;
}): Promise<InboundWebhookResponse> {
	const sender = options.from || "synthetic-sender@example.test";
	const response = await deliverInbound({
		inboundWebhookUrl: `${LOCAL_BASE_URL}/api/inbound/webhook`,
		serviceApiKey: LOCAL_SERVICE_API_KEY,
		recipients: options.recipients ?? [options.recipient],
		sesMessageId: options.sesMessageId || `ses-${makeToken("inbound")}`,
		source: sender,
		raw: buildRawEmailContent({
			from: sender,
			to: options.recipient,
			subject: options.subject,
			messageId: options.messageId,
			text: options.text,
			html: options.html,
			inReplyTo: options.inReplyTo,
			references: options.references,
		}),
	});

	const raw = response.body;
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

function e2eServerEnv() {
	return buildLocalEnv({
		appUrl: LOCAL_BASE_URL,
		databaseName: E2E_DATABASE,
		mailPort: MAIL_PORT,
		extra: {
			PORT: String(LOCAL_PORT),
			NEXT_DIST_DIR: ".next-e2e",
			INBOUND_E2E_TEST_MODE: "true",
			E2_LOCAL_RATE_LIMIT_PER_SECOND: String(E2E_RATE_LIMIT_PER_SECOND),
			MAILBOX_GATEWAY_AUTH_SECRET: E2E_GATEWAY_SECRET,
		},
	});
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
			env: e2eServerEnv(),
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

function startWebhookReceiver(): void {
	webhookServer = Bun.serve({
		port: WEBHOOK_PORT,
		hostname: "127.0.0.1",
		async fetch(request) {
			receivedWebhooks.push({
				path: new URL(request.url).pathname,
				body: await request.text(),
				receivedAt: Date.now(),
			});
			return Response.json({ ok: true });
		},
	});
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

async function createTestingEndpoint(): Promise<string> {
	const created = await apiJson<EndpointListItem>("/endpoints", {
		method: "POST",
		body: JSON.stringify({
			name: TEST_ENDPOINT_NAME,
			type: "webhook",
			config: normalizeWebhookConfig({}),
			description: "Local webhook receiver for app/api/e2/e2e.test.ts",
		}),
	});

	if (created.response.status !== 201) {
		throw new Error(
			`Failed to create webhook endpoint (${created.response.status}): ${JSON.stringify(created.data)}`,
		);
	}

	managedEndpointId = created.data.id;
	return created.data.id;
}

async function findDomainIdByAddress(address: string): Promise<string> {
	const domainName = address.slice(address.lastIndexOf("@") + 1).toLowerCase();
	const { response, data } = await apiJson<DomainListResponse>(
		`/domains${queryString({ limit: 100, offset: 0 })}`,
	);

	if (response.status !== 200) {
		throw new Error(`Failed to list domains (${response.status})`);
	}

	const match = data.data.find(
		(item) => item.domain.toLowerCase() === domainName,
	);
	if (!match) {
		throw new Error(`Domain not found for address: ${domainName}`);
	}
	return match.id;
}

async function createRecipientAddress(endpointId: string): Promise<void> {
	const created = await apiJson<EmailAddressUpdateResponse>(
		"/email-addresses",
		{
			method: "POST",
			body: JSON.stringify({
				address: E2E_RECIPIENT_ADDRESS,
				domainId: await findDomainIdByAddress(E2E_RECIPIENT_ADDRESS),
				endpointId,
				isActive: true,
			}),
		},
	);

	if (created.response.status !== 201) {
		throw new Error(
			`Failed to create recipient address ${E2E_RECIPIENT_ADDRESS} (${created.response.status}): ${JSON.stringify(created.data)}`,
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

	const received = receivedWebhooks.find(
		(webhook) =>
			webhook.path === TEST_WEBHOOK_PATH && webhook.body.includes(receivedEmailId),
	);
	expect(received).toBeDefined();
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

function openssl(args: string[], cwd: string): void {
	const result = spawnSync("openssl", args, { cwd, encoding: "utf8" });
	if (result.status !== 0) {
		throw new Error(`openssl ${args[0]} failed: ${result.stderr}`);
	}
}

function signSmimeMessage(
	headers: string[],
	content: string,
): {
	raw: string;
	verify: (raw: string) => boolean;
} {
	const dir = mkdtempSync(join(tmpdir(), "inbound-smime-"));
	openssl(
		[
			"req",
			"-x509",
			"-newkey",
			"rsa:2048",
			"-nodes",
			"-days",
			"1",
			"-keyout",
			"key.pem",
			"-out",
			"cert.pem",
			"-subj",
			`/CN=E2E Sender/emailAddress=${E2E_SENDER_ADDRESS}`,
		],
		dir,
	);
	writeFileSync(join(dir, "content.eml"), content);
	openssl(
		[
			"smime",
			"-sign",
			"-crlfeol",
			"-in",
			"content.eml",
			"-signer",
			"cert.pem",
			"-inkey",
			"key.pem",
			"-out",
			"signed.eml",
		],
		dir,
	);
	const signed = readFileSync(join(dir, "signed.eml"), "utf8");
	return {
		raw: `${headers.join("\r\n")}\r\n${signed}`,
		verify: (raw) => {
			writeFileSync(join(dir, "relayed.eml"), raw);
			return (
				spawnSync(
					"openssl",
					[
						"smime",
						"-verify",
						"-noverify",
						"-in",
						"relayed.eml",
						"-out",
						"/dev/null",
					],
					{ cwd: dir },
				).status === 0
			);
		},
	};
}

function messageBody(raw: string): string {
	return raw.slice(raw.indexOf("\r\n\r\n"));
}

function headerNames(raw: string): string[] {
	return raw
		.slice(0, raw.indexOf("\r\n\r\n"))
		.split("\r\n")
		.filter((line) => !/^[ \t]/.test(line))
		.map((line) => line.slice(0, line.indexOf(":")).toLowerCase());
}

describe("E2 API - Email E2E", () => {
	beforeAll(async () => {
		console.log("🐳 Starting local Docker services");
		startServices();
		console.log(`🗄️  Recreating ${E2E_DATABASE}`);
		recreateDatabase(E2E_DATABASE);
		await flushRedis();

		const seed = runSeed<E2ESeed>(["e2e"], e2eServerEnv());
		API_KEY = seed.primary.apiKey;
		ALT_API_KEY = seed.secondary.apiKey;
		PRIMARY_USER_ID = seed.primary.userId;
		E2E_DOMAIN_ID = seed.domainId;

		mailServer = startLocalMailServer({
			port: MAIL_PORT,
			inboundWebhookUrl: `${LOCAL_BASE_URL}/api/inbound/webhook`,
			serviceApiKey: LOCAL_SERVICE_API_KEY,
			log: SHOW_LOCAL_SERVER_LOGS ? console.log : undefined,
		});
		startWebhookReceiver();

		await startLocalServer();
		await waitForHttpOk(`${API_URL}/openapi.json`, "local API server", 240000);

		const endpointId = await createTestingEndpoint();
		await createRecipientAddress(endpointId);

		e2eCache.recipientAddress = E2E_RECIPIENT_ADDRESS;
		console.log("📬 E2E recipient address:", E2E_RECIPIENT_ADDRESS);
		console.log("📮 E2E sender address:", E2E_SENDER_ADDRESS);
		console.log("🔗 E2E webhook URL:", TEST_WEBHOOK_URL);
	}, SETUP_TIMEOUT_MS);

	afterAll(async () => {
		await stopLocalServer();
		mailServer?.stop();
		webhookServer?.stop(true);
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

			const crossTenantRead = await apiRequestWithKey(
				`/emails/${result.sentEmailId}`,
				ALT_API_KEY,
			);
			expect([401, 404]).toContain(crossTenantRead.status);
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
			const address = `e2e-endpoint-${token}@${E2E_DOMAIN}`;
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
		"sends at most once for concurrent requests sharing an idempotency key",
		async () => {
			const token = makeToken("idem-race");
			const subject = `E2E Idempotency Race ${token}`;
			const idempotencyKey = `e2e-idem-race-${token}`;
			const payload = JSON.stringify({
				from: E2E_SENDER_ADDRESS,
				to: E2E_RECIPIENT_ADDRESS,
				subject,
				text: `Idempotency race ${token}`,
			});

			const results = await Promise.all(
				Array.from({ length: 4 }, () =>
					apiJsonWithKey<SendEmailResponse | { error: string }>(
						"/emails",
						API_KEY,
						{
							method: "POST",
							headers: { "Idempotency-Key": idempotencyKey },
							body: payload,
						},
					),
				),
			);

			for (const result of results) {
				expect([200, 409]).toContain(result.response.status);
			}
			const ids = new Set(
				results
					.filter((result) => result.response.status === 200)
					.map((result) => (result.data as SendEmailResponse).id),
			);
			expect(ids.size).toBe(1);

			await sleep(2000);
			const stubSends = (mailServer?.messages ?? []).filter((message) =>
				message.raw.includes(subject),
			);
			expect(stubSends.length).toBe(1);
			expect((await listExactSubjectEmails("sent", subject)).length).toBe(1);

			const replay = await apiJson<SendEmailResponse>("/emails", {
				method: "POST",
				headers: { "Idempotency-Key": idempotencyKey },
				body: payload,
			});
			expect(replay.response.status).toBe(200);
			expect(ids.has(replay.data.id)).toBe(true);
		},
		TEST_TIMEOUT_MS,
	);

	it(
		"lets a client retry with the same idempotency key after a failed send",
		async () => {
			const token = makeToken("idem-failed");
			const subject = `E2E Idempotency Failed ${token}`;
			const idempotencyKey = `e2e-idem-failed-${token}`;
			const payload = JSON.stringify({
				from: E2E_SENDER_ADDRESS,
				to: E2E_RECIPIENT_ADDRESS,
				subject,
				text: `Idempotency failed ${token}`,
			});

			await fetch(`http://127.0.0.1:${MAIL_PORT}/_local/fail-next`, {
				method: "POST",
			});
			const failed = await apiRequest("/emails", {
				method: "POST",
				headers: { "Idempotency-Key": idempotencyKey },
				body: payload,
			});
			expect(failed.status).toBe(500);

			const retried = await apiJson<SendEmailResponse>("/emails", {
				method: "POST",
				headers: { "Idempotency-Key": idempotencyKey },
				body: payload,
			});
			expect(retried.response.status).toBe(200);
			expect(retried.data.id).toBeDefined();

			const replay = await apiJson<SendEmailResponse>("/emails", {
				method: "POST",
				headers: { "Idempotency-Key": idempotencyKey },
				body: payload,
			});
			expect(replay.data.id).toBe(retried.data.id);
		},
		TEST_TIMEOUT_MS,
	);

	it(
		"rejects idempotency keys longer than 256 characters",
		async () => {
			const response = await apiRequest("/emails", {
				method: "POST",
				headers: { "Idempotency-Key": "k".repeat(257) },
				body: JSON.stringify({
					from: E2E_SENDER_ADDRESS,
					to: E2E_RECIPIENT_ADDRESS,
					subject: "E2E long idempotency key",
					text: "long key",
				}),
			});
			expect(response.status).toBe(400);
		},
		TEST_TIMEOUT_MS,
	);

	it(
		"stores one email per message with every envelope recipient and one delivery per endpoint",
		async () => {
			const token = makeToken("envelope");
			const ccAddress = `e2e-cc-${token}@${E2E_DOMAIN}`;
			const bccAddress = `e2e-bcc-${token}@${E2E_DOMAIN}`;
			const bccWebhookPath = `/api/development/bcc-${token}`;
			const subject = `E2E Envelope Recipients ${token}`;
			const domainId = await findDomainIdByAddress(E2E_RECIPIENT_ADDRESS);

			const bccEndpoint = await apiJson<EndpointMutationResponse>("/endpoints", {
				method: "POST",
				body: JSON.stringify({
					name: `e2e-bcc-endpoint-${token}`,
					type: "webhook",
					config: {
						url: `http://hooks.localtest.me:${WEBHOOK_PORT}${bccWebhookPath}`,
						timeout: 30,
						retryAttempts: 1,
					},
				}),
			});
			expect(bccEndpoint.response.status).toBe(201);

			for (const [address, endpointId] of [
				[ccAddress, managedEndpointId],
				[bccAddress, bccEndpoint.data.id],
			]) {
				const created = await apiJson<EmailAddressUpdateResponse>(
					"/email-addresses",
					{
						method: "POST",
						body: JSON.stringify({ address, domainId, endpointId, isActive: true }),
					},
				);
				expect(created.response.status).toBe(201);
			}

			const sent = await apiJson<SendEmailResponse>("/emails", {
				method: "POST",
				body: JSON.stringify({
					from: E2E_SENDER_ADDRESS,
					to: E2E_RECIPIENT_ADDRESS,
					cc: ccAddress,
					bcc: bccAddress,
					subject,
					text: `Envelope recipients ${token}`,
				}),
			});
			expect(sent.response.status).toBe(200);

			const received = await waitForExactSubjectEmailCount("received", subject, 1);
			expect(received).toBeDefined();
			await sleep(2000);
			const rows = await listExactSubjectEmails("received", subject);
			expect(rows.length).toBe(1);

			const detail = await apiJson<EmailDetailResponse>(`/emails/${rows[0].id}`);
			expect(detail.response.status).toBe(200);
			expect([...(detail.data.envelope_recipients ?? [])].sort()).toEqual(
				[E2E_RECIPIENT_ADDRESS, ccAddress, bccAddress].sort(),
			);
			expect(detail.data.to).not.toContain(bccAddress);

			const deliveriesFor = (path: string) =>
				receivedWebhooks.filter(
					(webhook) => webhook.path === path && webhook.body.includes(rows[0].id),
				);
			const mainDeliveries = await pollFor(
				"webhook deliveries for envelope test",
				POLL_CONFIG.inboundTimeoutMs,
				async () =>
					deliveriesFor(TEST_WEBHOOK_PATH).length > 0 &&
					deliveriesFor(bccWebhookPath).length > 0
						? deliveriesFor(TEST_WEBHOOK_PATH)
						: null,
			);
			expect(mainDeliveries?.length).toBe(1);
			expect(deliveriesFor(bccWebhookPath).length).toBe(1);

			const payload = JSON.parse(deliveriesFor(bccWebhookPath)[0].body) as {
				email: { recipient: string; envelopeRecipients: string[] };
			};
			expect(payload.email.recipient).toBe(bccAddress);
			expect([...payload.email.envelopeRecipients].sort()).toEqual(
				[E2E_RECIPIENT_ADDRESS, ccAddress, bccAddress].sort(),
			);
		},
		TEST_TIMEOUT_MS,
	);

	it(
		"merges a later SES event for the same message into the existing email",
		async () => {
			const token = makeToken("merge");
			const subject = `E2E Envelope Merge ${token}`;
			const messageId = `${token}@example.test`;
			const secondRecipient = `e2e-merge-${token}@${E2E_DOMAIN}`;

			const first = await postSyntheticInboundRecord({
				subject,
				messageId,
				sesMessageId: `${token}-ses-1`,
				recipient: E2E_RECIPIENT_ADDRESS,
				text: `Merge test ${token}`,
			});
			expect(first.success).toBe(true);

			const second = await postSyntheticInboundRecord({
				subject,
				messageId,
				sesMessageId: `${token}-ses-2`,
				recipient: E2E_RECIPIENT_ADDRESS,
				recipients: [E2E_RECIPIENT_ADDRESS, secondRecipient],
				text: `Merge test ${token}`,
			});
			expect(second.success).toBe(true);

			const rows = await listExactSubjectEmails("received", subject);
			expect(rows.length).toBe(1);
			const detail = await apiJson<EmailDetailResponse>(`/emails/${rows[0].id}`);
			expect([...(detail.data.envelope_recipients ?? [])].sort()).toEqual(
				[E2E_RECIPIENT_ADDRESS, secondRecipient].sort(),
			);
		},
		TEST_TIMEOUT_MS,
	);

	it(
		"merges legacy per-recipient rows and keeps old IDs resolvable",
		async () => {
			const token = makeToken("legacy").replace(/[^a-z0-9-]/gi, "");
			const subject = `E2E Legacy Merge ${token}`;
			const ids = ["a", "b"].map((suffix) => `inbnd_legacy_${token}_${suffix}`);
			psql(
				`insert into structured_emails (id, email_id, ses_event_id, user_id, message_id, recipient, subject, raw_content, parse_success, created_at) values
				('${ids[0]}', '${ids[0]}', 'ses_${token}', '${PRIMARY_USER_ID}', '${token}@legacy.test', 'first-${token}@${E2E_DOMAIN}', '${subject}', 'Subject: x', true, now() - interval '2 minutes'),
				('${ids[1]}', '${ids[1]}', 'ses_${token}', '${PRIMARY_USER_ID}', '${token}@legacy.test', 'second-${token}@${E2E_DOMAIN}', '${subject}', 'Subject: x', true, now() - interval '1 minute');`,
				E2E_DATABASE,
			);

			const merge = Bun.spawnSync(
				["bun", "scripts/merge-inbound-duplicates.ts", "--apply", "--user", PRIMARY_USER_ID],
				{ env: e2eServerEnv(), stdout: "pipe", stderr: "pipe" },
			);
			expect(merge.exitCode).toBe(0);

			expect((await listExactSubjectEmails("received", subject)).length).toBe(1);
			const viaOldId = await apiJson<EmailDetailResponse>(`/emails/${ids[1]}`);
			expect(viaOldId.response.status).toBe(200);
			expect(viaOldId.data.id).toBe(ids[0]);
			expect([...(viaOldId.data.envelope_recipients ?? [])].sort()).toEqual(
				[`first-${token}@${E2E_DOMAIN}`, `second-${token}@${E2E_DOMAIN}`].sort(),
			);

			const otherTenant = await apiRequestWithKey(`/emails/${ids[1]}`, ALT_API_KEY);
			expect(otherTenant.status).toBe(404);
		},
		TEST_TIMEOUT_MS,
	);

	it(
		"delivers only to the real address when a display name contains angle brackets",
		async () => {
			const token = makeToken("redirect");
			const subject = `E2E Recipient Redirect ${token}`;
			const sent = await apiJson<SendEmailResponse>("/emails", {
				method: "POST",
				body: JSON.stringify({
					from: E2E_SENDER_ADDRESS,
					to: `"x <attacker@evil.example>" <${E2E_RECIPIENT_ADDRESS}>`,
					subject,
					text: `Redirect check ${token}`,
				}),
			});
			expect(sent.response.status).toBe(200);

			await sleep(1000);
			const message = (mailServer?.messages ?? []).find((item) =>
				item.raw.includes(subject),
			);
			expect(message?.recipients).toEqual([E2E_RECIPIENT_ADDRESS]);
		},
		TEST_TIMEOUT_MS,
	);

	it(
		"rejects header injection and reserved headers on send and reply",
		async () => {
			const base = {
				from: E2E_SENDER_ADDRESS,
				to: E2E_RECIPIENT_ADDRESS,
				text: "header safety",
			};
			const cases: Array<Record<string, unknown>> = [
				{ ...base, subject: "Hello\r\nBcc: attacker@evil.example" },
				{ ...base, subject: "ok", headers: { From: "ceo@another-customer.example" } },
				{ ...base, subject: "ok", headers: { "X-SES-CONFIGURATION-SET": "other" } },
				{ ...base, subject: "ok", headers: { "X-Custom": "a\r\nBcc: attacker@evil.example" } },
				{
					...base,
					subject: "ok",
					attachments: [
						{
							filename: "a.txt\r\nContent-Type: text/html",
							content: Buffer.from("x").toString("base64"),
						},
					],
				},
			];
			for (const body of cases) {
				const response = await apiRequest("/emails", {
					method: "POST",
					body: JSON.stringify(body),
				});
				expect(response.status).toBe(400);
			}

			const allowed = await apiRequest("/emails", {
				method: "POST",
				body: JSON.stringify({
					...base,
					subject: `E2E Allowed Header ${makeToken("hdr")}`,
					headers: { "X-Entity-Ref-ID": "ref-123" },
				}),
			});
			expect(allowed.status).toBe(200);

			const inboundToken = makeToken("reply-safety");
			const inboundSubject = `E2E Reply Safety ${inboundToken}`;
			await postSyntheticInboundRecord({
				subject: inboundSubject,
				messageId: `${inboundToken}@example.test`,
				recipient: E2E_RECIPIENT_ADDRESS,
				text: "reply target",
			});
			const [target] = await listExactSubjectEmails("received", inboundSubject);
			expect(target).toBeDefined();
			const reply = await apiRequest(`/emails/${target.id}/reply`, {
				method: "POST",
				body: JSON.stringify({
					from: E2E_SENDER_ADDRESS,
					text: "reply",
					subject: "Re\r\nBcc: attacker@evil.example",
				}),
			});
			expect(reply.status).toBe(400);
		},
		TEST_TIMEOUT_MS,
	);

	it(
		"routes mail for any subdomain of a wildcard domain to the parent catch-all",
		async () => {
			const secondaryUserId = psql(
				`select id from "user" where email = 'e2e-secondary@inbound.test';`,
				E2E_DATABASE,
			);
			psql(
				`insert into email_domains (id, domain, status, user_id, can_receive_emails, is_catch_all_enabled, catch_all_endpoint_id, include_subdomains, subdomain_receipt_rule_name) values
				('dom_wild_root', 'wild-e2e.com', 'verified', '${PRIMARY_USER_ID}', true, true, '${managedEndpointId}', true, 'batch-rule-e2e'),
				('dom_wild_evil', 'evil.wild-e2e.com', 'pending', '${secondaryUserId}', false, true, null, false, null);`,
				E2E_DATABASE,
			);

			const token = makeToken("wild").replace(/[^a-z0-9-]/gi, "");
			const addresses = [
				`orders@random-${token}.wild-e2e.com`,
				`anything@deep.nested-${token}.wild-e2e.com`,
				`x-${token}@evil.wild-e2e.com`,
			];

			for (const address of addresses) {
				const subject = `E2E Wildcard ${address}`;
				const result = await postSyntheticInboundRecord({
					subject,
					messageId: `${makeToken("wildmsg")}@example.test`,
					recipient: address,
					text: `Wildcard routing ${token}`,
				});
				expect(result.success).toBe(true);

				const [received] = await listExactSubjectEmails("received", subject);
				expect(received).toBeDefined();
				const detail = await getEmailDetail(received.id);
				expect(detail.envelope_recipients).toEqual([address]);

				const delivery = await pollFor(
					`wildcard webhook delivery for ${address}`,
					POLL_CONFIG.inboundTimeoutMs,
					async () =>
						receivedWebhooks.find(
							(webhook) =>
								webhook.path === TEST_WEBHOOK_PATH &&
								webhook.body.includes(received.id),
						) || null,
				);
				expect(delivery).toBeDefined();
				const payload = JSON.parse(delivery?.body ?? "{}") as {
					email: { recipient: string; envelopeRecipients: string[] };
				};
				expect(payload.email.recipient).toBe(address);
				expect(payload.email.envelopeRecipients).toEqual([address]);

				const otherTenant = await apiRequestWithKey(
					`/emails/${received.id}`,
					ALT_API_KEY,
				);
				expect(otherTenant.status).toBe(404);
			}

			const siblingSubject = `E2E Wildcard sibling ${token}`;
			await postSyntheticInboundRecord({
				subject: siblingSubject,
				messageId: `${makeToken("wildmsg")}@example.test`,
				recipient: `x@sub.notwild-e2e.com`,
				text: "not a subdomain of the wildcard domain",
			});
			expect(
				(await listExactSubjectEmails("received", siblingSubject)).length,
			).toBe(0);

			const domain = await apiJson<{
				includeSubdomains: boolean;
				subdomainDnsRecords: Array<{ type: string; name: string; value: string }>;
			}>("/domains/dom_wild_root");
			expect(domain.response.status).toBe(200);
			expect(domain.data.includeSubdomains).toBe(true);
			expect(domain.data.subdomainDnsRecords).toEqual([
				expect.objectContaining({
					type: "MX",
					name: "*.wild-e2e.com",
					value: "10 inbound-smtp.us-east-2.amazonaws.com",
				}),
			]);

			const list = await apiJson<
				DomainListResponse & { data: Array<{ includeSubdomains: boolean }> }
			>(`/domains${queryString({ limit: 100, offset: 0 })}`);
			const listed = list.data.data.find(
				(item) => item.domain === "wild-e2e.com",
			);
			expect(listed?.includeSubdomains).toBe(true);
		},
		TEST_TIMEOUT_MS,
	);

	it(
		"validates includeSubdomains updates and blocks subdomain hijacking",
		async () => {
			const secondaryUserId = psql(
				`select id from "user" where email = 'e2e-secondary@inbound.test';`,
				E2E_DATABASE,
			);
			psql(
				`insert into email_domains (id, domain, status, user_id, can_receive_emails) values
				('dom_plain_root', 'plain-e2e.com', 'verified', '${PRIMARY_USER_ID}', true),
				('dom_plain_sub', 'sub.plain-e2e.com', 'verified', '${PRIMARY_USER_ID}', true),
				('dom_pending_root', 'pending-e2e.com', 'pending', '${PRIMARY_USER_ID}', false),
				('dom_taken_root', 'taken-e2e.com', 'verified', '${PRIMARY_USER_ID}', true),
				('dom_taken_sub', 'owned.taken-e2e.com', 'pending', '${secondaryUserId}', false);`,
				E2E_DATABASE,
			);
			psql(
				`insert into email_domains (id, domain, status, user_id, can_receive_emails, include_subdomains) values
				('dom_stale_wild', 'stale-wild-e2e.com', 'verified', '${PRIMARY_USER_ID}', true, true);`,
				E2E_DATABASE,
			);

			const patch = (id: string, body: Record<string, unknown>, key = API_KEY) =>
				apiRequestWithKey(`/domains/${id}`, key, {
					method: "PATCH",
					body: JSON.stringify(body),
				});

			expect((await patch("dom_plain_root", {})).status).toBe(400);
			expect(
				(await patch("dom_pending_root", { includeSubdomains: true })).status,
			).toBe(400);

			const subdomain = await patch("dom_plain_sub", { includeSubdomains: true });
			expect(subdomain.status).toBe(400);
			expect(((await subdomain.json()) as { code?: string }).code).toBe(
				"INCLUDE_SUBDOMAINS_ROOT_ONLY",
			);

			const taken = await patch("dom_taken_root", { includeSubdomains: true });
			expect(taken.status).toBe(409);
			expect(((await taken.json()) as { code?: string }).code).toBe(
				"SUBDOMAIN_OWNED_BY_ANOTHER_ACCOUNT",
			);

			expect(
				(
					await patch("dom_plain_root", { includeSubdomains: true }, ALT_API_KEY)
				).status,
			).toBe(404);

			const alreadyOff = await apiJsonWithKey<{
				includeSubdomains: boolean;
				subdomainDnsRecords: unknown[];
			}>("/domains/dom_plain_root", API_KEY, {
				method: "PATCH",
				body: JSON.stringify({ includeSubdomains: false }),
			});
			expect(alreadyOff.response.status).toBe(200);
			expect(alreadyOff.data.includeSubdomains).toBe(false);
			expect(alreadyOff.data.subdomainDnsRecords).toEqual([]);

			const turnedOff = await apiJsonWithKey<{ includeSubdomains: boolean }>(
				"/domains/dom_stale_wild",
				API_KEY,
				{ method: "PATCH", body: JSON.stringify({ includeSubdomains: false }) },
			);
			expect(turnedOff.response.status).toBe(200);
			expect(turnedOff.data.includeSubdomains).toBe(false);

			const hijack = await apiRequestWithKey("/domains", ALT_API_KEY, {
				method: "POST",
				body: JSON.stringify({ domain: "hijack.wild-e2e.com" }),
			});
			expect(hijack.status).toBe(409);
			expect(((await hijack.json()) as { code?: string }).code).toBe(
				"DOMAIN_COVERED_BY_WILDCARD",
			);

			const deepHijack = await apiRequestWithKey("/domains", ALT_API_KEY, {
				method: "POST",
				body: JSON.stringify({ domain: "a.b.wild-e2e.com" }),
			});
			expect(deepHijack.status).toBe(409);
		},
		TEST_TIMEOUT_MS,
	);

	it(
		"relays S/MIME signed SMTP messages byte-for-byte with the send guards",
		async () => {
			const token = makeToken("raw-relay");
			const { response: mailboxResponse, data: mailbox } = await apiJson<{
				password: string;
			}>("/mailboxes", {
				method: "POST",
				body: JSON.stringify({
					name: `Raw relay ${token}`,
					loginAddress: `${token}@${E2E_DOMAIN}`,
					type: "smtp",
					accessMode: "read_write",
					sendingMode: "identity",
					sendingName: null,
					sendingAddress: E2E_SENDER_ADDRESS,
					scopes: [{ type: "domain", domainId: E2E_DOMAIN_ID }],
				}),
			});
			expect(mailboxResponse.status).toBe(201);

			const subject = `E2E Raw Relay ${token}`;
			const hiddenRecipient = `raw-hidden-${token}@${E2E_DOMAIN}`;
			const smime = signSmimeMessage(
				[
					`From: "E2E Sender" <${E2E_SENDER_ADDRESS}>`,
					`To: ${E2E_RECIPIENT_ADDRESS}`,
					`Bcc: ${hiddenRecipient}`,
					"X-SES-CONFIGURATION-SET: attacker-set",
					`Subject: ${subject}`,
					"X-Entity-Ref-ID: raw-relay",
				],
				[
					"Content-Type: text/plain; charset=utf-8",
					"Content-Transfer-Encoding: 7bit",
					"",
					"Signed body   ",
					"From the start of a line.",
					"",
				].join("\r\n"),
			);
			expect(smime.verify(smime.raw)).toBe(true);

			const sendRaw = (
				raw: string,
				options: {
					apiKey?: string;
					secret?: string | null;
					idempotencyKey?: string;
					recipients?: string[];
				} = {},
			) =>
				fetch(`${API_URL}/emails/raw`, {
					method: "POST",
					headers: {
						Authorization: `Bearer ${options.apiKey ?? mailbox.password}`,
						"Content-Type": "application/json",
						...(options.secret === null
							? {}
							: {
									"x-inbound-gateway-secret":
										options.secret ?? E2E_GATEWAY_SECRET,
								}),
						...(options.idempotencyKey
							? { "Idempotency-Key": options.idempotencyKey }
							: {}),
					},
					body: JSON.stringify({
						raw: Buffer.from(raw).toString("base64"),
						recipients: options.recipients ?? [
							E2E_RECIPIENT_ADDRESS,
							hiddenRecipient,
						],
					}),
				});

			const idempotencyKey = `raw-relay-${token}`;
			const response = await sendRaw(smime.raw, { idempotencyKey });
			const sent = (await response.json()) as SendEmailResponse;
			expect(response.status).toBe(200);

			const relayed = mailServer?.messages.find(
				(message) => message.messageId === sent.message_id,
			);
			expect(relayed).toBeDefined();
			if (!relayed) return;
			expect(relayed.from).toBe(E2E_SENDER_ADDRESS);
			expect(relayed.recipients.sort()).toEqual(
				[E2E_RECIPIENT_ADDRESS, hiddenRecipient].sort(),
			);
			expect(messageBody(relayed.raw)).toBe(messageBody(smime.raw));
			expect(smime.verify(relayed.raw)).toBe(true);
			const names = headerNames(relayed.raw);
			expect(names).not.toContain("bcc");
			expect(names.filter((name) => name.startsWith("x-ses-"))).toEqual([]);
			expect(names.filter((name) => name === "from")).toHaveLength(1);
			expect(names).toContain("date");
			expect(names).toContain("x-entity-ref-id");
			expect(relayed.raw).not.toContain(hiddenRecipient);

			const sentEmail = await getEmailDetail(sent.id);
			expect(sentEmail.subject).toBe(subject);
			expect(sentEmail.to).toEqual([E2E_RECIPIENT_ADDRESS]);

			const relayedCount = mailServer?.messages.length;
			const replay = await sendRaw(smime.raw, { idempotencyKey });
			expect(replay.status).toBe(200);
			expect(((await replay.json()) as SendEmailResponse).id).toBe(sent.id);
			expect(mailServer?.messages.length).toBe(relayedCount);

			const replaceHeader = (from: string, to: string) =>
				smime.raw.replace(from, to);
			const rejected: Array<[number, Response]> = [
				[403, await sendRaw(smime.raw, { secret: null })],
				[403, await sendRaw(smime.raw, { apiKey: API_KEY })],
				[
					403,
					await sendRaw(
						replaceHeader(
							`From: "E2E Sender" <${E2E_SENDER_ADDRESS}>`,
							"From: ceo@e2e-secondary.inbound.test",
						),
					),
				],
				[
					400,
					await sendRaw(
						replaceHeader(
							"X-Entity-Ref-ID: raw-relay",
							"From: ceo@e2e-secondary.inbound.test",
						),
					),
				],
				[
					400,
					await sendRaw(
						replaceHeader(
							"X-Entity-Ref-ID: raw-relay\r\n",
							"X-Entity-Ref-ID: raw-relay\nBcc: attacker@evil.example\r\n",
						),
					),
				],
				[
					400,
					await sendRaw(
						`From: ${E2E_SENDER_ADDRESS}\r\nTo: ${E2E_RECIPIENT_ADDRESS}\r\nSubject: plain\r\n\r\nUnsigned`,
					),
				],
				[400, await sendRaw(smime.raw, { recipients: ["bad address@x"] })],
			];
			for (const [status, rejection] of rejected) {
				expect(rejection.status).toBe(status);
			}
			expect(mailServer?.messages.length).toBe(relayedCount);
		},
		TEST_TIMEOUT_MS,
	);

	it(
		"returns 429 responses when burst traffic exceeds rate limits",
		async () => {
			let sawRateLimit = false;

			for (let attempt = 0; attempt < 5 && !sawRateLimit; attempt += 1) {
				const results = await Promise.allSettled(
					Array.from({ length: E2E_RATE_LIMIT_PER_SECOND * 3 }, async () => {
						const response = await apiRequestWithKey(
							`/endpoints${queryString({ limit: 1, offset: 0 })}`,
							API_KEY,
						);
						await response.arrayBuffer().catch(() => undefined);
						return response.status;
					}),
				);

				sawRateLimit = results.some(
					(result) => result.status === "fulfilled" && result.value === 429,
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
console.log("  - Auth boundary enforcement (invalid key + second tenant)");
console.log("  - Reply threading via In-Reply-To/References");
console.log("  - Multi-attachment parsing edge cases");
console.log("  - Endpoint lifecycle update + cleanup behavior");
console.log("  - S/MIME raw relay keeps signatures valid and strips Bcc");
console.log("  - Rate-limit 429 behavior under burst traffic");
console.log("=".repeat(60) + "\n");
