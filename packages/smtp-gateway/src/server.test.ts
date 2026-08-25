import { afterEach, describe, expect, it, mock, spyOn } from "bun:test";
import { createConnection, type Socket } from "node:net";
import { PassThrough } from "node:stream";
import { connect as connectTls } from "node:tls";
import {
	SMTPServer,
	type SMTPServerAuthentication,
	type SMTPServerAuthenticationResponse,
	type SMTPServerDataStream,
	type SMTPServerOptions,
	type SMTPServerSession,
} from "smtp-server";
import type { SmtpIdentity } from "./api-client.ts";
import { type GatewayConfig, loadConfig } from "./config.ts";
import { SmtpGateway } from "./server.ts";

interface GatewayInspection {
	activeData: number;
	authFailures: Map<string, { count: number; windowStart: number }>;
	successfulAuth: Map<string, number>;
	tlsHandshakeTimers: Map<string, ReturnType<typeof setTimeout>>;
	sessionDataStreams: Map<string, SMTPServerDataStream>;
	dataQueue: unknown[];
	servers: SMTPServer[];
	baseOptions(
		tls: { key: Buffer; cert: Buffer; minVersion: "TLSv1.2" } | null,
	): SMTPServerOptions;
	handleAuth(
		auth: SMTPServerAuthentication,
		session: SMTPServerSession,
	): Promise<SMTPServerAuthenticationResponse>;
	handleData(
		stream: SMTPServerDataStream,
		session: SMTPServerSession,
	): Promise<string>;
	acquireDataSlot(stream?: SMTPServerDataStream): Promise<() => void>;
	listen(server: SMTPServer, port: number, label: string): void;
}

const identity: SmtpIdentity = {
	credentialId: "credential-id",
	userId: "user-id",
	loginAddress: "sender@example.com",
	type: "smtp",
	accessMode: "read_write",
	sendingMode: "identity",
	sendingName: null,
	sendingAddress: "sender@example.com",
	allowedDomains: [],
};

function gateway(overrides: Partial<GatewayConfig> = {}): {
	gateway: SmtpGateway;
	inspect: GatewayInspection;
	config: GatewayConfig;
} {
	const config = {
		...loadConfig(),
		apiBaseUrl: "https://example.com/api/e2",
		tlsKeyPath: null,
		tlsCertPath: null,
		...overrides,
	};
	const instance = new SmtpGateway(config);
	return {
		gateway: instance,
		inspect: instance as unknown as GatewayInspection,
		config,
	};
}

function session(
	overrides: {
		secure?: boolean;
		user?: { apiKey: string; identity: SmtpIdentity };
		recipients?: string[];
		remoteAddress?: string;
	} = {},
): SMTPServerSession {
	return {
		id: "session-id",
		localAddress: "127.0.0.1",
		localPort: 587,
		remoteAddress: overrides.remoteAddress ?? "192.0.2.1",
		remotePort: 12_345,
		clientHostname: "client.example.com",
		openingCommand: "EHLO",
		hostNameAppearsAs: "client.example.com",
		envelope: {
			mailFrom: { address: "sender@example.com", args: {} },
			rcptTo: (overrides.recipients ?? []).map((address) => ({
				address,
				args: {},
			})),
		},
		secure: overrides.secure ?? true,
		transmissionType: "ESMTPSA",
		tlsOptions: {},
		user: overrides.user,
	} as unknown as SMTPServerSession;
}

function authentication(
	username: string,
	password: string,
): SMTPServerAuthentication {
	return {
		method: "PLAIN",
		username,
		password,
		validatePassword: (candidate) => candidate === password,
	};
}

function dataStream(content: string): SMTPServerDataStream {
	const stream = new PassThrough() as SMTPServerDataStream;
	stream.sizeExceeded = false;
	stream.end(content);
	return stream;
}

function socketResponse(socket: Socket): Promise<string> {
	return new Promise((resolve, reject) => {
		const onError = (error: Error) => {
			socket.removeListener("data", onData);
			reject(error);
		};
		const onData = (chunk: Buffer) => {
			socket.removeListener("error", onError);
			resolve(chunk.toString());
		};
		socket.once("data", onData);
		socket.once("error", onError);
	});
}

async function smtpCommand(socket: Socket, command: string): Promise<string> {
	const response = socketResponse(socket);
	socket.write(`${command}\r\n`);
	return response;
}

