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
import { createRequire } from "node:module";
import net from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { JevAnswer } from "@/lib/ai/jev";
import {
	buildStoredClassification,
	type ClassificationSummary,
	type DimensionSummary,
	withCurrentSummary,
} from "@/lib/guard/classification";
import {
	classifierJunkVerdict,
	SPAM_FILTER_LEVELS,
} from "@/lib/guard/junk-verdict";
import {
	buildLocalEnv,
	LOCAL_CRON_SECRET,
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
			AWS_ACCOUNT_ID: "000000000000",
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
			env: { ...e2eServerEnv(), NODE_ENV: "development" },
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
	const signed = readFileSync(join(dir, "signed.eml"), "utf8").replace(
		/\r?\n/g,
		"\r\n",
	);
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
		psql(
			`\\set gateway_password local-e2e-gateway\n${readFileSync("packages/imap-gateway/deploy/provision-db-role.sql", "utf8").replace("ON DATABASE neondb", `ON DATABASE ${E2E_DATABASE}`)}`,
			E2E_DATABASE,
		);
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
		"stores inbound mail with too many MIME parts as a parse failure without hanging",
		async () => {
			const token = makeToken("part-bomb");
			const subject = `E2E Part Bomb ${token}`;
			const lines = [
				"From: part-bomb@example.test",
				`To: ${E2E_RECIPIENT_ADDRESS}`,
				`Subject: ${subject}`,
				`Message-ID: <${token}@example.test>`,
				"MIME-Version: 1.0",
				'Content-Type: multipart/mixed; boundary="b"',
				"",
			];
			for (let index = 0; index < 1001; index++) {
				lines.push("--b", "Content-Type: message/rfc822", "", "Subject: x", "", "body");
			}
			lines.push("--b--", "");

			const startedAt = Date.now();
			const response = await deliverInbound({
				inboundWebhookUrl: `${LOCAL_BASE_URL}/api/inbound/webhook`,
				serviceApiKey: LOCAL_SERVICE_API_KEY,
				recipients: [E2E_RECIPIENT_ADDRESS],
				sesMessageId: `ses-${token}`,
				source: "part-bomb@example.test",
				raw: lines.join("\r\n"),
			});
			expect(response.status).toBe(200);
			expect(Date.now() - startedAt).toBeLessThan(30_000);

			const [parseSuccess, parseError, rawLength] = psql(
				`select parse_success, parse_error, length(raw_content) from structured_emails where subject = '${subject}' and user_id = '${PRIMARY_USER_ID}';`,
				E2E_DATABASE,
			).split("|");
			expect(parseSuccess).toBe("f");
			expect(parseError).toContain("more than 500 MIME parts");
			expect(Number(rawLength)).toBeGreaterThan(50_000);
		},
		TEST_TIMEOUT_MS,
	);

	it(
		"stores inbound mail with thousands of cid: references without inlining them",
		async () => {
			const token = makeToken("cid-bomb");
			const subject = `E2E Cid Bomb ${token}`;
			const image = Buffer.alloc(256 * 1024, 7)
				.toString("base64")
				.replace(/.{76}/g, "$&\r\n");
			const raw = [
				"From: cid-bomb@example.test",
				`To: ${E2E_RECIPIENT_ADDRESS}`,
				`Subject: ${subject}`,
				`Message-ID: <${token}@example.test>`,
				"MIME-Version: 1.0",
				'Content-Type: multipart/related; boundary="r"',
				"",
				"--r",
				"Content-Type: text/html; charset=utf-8",
				"",
				`<p>${'<img src="cid:logo">'.repeat(3000)}</p>`,
				"--r",
				"Content-Type: image/png",
				"Content-Transfer-Encoding: base64",
				"Content-ID: <logo>",
				"",
				image,
				"--r--",
				"",
			].join("\r\n");

			const startedAt = Date.now();
			const response = await deliverInbound({
				inboundWebhookUrl: `${LOCAL_BASE_URL}/api/inbound/webhook`,
				serviceApiKey: LOCAL_SERVICE_API_KEY,
				recipients: [E2E_RECIPIENT_ADDRESS],
				sesMessageId: `ses-${token}`,
				source: "cid-bomb@example.test",
				raw,
			});
			expect(response.status).toBe(200);
			expect(Date.now() - startedAt).toBeLessThan(30_000);

			const [parseSuccess, htmlLength, keptCid, attachments] = psql(
				`select parse_success, length(html_body), position('cid:logo' in html_body) > 0, attachments from structured_emails where subject = '${subject}' and user_id = '${PRIMARY_USER_ID}';`,
				E2E_DATABASE,
			).split("|");
			expect(parseSuccess).toBe("t");
			expect(Number(htmlLength)).toBeLessThan(100_000);
			expect(keptCid).toBe("t");
			expect(attachments).toContain('"contentId":"<logo>"');
		},
		TEST_TIMEOUT_MS,
	);

	it(
		"stores large crafted HTML-only inbound mail with derived text without hanging",
		async () => {
			const token = makeToken("html-nest");
			const subject = `E2E Nested Html ${token}`;
			const raw = [
				"From: html-nest@example.test",
				`To: ${E2E_RECIPIENT_ADDRESS}`,
				`Subject: ${subject}`,
				`Message-ID: <${token}@example.test>`,
				"MIME-Version: 1.0",
				"Content-Type: text/html; charset=utf-8",
				"",
				`<p>Nested ${token}</p>${"<b>".repeat(150_000)}${"</i>".repeat(150_000)}`,
				"",
			].join("\r\n");

			const startedAt = Date.now();
			const response = await deliverInbound({
				inboundWebhookUrl: `${LOCAL_BASE_URL}/api/inbound/webhook`,
				serviceApiKey: LOCAL_SERVICE_API_KEY,
				recipients: [E2E_RECIPIENT_ADDRESS],
				sesMessageId: `ses-${token}`,
				source: "html-nest@example.test",
				raw,
			});
			expect(response.status).toBe(200);
			expect(Date.now() - startedAt).toBeLessThan(30_000);

			const [parseSuccess, textBody, htmlLength] = psql(
				`select parse_success, text_body, length(html_body) from structured_emails where subject = '${subject}' and user_id = '${PRIMARY_USER_ID}';`,
				E2E_DATABASE,
			).split("|");
			expect(parseSuccess).toBe("t");
			expect(textBody).toBe(`Nested ${token}`);
			expect(Number(htmlLength)).toBeGreaterThan(1_000_000);
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
								timeout: 25,
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
			expect(failed.status).toBe(422);
			expect(((await failed.json()) as { error: string }).error).toContain(
				"Email rejected by the email provider",
			);

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
		"sends messages with an empty subject and no body",
		async () => {
			const token = makeToken("empty");
			const sent = await apiJson<SendEmailResponse>("/emails", {
				method: "POST",
				body: JSON.stringify({
					from: E2E_SENDER_ADDRESS,
					to: E2E_RECIPIENT_ADDRESS,
					subject: "",
					headers: { "X-E2E-Token": token },
				}),
			});
			expect(sent.response.status).toBe(200);
			expect(sent.data.id).toBeDefined();

			const message = await pollFor(
				"empty message at the SES stub",
				POLL_CONFIG.threadTimeoutMs,
				async () =>
					(mailServer?.messages ?? []).find((item) =>
						item.raw.includes(`X-E2E-Token: ${token}`),
					) ?? null,
			);
			expect(message?.raw).toContain("Subject: \r\n");
			expect(message?.raw).toContain("Content-Type: text/plain; charset=UTF-8");
			expect(message?.raw).not.toContain("[No content]");
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
		"rejects addresses whose display name contains angle brackets",
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
			expect(sent.response.status).toBe(400);

			const spoofedFrom = await apiJson<SendEmailResponse>("/emails", {
				method: "POST",
				body: JSON.stringify({
					from: `"<agent@inbnd.dev>" <${E2E_SENDER_ADDRESS}>`,
					to: E2E_RECIPIENT_ADDRESS,
					subject,
					text: `Redirect check ${token}`,
				}),
			});
			expect(spoofedFrom.response.status).toBe(400);

			await sleep(1000);
			const message = (mailServer?.messages ?? []).find((item) =>
				item.raw.includes(subject),
			);
			expect(message).toBeUndefined();
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
				Omit<DomainListResponse, "data"> & { data: Array<DomainListItem & { includeSubdomains: boolean }> }
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
					"Received: from client.example (client.example [203.0.113.7])",
					"Sender: someone-else@e2e-secondary.inbound.test",
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
			expect(names).not.toContain("received");
			expect(names).not.toContain("sender");
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
				[
					400,
					await sendRaw(
						smime.raw.replace(
							"From the start of a line.\r\n",
							"From the start of a line.\nBcc: attacker@evil.example\r\n",
						),
					),
				],
				[
					400,
					await sendRaw(
						smime.raw.replace("Signed body   \r\n", "Signed body\r   \r\n"),
					),
				],
				[
					400,
					await sendRaw(
						smime.raw.replace(
							/(smime\.p7s"\r\n\r\n)[A-Za-z0-9+/=\r\n]+?(\r\n\r\n--|\r\n--)/,
							"$1aGVsbG8gd29ybGQ=$2",
						),
					),
				],
				[
					400,
					await sendRaw(
						smime.raw.replace(
							/filename="?smime\.p7s"?/,
							'filename="invoice.pdf.exe"',
						),
					),
				],
			];
			for (const [status, rejection] of rejected) {
				expect(rejection.status).toBe(status);
			}
			expect(mailServer?.messages.length).toBe(relayedCount);

			const { response: readOnlyResponse, data: readOnly } = await apiJson<{
				password: string;
			}>("/mailboxes", {
				method: "POST",
				body: JSON.stringify({
					name: `Read only ${token}`,
					loginAddress: `ro-${token}@${E2E_DOMAIN}`,
					type: "mailbox",
					accessMode: "read",
					sendingMode: "identity",
					sendingName: null,
					sendingAddress: E2E_SENDER_ADDRESS,
					scopes: [{ type: "domain", domainId: E2E_DOMAIN_ID }],
				}),
			});
			expect(readOnlyResponse.status).toBe(201);
			const readOnlyRaw = await sendRaw(smime.raw, {
				apiKey: readOnly.password,
				idempotencyKey: `raw-relay-ro-${token}`,
			});
			expect(readOnlyRaw.status).toBe(403);
			const readOnlySend = await fetch(`${API_URL}/emails`, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${readOnly.password}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					from: E2E_SENDER_ADDRESS,
					to: E2E_RECIPIENT_ADDRESS,
					subject: `Read only send ${token}`,
					text: "must not send",
				}),
			});
			expect(readOnlySend.status).toBe(403);
			const readOnlyBody = (await readOnlySend.json()) as {
				error: string;
				message: string;
			};
			expect(readOnlyBody.error).toBe("Forbidden");
			expect(readOnlyBody.message).toContain("read only");
			const gatewayAuth = (path: string) =>
				fetch(`${API_URL}/mailboxes/${path}`, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						"x-inbound-gateway-secret": E2E_GATEWAY_SECRET,
					},
					body: JSON.stringify({
						loginAddress: `ro-${token}@${E2E_DOMAIN}`,
						password: readOnly.password,
					}),
				});
			const readOnlySmtpAuth = await gatewayAuth("authenticate-smtp");
			expect(readOnlySmtpAuth.status).toBe(200);
			expect(
				((await readOnlySmtpAuth.json()) as { accessMode: string }).accessMode,
			).toBe("read");
			const readOnlyImapAuth = await gatewayAuth("authenticate");
			expect(readOnlyImapAuth.status).toBe(200);
			expect(
				((await readOnlyImapAuth.json()) as { accessMode: string }).accessMode,
			).toBe("read");
			expect(mailServer?.messages.length).toBe(relayedCount);
		},
		TEST_TIMEOUT_MS,
	);

	it(
		"sends scheduled emails from the cron with pause, resume, cancel and stale recovery",
		async () => {
			const runCron = (authorized = true) =>
				fetch(`${LOCAL_BASE_URL}/api/cron/send-scheduled`, {
					headers: authorized
						? { Authorization: `Bearer ${LOCAL_CRON_SECRET}` }
						: {},
				});
			const stubCount = (subject: string) =>
				(mailServer?.messages ?? []).filter((message) =>
					message.raw.includes(subject),
				).length;
			const schedule = async (subject: string) => {
				const created = await apiJson<{ id: string; status?: string }>(
					"/emails",
					{
						method: "POST",
						body: JSON.stringify({
							from: E2E_SENDER_ADDRESS,
							to: E2E_RECIPIENT_ADDRESS,
							subject,
							text: `Scheduled ${subject}`,
							scheduled_at: new Date(Date.now() + 5 * 60_000).toISOString(),
						}),
					},
				);
				expect(created.response.status).toBe(201);
				expect(created.data.status).toBe("scheduled");
				return created.data.id;
			};
			const makeDue = (id: string) =>
				psql(
					`update scheduled_emails set scheduled_at = now() - interval '1 minute' where id = '${id}';`,
					E2E_DATABASE,
				);
			const statusOf = async (id: string) =>
				(await apiJson<EmailDetailResponse>(`/emails/${id}`)).data.status;

			expect((await runCron(false)).status).toBe(401);

			const token = makeToken("sched").replace(/[^a-z0-9-]/gi, "");
			const subject = `E2E Scheduled ${token}`;
			const id = await schedule(subject);

			expect(
				(await apiRequestWithKey(`/emails/${id}/pause`, ALT_API_KEY, {
					method: "POST",
				})).status,
			).toBe(404);
			const paused = await apiJson<{ status: string }>(`/emails/${id}/pause`, {
				method: "POST",
			});
			expect(paused.response.status).toBe(200);
			expect(paused.data.status).toBe("paused");

			makeDue(id);
			expect((await runCron()).status).toBe(200);
			expect(stubCount(subject)).toBe(0);
			expect(await statusOf(id)).toBe("paused");

			const resumed = await apiJson<{ status: string; scheduled_at: string }>(
				`/emails/${id}/resume`,
				{ method: "POST" },
			);
			expect(resumed.response.status).toBe(200);
			expect(resumed.data.status).toBe("scheduled");
			expect(new Date(resumed.data.scheduled_at).getTime()).toBeLessThanOrEqual(
				Date.now() + 1000,
			);

			const sentRun = await runCron();
			expect(sentRun.status).toBe(200);
			expect(((await sentRun.json()) as { sent: number }).sent).toBeGreaterThanOrEqual(1);
			expect(await statusOf(id)).toBe("sent");
			expect(stubCount(subject)).toBe(1);

			expect((await runCron()).status).toBe(200);
			expect(stubCount(subject)).toBe(1);
			const cancelSent = await apiRequest(`/emails/${id}`, { method: "DELETE" });
			expect(cancelSent.status).toBe(400);

			const cancelSubject = `E2E Scheduled Cancel ${token}`;
			const cancelId = await schedule(cancelSubject);
			const cancelled = await apiRequest(`/emails/${cancelId}`, {
				method: "DELETE",
			});
			expect(cancelled.status).toBe(200);
			makeDue(cancelId);
			await runCron();
			expect(stubCount(cancelSubject)).toBe(0);
			expect(await statusOf(cancelId)).toBe("cancelled");

			const maybeSentSubject = `E2E Scheduled Interrupted After SES ${token}`;
			const maybeSentId = await schedule(maybeSentSubject);
			const unsentSubject = `E2E Scheduled Interrupted Before SES ${token}`;
			const unsentId = await schedule(unsentSubject);
			psql(
				`update scheduled_emails set status = 'processing', attempts = 1, scheduled_at = now() - interval '20 minutes', updated_at = now() - interval '20 minutes', sent_email_id = case when id = '${maybeSentId}' then 'interrupted-${token}' else null end where id in ('${maybeSentId}', '${unsentId}');`,
				E2E_DATABASE,
			);
			expect(
				(await apiRequest(`/emails/${unsentId}`, { method: "DELETE" })).status,
			).toBe(400);
			expect((await runCron()).status).toBe(200);
			expect(await statusOf(maybeSentId)).toBe("failed");
			expect(stubCount(maybeSentSubject)).toBe(0);
			expect(await statusOf(unsentId)).toBe("sent");
			expect(stubCount(unsentSubject)).toBe(1);

			const legacyProcessingSubject = `E2E Scheduled Legacy Processing ${token}`;
			const legacyProcessingId = await schedule(legacyProcessingSubject);
			const unclaimedProcessingSubject = `E2E Scheduled Unclaimed Processing ${token}`;
			const unclaimedProcessingId = await schedule(unclaimedProcessingSubject);
			psql(
				`update scheduled_emails set status = 'processing', scheduled_at = now() - interval '20 minutes', updated_at = now() - interval '20 minutes', attempts = case when id = '${legacyProcessingId}' then 1 else 0 end, qstash_schedule_id = case when id = '${legacyProcessingId}' then 'legacy-${token}' else null end where id in ('${legacyProcessingId}', '${unclaimedProcessingId}');`,
				E2E_DATABASE,
			);
			const legacyMissedSubject = `E2E Scheduled Legacy Missed ${token}`;
			const legacyMissedId = await schedule(legacyMissedSubject);
			const legacyDueSubject = `E2E Scheduled Legacy Due ${token}`;
			const legacyDueId = await schedule(legacyDueSubject);
			const backoffSubject = `E2E Scheduled Backoff ${token}`;
			const backoffId = await schedule(backoffSubject);
			psql(
				`update scheduled_emails set qstash_schedule_id = 'legacy-${token}', scheduled_at = case when id = '${legacyMissedId}' then now() - interval '20 minutes' else now() - interval '5 minutes' end where id in ('${legacyMissedId}', '${legacyDueId}'); update scheduled_emails set scheduled_at = now() - interval '1 minute', next_retry_at = now() + interval '2 minutes' where id = '${backoffId}';`,
				E2E_DATABASE,
			);
			expect((await runCron()).status).toBe(200);
			expect(await statusOf(legacyProcessingId)).toBe("failed");
			expect(await statusOf(unclaimedProcessingId)).toBe("failed");
			expect(await statusOf(legacyMissedId)).toBe("failed");
			expect(
				psql(
					`select last_error from scheduled_emails where id = '${legacyMissedId}';`,
					E2E_DATABASE,
				),
			).toBe("Missed during scheduler migration");
			expect(await statusOf(legacyDueId)).toBe("sent");
			expect(await statusOf(backoffId)).toBe("scheduled");
			expect(stubCount(legacyProcessingSubject)).toBe(0);
			expect(stubCount(unclaimedProcessingSubject)).toBe(0);
			expect(stubCount(legacyMissedSubject)).toBe(0);
			expect(stubCount(legacyDueSubject)).toBe(1);
			expect(stubCount(backoffSubject)).toBe(0);

			psql(
				`update scheduled_emails set next_retry_at = now() - interval '1 second' where id = '${backoffId}';`,
				E2E_DATABASE,
			);
			expect((await runCron()).status).toBe(200);
			expect(await statusOf(backoffId)).toBe("sent");
			expect(stubCount(backoffSubject)).toBe(1);
		},
		TEST_TIMEOUT_MS,
	);

	it(
		"shares mailbox folders, flags, appends, moves, deletion and sent copies over HTTP",
		async () => {
			type Folder = {
				path: string;
				subscribed: boolean;
				specialUse: string | null;
				highestModseq: number;
				total: number;
			};
			type Message = {
				uid: number;
				flags: string[];
				subject?: string;
				structuredEmailId?: string | null;
			};
			type MessageList = {
				data: Message[];
				pagination: {
					limit: number;
					offset: number;
					total: number;
					hasMore: boolean;
				};
				highestModseq?: number;
				expunged?: unknown[];
			};
			const token = makeToken("state");
			const create = (accessMode: "read" | "read_write") =>
				apiJson<{ data: { id: string }; password: string }>("/mailboxes", {
					method: "POST",
					body: JSON.stringify({
						name: `${accessMode} ${token}`,
						loginAddress: `${accessMode}-${token}@${E2E_DOMAIN}`,
						type: "mailbox",
						accessMode,
						sendingMode: "scoped_domains",
						sendingName: null,
						sendingAddress: null,
						scopes: [{ type: "domain", domainId: E2E_DOMAIN_ID }],
					}),
				});
			const created = await create("read_write");
			expect(created.response.status).toBe(201);
			const id = created.data.data.id;
			const base = `/mailboxes/${id}/folders`;
			const mailboxHeaders = {
				Authorization: `Bearer ${created.data.password}`,
			};
			const folders = () => apiJson<{ data: Folder[] }>(base);
			const list = (folder: string, query = "") =>
				apiJson<MessageList>(
					`${base}/${encodeURIComponent(folder)}/messages${query}`,
				);
			const mutate = (path: string, method: string, body?: object) =>
				apiRequest(path, {
					method,
					...(body ? { body: JSON.stringify(body) } : {}),
				});
			const sentCount = (count: number) =>
				pollFor(`${count} Sent copies`, POLL_CONFIG.inboundTimeoutMs, async () => {
					const sent = await list("Sent");
					return sent.data.data.length === count ? sent.data.data : null;
				});
			const initial = await folders();
			expect(initial.response.status).toBe(200);
			expect(initial.data.data.map((folder) => folder.path)).toEqual(
				expect.arrayContaining([
					"INBOX",
					"Sent",
					"Drafts",
					"Trash",
					"Junk",
					"Archive",
				]),
			);
			expect(
				initial.data.data.find((folder) => folder.path === "Archive")
					?.specialUse,
			).toBe("\\Archive");
			expect(
				(await apiRequest("/mailboxes/me/folders", { headers: mailboxHeaders }))
					.status,
			).toBe(200);
			expect((await apiRequestWithKey(base, ALT_API_KEY)).status).toBe(404);
			expect((await mutate(`${base}/INBOX`, "DELETE")).status).toBe(400);
			expect((await mutate(base, "POST", { path: "Projects" })).status).toBe(
				201,
			);
			expect(
				(await mutate(base, "POST", { path: "Projects/Invoices" })).status,
			).toBe(201);
			expect(
				(await mutate(`${base}/Projects`, "PATCH", { path: "Work" })).status,
			).toBe(200);
			expect(
				(await folders()).data.data.map((folder) => folder.path),
			).toContain("Work/Invoices");
			expect(
				(await mutate(`${base}/Work`, "PATCH", { subscribed: false })).status,
			).toBe(200);
			expect(
				(await folders()).data.data.find((folder) => folder.path === "Work")
					?.subscribed,
			).toBe(false);
			const raw = buildRawEmailContent({
				from: E2E_SENDER_ADDRESS,
				to: E2E_RECIPIENT_ADDRESS,
				subject: `Mailbox ${token}`,
				messageId: `${token}@example.test`,
				text: `Stored body ${token}`,
			});
			const append = (folder: string, content = raw) =>
				mutate(`${base}/${encodeURIComponent(folder)}/messages`, "POST", {
					raw: Buffer.from(content).toString("base64"),
				});
			expect(
				(
					await mutate(`${base}/Drafts/messages`, "POST", {
						raw: "not-base64!",
					})
				).status,
			).toBe(400);
			expect((await append("Drafts", "x".repeat(1024 * 1024 + 1))).status).toBe(
				413,
			);
			expect((await append("Work/Invoices")).status).toBe(201);
			let messages = await list("Work/Invoices", "?limit=1&offset=0");
			expect(messages.response.status).toBe(200);
			expect(messages.data.pagination).toEqual({
				limit: 1,
				offset: 0,
				total: 1,
				hasMore: false,
			});
			const uid = messages.data.data[0].uid;
			const messagePath = `${base}/Work%2FInvoices/messages/${uid}`;
			const detail = await apiRequest(messagePath, { headers: mailboxHeaders });
			expect(detail.status).toBe(200);
			expect(await detail.text()).toContain(`Stored body ${token}`);
			const fetchedRaw = await apiRequest(`${messagePath}/raw`);
			expect(fetchedRaw.status).toBe(200);
			expect(fetchedRaw.headers.get("content-type")).toContain(
				"message/rfc822",
			);
			expect(await fetchedRaw.text()).toBe(raw);
			expect((await apiRequestWithKey(messagePath, ALT_API_KEY)).status).toBe(
				404,
			);
			const since = (await folders()).data.data.find(
				(folder) => folder.path === "Work/Invoices",
			)!.highestModseq;
			expect(
				(
					await mutate(messagePath, "PATCH", {
						action: "add",
						flags: ["\\Seen", "\\Flagged", "customer-tag"],
					})
				).status,
			).toBe(200);
			messages = await list("Work/Invoices", `?sinceModseq=${since}`);
			expect(messages.data.data).toHaveLength(1);
			expect(messages.data.data[0].flags).toEqual(
				expect.arrayContaining(["\\Seen", "\\Flagged", "customer-tag"]),
			);
			expect(
				(await list("Work/Invoices", `?sinceUid=${uid}`)).data.data,
			).toHaveLength(0);
			expect(
				(await list("Work/Invoices", "?unread=true")).data.data,
			).toHaveLength(0);
			expect(
				(await list("Work/Invoices", "?flagged=true")).data.data,
			).toHaveLength(1);
			expect(
				(await list("Work/Invoices", `?search=${token}`)).data.data,
			).toHaveLength(1);
			expect(
				(await list("Work/Invoices", `?search=${encodeURIComponent("Stored body")}`))
					.data.data,
			).toHaveLength(0);
			const unauthenticated = await fetch(
				`${API_URL}${base}/Work%2FInvoices/messages/not-a-uid`,
				{ method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "add", flags: ["bad flag"] }) },
			);
			expect(unauthenticated.status).toBe(401);
			expect((await apiRequestWithKey(`${base}/INBOX/messages/not-a-uid`, ALT_API_KEY)).status).toBe(404);
			expect(
				(
					await apiRequestWithKey(messagePath, ALT_API_KEY, {
						method: "PATCH",
						body: JSON.stringify({ action: "add", flags: ["bad flag"] }),
					})
				).status,
			).toBe(404);
			expect((await apiRequestWithKey(`${messagePath}/attachments/x`, ALT_API_KEY)).status).toBe(404);
			expect((await apiRequest(`${base}/INBOX/messages/not-a-uid`)).status).toBe(400);
			expect(
				(
					await mutate(`${base}/Drafts/messages`, "POST", {
						raw: Buffer.concat([
							Buffer.from(`From: ${E2E_SENDER_ADDRESS}\r\nSubject: latin1 ${token}\r\n\r\n`),
							Buffer.from([0xe9, 0xff]),
						]).toString("base64"),
					})
				).status,
			).toBe(400);
			expect(
				(await apiRequestWithKey(`${base}/Drafts/messages`, ALT_API_KEY, {
					method: "POST",
					body: JSON.stringify({ raw: "not-base64!" }),
				})).status,
			).toBe(404);
			expect(
				(
					await mutate(messagePath, "PATCH", {
						action: "remove",
						flags: ["\\Seen"],
					})
				).status,
			).toBe(200);
			expect(
				(await list("Work/Invoices", "?unread=true")).data.data,
			).toHaveLength(1);
			expect((await mutate(messagePath, "POST", {})).status).toBe(404);
			expect(
				(await mutate(`${messagePath}/copy`, "POST", { destination: "Drafts" }))
					.status,
			).toBe(201);
			expect((await list("Work/Invoices")).data.data).toHaveLength(1);
			expect((await list("Drafts")).data.data).toHaveLength(1);
			expect(
				(
					await mutate(`${messagePath}/move`, "POST", {
						destination: "Archive",
					})
				).status,
			).toBe(200);
			expect((await list("Work/Invoices")).data.data).toHaveLength(0);
			const archived = (await list("Archive")).data.data[0];
			expect(archived.flags).toContain("customer-tag");
			expect(
				(await mutate(`${base}/Archive/messages/${archived.uid}`, "DELETE"))
					.status,
			).toBe(200);
			expect((await list("Archive")).data.data).toHaveLength(0);
			const trashed = (await list("Trash")).data.data[0];
			expect(
				(
					await mutate(
						`${base}/Trash/messages/${trashed.uid}?permanent=true`,
						"DELETE",
					)
				).status,
			).toBe(200);
			expect((await list("Trash")).data.data).toHaveLength(0);
			const draft = (await list("Drafts")).data.data[0];
			const draftSince = (await folders()).data.data.find(
				(folder) => folder.path === "Drafts",
			)!.highestModseq;
			expect(
				(
					await mutate(`${base}/Drafts/messages/${draft.uid}`, "PATCH", {
						action: "set",
						flags: ["\\Deleted"],
					})
				).status,
			).toBe(200);
			expect((await mutate(`${base}/Drafts/expunge`, "POST", {})).status).toBe(
				200,
			);
			const removed = await list("Drafts", `?sinceModseq=${draftSince}`);
			expect(removed.data.data).toHaveLength(0);
			expect(removed.data.expunged).toHaveLength(1);
			psql(
				`update imap_mailbox_expunges set created_at = now() - interval '8 days' where mailbox_id in (select id from imap_mailboxes where credential_id = '${id}' and path = 'Drafts');`,
				E2E_DATABASE,
			);
			expect((await list("Drafts", `?sinceModseq=${draftSince}`)).response.status).toBe(409);
			expect((await mutate(`${base}/Drafts/messages`, "POST", { from: E2E_SENDER_ADDRESS, to: [E2E_RECIPIENT_ADDRESS], subject: `JSON draft ${token}`, text: "Editable draft" })).status).toBe(201);
			const jsonDraft = (await list("Drafts")).data.data[0];
			expect(jsonDraft.flags).toEqual(expect.arrayContaining(["\\Seen", "\\Draft"]));
			const attachmentRaw = [
				`From: ${E2E_SENDER_ADDRESS}`, `To: ${E2E_RECIPIENT_ADDRESS}`,
				`Subject: Attachment ${token}`, "MIME-Version: 1.0",
				'Content-Type: multipart/mixed; boundary="mailbox-test"', "",
				"--mailbox-test", "Content-Type: text/plain", "", "Body",
				"--mailbox-test", 'Content-Type: text/plain; name="note.txt"',
				'Content-Disposition: attachment; filename="note.txt"',
				"Content-Transfer-Encoding: base64", "", Buffer.from(token).toString("base64"),
				"--mailbox-test--", "",
			].join("\r\n");
			expect((await append("Drafts", attachmentRaw)).status).toBe(201);
			const attached = (await list("Drafts")).data.data[0];
			const attachmentsPath = `${base}/Drafts/messages/${attached.uid}/attachments`;
			const attachments = await apiJson<{ data: Array<{ index: number; filename: string }> }>(attachmentsPath);
			expect(attachments.data.data).toMatchObject([{ index: 0, filename: "note.txt" }]);
			const attachment = await apiRequest(`${attachmentsPath}/0`);
			expect(attachment.status).toBe(200);
			expect(await attachment.text()).toBe(token);
			expect((await mutate(`${base}/Work%2FInvoices`, "DELETE")).status).toBe(
				200,
			);
			expect((await mutate(`${base}/Work`, "DELETE")).status).toBe(200);
			const readOnly = await create("read");
			expect(readOnly.response.status).toBe(201);
			const readOnlyBase = `/mailboxes/${readOnly.data.data.id}/folders`;
			expect((await apiRequest(readOnlyBase)).status).toBe(200);
			expect(
				(await mutate(readOnlyBase, "POST", { path: "Forbidden" })).status,
			).toBe(403);
			expect(
				(
					await apiRequest("/mailboxes/me/folders", {
						method: "POST",
						headers: { Authorization: `Bearer ${readOnly.data.password}` },
						body: JSON.stringify({ path: "Forbidden" }),
					})
				).status,
			).toBe(403);
			expect(
				(
					await mutate(`${readOnlyBase}/Drafts/messages`, "POST", {
						raw: Buffer.from(raw).toString("base64"),
					})
				).status,
			).toBe(403);
			for (const appendFirst of [true, false]) {
				const messageId = `${token}-${appendFirst}@example.test`;
				const sentRaw = raw.replace(
					`<${token}@example.test>`,
					`<${messageId}>`,
				);
				if (appendFirst)
					expect((await append("Sent", sentRaw)).status).toBe(201);
				const sent = await apiRequest("/emails", {
					method: "POST",
					headers: mailboxHeaders,
					body: JSON.stringify({
						from: E2E_SENDER_ADDRESS,
						to: E2E_RECIPIENT_ADDRESS,
						subject: `Sent ${token} ${appendFirst}`,
						text: "Sent copy",
						message_id: `<${messageId}>`,
					}),
				});
				expect(sent.status).toBe(200);
				if (!appendFirst)
					expect((await append("Sent", sentRaw)).status).toBe(201);
			}
			expect(await sentCount(2)).not.toBeNull();
			const signed = signSmimeMessage([
				`From: ${E2E_SENDER_ADDRESS}`, `To: ${E2E_RECIPIENT_ADDRESS}`,
				`Subject: Signed mailbox ${token}`, `Message-ID: <signed-${token}@example.test>`,
			], "Content-Type: text/plain\r\n\r\nSigned mailbox body\r\n");
			const rawSend = await apiRequest("/emails/raw", {
				method: "POST",
				headers: { ...mailboxHeaders, "x-inbound-gateway-secret": E2E_GATEWAY_SECRET },
				body: JSON.stringify({ raw: Buffer.from(signed.raw).toString("base64"), recipients: [E2E_RECIPIENT_ADDRESS] }),
			});
			expect(rawSend.status).toBe(200);
			expect((await append("Sent", signed.raw)).status).toBe(201);
			expect(await sentCount(3)).not.toBeNull();
			const roundTrip = await ensureRoundTrip();
			expect(roundTrip).not.toBeNull();
			const structured = (await list("INBOX", `?search=${encodeURIComponent(roundTrip!.subject)}`)).data.data.find((message) => message.structuredEmailId === roundTrip!.receivedEmailId);
			expect(structured).toBeDefined();
			const structuredAttachment = await apiRequest(`${base}/INBOX/messages/${structured!.uid}/attachments/0`);
			expect(structuredAttachment.status).toBe(200);
			expect(await structuredAttachment.text()).toBe(roundTrip!.attachmentContent);
			const receivedSubject = `Mailbox received ${token}`;
			await postSyntheticInboundRecord({
				subject: receivedSubject,
				messageId: `received-${token}@example.test`,
				recipient: E2E_RECIPIENT_ADDRESS,
				text: "Mailbox legacy state",
			});
			const received = await waitForExactSubjectEmailCount(
				"received",
				receivedSubject,
				1,
			);
			expect(received).not.toBeNull();
			const receivedId = received![0].id;
			const receivedPath = `/mailboxes/${id}/messages/${receivedId}`;
			const dashboardRead = psql(
				`select is_read from structured_emails where id = '${receivedId}';`,
				E2E_DATABASE,
			);
			expect(
				(await mutate(receivedPath, "PATCH", { isRead: true })).status,
			).toBe(200);
			const receivedRows = (await list("INBOX", `?search=${token}`)).data.data;
			expect(
				receivedRows.find((message) => message.structuredEmailId === receivedId)
					?.flags,
			).toContain("\\Seen");
			expect(
				psql(
					`select is_read from structured_emails where id = '${receivedId}';`,
					E2E_DATABASE,
				),
			).toBe(dashboardRead);
			expect(
				(await mutate(receivedPath, "PATCH", { isArchived: true })).status,
			).toBe(200);
			expect(
				(await list("Archive", `?search=${token}`)).data.data.map(
					(message) => message.structuredEmailId,
				),
			).toContain(receivedId);
			expect(
				(await list("INBOX", `?search=${token}`)).data.data.map(
					(message) => message.structuredEmailId,
				),
			).not.toContain(receivedId);
			expect(
				(await mutate(receivedPath, "PATCH", { isArchived: false })).status,
			).toBe(200);
			expect(
				(await list("INBOX", `?search=${token}`)).data.data.map(
					(message) => message.structuredEmailId,
				),
			).toContain(receivedId);
			const legacy = (path: string) =>
				apiJson<{ folder: string; folderPath: string | null; isRead: boolean }>(path);
			expect(
				(await mutate(base, "POST", { path: "Clients" })).status,
			).toBe(201);
			const inboxCopy = (await list("INBOX", `?search=${token}`)).data.data.find(
				(message) => message.structuredEmailId === receivedId,
			);
			expect(inboxCopy).toBeDefined();
			expect(
				(
					await mutate(`${base}/INBOX/messages/${inboxCopy!.uid}/move`, "POST", {
						destination: "Clients",
					})
				).status,
			).toBe(200);
			const inClients = await legacy(receivedPath);
			expect(inClients.response.status).toBe(200);
			expect(inClients.data).toMatchObject({ folder: "archive", folderPath: "Clients" });
			const unread = await apiJson<{ folder: string; folderPath: string | null; isRead: boolean }>(
				receivedPath,
				{ method: "PATCH", body: JSON.stringify({ isRead: false }) },
			);
			expect(unread.response.status).toBe(200);
			expect(unread.data).toMatchObject({ folder: "archive", folderPath: "Clients", isRead: false });
			expect(
				(await mutate(receivedPath, "PATCH", { isArchived: true })).status,
			).toBe(200);
			expect((await legacy(receivedPath)).data.folderPath).toBe("Archive");
			expect(
				(await mutate(receivedPath, "PATCH", { isArchived: false })).status,
			).toBe(200);
			expect((await legacy(receivedPath)).data).toMatchObject({ folder: "inbox", folderPath: "INBOX" });
			const legacySent = await apiJson<{ folder: string; messages: Array<{ folder: string; folderPath: string | null }> }>(
				`/mailboxes/${id}/messages?folder=sent`,
			);
			expect(legacySent.response.status).toBe(200);
			expect(legacySent.data.messages.length).toBeGreaterThan(0);
			for (const message of legacySent.data.messages)
				expect(message).toMatchObject({ folder: "sent", folderPath: "Sent" });
			const replied = await apiRequest(`/emails/${receivedId}/reply`, {
				method: "POST", headers: mailboxHeaders,
				body: JSON.stringify({ from: E2E_SENDER_ADDRESS, text: "Mailbox reply" }),
			});
			expect(replied.status, await replied.clone().text()).toBe(200);
			expect(await sentCount(4)).not.toBeNull();
			const appendedIds = psql(`select string_agg(distinct mm.structured_email_id, ',') from imap_mailbox_messages mm join imap_mailboxes mb on mb.id = mm.mailbox_id where mb.credential_id = '${id}' and mm.raw_source = 'appended';`, E2E_DATABASE).split(",");
			expect((await mutate(`/mailboxes/${id}`, "DELETE")).status).toBe(200);
			expect(psql(`select count(*) from imap_appended_messages where id in (${appendedIds.map((value) => `'${value}'`).join(",")});`, E2E_DATABASE)).toBe("0");
		},
		TEST_TIMEOUT_MS * 3,
	);

	it(
		"copies account-key sends only into read_write mailboxes whose sending identity matches From",
		async () => {
			const token = makeToken("sent-copy");
			const createMailbox = async (
				label: string,
				accessMode: "read" | "read_write",
				sendingAddress: string | null,
			) => {
				const created = await apiJson<{ data: { id: string } }>("/mailboxes", {
					method: "POST",
					body: JSON.stringify({
						name: `${label} ${token}`,
						loginAddress: `${label}-${token}@${E2E_DOMAIN}`,
						type: "mailbox",
						accessMode,
						sendingMode: sendingAddress ? "identity" : "scoped_domains",
						sendingName: null,
						sendingAddress,
						scopes: [{ type: "domain", domainId: E2E_DOMAIN_ID }],
					}),
				});
				expect(created.response.status).toBe(201);
				return created.data.data.id;
			};
			const matching = await createMailbox("match", "read_write", E2E_SENDER_ADDRESS);
			const loginOnly = await createMailbox("login", "read_write", null);
			const readOnly = await createMailbox("readonly", "read", E2E_SENDER_ADDRESS);
			const sentSubjects = async (mailboxId: string) => {
				const sent = await apiJson<{ data: Array<{ subject: string | null; source: string }> }>(
					`/mailboxes/${mailboxId}/folders/Sent/messages?search=${token}`,
				);
				expect(sent.response.status).toBe(200);
				return sent.data.data.map((message) => message.subject ?? "");
			};
			const waitForSubjects = (mailboxId: string, count: number) =>
				pollFor(`${count} account Sent copies`, POLL_CONFIG.inboundTimeoutMs, async () => {
					const subjects = await sentSubjects(mailboxId);
					return subjects.length >= count ? subjects : null;
				});
			const send = async (from: string, subject: string) => {
				const response = await apiRequest("/emails", {
					method: "POST",
					body: JSON.stringify({
						from,
						to: E2E_RECIPIENT_ADDRESS,
						subject,
						text: `Account copy body ${token}`,
					}),
				});
				expect(response.status, await response.clone().text()).toBe(200);
			};
			await send(`other-${token}@${E2E_DOMAIN}`, `Unmatched ${token}`);
			await send(`"E2E Sender" <${E2E_SENDER_ADDRESS.toUpperCase()}>`, `Identity ${token}`);
			await send(`login-${token}@${E2E_DOMAIN}`, `Login ${token}`);
			const receivedSubject = `Account reply source ${token}`;
			await postSyntheticInboundRecord({
				subject: receivedSubject,
				messageId: `account-reply-${token}@example.test`,
				recipient: E2E_RECIPIENT_ADDRESS,
				text: "Account reply source",
			});
			const received = await waitForExactSubjectEmailCount("received", receivedSubject, 1);
			expect(received).not.toBeNull();
			const replied = await apiRequest(`/emails/${received![0].id}/reply`, {
				method: "POST",
				body: JSON.stringify({ from: E2E_SENDER_ADDRESS, text: "Account reply" }),
			});
			expect(replied.status, await replied.clone().text()).toBe(200);
			const matchingSubjects = await waitForSubjects(matching, 2);
			expect(matchingSubjects).not.toBeNull();
			expect(matchingSubjects).toEqual(
				expect.arrayContaining([`Identity ${token}`, expect.stringContaining(receivedSubject)]),
			);
			const loginSubjects = await waitForSubjects(loginOnly, 1);
			expect(loginSubjects).toEqual([`Login ${token}`]);
			expect(await sentSubjects(matching)).toHaveLength(2);
			expect(await sentSubjects(loginOnly)).toHaveLength(1);
			expect(await sentSubjects(readOnly)).toHaveLength(0);
			const legacy = await apiJson<{ messages: Array<{ subject: string | null; folder: string; folderPath: string | null }> }>(
				`/mailboxes/${matching}/messages?folder=sent&search=${encodeURIComponent(`Identity ${token}`)}`,
			);
			expect(legacy.response.status).toBe(200);
			expect(legacy.data.messages).toHaveLength(1);
			expect(legacy.data.messages[0]).toMatchObject({ folder: "sent", folderPath: "Sent" });
			for (const mailboxId of [matching, loginOnly, readOnly])
				expect((await apiRequest(`/mailboxes/${mailboxId}`, { method: "DELETE" })).status).toBe(200);
		},
		TEST_TIMEOUT_MS,
	);

	it(
		"filters junk: spam filter settings, Guard junk rules, webhook spam field and mailbox Junk folder",
		async () => {
			type SpamFilter = { level: string; isDefault: boolean; updatedAt: string | null };
			const initial = await apiJson<SpamFilter>("/spam-filter");
			expect(initial.response.status).toBe(200);
			expect(initial.data).toMatchObject({ level: "standard", isDefault: true });
			const strict = await apiJson<SpamFilter>("/spam-filter", {
				method: "PUT",
				body: JSON.stringify({ level: "strict" }),
			});
			expect(strict.response.status).toBe(200);
			expect(strict.data).toMatchObject({ level: "strict", isDefault: false });
			expect((await apiJson<SpamFilter>("/spam-filter")).data.level).toBe("strict");
			const invalid = await apiRequest("/spam-filter", {
				method: "PUT",
				body: JSON.stringify({ level: "paranoid" }),
			});
			expect(invalid.status).toBe(400);
			const other = await apiJsonWithKey<SpamFilter>("/spam-filter", ALT_API_KEY);
			expect(other.data).toMatchObject({ level: "standard", isDefault: true });
			const reset = await apiJson<SpamFilter>("/spam-filter", {
				method: "PUT",
				body: JSON.stringify({ level: "standard" }),
			});
			expect(reset.data.level).toBe("standard");

			const token = makeToken("junk");
			const subject = `E2E Junk ${token}`;
			const badAction = await apiRequest("/guard", {
				method: "POST",
				body: JSON.stringify({
					name: `Bad action ${token}`,
					type: "explicit",
					config: { subject: { operator: "OR", values: [token] } },
					action: { action: "explode" },
				}),
			});
			expect(badAction.status).toBe(400);
			const legacy = await apiJson<{ data: { id: string; actions: string } }>("/guard", {
				method: "POST",
				body: JSON.stringify({
					name: `Legacy action ${token}`,
					type: "explicit",
					config: { subject: { operator: "OR", values: [`never-${token}`] } },
					action: '{"action":"flag","color":"red"}',
				}),
			});
			expect(legacy.response.status).toBe(201);
			expect(JSON.parse(legacy.data.data.actions)).toEqual({ action: "flag" });
			await apiRequest(`/guard/${legacy.data.data.id}`, { method: "DELETE" });
			const rule = await apiJson<{ success: true; data: { id: string; actions: string } }>(
				"/guard",
				{
					method: "POST",
					body: JSON.stringify({
						name: `Junk ${token}`,
						type: "explicit",
						priority: 1000,
						config: { subject: { operator: "OR", values: [token] } },
						action: { action: "junk" },
					}),
				},
			);
			expect(rule.response.status).toBe(201);
			expect(JSON.parse(rule.data.data.actions)).toEqual({ action: "junk" });

			try {
				await postSyntheticInboundRecord({
					subject,
					messageId: `${token}@example.test`,
					recipient: E2E_RECIPIENT_ADDRESS,
					text: `Junk test ${token}`,
				});
				const received = await waitForExactSubjectEmailCount("received", subject, 1);
				const emailId = received?.[0]?.id ?? "";
				expect(emailId).not.toBe("");

				const webhook = await pollFor(
					"webhook for the junk email",
					POLL_CONFIG.inboundTimeoutMs,
					async () =>
						receivedWebhooks.find(
							(item) => item.path === TEST_WEBHOOK_PATH && item.body.includes(emailId),
						) ?? null,
				);
				const payload = JSON.parse(webhook?.body ?? "{}") as {
					email?: { spam?: { isJunk: boolean; reason: string | null } };
				};
				expect(payload.email?.spam).toEqual({ isJunk: true, reason: "guard_rule" });

				const [isJunk, junkReason, guardAction, guardBlocked] = psql(
					`select is_junk, junk_reason, guard_action, guard_blocked from structured_emails where id = '${emailId}';`,
					E2E_DATABASE,
				).split("|");
				expect([isJunk, junkReason, guardAction, guardBlocked]).toEqual([
					"t",
					"guard_rule",
					"junk",
					"f",
				]);
				const detail = await apiJson<EmailDetailResponse & {
					spam?: { is_junk: boolean; reason: string | null };
				}>(`/emails/${emailId}`);
				expect(detail.data.spam).toEqual({ is_junk: true, reason: "guard_rule" });
				type JunkList = {
					data: Array<{ id: string; spam?: { is_junk: boolean } }>;
				};
				const junkList = await apiJson<JunkList>(
					`/emails${queryString({ type: "received", is_junk: "true", search: token, time_range: "1h" })}`,
				);
				expect(junkList.data.data.map((email) => email.id)).toEqual([emailId]);
				expect(junkList.data.data[0]?.spam?.is_junk).toBe(true);
				const cleanList = await apiJson<JunkList>(
					`/emails${queryString({ is_junk: "false", search: token, time_range: "1h" })}`,
				);
				expect(cleanList.data.data).toEqual([]);

				const mailbox = await apiJson<{ data: { id: string } }>("/mailboxes", {
					method: "POST",
					body: JSON.stringify({
						name: `Junk mailbox ${token}`,
						loginAddress: `junk-${token}@${E2E_DOMAIN}`,
						type: "mailbox",
						accessMode: "read_write",
						sendingMode: "identity",
						sendingName: null,
						sendingAddress: E2E_SENDER_ADDRESS,
						scopes: [{ type: "domain", domainId: E2E_DOMAIN_ID }],
					}),
				});
				expect(mailbox.response.status).toBe(201);
				type Summary = { id: string; folder: string; isJunk: boolean };
				const folderIds = async (folder: string) => {
					const list = await apiJson<{ messages: Summary[] }>(
						`/mailboxes/${mailbox.data.data.id}/messages${queryString({ folder, search: token })}`,
					);
					expect(list.response.status).toBe(200);
					return list.data.messages.map((message) => message.id);
				};
				expect(await folderIds("junk")).toEqual([emailId]);
				expect(await folderIds("inbox")).toEqual([]);

				const notJunk = await apiJson<Summary>(
					`/mailboxes/${mailbox.data.data.id}/messages/${emailId}`,
					{ method: "PATCH", body: JSON.stringify({ isJunk: false }) },
				);
				expect(notJunk.response.status).toBe(200);
				expect(notJunk.data).toMatchObject({ folder: "inbox", isJunk: false });
				expect(await folderIds("inbox")).toEqual([emailId]);
				expect(await folderIds("junk")).toEqual([]);

				const retried = await apiRequest(`/emails/${emailId}/retry`, {
					method: "POST",
					body: JSON.stringify({}),
				});
				await retried.arrayBuffer();
				expect(
					psql(
						`select is_junk, junk_reason from structured_emails where id = '${emailId}';`,
						E2E_DATABASE,
					),
				).toBe("t|guard_rule");

				const marked = await apiJson<{ is_junk: boolean }>(`/emails/${emailId}`, {
					method: "PATCH",
					body: JSON.stringify({ is_junk: true }),
				});
				expect(marked.response.status).toBe(200);
				expect(marked.data.is_junk).toBe(true);
				expect(await folderIds("junk")).toEqual([]);
				expect(await folderIds("inbox")).toEqual([emailId]);
			} finally {
				await apiRequest(`/guard/${rule.data.data.id}`, { method: "DELETE" });
			}
		},
		TEST_TIMEOUT_MS,
	);

	it(
		"applies ordered mailbox filters once and isolates spam policy and user marks",
		async () => {
			const token = makeToken("controls");
			const recipient = `${token}@${E2E_DOMAIN}`;
			const create = async (suffix: string) => {
				const result = await apiJson<{
					data: { id: string };
					password: string;
				}>("/mailboxes", {
					method: "POST",
					body: JSON.stringify({
						name: `${token}-${suffix}`,
						loginAddress: `${token}-${suffix}@${E2E_DOMAIN}`,
						type: "mailbox",
						accessMode: "read_write",
						sendingMode: "identity",
						sendingName: null,
						sendingAddress: recipient,
						scopes: [
							{ type: "address", domainId: E2E_DOMAIN_ID, address: recipient },
						],
					}),
				});
				expect(result.response.status).toBe(201);
				return result.data;
			};
			const first = await create("a");
			const second = await create("b");
			const base = `/mailboxes/${first.data.id}`;
			const mutate = (path: string, method: string, body?: object) =>
				apiRequest(path, {
					method,
					...(body ? { body: JSON.stringify(body) } : {}),
				});
			type Row = {
				uid: number;
				flags: string[];
				structuredEmailId: string;
				modseq: number;
			};
			const list = async (id: string, folder: string) => {
				const result = await apiJson<{ data: Row[] }>(
					`/mailboxes/${id}/folders/${folder}/messages?limit=100`,
				);
				expect(result.response.status).toBe(200);
				return result.data.data;
			};
			const self = (path: string, method = "GET", body?: object) =>
				apiRequestWithKey(`/mailboxes/me/${path}`, first.password, {
					method,
					...(body ? { body: JSON.stringify(body) } : {}),
				});
			expect((await self("filters")).status).toBe(403);
			expect((await self("spam")).status).toBe(403);
			expect(
				(
					await mutate(base, "PUT", {
						selfService: { filters: true, spam: true, password: false },
					})
				).status,
			).toBe(200);
			expect((await self("filters")).status).toBe(200);
			expect(
				(await self("spam", "PUT", { level: "off", allow: [], block: [] }))
					.status,
			).toBe(200);
			expect(
				(await apiRequestWithKey(`${base}/filters`, ALT_API_KEY)).status,
			).toBe(404);
			expect(
				(await mutate(`${base}/folders`, "POST", { path: "Processed" })).status,
			).toBe(201);
			const rule = async (
				name: string,
				conditions: object[],
				actions: object[],
				stopProcessing = false,
			) => {
				const result = await apiJson<{ id: string }>(
					`${base}/filters`,
					{
						method: "POST",
						body: JSON.stringify({
							name,
							match: "all",
							enabled: true,
							conditions,
							actions,
							stopProcessing,
						}),
					},
				);
				expect(result.response.status).toBe(201);
				return result.data.id;
			};
			const subject = (value: string) => ({
				field: "subject",
				operator: "contains",
				value,
			});
			const invoice = await rule(
				"invoice",
				[
					subject("invoice"),
					{ field: "from", operator: "domain_is", value: "EXAMPLE.TEST" },
					{ field: "to", operator: "contains", value: token.toUpperCase() },
					{ field: "cc", operator: "equals", value: "copy@example.test" },
					{ field: "recipient", operator: "domain_is", value: E2E_DOMAIN },
					{
						field: "header",
						header: "X-Category",
						operator: "equals",
						value: "BILLING",
					},
					{ field: "body", operator: "contains", value: "PAYMENT" },
					{ field: "has_attachment", operator: "equals", value: true },
					{ field: "size", operator: "greater_than", value: 10 },
					{ field: "junk", operator: "equals", value: false },
					{ field: "jev", label: "spam", operator: "gte", value: 2 },
				],
				[
					{ type: "move_to", value: "Processed" },
					{ type: "mark_read" },
					{ type: "flag" },
					{ type: "add_keyword", value: "Billing" },
				],
				true,
			);
			const fallback = await rule(
				"fallback",
				[subject("invoice")],
				[{ type: "move_to_trash" }],
			);
			expect(
				(
					await mutate(`${base}/filters/reorder`, "POST", {
						ids: [fallback, invoice],
					})
				).status,
			).toBe(200);
			expect(
				(
					await mutate(`${base}/filters/reorder`, "POST", {
						ids: [invoice, fallback],
					})
				).status,
			).toBe(200);
			const ordered = await apiJson<{ data: { id: string }[] }>(
				`${base}/filters`,
			);
			expect(ordered.data.data.map((item) => item.id)).toEqual([
				invoice,
				fallback,
			]);
			await rule("junk", [subject("junk-me")], [{ type: "mark_junk" }]);
			await rule("clean", [subject("clean-me")], [{ type: "mark_not_junk" }]);
			await rule("trash", [subject("trash-me")], [{ type: "move_to_trash" }]);
			await rule(
				"stop",
				[subject("stop-me")],
				[{ type: "flag" }, { type: "stop" }],
			);
			await rule(
				"after stop",
				[subject("stop-me")],
				[{ type: "move_to_trash" }],
			);
			const literal = (value: unknown) =>
				`'${String(value).replaceAll("'", "''")}'`;
			const seed = (name: string, junk = false, level = 2) => {
				const id = `${token}-${name}`;
				const raw = `From: sender@example.test\r\nTo: ${recipient}\r\nSubject: ${name}\r\n\r\nPayment enclosed`;
				psql(
					`insert into structured_emails
					(id,email_id,ses_event_id,user_id,recipient,envelope_recipients,subject,from_data,to_data,cc_data,headers,text_body,raw_content,attachments,is_junk,jev_classification)
					values (${literal(id)},${literal(id)},'local',${literal(PRIMARY_USER_ID)},${literal(recipient)},ARRAY[${literal(recipient)}],${literal(name)},
					${literal(JSON.stringify({ addresses: [{ address: "sender@example.test" }] }))},
					${literal(JSON.stringify({ addresses: [{ address: recipient }] }))},
					${literal(JSON.stringify({ addresses: [{ address: "copy@example.test" }] }))},
					'{"x-category":"billing"}','Payment enclosed',${literal(raw)},'[{"filename":"invoice.pdf"}]',${junk},
					${literal(JSON.stringify({ summary: { spam: { level, confidence: 0.9, base_level: level } } }))});`,
					E2E_DATABASE,
				);
				return id;
			};
			const invoiceId = seed("invoice");
			const junkId = seed("junk-me");
			const cleanId = seed("clean-me", true);
			const trashId = seed("trash-me");
			const stopId = seed("stop-me");
			const applyId = seed("apply-me");
			await list(first.data.id, "INBOX");
			const processed = await list(first.data.id, "Processed");
			expect(processed.map((row) => row.structuredEmailId)).toEqual([
				invoiceId,
			]);
			expect(processed[0].flags).toEqual(
				expect.arrayContaining(["\\Seen", "\\Flagged", "Billing"]),
			);
			expect(
				(await list(first.data.id, "Junk")).map((row) => row.structuredEmailId),
			).toContain(junkId);
			expect(
				(await list(first.data.id, "INBOX")).map(
					(row) => row.structuredEmailId,
				),
			).toContain(cleanId);
			expect(
				(await list(first.data.id, "Trash")).map(
					(row) => row.structuredEmailId,
				),
			).toEqual([trashId]);
			expect(
				(await list(first.data.id, "INBOX")).find(
					(row) => row.structuredEmailId === stopId,
				)?.flags,
			).toContain("\\Flagged");
			const peer = await list(second.data.id, "INBOX");
			expect(peer.map((row) => row.structuredEmailId)).toContain(invoiceId);
			expect(
				peer.find((row) => row.structuredEmailId === invoiceId)?.flags,
			).toEqual([]);
			expect(
				(await list(second.data.id, "Junk")).map(
					(row) => row.structuredEmailId,
				),
			).toContain(cleanId);
			expect(
				(
					await mutate(`${base}/messages/${invoiceId}`, "PATCH", {
						isJunk: true,
					})
				).status,
			).toBe(200);
			expect(
				(await list(second.data.id, "INBOX")).map(
					(row) => row.structuredEmailId,
				),
			).toContain(invoiceId);
			expect(
				psql(
					`select is_junk from structured_emails where id=${literal(invoiceId)}`,
					E2E_DATABASE,
				),
			).toBe("f");
			await rule(
				"existing",
				[subject("apply-me")],
				[{ type: "mark_read" }, { type: "add_keyword", value: "Applied" }],
			);
			expect(
				(
					await mutate(`${base}/filters/apply`, "POST", {
						folder: "INBOX",
						limit: 100,
					})
				).status,
			).toBe(200);
			const applied = (await list(first.data.id, "INBOX")).find(
				(row) => row.structuredEmailId === applyId,
			)!;
			expect(applied.flags).toEqual(
				expect.arrayContaining(["\\Seen", "Applied"]),
			);
			expect(
				(
					await mutate(`${base}/filters/apply`, "POST", {
						folder: "INBOX",
						limit: 100,
					})
				).status,
			).toBe(200);
			expect(
				(await list(first.data.id, "INBOX")).find(
					(row) => row.structuredEmailId === applyId,
				)?.modseq,
			).toBe(applied.modseq);
			const policyId = seed("policy", false, 4);
			expect(
				(
					await mutate(`${base}/spam`, "PUT", {
						level: "standard",
						allow: [],
						block: [],
					})
				).status,
			).toBe(200);
			expect(
				(await list(first.data.id, "Junk")).map((row) => row.structuredEmailId),
			).toContain(policyId);
			expect(
				(await list(second.data.id, "INBOX")).map(
					(row) => row.structuredEmailId,
				),
			).toContain(policyId);
			expect(
				(await self("spam/allow", "POST", { pattern: "@EXAMPLE.TEST" })).status,
			).toBe(200);
			expect(
				(await list(first.data.id, "INBOX")).map(
					(row) => row.structuredEmailId,
				),
			).toContain(policyId);
			expect(
				(await self("spam/allow", "DELETE", { pattern: "@example.test" }))
					.status,
			).toBe(200);
			expect(
				(
					await self("spam", "PUT", {
						level: "off",
						allow: [],
						block: ["sender@example.test"],
					})
				).status,
			).toBe(200);
			expect(
				(await list(first.data.id, "Junk")).map((row) => row.structuredEmailId),
			).toContain(policyId);
			expect(
				(await self("spam/block", "DELETE", { pattern: "sender@example.test" }))
					.status,
			).toBe(200);
			expect(
				(await list(first.data.id, "INBOX")).map(
					(row) => row.structuredEmailId,
				),
			).toContain(policyId);
			expect(
				(await mutate(`${base}/filters/${invoice}`, "DELETE")).status,
			).toBe(200);
			expect(
				(
					await mutate(`${base}/filters`, "POST", {
						name: "invalid",
						match: "all",
						conditions: [subject("x")],
						actions: [{ type: "move_to", value: "Scopes/secret" }],
					})
				).status,
			).toBe(400);
			await rule(
				"live IMAP",
				[subject("live-imap")],
				[
					{ type: "move_to", value: "Processed" },
					{ type: "mark_read" },
					{ type: "flag" },
					{ type: "add_keyword", value: "Live" },
				],
			);
			const liveId = seed("live-imap");
			const gatewaySource = `${import.meta.dir}/../../../packages/imap-gateway/src`;
			const { ApiAuth } = await import(`${gatewaySource}/auth.ts`);
			const { loadConfig } = await import(`${gatewaySource}/config.ts`);
			const { MailStore } = await import(`${gatewaySource}/db.ts`);
			const { buildHandlers } = await import(`${gatewaySource}/handlers.ts`);
			const { ConnectionLimits } = await import(`${gatewaySource}/limits.ts`);
			const { PgNotifier } = await import(`${gatewaySource}/notifier.ts`);
			const gatewayUrl = `postgres://imap_gateway:local-e2e-gateway@127.0.0.1:54329/${E2E_DATABASE}`;
			const store = new MailStore(gatewayUrl, {
				appendMaxBytesPerUser: 250 * 1024 * 1024,
				appendMaxMessagesPerUser: 5000,
			});
			const notifier = new PgNotifier(gatewayUrl, store);
			const previousDatabaseUrl = process.env.DATABASE_URL;
			process.env.DATABASE_URL = gatewayUrl;
			const gatewayConfig = loadConfig();
			if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
			else process.env.DATABASE_URL = previousDatabaseUrl;
			const auth = new ApiAuth({
				...gatewayConfig,
				databaseUrl: gatewayUrl,
				apiBaseUrl: API_URL,
				gatewayAuthSecret: E2E_GATEWAY_SECRET,
			});
			const handlers = buildHandlers(
				auth,
				store,
				new ConnectionLimits(10, 10, 60000),
			);
			const require = createRequire(import.meta.url);
			const {
				IMAPServer,
			} = require("../../../packages/imap-gateway/vendor/imap-core/index.js");
			const server = new IMAPServer({
				name: "localhost",
				secure: false,
				disableSTARTTLS: true,
				ignoreSTARTTLS: true,
			});
			Object.assign(server, handlers, { notifier });
			await notifier.start();
			await new Promise<void>((resolve) =>
				server.listen(0, "127.0.0.1", resolve),
			);
			const port = (server.server.address() as net.AddressInfo).port;
			let socket = net.connect(port, "127.0.0.1");
			let sequence = 0;
			const command = (value: string) =>
				new Promise<string>((resolve, reject) => {
					const tag = `T${++sequence}`;
					let output = "";
					const timer = setTimeout(() => {
						socket.off("data", receive);
						reject(new Error(`IMAP timeout: ${value}: ${output}`));
					}, 15000);
					const receive = (chunk: Buffer) => {
						output += chunk.toString();
						if (!new RegExp(`(?:^|\\r\\n)${tag} (?:OK|NO|BAD) `).test(output))
							return;
						clearTimeout(timer);
						socket.off("data", receive);
						if (!output.includes(`${tag} OK `)) reject(new Error(output));
						else resolve(output);
					};
					socket.on("data", receive);
					socket.write(`${tag} ${value}\r\n`);
				});
			try {
				await new Promise<void>((resolve, reject) => {
					socket.once("data", () => resolve());
					socket.once("error", reject);
				});
				await command(`LOGIN "${token}-a@${E2E_DOMAIN}" "${first.password}"`);
				await command('SELECT "INBOX"');
				await command('SELECT "Processed"');
				const rows = await list(first.data.id, "Processed");
				const live = rows.find((row) => row.structuredEmailId === liveId)!;
				expect(live).toBeDefined();
				const fetched = await command(`UID FETCH ${live.uid} (FLAGS)`);
				expect(fetched).toContain("\\Seen");
				expect(fetched).toContain("\\Flagged");
				expect(fetched).toContain("Live");
				await command(`UID MOVE ${live.uid} "Junk"`);
				expect(
					(await list(second.data.id, "INBOX")).map(
						(row) => row.structuredEmailId,
					),
				).toContain(liveId);
				expect(
					psql(
						`select is_junk from structured_emails where id=${literal(liveId)}`,
						E2E_DATABASE,
					),
				).toBe("f");
				const principal = await auth.authenticate(
					`${token}-a@${E2E_DOMAIN}`,
					first.password,
					"127.0.0.1",
				);
				expect(principal).not.toBeNull();
				await store.createMailbox(principal!, "RoleTest");
				await store.renameMailbox(principal!, "RoleTest", "RoleRenamed");
				await store.subscribeMailbox(principal!, "RoleRenamed", true);
				const folder = (await store.getMailboxByPath(
					principal!,
					"RoleRenamed",
				))!;
				const appended = await store.appendMessage(
					folder,
					principal!,
					"Subject: role\r\n\r\nbody",
					["\\Seen"],
					new Date(),
				);
				await store.updateFlags(principal!, folder.id, [appended.uid], "add", [
					"\\Deleted",
				]);
				expect(
					await store.expunge(principal!, folder.id, [appended.uid]),
				).toEqual([appended.uid]);
				await store.deleteMailbox(principal!, "RoleRenamed");
				for (const [change, restore] of [
					[{ protocols: { imap: false } }, { protocols: null }],
					[{ allowedIps: ["203.0.113.0/24"] }, { allowedIps: null }],
					[
						{ selfService: { filters: false } },
						{ selfService: { filters: true } },
					],
				]) {
					await new Promise<void>((resolve, reject) => {
						let output = "";
						const timer = setTimeout(() => {
							socket.off("data", receive);
							reject(new Error(`IMAP IDLE timeout: ${output}`));
						}, 5000);
						const receive = (chunk: Buffer) => {
							output += chunk.toString();
							if (!/(?:^|\r\n)\+/.test(output)) return;
							clearTimeout(timer);
							socket.off("data", receive);
							resolve();
						};
						socket.on("data", receive);
						socket.write(`T${++sequence} IDLE\r\n`);
					});
					const closed = new Promise<void>((resolve, reject) => {
						const timer = setTimeout(
							() =>
								reject(
									new Error(
										"IMAP session stayed open after access controls changed",
									),
								),
							5000,
						);
						socket.once("close", () => {
							clearTimeout(timer);
							resolve();
						});
					});
					const [updated] = await Promise.all([
						mutate(base, "PUT", change),
						closed,
					]);
					expect(updated.status).toBe(200);
					expect((await mutate(base, "PUT", restore)).status).toBe(200);
					socket = net.connect(port, "127.0.0.1");
					await new Promise<void>((resolve, reject) => {
						socket.once("data", () => resolve());
						socket.once("error", reject);
					});
					await command(`LOGIN "${token}-a@${E2E_DOMAIN}" "${first.password}"`);
					await command('SELECT "Processed"');
				}
				await command("LOGOUT");
			} finally {
				socket.destroy();
				await new Promise<void>((resolve) => server.close(resolve));
				await notifier.stop();
				await store.end();
			}
			expect((await mutate(base, "DELETE")).status).toBe(200);
			expect(
				(await mutate(`/mailboxes/${second.data.id}`, "DELETE")).status,
			).toBe(200);
		},
		TEST_TIMEOUT_MS,
	);

	it(
		"matches SQL per-mailbox classifier thresholds to the TypeScript verdict",
		() => {
			const cases: Array<{
				level: string;
				classification: object;
				expected: boolean;
			}> = [];
			const dimensions: DimensionSummary[] = [];
			for (let level = 0; level <= 4; level++) {
				for (const confidence of [0.59, 0.6, 0.9]) {
					dimensions.push({ level, confidence });
					for (const base_level of [0, 2, 4])
						dimensions.push({ level, confidence, base_level });
				}
				for (const mass of [0.49, 0.5, 0.69, 0.7, 1]) {
					dimensions.push({
						level,
						confidence: 0.2,
						base_level: 0,
						p_ge2: mass,
						p_ge3: mass,
						p_eq4: mass,
					});
				}
			}
			for (const dimension of dimensions) {
				for (const label of [
					"spam",
					"phishing",
					"fraud",
					"impersonation",
					"malware",
					"prompt_injection",
				] as const) {
					const clear = { level: 0, confidence: 1, base_level: 0 };
					const summary: ClassificationSummary = {
						spam: clear,
						phishing: clear,
						fraud: clear,
						impersonation: clear,
						malware: clear,
						prompt_injection: clear,
						risk: 0,
						[label]: dimension,
					};
					for (const level of SPAM_FILTER_LEVELS) {
						cases.push({
							level,
							classification: {
								summary,
								facts: { ses_spam: "PASS", ses_virus: "PASS" },
							},
							expected: classifierJunkVerdict(level, summary, "PASS", "PASS")!
								.isJunk,
						});
					}
				}
			}
			for (const level of SPAM_FILTER_LEVELS) {
				cases.push({
					level,
					classification: { facts: { ses_spam: "FAIL", ses_virus: "PASS" } },
					expected: classifierJunkVerdict(level, null, "FAIL", "PASS")!.isJunk,
				});
				cases.push({
					level,
					classification: { facts: { ses_spam: "PASS", ses_virus: "FAIL" } },
					expected: classifierJunkVerdict(level, null, "PASS", "FAIL")!.isJunk,
				});
			}
			const answers: Array<Record<string, JevAnswer>> = [
				{
					spam: {
						score: 4,
						confidence: 0.1,
						probabilities: { "3": 0.5, "4": 0.5 },
					},
				},
				{
					phishing: {
						score: 3,
						confidence: 0.4,
						probabilities: { "0": 0.1, "3": 0.4, "4": 0.5 },
					},
				},
				{ phishing: { score: 2, confidence: 0.8, probabilities: {} } },
				{ fraud: { score: 2, confidence: 0.8, probabilities: {} } },
				{ impersonation: { noul: 0.2 } },
				{ malware: { noul: 0.9 } },
				{ spam: { score: 0, confidence: 1, probabilities: {} } },
			];
			for (const answer of answers) {
				for (const factChanges of [
					{},
					{ ses_spam: "FAIL" },
					{ ses_virus: "FAIL" },
					{ dmarc: "FAIL", reply_to_differs_from_sender: true },
					{
						spf: "FAIL",
						dkim: "FAIL",
						display_name_contains_other_address: true,
					},
					{ reply_to_differs_from_sender: true },
				]) {
					const stored = buildStoredClassification("local-parity", answer, {
						spf: "PASS",
						dkim: "PASS",
						dmarc: "PASS",
						ses_spam: "PASS",
						ses_virus: "PASS",
						sender_domain: "example.test",
						link_domains: [],
						reply_to_differs_from_sender: false,
						display_name_contains_other_address: false,
						...factChanges,
					})!;
					const noBase = structuredClone(stored);
					const noMass = structuredClone(stored);
					for (const label of [
						"spam",
						"phishing",
						"fraud",
						"impersonation",
						"malware",
						"prompt_injection",
					] as const) {
						delete noBase.summary[label].base_level;
						delete noMass.summary[label].p_ge2;
						delete noMass.summary[label].p_ge3;
						delete noMass.summary[label].p_eq4;
					}
					for (const classification of [
						stored,
						noBase,
						noMass,
						{ ...noBase, answers: {} },
					]) {
						const current = withCurrentSummary(classification);
						for (const level of SPAM_FILTER_LEVELS) {
							cases.push({
								level,
								classification,
								expected: classifierJunkVerdict(
									level,
									current.summary,
									current.facts.ses_spam,
									current.facts.ses_virus,
								)!.isJunk,
							});
						}
					}
				}
			}
			const encoded = JSON.stringify(cases).replaceAll("'", "''");
			expect(
				psql(
					`select count(*) from jsonb_to_recordset('${encoded}'::jsonb) as cases(level text, classification jsonb, expected boolean)
				where imap_mailbox_junk(false, 'classifier', null::text, classification::text, level, null::text[], null::text[], null::boolean) is distinct from expected`,
					E2E_DATABASE,
				),
			).toBe("0");
			const malformed = JSON.stringify(
				[
					{ score: "invalid", confidence: 1, probabilities: {} },
					{ score: 3, confidence: 1, probabilities: [] },
					{ score: 3, confidence: 1, probabilities: { "3": "invalid" } },
					{ noul: "invalid" },
				].map((spam) => ({
					answers: { spam },
					summary: { spam: { level: 2, confidence: 0.5 } },
				})),
			).replaceAll("'", "''");
			expect(
				psql(
					`select count(*) from jsonb_array_elements('${malformed}'::jsonb) classification
				where imap_filter_email(null::text, null::text, null::text, '{}'::text[], null::text,
				  null::text, null::text, null::text, 0::integer, classification::text) -> 'jev'
				  is distinct from classification -> 'summary'`,
					E2E_DATABASE,
				),
			).toBe("0");
		},
		TEST_TIMEOUT_MS,
	);

	it(
		"enforces mailbox protocols, trusted IPs, append/send quotas and password self-service",
		async () => {
			const token = makeToken("limits");
			const loginAddress = `${token}@${E2E_DOMAIN}`;
			const created = await apiJson<{
				data: { id: string; protocols: object; storageQuotaBytes: number };
				password: string;
			}>("/mailboxes", {
				method: "POST",
				body: JSON.stringify({
					name: token,
					loginAddress,
					type: "mailbox",
					accessMode: "read_write",
					sendingMode: "identity",
					sendingName: null,
					sendingAddress: E2E_SENDER_ADDRESS,
					scopes: [{ type: "domain", domainId: E2E_DOMAIN_ID }],
					protocols: { imap: false, smtp: false, api: true },
					storageQuotaBytes: 1,
					dailySendLimit: 1,
				}),
			});
			expect(created.response.status).toBe(201);
			expect(created.data.data.storageQuotaBytes).toBe(1);
			const { password } = created.data;
			const base = `/mailboxes/${created.data.data.id}`;
			const patch = (body: object) =>
				apiRequest(base, { method: "PUT", body: JSON.stringify(body) });
			const self = (
				path: string,
				method = "GET",
				body?: object,
				key = password,
			) =>
				apiRequestWithKey(`/mailboxes/me/${path}`, key, {
					method,
					...(body ? { body: JSON.stringify(body) } : {}),
				});
			const gateway = (protocol: "imap" | "smtp", ip = "203.0.113.42") =>
				fetch(
					`${API_URL}/mailboxes/${protocol === "imap" ? "authenticate" : "authenticate-smtp"}`,
					{
						method: "POST",
						headers: {
							"Content-Type": "application/json",
							"x-inbound-gateway-secret": E2E_GATEWAY_SECRET,
							"x-inbound-client-ip": ip,
						},
						body: JSON.stringify({ loginAddress, password }),
					},
				);
			expect((await gateway("imap")).status).toBe(401);
			expect((await gateway("smtp")).status).toBe(401);
			expect((await self("folders")).status).toBe(200);
			expect(
				(await patch({ protocols: { imap: true, smtp: true, api: false } }))
					.status,
			).toBe(200);
			expect((await gateway("imap")).status).toBe(200);
			expect((await gateway("smtp")).status).toBe(200);
			expect((await self("folders")).status).toBe(401);
			const protocolRefusals = await Promise.all(
				Array.from({ length: 65 }, async () => {
					const response = await fetch(`${API_URL}/mailboxes/me/folders`, {
						headers: { Authorization: `Bearer ${password}` },
					});
					await response.arrayBuffer();
					return response.status;
				}),
			);
			expect(protocolRefusals.every((status) => status === 401)).toBe(true);
			expect((await patch({ protocols: { api: true } })).status).toBe(200);
			expect((await self("folders")).status).toBe(200);
			expect(
				(
					await patch({
						protocols: null,
						allowedIps: ["203.0.113.0/24", "2001:db8::/32"],
					})
				).status,
			).toBe(200);
			expect((await gateway("imap")).status).toBe(200);
			expect((await gateway("smtp", "2001:db8::1234")).status).toBe(200);
			expect((await gateway("imap", "198.51.100.1")).status).toBe(401);
			const ipRefusals = await Promise.all(
				Array.from({ length: 65 }, async () => {
					const response = await fetch(`${API_URL}/mailboxes/me/folders`, {
						headers: { Authorization: `Bearer ${password}` },
					});
					await response.arrayBuffer();
					return response.status;
				}),
			);
			expect(ipRefusals.every((status) => status === 401)).toBe(true);
			const allowedSource = await apiRequestWithKey("/emails", password, {
				method: "POST",
				headers: {
					"x-inbound-gateway-secret": E2E_GATEWAY_SECRET,
					"x-inbound-client-ip": "203.0.113.42",
				},
				body: JSON.stringify({
					from: E2E_SENDER_ADDRESS,
					to: E2E_RECIPIENT_ADDRESS,
					subject: token,
					text: "policy limiter",
					scheduled_at: new Date(Date.now() + 60_000).toISOString(),
				}),
			});
			expect(allowedSource.status).toBe(400);
			expect(await allowedSource.text()).toContain("daily sending limit");
			expect(
				(
					await apiRequestWithKey("/mailboxes/me/folders", password, {
						headers: {
							"x-forwarded-for": "203.0.113.42",
							"x-inbound-client-ip": "203.0.113.42",
						},
					})
				).status,
			).toBe(401);
			expect((await patch({ allowedIps: ["not-an-ip/24"] })).status).toBe(400);
			expect((await patch({ allowedIps: null })).status).toBe(200);
			const raw = `From: ${loginAddress}\r\nTo: ${E2E_RECIPIENT_ADDRESS}\r\nSubject: quota\r\n\r\nquota body`;
			const append = { raw: Buffer.from(raw).toString("base64") };
			expect(
				(await self("folders/Drafts/messages", "POST", append)).status,
			).toBe(413);
			expect(
				(await patch({ storageQuotaBytes: Buffer.byteLength(raw) })).status,
			).toBe(200);
			expect(
				(await self("folders/Drafts/messages", "POST", append)).status,
			).toBe(201);
			expect(
				(await self("folders/Drafts/messages", "POST", append)).status,
			).toBe(413);
			expect((await patch({ storageQuotaBytes: null })).status).toBe(200);
			expect((await self("rotate-password", "POST", {})).status).toBe(403);
			expect(
				(
					await self("", "PATCH", {
						selfService: { password: true, filters: true, spam: true },
					})
				).status,
			).not.toBe(200);
			const sendBody = {
				from: E2E_SENDER_ADDRESS,
				to: E2E_RECIPIENT_ADDRESS,
				subject: `Quota ${token}`,
				text: "quota",
			};
			const send = (idempotencyKey: string, extra: HeadersInit = {}) =>
				apiRequestWithKey("/emails", password, {
					method: "POST",
					headers: { "Idempotency-Key": idempotencyKey, ...extra },
					body: JSON.stringify(sendBody),
				});
			expect((await apiRequestWithKey("/emails", password, {
				method: "POST",
				body: JSON.stringify({ ...sendBody, scheduled_at: new Date(Date.now() + 60_000).toISOString() }),
			})).status).toBe(400);
			const replySubject = `Quota reply ${token}`;
			await postSyntheticInboundRecord({
				subject: replySubject,
				messageId: `${token}-reply@example.test`,
				recipient: E2E_RECIPIENT_ADDRESS,
				text: "Reply reservation release",
			});
			const replySource = await waitForExactSubjectEmailCount("received", replySubject, 1);
			expect(replySource).not.toBeNull();
			const tenantId = psql(`select tenant_id from email_domains where id = '${E2E_DOMAIN_ID}';`, E2E_DATABASE);
			try {
				psql(`update email_domains set tenant_id = null where id = '${E2E_DOMAIN_ID}';`, E2E_DATABASE);
				const failedReply = await apiRequestWithKey(`/emails/${replySource![0].id}/reply`, password, {
					method: "POST",
					body: JSON.stringify({ from: E2E_SENDER_ADDRESS, text: "No identity ARN" }),
				});
				expect(failedReply.status).toBe(500);
				expect(await failedReply.text()).toContain("Failed to get identity ARN");
				expect(psql(`select count from mailbox_send_usage where credential_id = '${created.data.data.id}';`, E2E_DATABASE)).toBe("0");
			} finally {
				psql(`update email_domains set tenant_id = '${tenantId}' where id = '${E2E_DOMAIN_ID}';`, E2E_DATABASE);
			}
			const sendKeys = [`${token}-first`, `${token}-second`];
			const sent = await Promise.all(sendKeys.map((key) => send(key)));
			expect(sent.map((response) => response.status).sort()).toEqual([200, 429]);
			const acceptedKey = sendKeys[sent.findIndex((response) => response.status === 200)];
			expect((await send(acceptedKey)).status).toBe(200);
			expect(psql(`select count from mailbox_send_usage where credential_id = '${created.data.data.id}';`, E2E_DATABASE)).toBe("1");
			expect(
				(
					await patch({
						dailySendLimit: 2,
						protocols: { imap: true, smtp: true, api: false },
					})
				).status,
			).toBe(200);
			expect((await send(`${token}-api-disabled`)).status).toBe(401);
			expect(
				(
					await send(`${token}-smtp`, {
						"x-inbound-gateway-secret": E2E_GATEWAY_SECRET,
						"x-inbound-client-ip": "203.0.113.42",
					})
				).status,
			).toBe(200);
			expect(
				(
					await send(`${token}-smtp-full`, {
						"x-inbound-gateway-secret": E2E_GATEWAY_SECRET,
						"x-inbound-client-ip": "203.0.113.42",
					})
				).status,
			).toBe(429);
			expect(
				(
					await patch({
						protocols: null,
						selfService: { filters: false, spam: false, password: true },
					})
				).status,
			).toBe(200);
			const rotated = await self("rotate-password", "POST", {});
			expect(rotated.status).toBe(200);
			const replacement = (await rotated.json()) as { password: string };
			expect((await self("folders")).status).toBe(401);
			expect(
				(await self("folders", "GET", undefined, replacement.password)).status,
			).toBe(200);
			expect((await apiRequest(base, { method: "DELETE" })).status).toBe(200);
		},
		TEST_TIMEOUT_MS,
	);

	it(
		"records mailbox activity for sign-ins, gateway sessions and sends, and serves it over the API",
		async () => {
			type Activity = {
				id: string;
				mailboxId: string;
				occurredAt: string;
				protocol: string;
				event: string;
				reason: string | null;
				clientIp: string | null;
				client: string | null;
				count: number;
				detail: Record<string, string | number | boolean> | null;
			};
			type ActivityList = {
				data: Activity[];
				pagination: {
					limit: number;
					offset: number;
					total: number;
					hasMore: boolean;
				};
			};
			const token = makeToken("activity");
			const loginAddress = `${token}@${E2E_DOMAIN}`;
			const created = await apiJson<{
				data: { id: string; selfService: Record<string, boolean> };
				password: string;
			}>("/mailboxes", {
				method: "POST",
				body: JSON.stringify({
					name: token,
					loginAddress,
					type: "mailbox",
					accessMode: "read_write",
					sendingMode: "identity",
					sendingName: null,
					sendingAddress: E2E_SENDER_ADDRESS,
					scopes: [{ type: "domain", domainId: E2E_DOMAIN_ID }],
				}),
			});
			expect(created.response.status).toBe(201);
			expect(created.data.data.selfService.activity).toBe(false);
			const mailboxId = created.data.data.id;
			const { password } = created.data;
			const base = `/mailboxes/${mailboxId}`;
			const patch = (body: object) =>
				apiRequest(base, { method: "PUT", body: JSON.stringify(body) });
			const gateway = (
				protocol: "imap" | "smtp",
				ip: string,
				options: {
					password?: string;
					login?: string;
					headers?: Record<string, string>;
				} = {},
			) =>
				fetch(
					`${API_URL}/mailboxes/${protocol === "imap" ? "authenticate" : "authenticate-smtp"}`,
					{
						method: "POST",
						headers: {
							"Content-Type": "application/json",
							"x-inbound-gateway-secret": E2E_GATEWAY_SECRET,
							"x-inbound-client-ip": ip,
							...options.headers,
						},
						body: JSON.stringify({
							loginAddress: options.login ?? loginAddress,
							password: options.password ?? password,
						}),
					},
				);
			const activity = async (query: Record<string, string | number> = {}) => {
				const { response, data } = await apiJson<ActivityList>(
					`${base}/activity${queryString({ limit: 100, ...query })}`,
				);
				expect(response.status).toBe(200);
				return data;
			};
			const find = async (
				predicate: (row: Activity) => boolean,
				ready: (rows: Activity[]) => boolean = (rows) => rows.length > 0,
			) => {
				const deadline = Date.now() + 10_000;
				let rows = (await activity()).data.filter(predicate);
				while (!ready(rows) && Date.now() < deadline) {
					await sleep(200);
					rows = (await activity()).data.filter(predicate);
				}
				return rows;
			};

			expect(
				(
					await gateway("imap", "203.0.113.10", {
						headers: { "x-inbound-client-name": "TestMail/1.0" },
					})
				).status,
			).toBe(200);
			expect((await gateway("imap", "203.0.113.10")).status).toBe(200);
			expect(
				(
					await gateway("imap", "203.0.113.10", {
						headers: { "x-inbound-auth-purpose": "revalidate" },
					})
				).status,
			).toBe(200);
			expect(
				(await gateway("imap", "203.0.113.11", { password: "mail_wrong" }))
					.status,
			).toBe(401);
			expect(
				(
					await gateway("imap", "203.0.113.12", {
						login: `nobody-${token}@${E2E_DOMAIN}`,
						password: "mail_wrong",
					})
				).status,
			).toBe(401);
			const failed = await find((row) => row.event === "login_failed");
			expect(failed).toHaveLength(1);
			expect(failed[0]).toMatchObject({
				protocol: "imap",
				clientIp: "203.0.113.11",
				reason: "invalid_password",
			});
			const succeeded = await find(
				(row) => row.event === "login_succeeded",
				(rows) => rows.length > 0 && rows[0].count >= 2,
			);
			expect(succeeded).toHaveLength(1);
			expect(succeeded[0]).toMatchObject({
				protocol: "imap",
				clientIp: "203.0.113.10",
				client: "TestMail/1.0",
				count: 2,
				mailboxId,
			});

			expect((await patch({ allowedIps: ["203.0.113.0/24"] })).status).toBe(
				200,
			);
			expect((await gateway("imap", "198.51.100.7")).status).toBe(401);
			expect(
				(await patch({ allowedIps: null, protocols: { smtp: false } })).status,
			).toBe(200);
			expect((await gateway("smtp", "203.0.113.13")).status).toBe(401);
			expect((await patch({ protocols: null, enabled: false })).status).toBe(
				200,
			);
			expect((await gateway("imap", "203.0.113.14")).status).toBe(401);
			expect((await patch({ enabled: true })).status).toBe(200);
			const refusals = await find(
				(row) => row.event === "login_refused",
				(rows) => rows.length >= 3,
			);
			expect(
				refusals
					.map((row) => `${row.protocol}:${row.reason}:${row.clientIp}`)
					.sort(),
			).toEqual([
				"imap:disabled:203.0.113.14",
				"imap:ip_not_allowed:198.51.100.7",
				"smtp:protocol_disabled:203.0.113.13",
			]);
			expect(
				(await activity()).data.filter((row) => row.clientIp === "203.0.113.12"),
			).toHaveLength(0);

			const limited = await Promise.all(
				Array.from({ length: 65 }, async () => {
					const response = await gateway("imap", "203.0.113.15", {
						password: "mail_wrong",
					});
					await response.arrayBuffer();
					return response.status;
				}),
			);
			expect(limited).toContain(429);
			const rateLimited = await find(
				(row) => row.event === "login_refused" && row.reason === "rate_limited",
			);
			expect(rateLimited).toHaveLength(1);
			expect(rateLimited[0].clientIp).toBe("203.0.113.15");
			expect(rateLimited[0].count).toBeGreaterThanOrEqual(1);
			const hammered = await find(
				(row) => row.event === "login_failed" && row.clientIp === "203.0.113.15",
				(rows) => rows.length > 0 && rows[0].count > 1,
			);
			expect(hammered).toHaveLength(1);
			expect(hammered[0].count).toBeGreaterThan(1);

			for (let attempt = 0; attempt < 2; attempt++) {
				expect(
					(
						await apiRequestWithKey("/mailboxes/me/folders", password, {
							headers: { "User-Agent": "ActivityProbe/3.1 (e2e)" },
						})
					).status,
				).toBe(200);
			}
			const apiLogins = await find(
				(row) => row.event === "login_succeeded" && row.protocol === "api",
			);
			expect(apiLogins).toHaveLength(1);
			expect(apiLogins[0]).toMatchObject({
				client: "ActivityProbe/3.1",
				clientIp: null,
				count: 1,
			});

			const ingest = (body: object, headers: Record<string, string> = {}) =>
				fetch(`${API_URL}/mailboxes/activity/ingest`, {
					method: "POST",
					headers: { "Content-Type": "application/json", ...headers },
					body: JSON.stringify(body),
				});
			const gatewayEvent = {
				credentialId: mailboxId,
				userId: PRIMARY_USER_ID,
				protocol: "imap",
				event: "command_error",
				reason: "57014",
				clientIp: "203.0.113.16",
				session: "ingest-session",
				detail: { code: "TEMPFAIL", password, subject: "secret subject" },
			};
			expect((await ingest({ events: [gatewayEvent] })).status).toBe(403);
			expect(
				(
					await ingest(
						{ events: [gatewayEvent] },
						{ "x-inbound-gateway-secret": "wrong" },
					)
				).status,
			).toBe(403);
			const ingested = await ingest(
				{
					events: [
						gatewayEvent,
						gatewayEvent,
						{ ...gatewayEvent, userId: "someone-else" },
						{ ...gatewayEvent, credentialId: `missing-${token}` },
					],
				},
				{ "x-inbound-gateway-secret": E2E_GATEWAY_SECRET },
			);
			expect(ingested.status).toBe(200);
			expect(await ingested.json()).toEqual({ accepted: 2, rejected: 2 });
			const commandErrors = await find(
				(row) => row.event === "command_error",
				(rows) => rows.length > 0 && rows[0].count >= 2,
			);
			expect(commandErrors).toHaveLength(1);
			expect(commandErrors[0]).toMatchObject({
				count: 2,
				reason: "57014",
				clientIp: "203.0.113.16",
				detail: { code: "TEMPFAIL", session: "ingest-session" },
			});
			expect(
				(
					await ingest(
						{ events: [{ ...gatewayEvent, event: "login_succeeded" }] },
						{ "x-inbound-gateway-secret": E2E_GATEWAY_SECRET },
					)
				).status,
			).toBe(400);

			const gatewaySource = `${import.meta.dir}/../../../packages/imap-gateway/src`;
			const { ActivityReporter } = await import(`${gatewaySource}/activity.ts`);
			const { ApiAuth } = await import(`${gatewaySource}/auth.ts`);
			const { loadConfig } = await import(`${gatewaySource}/config.ts`);
			const { MailStore } = await import(`${gatewaySource}/db.ts`);
			const { buildHandlers } = await import(`${gatewaySource}/handlers.ts`);
			const { ConnectionLimits } = await import(`${gatewaySource}/limits.ts`);
			const { PgNotifier } = await import(`${gatewaySource}/notifier.ts`);
			const gatewayUrl = `postgres://imap_gateway:local-e2e-gateway@127.0.0.1:54329/${E2E_DATABASE}`;
			const store = new MailStore(gatewayUrl, {
				appendMaxBytesPerUser: 250 * 1024 * 1024,
				appendMaxMessagesPerUser: 5000,
			});
			const notifier = new PgNotifier(gatewayUrl, store);
			const previousDatabaseUrl = process.env.DATABASE_URL;
			process.env.DATABASE_URL = gatewayUrl;
			const gatewayConfig = loadConfig();
			if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
			else process.env.DATABASE_URL = previousDatabaseUrl;
			const reporter = new ActivityReporter({
				apiBaseUrl: API_URL,
				gatewayAuthSecret: E2E_GATEWAY_SECRET,
				timeoutMs: 10000,
			});
			const handlers = buildHandlers(
				new ApiAuth({
					...gatewayConfig,
					databaseUrl: gatewayUrl,
					apiBaseUrl: API_URL,
					gatewayAuthSecret: E2E_GATEWAY_SECRET,
				}),
				store,
				new ConnectionLimits(10, 10, 60000),
				{ activity: reporter },
			);
			const require = createRequire(import.meta.url);
			const {
				IMAPServer,
			} = require("../../../packages/imap-gateway/vendor/imap-core/index.js");
			const server = new IMAPServer({
				name: "localhost",
				secure: false,
				disableSTARTTLS: true,
				ignoreSTARTTLS: true,
			});
			Object.assign(server, handlers, { notifier });
			await notifier.start();
			await new Promise<void>((resolve) =>
				server.listen(0, "127.0.0.1", resolve),
			);
			const port = (server.server.address() as net.AddressInfo).port;
			const socket = net.connect(port, "127.0.0.1");
			let sequence = 0;
			const command = (value: string) =>
				new Promise<string>((resolve, reject) => {
					const tag = `A${++sequence}`;
					let output = "";
					const timer = setTimeout(() => {
						socket.off("data", receive);
						reject(new Error(`IMAP timeout: ${value}: ${output}`));
					}, 15000);
					const receive = (chunk: Buffer) => {
						output += chunk.toString();
						if (!new RegExp(`(?:^|\\r\\n)${tag} (?:OK|NO|BAD) `).test(output))
							return;
						clearTimeout(timer);
						socket.off("data", receive);
						if (!output.includes(`${tag} OK `)) reject(new Error(output));
						else resolve(output);
					};
					socket.on("data", receive);
					socket.write(`${tag} ${value}\r\n`);
				});
			try {
				await new Promise<void>((resolve, reject) => {
					socket.once("data", () => resolve());
					socket.once("error", reject);
				});
				await command('ID ("name" "LiveMail" "version" "2.0")');
				await command(`LOGIN "${loginAddress}" "${password}"`);
				await command("NOOP");
				const closed = new Promise<void>((resolve) =>
					socket.once("close", () => resolve()),
				);
				await command("LOGOUT");
				await closed;
				const ended = await pollFor("session_ended activity", 15000, async () => {
					await reporter.flush();
					const rows = await find((row) => row.event === "session_ended");
					return rows.length > 0 ? rows : null;
				});
				expect(ended).toHaveLength(1);
				expect(ended![0]).toMatchObject({
					protocol: "imap",
					reason: "client_logout",
					clientIp: "127.0.0.1",
					client: "LiveMail/2.0",
				});
				expect(Number(ended![0].detail?.commands)).toBeGreaterThanOrEqual(3);
				expect(typeof ended![0].detail?.durationMs).toBe("number");
				const liveLogin = await find(
					(row) =>
						row.event === "login_succeeded" && row.clientIp === "127.0.0.1",
				);
				expect(liveLogin[0]?.client).toBe("LiveMail/2.0");
			} finally {
				socket.destroy();
				await new Promise<void>((resolve) => server.close(resolve));
				await reporter.stop();
				await notifier.stop();
				await store.end();
			}

			const sendAs = (from: string, extra: object = {}) =>
				apiRequestWithKey("/emails", password, {
					method: "POST",
					headers: { "Idempotency-Key": `${token}-${from}-${sequence++}` },
					body: JSON.stringify({
						from,
						to: E2E_RECIPIENT_ADDRESS,
						subject: `Activity ${token}`,
						text: "activity",
						...extra,
					}),
				});
			expect((await sendAs(`intruder@${E2E_DOMAIN}`)).status).toBe(403);
			expect((await patch({ dailySendLimit: 0 })).status).toBe(200);
			expect((await sendAs(E2E_SENDER_ADDRESS)).status).toBe(429);
			const sendRows = await pollFor("send activity", 15000, async () => {
				const rows = await find(
					(row) =>
						row.event === "send_failed" || row.event === "send_rate_limited",
				);
				return rows.length >= 2 ? rows : null;
			});
			expect(sendRows).not.toBeNull();
			expect(
				sendRows!.find((row) => row.event === "send_failed"),
			).toMatchObject({
				protocol: "api",
				reason: "not_allowed",
				detail: { status: 403 },
			});
			expect(
				sendRows!.find((row) => row.event === "send_rate_limited"),
			).toMatchObject({ reason: "daily_limit", detail: { status: 429, limit: 0 } });
			expect((await patch({ dailySendLimit: null })).status).toBe(200);

			const all = await activity();
			const serialized = JSON.stringify(all);
			expect(serialized).not.toContain(password);
			expect(serialized).not.toContain("secret subject");
			expect(serialized).not.toContain(`intruder@${E2E_DOMAIN}`);
			expect(serialized).not.toContain(E2E_RECIPIENT_ADDRESS);
			const times = all.data.map((row) => Date.parse(row.occurredAt));
			expect(times).toEqual([...times].sort((a, b) => b - a));

			expect(
				(await activity({ event: "login_refused", protocol: "smtp" })).data.map(
					(row) => row.reason,
				),
			).toEqual(["protocol_disabled"]);
			expect(
				(await activity({ ip: "198.51.100.7" })).data.map((row) => row.reason),
			).toEqual(["ip_not_allowed"]);
			expect(
				(await activity({ since: new Date(Date.now() + 60_000).toISOString() }))
					.pagination.total,
			).toBe(0);
			expect(
				(await activity({ until: "2020-01-01T00:00:00Z" })).pagination.total,
			).toBe(0);
			const page = await activity({ limit: 2, offset: 1 });
			expect(page.data).toHaveLength(2);
			expect(page.data[0].id).toBe(all.data[1].id);
			expect(page.pagination).toMatchObject({
				limit: 2,
				offset: 1,
				total: all.pagination.total,
				hasMore: true,
			});
			expect(
				(await apiRequest(`${base}/activity?since=yesterday-ish`)).status,
			).toBe(400);
			expect((await apiRequest(`${base}/activity?ip=not-an-ip`)).status).toBe(
				400,
			);
			const accountWide = await apiJson<ActivityList>(
				`/mailboxes/activity${queryString({ mailboxId, event: "login_failed", limit: 100 })}`,
			);
			expect(accountWide.response.status).toBe(200);
			expect(accountWide.data.data.every((row) => row.mailboxId === mailboxId)).toBe(true);
			expect(accountWide.data.data.map((row) => row.clientIp).sort()).toEqual([
				"203.0.113.11",
				"203.0.113.15",
			]);
			expect(
				(await apiRequestWithKey(`${base}/activity`, ALT_API_KEY)).status,
			).toBe(404);
			expect(
				(
					await apiRequestWithKey(
						`/mailboxes/activity?mailboxId=${mailboxId}`,
						ALT_API_KEY,
					)
				).status,
			).toBe(404);
			const altAll = await apiJsonWithKey<ActivityList>(
				"/mailboxes/activity",
				ALT_API_KEY,
			);
			expect(altAll.data.data.some((row) => row.mailboxId === mailboxId)).toBe(
				false,
			);

			expect(
				(await apiRequestWithKey("/mailboxes/me/activity", password)).status,
			).toBe(403);
			expect(
				(await apiRequestWithKey("/mailboxes/activity", password)).status,
			).toBe(403);
			const enabled = await apiJson<{
				data: { selfService: Record<string, boolean> };
			}>(base, {
				method: "PUT",
				body: JSON.stringify({ selfService: { activity: true } }),
			});
			expect(enabled.data.data.selfService).toMatchObject({
				activity: true,
				filters: false,
			});
			const selfActivity = await apiJsonWithKey<ActivityList>(
				"/mailboxes/me/activity?event=login_refused",
				password,
			);
			expect(selfActivity.response.status).toBe(200);
			expect(selfActivity.data.data.length).toBeGreaterThanOrEqual(3);

			const literal = (value: string) => `'${value.replaceAll("'", "''")}'`;
			psql(
				`insert into mailbox_activity (id, user_id, credential_id, protocol, event, occurred_at, last_occurred_at)
				 select ${literal(token)} || '-cap-' || n, ${literal(PRIMARY_USER_ID)}, ${literal(mailboxId)}, 'imap', 'session_ended', now(), now()
				 from generate_series(1, 600) as n;`,
				E2E_DATABASE,
			);
			expect(
				(await gateway("imap", "203.0.113.17", { password: "mail_wrong" }))
					.status,
			).toBe(401);
			expect(
				(await gateway("imap", "203.0.113.18", { password: "mail_wrong" }))
					.status,
			).toBe(401);
			const dropped = await pollFor("events_dropped", 10_000, async () => {
				const value = psql(
					`select reason || ':' || count from mailbox_activity where credential_id = ${literal(mailboxId)} and event = 'events_dropped';`,
					E2E_DATABASE,
				);
				return value === "hourly_cap:2" ? value : null;
			});
			expect(dropped).toBe("hourly_cap:2");
			expect(
				psql(
					`select count(*) from mailbox_activity where credential_id = ${literal(mailboxId)} and client_ip in ('203.0.113.17', '203.0.113.18');`,
					E2E_DATABASE,
				),
			).toBe("0");

			psql(
				`delete from mailbox_activity where id like ${literal(`${token}-cap-%`)};
				 insert into mailbox_activity (id, user_id, credential_id, protocol, event, occurred_at, last_occurred_at) values
				 (${literal(`${token}-expired`)}, ${literal(PRIMARY_USER_ID)}, ${literal(mailboxId)}, 'imap', 'session_ended', now() - interval '31 days', now() - interval '31 days'),
				 (${literal(`${token}-kept`)}, ${literal(PRIMARY_USER_ID)}, ${literal(mailboxId)}, 'imap', 'session_ended', now() - interval '29 days', now() - interval '29 days');`,
				E2E_DATABASE,
			);
			const cron = await fetch(`${LOCAL_BASE_URL}/api/cron/send-scheduled`, {
				headers: { Authorization: `Bearer ${LOCAL_CRON_SECRET}` },
			});
			expect(cron.status).toBe(200);
			expect(
				((await cron.json()) as { activityPurged: number }).activityPurged,
			).toBeGreaterThanOrEqual(1);
			expect(
				psql(
					`select string_agg(id, ',' order by id) from mailbox_activity where id in (${literal(`${token}-expired`)}, ${literal(`${token}-kept`)});`,
					E2E_DATABASE,
				),
			).toBe(`${token}-kept`);

			expect((await apiRequest(base, { method: "DELETE" })).status).toBe(200);
			expect(
				psql(
					`select count(*) from mailbox_activity where credential_id = ${literal(mailboxId)};`,
					E2E_DATABASE,
				),
			).toBe("0");
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
console.log("  - Scheduled sends via cron (pause/resume/cancel, stale recovery)");
console.log("  - Junk filter settings, Guard junk rules and mailbox Junk folder");
console.log("  - Mailbox activity log (sign-ins, gateway sessions, sends, caps, retention)");
console.log("  - Rate-limit 429 behavior under burst traffic");
console.log("=".repeat(60) + "\n");
