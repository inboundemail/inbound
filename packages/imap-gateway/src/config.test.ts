import { afterEach, describe, expect, it } from "bun:test";
import { loadConfig } from "./config.ts";

const originalEnvironment = { ...process.env };

afterEach(() => {
	for (const key of Object.keys(process.env)) {
		if (!(key in originalEnvironment)) delete process.env[key];
	}
	Object.assign(process.env, originalEnvironment);
});

describe("loadConfig", () => {
	it("uses safe defaults and accepts valid paired TLS settings", () => {
		process.env.DATABASE_URL = "postgres://localhost/inbound";
		process.env.IMAP_TLS_KEY_PATH = "/certs/key.pem";
		process.env.IMAP_TLS_CERT_PATH = "/certs/cert.pem";
		process.env.IMAP_API_TIMEOUT_MS = "2500";
		process.env.IMAP_MAX_MESSAGE_BYTES = "524288";
		process.env.IMAP_PORT = "1143";

		const config = loadConfig();
		expect(config.port).toBe(1143);
		expect(config.apiTimeoutMs).toBe(2500);
		expect(config.maxMessageBytes).toBe(524288);
		expect(config.tlsKeyPath).toBe("/certs/key.pem");
		expect(config.tlsCertPath).toBe("/certs/cert.pem");
	});

	it.each([
		"0",
		"-1",
		"1.5",
		"NaN",
	])("rejects invalid positive integer settings: %s", (value) => {
		process.env.DATABASE_URL = "postgres://localhost/inbound";
		delete process.env.IMAP_TLS_KEY_PATH;
		delete process.env.IMAP_TLS_CERT_PATH;
		process.env.IMAP_API_TIMEOUT_MS = value;
		expect(loadConfig).toThrow(
			"IMAP_API_TIMEOUT_MS must be a positive integer",
		);
	});

	it("defaults APPEND messages to 1 MiB", () => {
		process.env.DATABASE_URL = "postgres://localhost/inbound";
		delete process.env.IMAP_TLS_KEY_PATH;
		delete process.env.IMAP_TLS_CERT_PATH;
		delete process.env.IMAP_MAX_MESSAGE_BYTES;
		expect(loadConfig().maxMessageBytes).toBe(1024 * 1024);
	});

	it("accepts the maximum supported authentication timeout", () => {
		process.env.DATABASE_URL = "postgres://localhost/inbound";
		delete process.env.IMAP_TLS_KEY_PATH;
		delete process.env.IMAP_TLS_CERT_PATH;
		process.env.IMAP_API_TIMEOUT_MS = "2147483647";
		expect(loadConfig().apiTimeoutMs).toBe(2_147_483_647);
	});

	it("rejects authentication timeouts outside AbortSignal's supported range", () => {
		process.env.DATABASE_URL = "postgres://localhost/inbound";
		delete process.env.IMAP_TLS_KEY_PATH;
		delete process.env.IMAP_TLS_CERT_PATH;
		process.env.IMAP_API_TIMEOUT_MS = "2147483648";
		expect(loadConfig).toThrow(
			"IMAP_API_TIMEOUT_MS must be a positive integer",
		);
	});

	it("rejects invalid APPEND message limits", () => {
		process.env.DATABASE_URL = "postgres://localhost/inbound";
		delete process.env.IMAP_TLS_KEY_PATH;
		delete process.env.IMAP_TLS_CERT_PATH;
		process.env.IMAP_MAX_MESSAGE_BYTES = "0";
		expect(loadConfig).toThrow(
			"IMAP_MAX_MESSAGE_BYTES must be a positive integer",
		);
	});

	it("rejects out-of-range ports", () => {
		process.env.DATABASE_URL = "postgres://localhost/inbound";
		delete process.env.IMAP_TLS_KEY_PATH;
		delete process.env.IMAP_TLS_CERT_PATH;
		process.env.IMAP_PORT = "65536";
		expect(loadConfig).toThrow("IMAP_PORT must be a positive integer");
	});

	it("requires both TLS certificate and key paths", () => {
		process.env.DATABASE_URL = "postgres://localhost/inbound";
		process.env.IMAP_TLS_KEY_PATH = "/certs/key.pem";
		delete process.env.IMAP_TLS_CERT_PATH;
		expect(loadConfig).toThrow(
			"IMAP_TLS_KEY_PATH and IMAP_TLS_CERT_PATH must both be set",
		);
	});
});
