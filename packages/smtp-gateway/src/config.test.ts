import { afterEach, describe, expect, it } from "bun:test";
import { loadConfig } from "./config.ts";

const names = [
	"INBOUND_API_BASE_URL",
	"SMTP_STARTTLS_PORT",
	"SMTP_IMPLICIT_TLS_PORT",
	"SMTP_MAX_MESSAGE_BYTES",
	"SMTP_MAX_RECIPIENTS",
	"SMTP_TLS_HANDSHAKE_TIMEOUT_MS",
	"SMTP_AUTH_FAILURE_WINDOW_MS",
	"SMTP_AUTH_FAILURE_LIMIT",
	"SMTP_AUTH_FAILURE_IP_LIMIT",
	"SMTP_MAX_AUTH_FAILURE_RECORDS",
	"SMTP_AUTH_REQUEST_TIMEOUT_MS",
	"SMTP_SEND_REQUEST_TIMEOUT_MS",
	"SMTP_SOCKET_TIMEOUT_MS",
	"SMTP_MAX_CONNECTIONS",
	"SMTP_MAX_CONCURRENT_DATA",
	"SMTP_MAX_DATA_QUEUE",
	"SMTP_MAX_CONNECTIONS_PER_IP",
	"SMTP_MAX_DATA_PER_CREDENTIAL",
	"SMTP_MAX_DATA_PER_IP",
	"SMTP_MAX_BUFFERED_BYTES",
	"SMTP_DATA_TIMEOUT_MS",
	"SMTP_PARSE_TIMEOUT_MS",
	"SMTP_MAX_CONCURRENT_PARSES",
	"SMTP_PARSE_HEAP_MB",
	"SMTP_MAX_MIME_PARTS",
	"SMTP_PREAUTH_TIMEOUT_MS",
	"SMTP_MAX_SESSION_MS",
] as const;
const original = new Map(names.map((name) => [name, process.env[name]]));

afterEach(() => {
	for (const [name, value] of original) {
		if (value === undefined) delete process.env[name];
		else process.env[name] = value;
	}
});

