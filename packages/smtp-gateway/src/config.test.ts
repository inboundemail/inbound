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
		expect(config.tlsHandshakeTimeoutMs).toBe(10_000);
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
