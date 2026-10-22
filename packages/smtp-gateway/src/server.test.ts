import { afterEach, describe, expect, it, mock, spyOn } from "bun:test";
import { createRequire } from "node:module";
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

type TestTls = { key: Buffer; cert: Buffer; minVersion: "TLSv1.2" };

// smtp-server ships a self-signed localhost certificate for tests.
const testTls: TestTls = {
	...createRequire(import.meta.url)("smtp-server/lib/tls-options.js")(),
	minVersion: "TLSv1.2",
};

interface GatewayInspection {
	activeData: number;
	authFailures: Map<string, { count: number; windowStart: number }>;
	successfulAuth: Map<string, number>;
	connectionsByIp: Map<string, number>;
	sessionData: Map<string, { stream: SMTPServerDataStream }>;
	sessionTimers: Map<string, unknown>;
	dataByCredential: Map<string, number>;
	dataByIp: Map<string, number>;
	bufferedBytes: number;
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
		signal?: AbortSignal,
	): Promise<string>;
	acquireDataSlot(signal?: AbortSignal): Promise<() => void>;
	acquireParseSlot(signal: AbortSignal): Promise<() => void>;
	activeParses: number;
	parseQueue: unknown[];
	implicitTlsServer(tls: TestTls): SMTPServer;
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
		id?: string;
		secure?: boolean;
		user?: { apiKey: string; identity: SmtpIdentity };
		recipients?: string[];
		remoteAddress?: string;
	} = {},
): SMTPServerSession {
	return {
		id: overrides.id ?? "session-id",
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

// Past mailsplit's 1000-node limit, mailparser 3.9 never settles on this shape.
function stallingMessage(parts: number): string {
	const lines = [
		"From: sender@example.com",
		"To: recipient@example.com",
		'Content-Type: multipart/mixed; boundary="b"',
		"",
	];
	for (let index = 0; index < parts; index++) {
		lines.push(
			"--b",
			index % 2
				? "Content-Type: text/html\r\n\r\n<b>x</b>"
				: "Content-Type: application/pdf\r\nContent-Disposition: attachment; filename=x.pdf\r\nContent-Transfer-Encoding: base64\r\n\r\nJVBERi0=",
		);
	}
	lines.push("--b--", "");
	return lines.join("\r\n");
}

// A large message whose parse takes hundreds of milliseconds.
function slowMessage(): string {
	const attachment = Buffer.alloc(1_500_000, 7)
		.toString("base64")
		.replace(/.{76}/g, "$&\r\n");
	return [
		"From: sender@example.com",
		"To: recipient@example.com",
		'Content-Type: multipart/mixed; boundary="mix"',
		"",
		"--mix",
		"Content-Type: text/html",
		"",
		"<p>hello</p>\n".repeat(60_000),
		"--mix",
		"Content-Type: application/octet-stream",
		"Content-Transfer-Encoding: base64",
		"",
		attachment,
		"--mix--",
		"",
	].join("\r\n");
}

function dotStuff(message: string): string {
	return message.replace(/^\./gm, "..");
}

function mockApi(senderIdentity: SmtpIdentity = identity) {
	return spyOn(globalThis, "fetch").mockImplementation(
		Object.assign(
			async (
				input: Parameters<typeof fetch>[0],
				options?: Parameters<typeof fetch>[1],
			) => {
				if (!String(input).endsWith("/mailboxes/authenticate-smtp")) {
					return Response.json({ id: "message-id" });
				}
				const { loginAddress } = JSON.parse(String(options?.body));
				return Response.json({
					...senderIdentity,
					credentialId: `credential:${loginAddress}`,
				});
			},
			{ preconnect: globalThis.fetch.preconnect },
		),
	);
}

async function listenPlain(
	inspect: GatewayInspection,
	label: string,
): Promise<{ server: SMTPServer; port: number }> {
	const server = new SMTPServer({
		...inspect.baseOptions(null),
		secure: false,
	});
	inspect.listen(server, 0, label);
	await new Promise<void>((resolve) =>
		server.server.once("listening", resolve),
	);
	const address = server.server.address();
	if (!address || typeof address === "string") {
		throw new Error("Expected TCP listener address");
	}
	return { server, port: address.port };
}

async function openAuthenticated(
	port: number,
	sockets: Socket[],
	login = "sender@example.com",
): Promise<Socket> {
	const socket = createConnection({ host: "127.0.0.1", port });
	sockets.push(socket);
	expect(await socketResponse(socket)).toStartWith("220 ");
	expect(await smtpCommand(socket, "EHLO client.example.com")).toStartWith(
		"250-",
	);
	const credentials = Buffer.from(`\0${login}\0secret`).toString("base64");
	expect(await smtpCommand(socket, `AUTH PLAIN ${credentials}`)).toStartWith(
		"235 ",
	);
	expect(
		await smtpCommand(socket, "MAIL FROM:<sender@example.com>"),
	).toStartWith("250 ");
	expect(
		await smtpCommand(socket, "RCPT TO:<recipient@example.com>"),
	).toStartWith("250 ");
	return socket;
}

function closed(socket: Socket): Promise<void> {
	return new Promise((resolve) => {
		if (socket.destroyed) resolve();
		else socket.once("close", () => resolve());
	});
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

	it("caps TCP connections and closes stalled implicit TLS handshakes without crashing", async () => {
		const { gateway: instance, inspect } = gateway({
			maxConnections: 3,
			tlsHandshakeTimeoutMs: 20,
		});
		spyOn(console, "log").mockImplementation(() => {});
		const smtp = inspect.implicitTlsServer(testTls);
		const listener = smtp.server;
		inspect.listen(smtp, 0, "test implicit TLS");
		await new Promise<void>((resolve) => listener.once("listening", resolve));

		try {
			expect(listener.maxConnections).toBe(3);
			const address = listener.address();
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
		const smtp = inspect.implicitTlsServer(testTls);
		const listener = smtp.server;
		inspect.listen(smtp, 0, "healthy implicit TLS");
		await new Promise<void>((resolve) => listener.once("listening", resolve));

		try {
			const address = listener.address();
			if (!address || typeof address === "string") {
				throw new Error("Expected TCP listener address");
			}
			const socket = connectTls({
				host: "127.0.0.1",
				port: address.port,
				rejectUnauthorized: false,
			});
			try {
				expect(await socketResponse(socket)).toStartWith("220 ");
				expect(await smtpCommand(socket, "EHLO client.example.com")).toContain(
					"AUTH PLAIN LOGIN",
				);
				await new Promise<void>((resolve) => setTimeout(resolve, 300));
				expect(socket.destroyed).toBe(false);
				expect(await smtpCommand(socket, "NOOP")).toStartWith("250 ");
			} finally {
				socket.destroy();
			}
		} finally {
			await instance.stop();
		}
	});

	it("offers AUTH only after STARTTLS and requires a new EHLO on the TLS session", async () => {
		const { gateway: instance, inspect } = gateway({
			allowInsecureAuth: false,
			socketTimeoutMs: 2_000,
		});
		spyOn(console, "log").mockImplementation(() => {});
		spyOn(console, "error").mockImplementation(() => {});
		const smtp = new SMTPServer({
			...inspect.baseOptions(testTls),
			secure: false,
		});
		inspect.listen(smtp, 0, "STARTTLS");
		await new Promise<void>((resolve) =>
			smtp.server.once("listening", resolve),
		);

		try {
			const address = smtp.server.address();
			if (!address || typeof address === "string") {
				throw new Error("Expected TCP listener address");
			}
			const socket = createConnection({
				host: "127.0.0.1",
				port: address.port,
			});
			expect(await socketResponse(socket)).toStartWith("220 ");
			const plaintext = await smtpCommand(socket, "EHLO client.example.com");
			expect(plaintext).toContain("STARTTLS");
			expect(plaintext).not.toContain("AUTH");
			expect(plaintext).not.toContain("SMTPUTF8");
			expect(await smtpCommand(socket, "STARTTLS")).toStartWith("220 ");
			const secure = connectTls({ socket, rejectUnauthorized: false });
			try {
				await new Promise<void>((resolve, reject) => {
					secure.once("secureConnect", resolve);
					secure.once("error", reject);
				});
				expect(await smtpCommand(secure, "AUTH PLAIN")).toStartWith("503 ");
				const encrypted = await smtpCommand(secure, "EHLO secure.example.com");
				expect(encrypted).toContain("AUTH PLAIN LOGIN");
				expect(encrypted).not.toContain("STARTTLS");
			} finally {
				secure.destroy();
			}
		} finally {
			await instance.stop();
		}
	});
});

describe("SmtpGateway connection limits", () => {
	it("limits connections per address on the raw socket before the TLS handshake", async () => {
		const { gateway: instance, inspect } = gateway({
			maxConnectionsPerIp: 2,
			tlsHandshakeTimeoutMs: 5_000,
		});
		spyOn(console, "log").mockImplementation(() => {});
		const smtp = inspect.implicitTlsServer(testTls);
		inspect.listen(smtp, 0, "per-IP implicit TLS");
		await new Promise<void>((resolve) =>
			smtp.server.once("listening", resolve),
		);
		const sockets: Socket[] = [];

		try {
			const address = smtp.server.address();
			if (!address || typeof address === "string") {
				throw new Error("Expected TCP listener address");
			}
			const open = () => {
				const socket = createConnection({
					host: "127.0.0.1",
					port: address.port,
				});
				socket.on("error", () => {});
				sockets.push(socket);
				return socket;
			};
			const [first] = [open(), open()];
			await eventually(() => inspect.connectionsByIp.get("127.0.0.1") === 2);
			const rejected = open();
			await closed(rejected);
			expect(inspect.connectionsByIp.get("127.0.0.1")).toBe(2);

			first?.destroy();
			await eventually(() => inspect.connectionsByIp.get("127.0.0.1") === 1);
			const admitted = connectTls({
				host: "127.0.0.1",
				port: address.port,
				rejectUnauthorized: false,
			});
			sockets.push(admitted);
			expect(await socketResponse(admitted)).toStartWith("220 ");
		} finally {
			for (const socket of sockets) socket.destroy();
			await instance.stop();
		}
		await eventually(() => inspect.connectionsByIp.size === 0);
	});

	it("limits connections per address across the STARTTLS listener before the banner", async () => {
		const { gateway: instance, inspect } = gateway({
			allowInsecureAuth: true,
			maxConnectionsPerIp: 1,
		});
		spyOn(console, "log").mockImplementation(() => {});
		const { port } = await listenPlain(inspect, "per-IP STARTTLS");
		const sockets: Socket[] = [];

		try {
			const first = createConnection({ host: "127.0.0.1", port });
			sockets.push(first);
			expect(await socketResponse(first)).toStartWith("220 ");
			const second = createConnection({ host: "127.0.0.1", port });
			second.on("error", () => {});
			sockets.push(second);
			let received = "";
			second.on("data", (chunk: Buffer) => {
				received += chunk.toString();
			});
			await closed(second);
			expect(received).toBe("");
		} finally {
			for (const socket of sockets) socket.destroy();
			await instance.stop();
		}
	});

	it("releases per-address slots of sessions upgraded with STARTTLS", async () => {
		const { gateway: instance, inspect } = gateway({
			maxConnectionsPerIp: 1,
			socketTimeoutMs: 5_000,
		});
		spyOn(console, "log").mockImplementation(() => {});
		const smtp = new SMTPServer({
			...inspect.baseOptions(testTls),
			secure: false,
		});
		inspect.listen(smtp, 0, "STARTTLS release");
		await new Promise<void>((resolve) =>
			smtp.server.once("listening", resolve),
		);

		try {
			const address = smtp.server.address();
			if (!address || typeof address === "string") {
				throw new Error("Expected TCP listener address");
			}
			for (let attempt = 0; attempt < 3; attempt++) {
				const socket = createConnection({
					host: "127.0.0.1",
					port: address.port,
				});
				expect(await socketResponse(socket)).toStartWith("220 ");
				await smtpCommand(socket, "EHLO client.example.com");
				expect(await smtpCommand(socket, "STARTTLS")).toStartWith("220 ");
				const secure = connectTls({ socket, rejectUnauthorized: false });
				await new Promise<void>((resolve, reject) => {
					secure.once("secureConnect", resolve);
					secure.once("error", reject);
				});
				expect(
					await smtpCommand(secure, "EHLO secure.example.com"),
				).toStartWith("250-");
				secure.destroy();
				await eventually(() => inspect.connectionsByIp.size === 0);
			}
		} finally {
			await instance.stop();
		}
	});

	it("logs implicit TLS listener errors instead of crashing", async () => {
		const { gateway: instance, inspect } = gateway();
		spyOn(console, "log").mockImplementation(() => {});
		const errors = spyOn(console, "error").mockImplementation(() => {});
		const first = inspect.implicitTlsServer(testTls);
		inspect.listen(first, 0, "first implicit TLS");
		await new Promise<void>((resolve) =>
			first.server.once("listening", resolve),
		);

		try {
			const address = first.server.address();
			if (!address || typeof address === "string") {
				throw new Error("Expected TCP listener address");
			}
			const second = inspect.implicitTlsServer(testTls);
			inspect.listen(second, address.port, "conflicting implicit TLS");
			await eventually(() =>
				errors.mock.calls.some(([message]) =>
					String(message).includes("conflicting implicit TLS listener error"),
				),
			);
		} finally {
			await instance.stop();
		}
	});

	it("closes sessions that do not authenticate before the deadline", async () => {
		const { gateway: instance, inspect } = gateway({
			allowInsecureAuth: true,
			preAuthTimeoutMs: 150,
			socketTimeoutMs: 5_000,
		});
		spyOn(console, "log").mockImplementation(() => {});
		const { port } = await listenPlain(inspect, "pre-auth deadline");
		const socket = createConnection({ host: "127.0.0.1", port });

		try {
			expect(await socketResponse(socket)).toStartWith("220 ");
			expect(await smtpCommand(socket, "EHLO client.example.com")).toStartWith(
				"250-",
			);
			socket.write("AUTH PLA");
			expect(await socketResponse(socket)).toStartWith(
				"421 4.4.2 Authentication timeout",
			);
			await closed(socket);
			await eventually(() => inspect.sessionTimers.size === 0);
		} finally {
			socket.destroy();
			await instance.stop();
		}
	});

	it("keeps authenticated sessions past the pre-auth deadline but caps session lifetime", async () => {
		const { gateway: instance, inspect } = gateway({
			allowInsecureAuth: true,
			preAuthTimeoutMs: 100,
			maxSessionMs: 400,
			socketTimeoutMs: 5_000,
		});
		spyOn(console, "log").mockImplementation(() => {});
		mockApi();
		const { port } = await listenPlain(inspect, "session lifetime");
		const sockets: Socket[] = [];

		try {
			const socket = await openAuthenticated(port, sockets);
			await new Promise<void>((resolve) => setTimeout(resolve, 200));
			expect(await smtpCommand(socket, "NOOP")).toStartWith("250 ");
			expect(await socketResponse(socket)).toStartWith(
				"421 4.4.2 Maximum session duration",
			);
			await closed(socket);
		} finally {
			for (const socket of sockets) socket.destroy();
			await instance.stop();
		}
	});

	it("lets a message in flight finish before closing an expired session", async () => {
		const { gateway: instance, inspect } = gateway({
			allowInsecureAuth: true,
			maxSessionMs: 300,
			socketTimeoutMs: 5_000,
		});
		spyOn(console, "log").mockImplementation(() => {});
		let sendStarted = false;
		let finishSend: (() => void) | undefined;
		spyOn(globalThis, "fetch").mockImplementation(
			Object.assign(
				async (
					input: Parameters<typeof fetch>[0],
					options?: Parameters<typeof fetch>[1],
				) => {
					if (String(input).endsWith("/mailboxes/authenticate-smtp")) {
						const { loginAddress } = JSON.parse(String(options?.body));
						return Response.json({
							...identity,
							credentialId: `credential:${loginAddress}`,
						});
					}
					sendStarted = true;
					await new Promise<void>((resolve) => {
						finishSend = resolve;
					});
					return Response.json({ id: "message-id" });
				},
				{ preconnect: globalThis.fetch.preconnect },
			),
		);
		const { port } = await listenPlain(inspect, "session lifetime in DATA");
		const sockets: Socket[] = [];

		try {
			const socket = await openAuthenticated(port, sockets);
			expect(await smtpCommand(socket, "DATA")).toStartWith("354 ");
			let replies = "";
			socket.on("data", (chunk: Buffer) => {
				replies += chunk.toString();
			});
			socket.write(
				"From: sender@example.com\r\nTo: recipient@example.com\r\n\r\nHello\r\n.\r\n",
			);
			await eventually(() => sendStarted);
			await new Promise<void>((resolve) => setTimeout(resolve, 400));
			expect(replies).toBe("");
			expect(socket.destroyed).toBe(false);

			finishSend?.();
			await closed(socket);
			expect(replies).toMatch(
				/^250 .*Queued as message-id\r\n421 4\.4\.2 Maximum session duration/,
			);
		} finally {
			finishSend?.();
			for (const socket of sockets) socket.destroy();
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

	it("rejects PLAIN authorization identities other than the login", async () => {
		const { inspect } = gateway();
		const fetchMock = spyOn(globalThis, "fetch");

		await expect(
			inspect.handleAuth(
				{
					...authentication("sender@example.com", "secret"),
					authzid: "victim@example.com",
				} as SMTPServerAuthentication,
				session(),
			),
		).rejects.toMatchObject({ responseCode: 535 });
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("rejects read-only credentials without counting a failure", async () => {
		const { inspect } = gateway();
		spyOn(globalThis, "fetch").mockResolvedValue(
			Response.json({ ...identity, accessMode: "read" }),
		);

		await expect(
			inspect.handleAuth(
				authentication("sender@example.com", "secret"),
				session(),
			),
		).rejects.toMatchObject({
			responseCode: 535,
			message: "5.7.8 This credential is read-only",
		});
		expect(inspect.authFailures.size).toBe(0);
		expect(inspect.successfulAuth.size).toBe(0);
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

	it("evicts the oldest records instead of refusing unknown logins when the table is full", async () => {
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
		).rejects.toMatchObject({ responseCode: 535 });
		expect(inspect.authFailures.size).toBe(2);
		expect([...inspect.authFailures.keys()]).toEqual([
			"user:192.0.2.20\0unknown@example.com",
			"ip:192.0.2.20",
		]);

		spyOn(globalThis, "fetch").mockResolvedValue(Response.json(identity));
		await expect(
			inspect.handleAuth(
				authentication("fresh@example.com", "secret"),
				session({ remoteAddress: "192.0.2.30" }),
			),
		).resolves.toBeDefined();
	});

	it("drops expired failure records before evicting live ones", async () => {
		const { inspect } = gateway({
			authFailureLimit: 100,
			authFailureIpLimit: 100,
			authFailureWindowMs: 60_000,
			maxAuthFailureRecords: 4,
		});
		inspect.authFailures.set("user:192.0.2.1\0old@example.com", {
			count: 1,
			windowStart: Date.now() - 120_000,
		});
		inspect.authFailures.set("ip:192.0.2.1", {
			count: 1,
			windowStart: Date.now() - 120_000,
		});
		inspect.authFailures.set("user:192.0.2.2\0live@example.com", {
			count: 1,
			windowStart: Date.now(),
		});
		inspect.authFailures.set("ip:192.0.2.2", {
			count: 1,
			windowStart: Date.now(),
		});

		await expect(
			inspect.handleAuth(
				authentication("new@example.com", ""),
				session({ remoteAddress: "192.0.2.3" }),
			),
		).rejects.toMatchObject({ responseCode: 535 });
		expect(inspect.authFailures.has("user:192.0.2.2\0live@example.com")).toBe(
			true,
		);
		expect(inspect.authFailures.has("ip:192.0.2.1")).toBe(false);
		expect(inspect.authFailures.size).toBe(4);
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

	it("compares sender domains after the last @ in their ASCII form", async () => {
		const { inspect } = gateway();
		const options = inspect.baseOptions(null);
		const mailFrom = (senderIdentity: SmtpIdentity, address: string) =>
			new Promise<Error | null | undefined>((resolve) =>
				options.onMailFrom?.(
					{ address, args: {} },
					session({ user: { apiKey: "secret", identity: senderIdentity } }),
					resolve,
				),
			);
		const scoped: SmtpIdentity = {
			...identity,
			sendingMode: "scoped_domains",
			sendingAddress: null,
			allowedDomains: ["example.com", "xn--bcher-kva.example"],
		};
		const idnIdentity: SmtpIdentity = {
			...identity,
			sendingAddress: "Sender@XN--BCHER-KVA.example",
		};

		expect(await mailFrom(scoped, "news@bücher.example")).toBeUndefined();
		expect(
			await mailFrom(scoped, "news@XN--BCHER-KVA.EXAMPLE"),
		).toBeUndefined();
		expect(
			await mailFrom(idnIdentity, "sender@bücher.example"),
		).toBeUndefined();
		expect(
			await mailFrom(scoped, "attacker@example.com@evil.example"),
		).toMatchObject({ responseCode: 553 });
		expect(await mailFrom(scoped, "nobody@bucher.example")).toMatchObject({
			responseCode: 553,
		});
	});

	it("accepts header senders that mailparser decodes to Unicode IDN domains", async () => {
		const { inspect } = gateway();
		spyOn(console, "log").mockImplementation(() => {});
		const fetchMock = mockApi();
		const scoped: SmtpIdentity = {
			...identity,
			sendingMode: "scoped_domains",
			sendingAddress: null,
			allowedDomains: ["xn--bcher-kva.example"],
		};
		const active = session({
			user: { apiKey: "secret", identity: scoped },
			recipients: ["recipient@example.com"],
		});
		active.envelope.mailFrom = {
			address: "news@xn--bcher-kva.example",
			args: {},
		};

		await expect(
			inspect.handleData(
				dataStream(
					"From: news@xn--bcher-kva.example\r\nTo: recipient@example.com\r\n\r\nHello",
				),
				active,
			),
		).resolves.toBe("Queued as message-id");
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it("rejects unadvertised parameters and non-ASCII mailboxes", async () => {
		const { inspect } = gateway();
		const options = inspect.baseOptions(null);
		const authenticated = session({ user: { apiKey: "secret", identity } });
		const mailFrom = (address: string, args: Record<string, string | true>) =>
			new Promise<Error | null | undefined>((resolve) =>
				options.onMailFrom?.({ address, args }, authenticated, resolve),
			);
		const rcptTo = (address: string, args: Record<string, string | true>) =>
			new Promise<Error | null | undefined>((resolve) =>
				options.onRcptTo?.({ address, args }, authenticated, resolve),
			);

		expect(
			await mailFrom("sender@example.com", {
				SIZE: "100",
				BODY: "8BITMIME",
				AUTH: "<>",
			}),
		).toBeUndefined();
		expect(
			await mailFrom("sender@example.com", { SMTPUTF8: true }),
		).toMatchObject({ responseCode: 555 });
		expect(await mailFrom("sender@example.com", { SIZE: "abc" })).toMatchObject(
			{
				responseCode: 501,
			},
		);
		expect(await rcptTo("to@example.com", { NOTIFY: "NEVER" })).toMatchObject({
			responseCode: 555,
		});
		expect(await rcptTo("jös@example.com", {})).toMatchObject({
			responseCode: 553,
		});
		expect(await rcptTo("to@bücher.example", {})).toBeUndefined();
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

	it("relays S/MIME signed messages byte-for-byte and keeps plain messages on the JSON path", async () => {
		const { inspect } = gateway();
		spyOn(console, "log").mockImplementation(() => {});
		const fetchMock = spyOn(globalThis, "fetch").mockImplementation(
			Object.assign(async () => Response.json({ id: "message-id" }), {
				preconnect: globalThis.fetch.preconnect,
			}),
		);
		const signed = [
			"From: sender@example.com",
			"To: recipient@example.com",
			"Bcc: hidden@example.com",
			'Content-Type: multipart/signed; boundary="sig"; protocol="application/pkcs7-signature"; micalg=sha-256',
			"",
			"--sig",
			"Content-Type: text/plain",
			"",
			"Signed body  ",
			"--sig",
			"Content-Type: application/pkcs7-signature; name=smime.p7s",
			"Content-Transfer-Encoding: base64",
			"",
			"MIAGCSqGSIb3DQEHAqCAMIACAQExDzANBglghkgBZQMEAgEFADCABgkqhkiG9w0BBwEAAA==",
			"--sig--",
			"",
		].join("\r\n");
		const recipients = ["recipient@example.com", "hidden@example.com"];

		await inspect.handleData(
			dataStream(signed),
			session({ user: { apiKey: "secret", identity }, recipients }),
		);
		await inspect.handleData(
			dataStream(
				"From: sender@example.com\r\nTo: recipient@example.com\r\n\r\nHello",
			),
			session({
				user: { apiKey: "secret", identity },
				recipients: ["recipient@example.com"],
			}),
		);

		const [rawUrl, rawOptions] = fetchMock.mock.calls[0] ?? [];
		expect(rawUrl).toBe("https://example.com/api/e2/emails/raw");
		const rawBody = JSON.parse(String(rawOptions?.body));
		expect(Buffer.from(rawBody.raw, "base64").toString()).toBe(signed);
		expect(rawBody.recipients).toEqual(recipients);
		const [jsonUrl, jsonOptions] = fetchMock.mock.calls[1] ?? [];
		expect(jsonUrl).toBe("https://example.com/api/e2/emails");
		expect(JSON.parse(String(jsonOptions?.body)).text).toBe("Hello");
	});

	it("falls back to the JSON path when the API does not offer raw relay", async () => {
		const { inspect } = gateway();
		spyOn(console, "log").mockImplementation(() => {});
		const fetchMock = spyOn(globalThis, "fetch").mockImplementation(
			Object.assign(
				async (input: Parameters<typeof fetch>[0]) =>
					String(input).endsWith("/emails/raw")
						? new Response("Not Found", { status: 404 })
						: Response.json({ id: "fallback-id" }),
				{ preconnect: globalThis.fetch.preconnect },
			),
		);

		await expect(
			inspect.handleData(
				dataStream(
					[
						"From: sender@example.com",
						"To: recipient@example.com",
						'Content-Type: multipart/signed; boundary="sig"; protocol="application/pkcs7-signature"',
						"",
						"--sig",
						"Content-Type: text/plain",
						"",
						"Signed body",
						"--sig",
						"Content-Type: application/pkcs7-signature; name=smime.p7s",
						"",
						"AAAA",
						"--sig--",
					].join("\r\n"),
				),
				session({
					user: { apiKey: "secret", identity },
					recipients: ["recipient@example.com"],
				}),
			),
		).resolves.toBe("Queued as fallback-id");
		const fallback = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));
		expect(fallback.text.trim()).toBe("Signed body");
		expect(fallback.attachments).toBeUndefined();
		expect(
			new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get("Idempotency-Key"),
		).toBe(
			new Headers(fetchMock.mock.calls[1]?.[1]?.headers).get("Idempotency-Key"),
		);
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

		await expect(inspect.acquireDataSlot()).rejects.toMatchObject({
			responseCode: 451,
		});
		expect(inspect.activeData).toBe(1);
		releaseFirst();
		releaseFirst();
		const releaseSecond = await waiting;
		expect(inspect.activeData).toBe(1);
		releaseSecond();
		expect(inspect.activeData).toBe(0);
	});

	it("collects the message body before taking a processing slot", async () => {
		const { inspect } = gateway({ maxConcurrentData: 1, maxDataQueue: 1 });
		spyOn(console, "log").mockImplementation(() => {});
		mockApi();
		const held = await inspect.acquireDataSlot();
		const stream = new PassThrough() as SMTPServerDataStream;
		stream.sizeExceeded = false;
		const pending = inspect.handleData(
			stream,
			session({
				user: { apiKey: "secret", identity },
				recipients: ["recipient@example.com"],
			}),
		);
		stream.write("From: sender@example.com\r\nTo: recipient@example.com\r\n");
		await new Promise<void>((resolve) => setTimeout(resolve, 20));

		expect(inspect.activeData).toBe(1);
		expect(inspect.dataQueue).toHaveLength(0);
		expect(inspect.bufferedBytes).toBeGreaterThan(0);
		stream.end("\r\nHello");
		await eventually(() => inspect.dataQueue.length === 1);
		held();
		await expect(pending).resolves.toBe("Queued as message-id");
		expect(inspect.activeData).toBe(0);
		expect(inspect.bufferedBytes).toBe(0);
	});

	it("limits concurrent DATA per credential and per client address", async () => {
		const { inspect } = gateway({ maxDataPerCredential: 1, maxDataPerIp: 1 });
		spyOn(console, "log").mockImplementation(() => {});
		mockApi();
		const slow = new PassThrough() as SMTPServerDataStream;
		slow.sizeExceeded = false;
		const first = inspect.handleData(
			slow,
			session({
				user: { apiKey: "secret", identity },
				recipients: ["recipient@example.com"],
			}),
		);
		const message =
			"From: sender@example.com\r\nTo: recipient@example.com\r\n\r\nHello";

		await expect(
			inspect.handleData(
				dataStream(message),
				session({
					id: "same-credential",
					remoteAddress: "198.51.100.7",
					user: { apiKey: "secret", identity },
					recipients: ["recipient@example.com"],
				}),
			),
		).rejects.toMatchObject({ responseCode: 451 });
		await expect(
			inspect.handleData(
				dataStream(message),
				session({
					id: "same-address",
					user: {
						apiKey: "other",
						identity: { ...identity, credentialId: "other-credential" },
					},
					recipients: ["recipient@example.com"],
				}),
			),
		).rejects.toMatchObject({ responseCode: 451 });
		await expect(
			inspect.handleData(
				dataStream(message),
				session({
					id: "unrelated",
					remoteAddress: "198.51.100.8",
					user: {
						apiKey: "other",
						identity: { ...identity, credentialId: "other-credential" },
					},
					recipients: ["recipient@example.com"],
				}),
			),
		).resolves.toBe("Queued as message-id");

		slow.end(message);
		await expect(first).resolves.toBe("Queued as message-id");
		expect(inspect.dataByCredential.size).toBe(0);
		expect(inspect.dataByIp.size).toBe(0);
	});

	it("enforces an absolute DATA deadline against trickling clients", async () => {
		const { inspect } = gateway({ dataTimeoutMs: 50 });
		const stream = new PassThrough() as SMTPServerDataStream;
		stream.sizeExceeded = false;
		const trickle = setInterval(() => stream.write("X"), 5);

		try {
			await expect(
				inspect.handleData(
					stream,
					session({
						user: { apiKey: "secret", identity },
						recipients: ["recipient@example.com"],
					}),
				),
			).rejects.toMatchObject({
				responseCode: 451,
				message: expect.stringContaining("deadline"),
			});
		} finally {
			clearInterval(trickle);
		}
		expect(stream.destroyed).toBe(true);
		await eventually(
			() => inspect.dataByCredential.size === 0 && inspect.bufferedBytes === 0,
		);
		expect(inspect.activeData).toBe(0);
	});

	it("bounds memory held by bodies awaiting processing", async () => {
		const { inspect } = gateway({ maxBufferedBytes: 16 });
		const fetchMock = spyOn(globalThis, "fetch");

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
		expect(fetchMock).not.toHaveBeenCalled();
		expect(inspect.bufferedBytes).toBe(0);
	});

	it("rejects oversized messages permanently without buffering them", async () => {
		const { inspect } = gateway({ maxMessageBytes: 32 });

		await expect(
			inspect.handleData(
				dataStream(`From: sender@example.com\r\n\r\n${"x".repeat(100)}`),
				session({
					user: { apiKey: "secret", identity },
					recipients: ["recipient@example.com"],
				}),
			),
		).rejects.toMatchObject({ responseCode: 552 });
		expect(inspect.bufferedBytes).toBe(0);
	});

	it("rejects messages with too many MIME parts and keeps relaying afterwards", async () => {
		const { inspect } = gateway({ maxConcurrentData: 1, maxDataQueue: 0 });
		spyOn(console, "log").mockImplementation(() => {});
		const fetchMock = mockApi();
		const active = () =>
			session({
				user: { apiKey: "secret", identity },
				recipients: ["recipient@example.com"],
			});

		for (let attempt = 0; attempt < 3; attempt++) {
			await expect(
				inspect.handleData(dataStream(stallingMessage(1_001)), active()),
			).rejects.toMatchObject({ responseCode: 554 });
		}
		expect(fetchMock).not.toHaveBeenCalled();
		expect(inspect.activeData).toBe(0);
		await expect(
			inspect.handleData(
				dataStream(
					"From: sender@example.com\r\nTo: recipient@example.com\r\n\r\nHello",
				),
				active(),
			),
		).resolves.toBe("Queued as message-id");
	});

	it("releases the processing slot when parsing exceeds its deadline", async () => {
		const { inspect, config } = gateway({
			maxConcurrentData: 1,
			maxDataQueue: 0,
			parseTimeoutMs: 50,
		});
		spyOn(console, "log").mockImplementation(() => {});
		mockApi();
		const active = () =>
			session({
				user: { apiKey: "secret", identity },
				recipients: ["recipient@example.com"],
			});

		for (let attempt = 0; attempt < 2; attempt++) {
			await expect(
				inspect.handleData(dataStream(slowMessage()), active()),
			).rejects.toMatchObject({
				responseCode: 554,
				message: expect.stringContaining("parsed in time"),
			});
			expect(inspect.activeData).toBe(0);
			expect(inspect.activeParses).toBe(0);
		}
		// Worker start-up alone can exceed 50 ms on slow CI runners.
		config.parseTimeoutMs = 10_000;
		await expect(
			inspect.handleData(
				dataStream(
					"From: sender@example.com\r\nTo: recipient@example.com\r\n\r\nHello",
				),
				active(),
			),
		).resolves.toBe("Queued as message-id");
	});

	it("limits concurrent parses separately and drops canceled waiters", async () => {
		const { inspect } = gateway({ maxConcurrentParses: 1 });
		const releaseFirst = await inspect.acquireParseSlot(
			new AbortController().signal,
		);
		const canceled = new AbortController();
		const abandoned = inspect.acquireParseSlot(canceled.signal);
		const waiting = inspect.acquireParseSlot(new AbortController().signal);
		expect(inspect.parseQueue).toHaveLength(2);

		canceled.abort();
		await expect(abandoned).rejects.toMatchObject({ responseCode: 451 });
		expect(inspect.parseQueue).toHaveLength(1);
		releaseFirst();
		releaseFirst();
		const releaseSecond = await waiting;
		expect(inspect.activeParses).toBe(1);
		releaseSecond();
		expect(inspect.activeParses).toBe(0);
	});

	it("cancels queued messages when their SMTP session closes", async () => {
		const { inspect } = gateway({ maxConcurrentData: 1, maxDataQueue: 1 });
		const release = await inspect.acquireDataSlot();
		const stream = dataStream(
			"From: sender@example.com\r\nTo: recipient@example.com\r\n\r\nHello",
		);
		const active = session({
			user: { apiKey: "secret", identity },
			recipients: ["recipient@example.com"],
		});
		const options = inspect.baseOptions(null);
		const rejected = new Promise<Error | null | undefined>((resolve) => {
			options.onData?.(stream, active, resolve);
		});

		await eventually(() => inspect.dataQueue.length === 1);
		expect(inspect.sessionData.get(active.id)?.stream).toBe(stream);
		options.onClose?.(active, () => {});
		await expect(rejected).resolves.toMatchObject({ responseCode: 451 });
		expect(inspect.dataQueue).toHaveLength(0);
		expect(inspect.sessionData.size).toBe(0);
		expect(inspect.bufferedBytes).toBe(0);
		release();
		expect(inspect.activeData).toBe(0);
	});

	it("destroys DATA streams being collected when their SMTP session closes", async () => {
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
		stream.write("From: sender@example.com\r\n");
		await Promise.resolve();

		expect(inspect.activeData).toBe(0);
		expect(inspect.sessionData.get(active.id)?.stream).toBe(stream);
		options.onClose?.(active, () => {});
		await expect(rejected).resolves.toMatchObject({ responseCode: 451 });
		expect(stream.destroyed).toBe(true);
		expect(inspect.activeData).toBe(0);
		expect(inspect.sessionData.size).toBe(0);
		expect(inspect.dataByCredential.size).toBe(0);
		expect(inspect.bufferedBytes).toBe(0);
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
		await eventually(() => inspect.sessionData.size === 0);
		expect(result).toBe("Queued as completed-message");
		expect(inspect.activeData).toBe(0);
	});

	it("removes aborted queued waiters without leaking DATA slots", async () => {
		const { inspect } = gateway({ maxConcurrentData: 1, maxDataQueue: 2 });
		const release = await inspect.acquireDataSlot();
		const canceledController = new AbortController();
		const canceled = inspect.acquireDataSlot(canceledController.signal);
		const live = inspect.acquireDataSlot(new AbortController().signal);

		canceledController.abort();
		await expect(canceled).rejects.toMatchObject({ responseCode: 451 });
		expect(inspect.dataQueue).toHaveLength(1);
		release();
		const releaseLive = await live;
		expect(inspect.activeData).toBe(1);
		releaseLive();
		expect(inspect.activeData).toBe(0);
	});

	it("releases DATA claims when a stream closes during collection", async () => {
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
		expect(inspect.dataByCredential.size).toBe(0);
		expect(inspect.dataByIp.size).toBe(0);
	});

	it("rejects complete messages when the processing queue is full", async () => {
		const { inspect } = gateway({ maxConcurrentData: 1, maxDataQueue: 0 });
		const release = await inspect.acquireDataSlot();
		const stream = dataStream("From: sender@example.com\r\n\r\nHello");
		const ended = new Promise<void>((resolve) => stream.once("end", resolve));
		const active = session({
			user: { apiKey: "secret", identity },
			recipients: ["recipient@example.com"],
		});

		const rejected = await new Promise<Error | null | undefined>((resolve) => {
			inspect.baseOptions(null).onData?.(stream, active, resolve);
		});
		await ended;
		expect(rejected).toMatchObject({ responseCode: 451 });
		expect(inspect.bufferedBytes).toBe(0);
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

	it("releases queued and collecting DATA after real SMTP clients disconnect", async () => {
		const { gateway: instance, inspect } = gateway({
			allowInsecureAuth: true,
			maxConcurrentData: 1,
			maxDataQueue: 1,
			maxDataPerIp: 5,
			socketTimeoutMs: 2_000,
		});
		spyOn(console, "log").mockImplementation(() => {});
		spyOn(console, "error").mockImplementation(() => {});
		mockApi();
		const { port } = await listenPlain(inspect, "DATA disconnect integration");
		const sockets: Socket[] = [];
		const held = await inspect.acquireDataSlot();

		try {
			const queued = await openAuthenticated(
				port,
				sockets,
				"first@example.com",
			);
			const collecting = await openAuthenticated(
				port,
				sockets,
				"second@example.com",
			);
			expect(await smtpCommand(queued, "DATA")).toStartWith("354 ");
			queued.write(
				"From: first@example.com\r\nTo: recipient@example.com\r\n\r\nHello\r\n.\r\n",
			);
			expect(await smtpCommand(collecting, "DATA")).toStartWith("354 ");
			collecting.write("From: second@example.com\r\n");
			await eventually(
				() =>
					inspect.activeData === 1 &&
					inspect.dataQueue.length === 1 &&
					inspect.sessionData.size === 2,
			);

			queued.destroy();
			await eventually(
				() => inspect.dataQueue.length === 0 && inspect.sessionData.size === 1,
			);
			collecting.destroy();
			await eventually(
				() =>
					inspect.sessionData.size === 0 &&
					inspect.dataByCredential.size === 0 &&
					inspect.bufferedBytes === 0,
			);
			held();
			expect(inspect.activeData).toBe(0);
		} finally {
			held();
			for (const socket of sockets) socket.destroy();
			await instance.stop();
		}
	});

	it("answers a 1000-part message with 5xx over SMTP and relays the next message", async () => {
		const { gateway: instance, inspect } = gateway({
			allowInsecureAuth: true,
			socketTimeoutMs: 5_000,
		});
		spyOn(console, "log").mockImplementation(() => {});
		spyOn(console, "error").mockImplementation(() => {});
		const fetchMock = mockApi();
		const { port } = await listenPlain(inspect, "MIME part limit integration");
		const sockets: Socket[] = [];

		try {
			const client = await openAuthenticated(port, sockets);
			expect(await smtpCommand(client, "DATA")).toStartWith("354 ");
			const rejected = socketResponse(client);
			client.write(`${dotStuff(stallingMessage(1_001))}\r\n.\r\n`);
			expect(await rejected).toStartWith("554 ");

			expect(
				await smtpCommand(client, "MAIL FROM:<sender@example.com>"),
			).toStartWith("250 ");
			expect(
				await smtpCommand(client, "RCPT TO:<recipient@example.com>"),
			).toStartWith("250 ");
			expect(await smtpCommand(client, "DATA")).toStartWith("354 ");
			expect(
				await smtpCommand(
					client,
					"From: sender@example.com\r\nTo: recipient@example.com\r\n\r\nHello\r\n.",
				),
			).toStartWith("250 ");
			expect(
				fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/emails")),
			).toHaveLength(1);
			expect(inspect.activeData).toBe(0);
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