async function eventually(assertion: () => boolean): Promise<void> {
	const deadline = Date.now() + 1_000;
	while (!assertion()) {
		if (Date.now() >= deadline) throw new Error("Timed out waiting for state");
		await new Promise<void>((resolve) => setTimeout(resolve, 5));
	}
}

afterEach(() => mock.restore());

describe("SmtpGateway TLS startup", () => {
	it("refuses to start without TLS unless insecure authentication is explicit", () => {
		const { gateway: instance, inspect } = gateway({
			implicitTlsPort: 0,
			allowInsecureAuth: false,
		});

		expect(() => instance.start()).toThrow("SMTP_ALLOW_INSECURE_AUTH=true");
		expect(inspect.servers).toHaveLength(0);
	});

	it("rejects incomplete certificate and private-key configuration", () => {
		for (const paths of [
			{ tlsKeyPath: "/missing/key", tlsCertPath: null },
			{ tlsKeyPath: null, tlsCertPath: "/missing/cert" },
		]) {
			const { gateway: instance } = gateway({
				...paths,
				implicitTlsPort: 0,
				allowInsecureAuth: true,
			});
			expect(() => instance.start()).toThrow("must both be configured");
		}
	});

	it("never permits implicit TLS without certificates, even in development", () => {
		const { gateway: instance, inspect } = gateway({
			allowInsecureAuth: true,
			implicitTlsPort: 465,
		});

		expect(() => instance.start()).toThrow("implicit TLS listener");
		expect(inspect.servers).toHaveLength(0);
	});

	it("rejects configurations with no listeners before binding sockets", () => {
		const { gateway: instance } = gateway({
			starttlsPort: 0,
			implicitTlsPort: 0,
			allowInsecureAuth: true,
		});

		expect(() => instance.start()).toThrow("No listeners configured");
	});

	it("applies TLS 1.2 without advertising an unsupported server handshake option", () => {
		const { inspect } = gateway();
		const options = inspect.baseOptions({
			key: Buffer.from("key"),
			cert: Buffer.from("certificate"),
			minVersion: "TLSv1.2",
		});

		expect(options.minVersion).toBe("TLSv1.2");
		expect(options.handshakeTimeout).toBeUndefined();
		expect(options.disabledCommands).toEqual([]);
		expect(inspect.baseOptions(null).disabledCommands).toEqual(["STARTTLS"]);
	});

	it("caps underlying TCP connections and closes stalled implicit TLS handshakes", async () => {
		const { gateway: instance, inspect } = gateway({
			maxConnections: 3,
			tlsHandshakeTimeoutMs: 20,
		});
		spyOn(console, "log").mockImplementation(() => {});
		spyOn(console, "error").mockImplementation(() => {});
		const server = new SMTPServer({
			...inspect.baseOptions(null),
			secure: true,
		});
		inspect.listen(server, 0, "test implicit TLS");
		await new Promise<void>((resolve) =>
			server.server.once("listening", resolve),
		);

		try {
			expect(server.server.maxConnections).toBe(3);
			const address = server.server.address();
			if (!address || typeof address === "string") {
				throw new Error("Expected TCP listener address");
			}
			const socket = createConnection({
				host: "127.0.0.1",
				port: address.port,
			});
			await new Promise<void>((resolve, reject) => {
				socket.once("close", resolve);
				socket.once("error", reject);
			});
			expect(socket.destroyed).toBe(true);
			expect(inspect.tlsHandshakeTimers.size).toBe(0);
		} finally {
			await instance.stop();
		}
	});

	it("keeps healthy implicit TLS sessions alive beyond the handshake deadline", async () => {
		const { gateway: instance, inspect } = gateway({
			tlsHandshakeTimeoutMs: 250,
			socketTimeoutMs: 2_000,
		});
		spyOn(console, "log").mockImplementation(() => {});
		spyOn(console, "error").mockImplementation(() => {});
		const server = new SMTPServer({
			...inspect.baseOptions(null),
			secure: true,
			disableReverseLookup: true,
		});
		inspect.listen(server, 0, "healthy implicit TLS");
		await new Promise<void>((resolve) =>
			server.server.once("listening", resolve),
		);

		try {
			const address = server.server.address();
			if (!address || typeof address === "string") {
				throw new Error("Expected TCP listener address");
			}
			const socket = connectTls({
				host: "127.0.0.1",
				port: address.port,
				rejectUnauthorized: false,
			});
			try {
				const greeting = await new Promise<string>((resolve, reject) => {
					socket.once("data", (chunk: Buffer) => resolve(chunk.toString()));
					socket.once("error", reject);
				});
				expect(greeting).toStartWith("220 ");
				expect(inspect.tlsHandshakeTimers.size).toBe(0);
				await new Promise<void>((resolve) => setTimeout(resolve, 300));
				expect(socket.destroyed).toBe(false);
				const response = new Promise<string>((resolve) => {
					socket.once("data", (chunk: Buffer) => resolve(chunk.toString()));
				});
				socket.write("NOOP\r\n");
				expect(await response).toStartWith("250 ");
			} finally {
				socket.destroy();
			}
		} finally {
			await instance.stop();
		}
	});

	it("terminates stalled STARTTLS upgrades at the configured handshake deadline", async () => {
		const { gateway: instance, inspect } = gateway({
			tlsHandshakeTimeoutMs: 40,
			socketTimeoutMs: 2_000,
		});
		spyOn(console, "log").mockImplementation(() => {});
		spyOn(console, "error").mockImplementation(() => {});
		const server = new SMTPServer({
			...inspect.baseOptions(null),
			secure: false,
			disabledCommands: [],
			disableReverseLookup: true,
		});
		inspect.listen(server, 0, "stalled STARTTLS");
		await new Promise<void>((resolve) =>
			server.server.once("listening", resolve),
		);

		try {
			const address = server.server.address();
			if (!address || typeof address === "string") {
				throw new Error("Expected TCP listener address");
			}
			const socket = createConnection({
				host: "127.0.0.1",
				port: address.port,
			});
			expect(await socketResponse(socket)).toStartWith("220 ");
			expect(await smtpCommand(socket, "EHLO client.example.com")).toStartWith(
				"250-",
			);
			expect(await smtpCommand(socket, "STARTTLS invalid")).toStartWith("501 ");
			expect(inspect.tlsHandshakeTimers.size).toBe(0);
			const response = socketResponse(socket);
			socket.write("START");
			expect(inspect.tlsHandshakeTimers.size).toBe(0);
			socket.write("TLS\r\n");
			expect(await response).toStartWith("220 ");
			expect(inspect.tlsHandshakeTimers.size).toBe(1);
			await new Promise<void>((resolve, reject) => {
				socket.once("close", resolve);
				socket.once("error", reject);
			});
			expect(socket.destroyed).toBe(true);
			expect(inspect.tlsHandshakeTimers.size).toBe(0);
		} finally {
			await instance.stop();
		}
	});

	it("keeps successful STARTTLS sessions alive beyond the handshake deadline", async () => {
		const { gateway: instance, inspect } = gateway({
			tlsHandshakeTimeoutMs: 100,
			socketTimeoutMs: 2_000,
		});
		spyOn(console, "log").mockImplementation(() => {});
		spyOn(console, "error").mockImplementation(() => {});
		const server = new SMTPServer({
			...inspect.baseOptions(null),
			secure: false,
			disabledCommands: [],
			disableReverseLookup: true,
		});
		inspect.listen(server, 0, "healthy STARTTLS");
		await new Promise<void>((resolve) =>
			server.server.once("listening", resolve),
		);

		try {
			const address = server.server.address();
			if (!address || typeof address === "string") {
				throw new Error("Expected TCP listener address");
			}
			const socket = createConnection({
				host: "127.0.0.1",
				port: address.port,
			});
			expect(await socketResponse(socket)).toStartWith("220 ");
			expect(await smtpCommand(socket, "EHLO client.example.com")).toStartWith(
				"250-",
			);
			expect(await smtpCommand(socket, "STARTTLS")).toStartWith("220 ");
			const secure = connectTls({ socket, rejectUnauthorized: false });
			try {
				await new Promise<void>((resolve, reject) => {
					secure.once("secureConnect", resolve);
					secure.once("error", reject);
				});
				expect(
					await smtpCommand(secure, "EHLO secure.example.com"),
				).toStartWith("250-");
				expect(inspect.tlsHandshakeTimers.size).toBe(0);
				await new Promise<void>((resolve) => setTimeout(resolve, 150));
				expect(secure.destroyed).toBe(false);
				expect(await smtpCommand(secure, "NOOP")).toStartWith("250 ");
			} finally {
				secure.destroy();
			}
		} finally {
			await instance.stop();
		}
	});
});