describe("loadConfig", () => {
	it("loads conservative production defaults", () => {
		for (const name of names) delete process.env[name];
		const config = loadConfig();

		expect(config.starttlsPort).toBe(587);
		expect(config.implicitTlsPort).toBe(465);
		expect(config.maxRecipients).toBe(50);
		expect(config.authFailureIpLimit).toBe(50);
		expect(config.maxAuthFailureRecords).toBe(10_000);
		expect(config.authRequestTimeoutMs).toBe(10_000);
		expect(config.sendRequestTimeoutMs).toBe(30_000);
		expect(config.tlsHandshakeTimeoutMs).toBe(5_000);
		expect(config.maxConnections).toBe(500);
		expect(config.maxConnectionsPerIp).toBe(10);
		expect(config.maxConcurrentData).toBe(8);
		expect(config.maxDataQueue).toBe(20);
		expect(config.maxDataPerCredential).toBe(3);
		expect(config.maxDataPerIp).toBe(4);
		expect(config.maxBufferedBytes).toBe(64 * 1024 * 1024);
		expect(config.dataTimeoutMs).toBe(120_000);
		expect(config.parseTimeoutMs).toBe(15_000);
		expect(config.maxConcurrentParses).toBe(2);
		expect(config.parseHeapMb).toBe(64);
		expect(config.maxMimeParts).toBe(500);
		expect(config.preAuthTimeoutMs).toBe(30_000);
		expect(config.maxSessionMs).toBe(600_000);
	});

	it("keeps the MIME part limit below the parser's stalling threshold", () => {
		process.env.SMTP_MAX_MIME_PARTS = "900";
		expect(loadConfig().maxMimeParts).toBe(900);
		process.env.SMTP_MAX_MIME_PARTS = "1000";
		expect(() => loadConfig()).toThrow("SMTP_MAX_MIME_PARTS");
	});

	it("bounds the parse worker heap", () => {
		process.env.SMTP_PARSE_HEAP_MB = "31";
		expect(() => loadConfig()).toThrow("SMTP_PARSE_HEAP_MB");
		process.env.SMTP_PARSE_HEAP_MB = "1025";
		expect(() => loadConfig()).toThrow("SMTP_PARSE_HEAP_MB");
		process.env.SMTP_PARSE_HEAP_MB = "128";
		expect(loadConfig().parseHeapMb).toBe(128);
	});

	it("requires the buffered-body budget to fit at least one message", () => {
		process.env.SMTP_MAX_MESSAGE_BYTES = "2048";
		process.env.SMTP_MAX_BUFFERED_BYTES = "1024";
		expect(() => loadConfig()).toThrow("SMTP_MAX_BUFFERED_BYTES");
		process.env.SMTP_MAX_MESSAGE_BYTES = String(100 * 1024 * 1024);
		delete process.env.SMTP_MAX_BUFFERED_BYTES;
		expect(loadConfig().maxBufferedBytes).toBe(100 * 1024 * 1024);
	});

	it("allows disabling listeners and disabling the DATA queue with zero", () => {
		process.env.SMTP_STARTTLS_PORT = "0";
		process.env.SMTP_IMPLICIT_TLS_PORT = "0";
		process.env.SMTP_MAX_DATA_QUEUE = "0";

		const config = loadConfig();
		expect(config.starttlsPort).toBe(0);
		expect(config.implicitTlsPort).toBe(0);
		expect(config.maxDataQueue).toBe(0);
	});

	it("rejects invalid, fractional, negative, and out-of-range ports", () => {
		for (const value of ["invalid", "1.5", "-1", "65536", "Infinity"]) {
			process.env.SMTP_STARTTLS_PORT = value;
			expect(() => loadConfig()).toThrow("SMTP_STARTTLS_PORT");
		}
	});

	it("rejects nonpositive limits and timeouts", () => {
		const positiveNames = [
			"SMTP_MAX_MESSAGE_BYTES",
			"SMTP_MAX_RECIPIENTS",
			"SMTP_TLS_HANDSHAKE_TIMEOUT_MS",
			"SMTP_AUTH_FAILURE_WINDOW_MS",
			"SMTP_AUTH_FAILURE_LIMIT",
			"SMTP_AUTH_FAILURE_IP_LIMIT",
			"SMTP_MAX_AUTH_FAILURE_RECORDS",
			"SMTP_AUTH_REQUEST_TIMEOUT_MS",
			"SMTP_SEND_REQUEST_TIMEOUT_MS",
			"SMTP_SOCKET_TIMEOUT_MS",
			"SMTP_MAX_CONNECTIONS",
			"SMTP_MAX_CONCURRENT_DATA",
			"SMTP_MAX_DATA_PER_CREDENTIAL",
			"SMTP_MAX_DATA_PER_IP",
			"SMTP_DATA_TIMEOUT_MS",
			"SMTP_PARSE_TIMEOUT_MS",
			"SMTP_MAX_CONCURRENT_PARSES",
			"SMTP_PARSE_HEAP_MB",
			"SMTP_MAX_MIME_PARTS",
			"SMTP_PREAUTH_TIMEOUT_MS",
			"SMTP_MAX_SESSION_MS",
		] as const;

		for (const name of positiveNames) {
			process.env[name] = "0";
			expect(() => loadConfig()).toThrow(name);
			delete process.env[name];
		}
	});

	it("rejects recipient limits above the SES maximum", () => {
		process.env.SMTP_MAX_RECIPIENTS = "50";
		expect(loadConfig().maxRecipients).toBe(50);
		process.env.SMTP_MAX_RECIPIENTS = "51";
		expect(() => loadConfig()).toThrow("SMTP_MAX_RECIPIENTS");
	});

	it("rejects a negative or fractional DATA queue size", () => {
		process.env.SMTP_MAX_DATA_QUEUE = "-1";
		expect(() => loadConfig()).toThrow("SMTP_MAX_DATA_QUEUE");
		process.env.SMTP_MAX_DATA_QUEUE = "1.5";
		expect(() => loadConfig()).toThrow("SMTP_MAX_DATA_QUEUE");
	});

	it("normalizes a trailing slash on the upstream base URL", () => {
		process.env.INBOUND_API_BASE_URL = "https://example.com/api/";
		expect(loadConfig().apiBaseUrl).toBe("https://example.com/api");
	});
});