describe("SmtpGateway authentication", () => {
	it("independently rejects AUTH on insecure sessions", async () => {
		const { inspect } = gateway({ allowInsecureAuth: false });
		const fetchMock = spyOn(globalThis, "fetch");

		await expect(
			inspect.handleAuth(
				authentication("sender@example.com", "secret"),
				session({
					secure: false,
				}),
			),
		).rejects.toMatchObject({ responseCode: 538 });
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("permits insecure AUTH only with the explicit development override", async () => {
		const { inspect } = gateway({ allowInsecureAuth: true });
		spyOn(globalThis, "fetch").mockResolvedValue(Response.json(identity));

		const result = await inspect.handleAuth(
			authentication("sender@example.com", "secret"),
			session({ secure: false }),
		);

		expect(result.user).toMatchObject({ apiKey: "secret", identity });
	});

	it("throttles repeated failures for each login and IP pair", async () => {
		const { inspect } = gateway({
			authFailureLimit: 2,
			authFailureIpLimit: 20,
		});
		const attempt = () =>
			inspect.handleAuth(authentication("sender@example.com", ""), session());

		await expect(attempt()).rejects.toMatchObject({ responseCode: 535 });
		await expect(attempt()).rejects.toMatchObject({ responseCode: 535 });
		await expect(attempt()).rejects.toMatchObject({ responseCode: 421 });
	});

	it("limits aggregate IP failures without blocking recently successful users", async () => {
		const { inspect } = gateway({
			authFailureLimit: 10,
			authFailureIpLimit: 3,
		});
		spyOn(globalThis, "fetch").mockImplementation(
			Object.assign(async () => Response.json(identity), {
				preconnect: globalThis.fetch.preconnect,
			}),
		);
		const valid = () =>
			inspect.handleAuth(
				authentication("sender@example.com", "secret"),
				session(),
			);

		await expect(valid()).resolves.toBeDefined();
		for (let index = 0; index < 3; index++) {
			await expect(
				inspect.handleAuth(
					authentication(`bad-${index}@example.com`, ""),
					session(),
				),
			).rejects.toMatchObject({ responseCode: 535 });
		}

		await expect(
			inspect.handleAuth(
				authentication("new@example.com", "secret"),
				session(),
			),
		).rejects.toMatchObject({ responseCode: 421 });
		await expect(valid()).resolves.toBeDefined();
	});

	it("does not evict blocked login records when unrelated failures flood the cache", async () => {
		const { inspect } = gateway({
			authFailureLimit: 2,
			authFailureIpLimit: 100,
			maxAuthFailureRecords: 6,
		});
		const blockedSession = session({ remoteAddress: "192.0.2.10" });
		for (let index = 0; index < 2; index++) {
			await expect(
				inspect.handleAuth(
					authentication("blocked@example.com", ""),
					blockedSession,
				),
			).rejects.toMatchObject({ responseCode: 535 });
		}
		for (let index = 0; index < 20; index++) {
			await expect(
				inspect.handleAuth(
					authentication(`noise-${index}@example.com`, ""),
					session({ remoteAddress: `192.0.2.${index + 20}` }),
				),
			).rejects.toMatchObject({ responseCode: 535 });
		}

		expect(inspect.authFailures.size).toBeLessThanOrEqual(6);
		await expect(
			inspect.handleAuth(
				authentication("blocked@example.com", "secret"),
				blockedSession,
			),
		).rejects.toMatchObject({ responseCode: 421 });
	});

	it("does not evict blocked IP records when other addresses flood the cache", async () => {
		const { inspect } = gateway({
			authFailureLimit: 100,
			authFailureIpLimit: 2,
			maxAuthFailureRecords: 6,
		});
		const blockedSession = session({ remoteAddress: "192.0.2.10" });
		for (let index = 0; index < 2; index++) {
			await expect(
				inspect.handleAuth(
					authentication(`blocked-${index}@example.com`, ""),
					blockedSession,
				),
			).rejects.toMatchObject({ responseCode: 535 });
		}
		for (let index = 0; index < 20; index++) {
			await expect(
				inspect.handleAuth(
					authentication(`noise-${index}@example.com`, ""),
					session({ remoteAddress: `192.0.2.${index + 20}` }),
				),
			).rejects.toMatchObject({ responseCode: 535 });
		}

		expect(inspect.authFailures.size).toBeLessThanOrEqual(6);
		await expect(
			inspect.handleAuth(
				authentication("new@example.com", "secret"),
				blockedSession,
			),
		).rejects.toMatchObject({ responseCode: 421 });
	});

	it("fails closed when every bounded failure record is an active block", async () => {
		const { inspect } = gateway({
			authFailureLimit: 1,
			authFailureIpLimit: 1,
			maxAuthFailureRecords: 2,
		});

		await expect(
			inspect.handleAuth(
				authentication("blocked@example.com", ""),
				session({ remoteAddress: "192.0.2.10" }),
			),
		).rejects.toMatchObject({ responseCode: 535 });
		expect(inspect.authFailures.size).toBe(2);
		await expect(
			inspect.handleAuth(
				authentication("unknown@example.com", ""),
				session({ remoteAddress: "192.0.2.20" }),
			),
		).rejects.toMatchObject({ responseCode: 421 });
		expect(inspect.authFailures.size).toBe(2);
	});

	it("bounds retained authentication failure and success records", async () => {
		const { inspect } = gateway({
			authFailureLimit: 100,
			authFailureIpLimit: 100,
			maxAuthFailureRecords: 4,
		});

		for (let index = 0; index < 10; index++) {
			await expect(
				inspect.handleAuth(
					authentication(`bad-${index}@example.com`, ""),
					session(),
				),
			).rejects.toMatchObject({ responseCode: 535 });
		}
		expect(inspect.authFailures.size).toBeLessThanOrEqual(4);

		spyOn(globalThis, "fetch").mockImplementation(
			Object.assign(async () => Response.json(identity), {
				preconnect: globalThis.fetch.preconnect,
			}),
		);
		for (let index = 0; index < 10; index++) {
			await inspect.handleAuth(
				authentication(`valid-${index}@example.com`, "secret"),
				session(),
			);
		}
		expect(inspect.successfulAuth.size).toBeLessThanOrEqual(4);
	});
});

describe("SmtpGateway envelope limits", () => {
	it("authorizes MAIL FROM before accepting the transaction", async () => {
		const { inspect } = gateway();
		const options = inspect.baseOptions(null);
		const authenticated = session({ user: { apiKey: "secret", identity } });

		const accepted = await new Promise<Error | null | undefined>((resolve) => {
			options.onMailFrom?.(
				{ address: "SENDER@example.com", args: {} },
				authenticated,
				resolve,
			);
		});
		expect(accepted).toBeUndefined();

		const rejected = await new Promise<Error | null | undefined>((resolve) => {
			options.onMailFrom?.(
				{ address: "other@example.com", args: {} },
				authenticated,
				resolve,
			);
		});
		expect(rejected).toMatchObject({ responseCode: 553 });
	});

	it("accepts authenticated RFC-valid null reverse paths", async () => {
		const { inspect } = gateway();
		const authenticated = session({ user: { apiKey: "secret", identity } });
		const result = await new Promise<Error | null | undefined>((resolve) => {
			inspect
				.baseOptions(null)
				.onMailFrom?.({ address: "", args: {} }, authenticated, resolve);
		});

		expect(result).toBeUndefined();
	});

	it("rejects MAIL FROM before authentication", async () => {
		const { inspect } = gateway();
		const rejected = await new Promise<Error | null | undefined>((resolve) => {
			inspect
				.baseOptions(null)
				.onMailFrom?.(
					{ address: "sender@example.com", args: {} },
					session(),
					resolve,
				);
		});

		expect(rejected).toMatchObject({ responseCode: 530 });
	});

	it("continues validating header senders for null reverse paths", async () => {
		const { inspect } = gateway();
		const active = session({
			user: { apiKey: "secret", identity },
			recipients: ["recipient@example.com"],
		});
		active.envelope.mailFrom = { address: "", args: {} };
		const fetchMock = spyOn(globalThis, "fetch");

		await expect(
			inspect.handleData(
				dataStream(
					"From: intruder@example.com\r\nTo: recipient@example.com\r\n\r\nHello",
				),
				active,
			),
		).rejects.toMatchObject({ responseCode: 553 });
		expect(fetchMock).not.toHaveBeenCalled();
		expect(inspect.activeData).toBe(0);
	});

	it("relays authorized header senders with a null reverse path", async () => {
		const { inspect } = gateway();
		const active = session({
			user: { apiKey: "secret", identity },
			recipients: ["recipient@example.com"],
		});
		active.envelope.mailFrom = { address: "", args: {} };
		spyOn(console, "log").mockImplementation(() => {});
		spyOn(globalThis, "fetch").mockResolvedValue(
			Response.json({ id: "null-sender-message" }),
		);

		await expect(
			inspect.handleData(
				dataStream(
					"From: sender@example.com\r\nTo: recipient@example.com\r\n\r\nHello",
				),
				active,
			),
		).resolves.toBe("Queued as null-sender-message");
		expect(inspect.activeData).toBe(0);
	});

	it("enforces the SES hard maximum even for programmatic configuration", async () => {
		const { inspect } = gateway({ maxRecipients: 100 });
		const active = session({
			recipients: Array.from(
				{ length: 50 },
				(_unused, index) => `recipient-${index}@example.com`,
			),
		});
		const rejected = await new Promise<Error | null | undefined>((resolve) => {
			inspect
				.baseOptions(null)
				.onRcptTo?.(
					{ address: "extra@example.com", args: {} },
					active,
					resolve,
				);
		});

		expect(rejected).toMatchObject({ responseCode: 452 });
	});

	it("enforces the distinct recipient limit without rejecting duplicate RCPT", async () => {
		const { inspect } = gateway({ maxRecipients: 1 });
		const active = session({ recipients: ["first@example.com"] });
		const options = inspect.baseOptions(null);

		const duplicate = await new Promise<Error | null | undefined>((resolve) => {
			options.onRcptTo?.(
				{ address: "FIRST@example.com", args: {} },
				active,
				resolve,
			);
		});
		expect(duplicate).toBeUndefined();

		const rejected = await new Promise<Error | null | undefined>((resolve) => {
			options.onRcptTo?.(
				{ address: "second@example.com", args: {} },
				active,
				resolve,
			);
		});
		expect(rejected).toMatchObject({ responseCode: 452 });
	});
});

describe("SmtpGateway DATA concurrency", () => {
	it("queues waiting messages and hands released slots directly to them", async () => {
		const { inspect } = gateway({ maxConcurrentData: 1, maxDataQueue: 1 });
		const releaseFirst = await inspect.acquireDataSlot();
		const waiting = inspect.acquireDataSlot();

		expect(() => inspect.acquireDataSlot()).toThrow("Gateway busy");
		expect(inspect.activeData).toBe(1);
		releaseFirst();
		const releaseSecond = await waiting;
		expect(inspect.activeData).toBe(1);
		releaseSecond();
		expect(inspect.activeData).toBe(0);
	});

	it("destroys queued DATA streams when their SMTP session closes", async () => {
		const { inspect } = gateway({ maxConcurrentData: 1, maxDataQueue: 1 });
		const release = await inspect.acquireDataSlot();
		const stream = new PassThrough() as SMTPServerDataStream;
		const active = session({ user: { apiKey: "secret", identity } });
		const options = inspect.baseOptions(null);
		const rejected = new Promise<Error | null | undefined>((resolve) => {
			options.onData?.(stream, active, resolve);
		});

		expect(inspect.dataQueue).toHaveLength(1);
		expect(inspect.sessionDataStreams.get(active.id)).toBe(stream);
		options.onClose?.(active, () => {});
		expect(stream.destroyed).toBe(true);
		await expect(rejected).resolves.toMatchObject({ responseCode: 451 });
		expect(inspect.dataQueue).toHaveLength(0);
		expect(inspect.sessionDataStreams.size).toBe(0);
		release();
		expect(inspect.activeData).toBe(0);
	});

	it("destroys active DATA streams and releases slots when their SMTP session closes", async () => {
		const { inspect } = gateway({ maxConcurrentData: 1, maxDataQueue: 0 });
		const stream = new PassThrough() as SMTPServerDataStream;
		const active = session({
			user: { apiKey: "secret", identity },
			recipients: ["recipient@example.com"],
		});
		const options = inspect.baseOptions(null);
		const rejected = new Promise<Error | null | undefined>((resolve) => {
			options.onData?.(stream, active, resolve);
		});
		await Promise.resolve();

		expect(inspect.activeData).toBe(1);
		expect(inspect.sessionDataStreams.get(active.id)).toBe(stream);
		options.onClose?.(active, () => {});
		await expect(rejected).resolves.toMatchObject({ responseCode: 451 });
		expect(inspect.activeData).toBe(0);
		expect(inspect.sessionDataStreams.size).toBe(0);
	});

	it("removes completed DATA streams from their SMTP session", async () => {
		const { inspect } = gateway();
		spyOn(console, "log").mockImplementation(() => {});
		spyOn(globalThis, "fetch").mockResolvedValue(
			Response.json({ id: "completed-message" }),
		);
		const active = session({
			user: { apiKey: "secret", identity },
			recipients: ["recipient@example.com"],
		});
		const stream = dataStream(
			"From: sender@example.com\r\nTo: recipient@example.com\r\n\r\nHello",
		);

		const result = await new Promise<string | undefined>((resolve, reject) => {
			inspect.baseOptions(null).onData?.(stream, active, (error, message) => {
				if (error) reject(error);
				else resolve(message);
			});
		});
		await eventually(() => inspect.sessionDataStreams.size === 0);
		expect(result).toBe("Queued as completed-message");
		expect(inspect.activeData).toBe(0);
	});

	it("removes disconnected queued streams without leaking DATA slots", async () => {
		const { inspect } = gateway({ maxConcurrentData: 1, maxDataQueue: 1 });
		const release = await inspect.acquireDataSlot();
		const stream = new PassThrough() as SMTPServerDataStream;
		const waiting = inspect.acquireDataSlot(stream);

		expect(inspect.dataQueue).toHaveLength(1);
		stream.destroy();
		await expect(waiting).rejects.toMatchObject({ responseCode: 451 });
		expect(inspect.dataQueue).toHaveLength(0);
		release();
		expect(inspect.activeData).toBe(0);
		const replacement = await inspect.acquireDataSlot();
		expect(inspect.activeData).toBe(1);
		replacement();
		expect(inspect.activeData).toBe(0);
	});

	it("skips canceled queued streams and grants the next live waiter", async () => {
		const { inspect } = gateway({ maxConcurrentData: 1, maxDataQueue: 2 });
		const release = await inspect.acquireDataSlot();
		const canceledStream = new PassThrough() as SMTPServerDataStream;
		const liveStream = new PassThrough() as SMTPServerDataStream;
		const canceled = inspect.acquireDataSlot(canceledStream);
		const live = inspect.acquireDataSlot(liveStream);

		canceledStream.destroy();
		await expect(canceled).rejects.toMatchObject({ responseCode: 451 });
		release();
		const releaseLive = await live;
		expect(inspect.activeData).toBe(1);
		releaseLive();
		expect(inspect.activeData).toBe(0);
		liveStream.destroy();
	});

	it("rejects queued stream errors without reserving a processing slot", async () => {
		const { inspect } = gateway({ maxConcurrentData: 1, maxDataQueue: 1 });
		const release = await inspect.acquireDataSlot();
		const stream = new PassThrough() as SMTPServerDataStream;
		const waiting = inspect.acquireDataSlot(stream);

		stream.destroy(new Error("client disconnected"));
		await expect(waiting).rejects.toMatchObject({ responseCode: 451 });
		expect(inspect.dataQueue).toHaveLength(0);
		release();
		expect(inspect.activeData).toBe(0);
	});

	it("releases active DATA slots when a stream closes during collection", async () => {
		const { inspect } = gateway({ maxConcurrentData: 1, maxDataQueue: 0 });
		const stream = new PassThrough() as SMTPServerDataStream;
		const pending = inspect.handleData(
			stream,
			session({
				user: { apiKey: "secret", identity },
				recipients: ["recipient@example.com"],
			}),
		);
		await Promise.resolve();
		stream.destroy();

		await expect(pending).rejects.toMatchObject({ responseCode: 451 });
		expect(inspect.activeData).toBe(0);
	});

	it("drains rejected DATA streams after a full queue", async () => {
		const { inspect } = gateway({ maxConcurrentData: 1, maxDataQueue: 0 });
		const release = await inspect.acquireDataSlot();
		const stream = dataStream("From: sender@example.com\r\n\r\nHello");
		const ended = new Promise<void>((resolve) => stream.once("end", resolve));
		const active = session({ user: { apiKey: "secret", identity } });

		const rejected = await new Promise<Error | null | undefined>((resolve) => {
			inspect.baseOptions(null).onData?.(stream, active, resolve);
		});
		await ended;
		expect(rejected).toMatchObject({ responseCode: 451 });
		release();
	});

	it("drains unauthenticated DATA streams", async () => {
		const { inspect } = gateway();
		const stream = dataStream("From: sender@example.com\r\n\r\nHello");
		const ended = new Promise<void>((resolve) => stream.once("end", resolve));

		const rejected = await new Promise<Error | null | undefined>((resolve) => {
			inspect.baseOptions(null).onData?.(stream, session(), resolve);
		});
		await ended;
		expect(rejected).toMatchObject({ responseCode: 530 });
	});

	it("releases queued and active DATA slots after real SMTP clients disconnect", async () => {
		const { gateway: instance, inspect } = gateway({
			allowInsecureAuth: true,
			maxConcurrentData: 1,
			maxDataQueue: 1,
			socketTimeoutMs: 2_000,
		});
		spyOn(console, "log").mockImplementation(() => {});
		spyOn(console, "error").mockImplementation(() => {});
		spyOn(globalThis, "fetch").mockImplementation(
			Object.assign(async () => Response.json(identity), {
				preconnect: globalThis.fetch.preconnect,
			}),
		);
		const server = new SMTPServer({
			...inspect.baseOptions(null),
			secure: false,
			disableReverseLookup: true,
		});
		inspect.listen(server, 0, "DATA disconnect integration");
		await new Promise<void>((resolve) =>
			server.server.once("listening", resolve),
		);
		const sockets: Socket[] = [];

		try {
			const address = server.server.address();
			if (!address || typeof address === "string") {
				throw new Error("Expected TCP listener address");
			}
			const open = async () => {
				const socket = createConnection({
					host: "127.0.0.1",
					port: address.port,
				});
				sockets.push(socket);
				expect(await socketResponse(socket)).toStartWith("220 ");
				expect(
					await smtpCommand(socket, "EHLO client.example.com"),
				).toStartWith("250-");
				const credentials = Buffer.from(
					"\0sender@example.com\0secret",
				).toString("base64");
				expect(
					await smtpCommand(socket, `AUTH PLAIN ${credentials}`),
				).toStartWith("235 ");
				expect(
					await smtpCommand(socket, "MAIL FROM:<sender@example.com>"),
				).toStartWith("250 ");
				expect(
					await smtpCommand(socket, "RCPT TO:<recipient@example.com>"),
				).toStartWith("250 ");
				return socket;
			};
			const [active, queued] = await Promise.all([open(), open()]);
			expect(await smtpCommand(active, "DATA")).toStartWith("354 ");
			expect(await smtpCommand(queued, "DATA")).toStartWith("354 ");
			await eventually(
				() =>
					inspect.activeData === 1 &&
					inspect.dataQueue.length === 1 &&
					inspect.sessionDataStreams.size === 2,
			);

			queued.destroy();
			await eventually(
				() =>
					inspect.activeData === 1 &&
					inspect.dataQueue.length === 0 &&
					inspect.sessionDataStreams.size === 1,
			);
			active.destroy();
			await eventually(
				() =>
					inspect.activeData === 0 &&
					inspect.dataQueue.length === 0 &&
					inspect.sessionDataStreams.size === 0,
			);
		} finally {
			for (const socket of sockets) socket.destroy();
			await instance.stop();
		}
	});

	it("keeps idempotency stable across password rotation for the same credential", async () => {
		const { inspect } = gateway();
		spyOn(console, "log").mockImplementation(() => {});
		const fetchMock = spyOn(globalThis, "fetch").mockImplementation(
			Object.assign(async () => Response.json({ id: "message-id" }), {
				preconnect: globalThis.fetch.preconnect,
			}),
		);
		const content =
			"From: sender@example.com\r\nTo: recipient@example.com\r\n\r\nHello";
		for (const password of ["original-password", "rotated-password"]) {
			await inspect.handleData(
				dataStream(content),
				session({
					user: { apiKey: password, identity },
					recipients: ["recipient@example.com"],
				}),
			);
		}

		const first = new Headers(fetchMock.mock.calls[0]?.[1]?.headers);
		const second = new Headers(fetchMock.mock.calls[1]?.[1]?.headers);
		expect(first.get("Idempotency-Key")).toBe(second.get("Idempotency-Key"));
		expect(first.get("Authorization")).toBe("Bearer original-password");
		expect(second.get("Authorization")).toBe("Bearer rotated-password");
	});

	it("releases DATA slots when upstream send requests time out", async () => {
		const { inspect } = gateway({
			maxConcurrentData: 1,
			maxDataQueue: 0,
			sendRequestTimeoutMs: 5,
		});
		spyOn(globalThis, "fetch").mockImplementation(
			Object.assign(
				(
					_input: Parameters<typeof fetch>[0],
					options?: Parameters<typeof fetch>[1],
				) => {
					return new Promise<Response>((_resolve, reject) => {
						options?.signal?.addEventListener("abort", () => {
							reject(options.signal?.reason);
						});
					});
				},
				{ preconnect: globalThis.fetch.preconnect },
			),
		);

		await expect(
			inspect.handleData(
				dataStream(
					"From: sender@example.com\r\nTo: recipient@example.com\r\n\r\nHello",
				),
				session({
					user: { apiKey: "secret", identity },
					recipients: ["recipient@example.com"],
				}),
			),
		).rejects.toMatchObject({ responseCode: 451 });
		expect(inspect.activeData).toBe(0);
	});
});
