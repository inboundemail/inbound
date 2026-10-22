import { describe, expect, it } from "bun:test";
import { createRequire } from "node:module";
import net from "node:net";
import tls from "node:tls";

const require = createRequire(import.meta.url);

interface ProtocolResponse {
	response: string;
	code?: string;
	message?: string;
}

interface CommandModule {
	handler: (
		this: object,
		command: {
			command: string;
			attributes: Array<
				| { value: string; type?: string }
				| Array<{ value: string; type?: string }>
			>;
		},
		callback: (error: Error | null, response: ProtocolResponse) => void,
	) => void;
}

const tlsOptions = require("../vendor/imap-core/lib/tls-options.js") as (
	options?: object,
) => { minVersion: string; ciphers: string; honorCipherOrder: boolean };
const imapTools = require("../vendor/imap-core/lib/imap-tools.js") as {
	sendCapabilityResponse: (connection: object) => void;
	generateFolderListing: (
		folders: Array<{ path: string; flags: string[] }>,
	) => Array<{ path: string; flags: string[] }>;
	filterFolders: (
		folders: Array<{ path: string }>,
		query: string,
	) => Array<{ path: string }>;
	getQueryResponse: (
		query: unknown[],
		message: object,
		options?: object,
	) => unknown[];
};

function runCommand(name: string, commandName = name): ProtocolResponse {
	const command = require(
		`../vendor/imap-core/lib/commands/${name}.js`,
	) as CommandModule;
	let response: ProtocolResponse | undefined;
	command.handler.call(
		{
			_server: {
				options: {},
				onStore: () => undefined,
				onMove: () => undefined,
				onExpunge: () => undefined,
			},
			selected: { readOnly: true },
		},
		{ command: commandName, attributes: [{ value: "DEFLATE" }] },
		(_error, result) => {
			response = result;
		},
	);
	if (!response) throw new Error("Command did not produce a response");
	return response;
}

describe("IMAP protocol hardening", () => {
	it("requires TLS 1.2 by default", () => {
		expect(tlsOptions().minVersion).toBe("TLSv1.2");
	});

	it("uses AEAD forward-secret TLS 1.2 ciphers in server order", () => {
		const options = tlsOptions({ minVersion: "TLSv1.2" });
		expect(options.honorCipherOrder).toBe(true);
		const ciphers = options.ciphers.split(":");
		expect(ciphers[0]).toBe("ECDHE-ECDSA-AES128-GCM-SHA256");
		expect(ciphers.every((cipher) => /GCM|CHACHA20/.test(cipher))).toBe(true);
		expect(options.ciphers).not.toMatch(/CBC|SHA1|RC4|3DES|-SHA:/);
		const context = tls.createSecureContext(
			options as tls.SecureContextOptions,
		);
		expect(context).toBeDefined();
	});

	it.each([
		["store", "STORE"],
		["uid-store", "UID STORE"],
		["move", "MOVE"],
		["move", "UID MOVE"],
		["expunge", "EXPUNGE"],
		["uid-expunge", "UID EXPUNGE"],
	])("rejects %s on read-only mailboxes", (module, command) => {
		expect(runCommand(module, command)).toMatchObject({
			response: "NO",
			code: "READ-ONLY",
		});
	});

	it("rejects compression unless explicitly enabled", () => {
		expect(runCommand("compress", "COMPRESS")).toMatchObject({
			response: "NO",
			code: "CANNOT",
		});
	});

	it.each([
		"Not Authenticated",
		"Authenticated",
	])("advertises supported capabilities and the APPEND limit in %s state", (state) => {
		let response = "";
		imapTools.sendCapabilityResponse({
			secure: true,
			state,
			_server: { options: { maxMessage: 1024 * 1024 } },
			send: (value: string) => {
				response = value;
			},
		});
		expect(response).toContain("APPENDLIMIT=1048576");
		expect(response).not.toContain("CONDSTORE");
		expect(response).not.toContain("AUTH=PLAIN-CLIENTTOKEN");
		if (state === "Not Authenticated") {
			expect(response).toContain("AUTH=PLAIN");
		}
		expect(response).not.toContain("QUOTA");
		expect(response).not.toContain("COMPRESS=DEFLATE");
	});

	it("rejects direct PLAIN-CLIENTTOKEN handler invocation without logging secrets", () => {
		const authenticate =
			require("../vendor/imap-core/lib/commands/authenticate-plain.js") as CommandModule;
		const clientToken = "private-client-token";
		const encoded = Buffer.from(
			`\0user@example.com\0private-password\0${clientToken}`,
		).toString("base64");
		const logs: unknown[][] = [];
		let authCalled = false;
		let response: ProtocolResponse | undefined;
		authenticate.handler.call(
			{
				secure: true,
				_server: {
					options: {},
					onAuth: () => {
						authCalled = true;
					},
					logger: { info: (...values: unknown[]) => logs.push(values) },
				},
			},
			{
				command: "AUTHENTICATE PLAIN-CLIENTTOKEN",
				attributes: [{ value: encoded }],
			},
			(_error, result) => {
				response = result;
			},
		);

		expect(response).toMatchObject({ response: "BAD" });
		expect(authCalled).toBe(false);
		expect(JSON.stringify(logs)).not.toContain(clientToken);
		expect(JSON.stringify(logs)).not.toContain(encoded);
	});

	it("preserves AUTH PLAIN and useful logging without exposing credentials", () => {
		const authenticate =
			require("../vendor/imap-core/lib/commands/authenticate-plain.js") as CommandModule;
		const password = "private-password";
		const encoded = Buffer.from(`\0user@example.com\0${password}`).toString(
			"base64",
		);
		const logs: unknown[][] = [];
		const session: { user?: { id: string }; clientId?: object } = {};
		let credentials: Record<string, unknown> | undefined;
		let response: ProtocolResponse | undefined;
		authenticate.handler.call(
			{
				id: "connection",
				secure: true,
				state: "Not Authenticated",
				session,
				_server: {
					options: {},
					logger: { info: (...values: unknown[]) => logs.push(values) },
					onAuth: (
						input: Record<string, unknown>,
						_session: object,
						callback: (error: null, result: { user: { id: string } }) => void,
					) => {
						credentials = input;
						callback(null, { user: { id: "user" } });
					},
				},
				setUser: (user: { id: string }) => {
					session.user = user;
				},
				setupNotificationListener: () => undefined,
				send: () => undefined,
			},
			{ command: "AUTHENTICATE PLAIN", attributes: [{ value: encoded }] },
			(_error, result) => {
				response = result;
			},
		);

		expect(response).toMatchObject({ response: "OK" });
		expect(credentials).toMatchObject({
			method: "PLAIN",
			username: "user@example.com",
			password,
		});
		expect(credentials).not.toHaveProperty("clientToken");
		expect(logs[0]?.[0]).toMatchObject({
			username: "user@example.com",
			method: "PLAIN",
			action: "success",
		});
		expect(JSON.stringify(logs)).not.toContain(password);
		expect(JSON.stringify(logs)).not.toContain(encoded);
	});

	it("rejects unregistered CLIENTTOKEN commands without logging their payload", () => {
		const { IMAPCommand } =
			require("../vendor/imap-core/lib/imap-command.js") as {
				IMAPCommand: new (
					connection: object,
				) => {
					append: (
						command: { value: string; literal: boolean; expecting: number },
						callback: (error?: Error) => void,
					) => void;
				};
			};
		const clientToken = "private-client-token";
		const encoded = Buffer.from(
			`\0user@example.com\0private-password\0${clientToken}`,
		).toString("base64");
		const logs: Array<Record<string, unknown>> = [];
		const responses: string[] = [];
		const parser = new IMAPCommand({
			loggelf: (entry: Record<string, unknown>) => logs.push(entry),
			send: (value: string) => responses.push(value),
		});
		let error: Error | undefined;
		parser.append(
			{
				value: `A1 AUTHENTICATE PLAIN-CLIENTTOKEN ${encoded}`,
				literal: false,
				expecting: 0,
			},
			(result) => {
				error = result;
			},
		);

		expect(error).toBeInstanceOf(Error);
		expect(responses[0]).toContain("BAD Unknown command");
		expect(logs[0]).toMatchObject({
			_command: "AUTHENTICATE PLAIN-CLIENTTOKEN",
			_payload: false,
		});
		expect(JSON.stringify(logs)).not.toContain(clientToken);
		expect(JSON.stringify(logs)).not.toContain(encoded);
	});

	it("advertises the configured APPEND limit rather than a fixed default", () => {
		let response = "";
		imapTools.sendCapabilityResponse({
			secure: true,
			state: "Authenticated",
			_server: { options: { maxMessage: 512 } },
			send: (value: string) => {
				response = value;
			},
		});
		expect(response).toContain("APPENDLIMIT=512");
	});

	it("hides plaintext SASL mechanisms until STARTTLS has completed", () => {
		let response = "";
		imapTools.sendCapabilityResponse({
			secure: false,
			state: "Not Authenticated",
			_server: { options: {} },
			send: (value: string) => {
				response = value;
			},
		});
		expect(response).toContain("STARTTLS");
		expect(response).toContain("LOGINDISABLED");
		expect(response).not.toContain("AUTH=PLAIN");
		expect(response).not.toContain("SASL-IR");
	});

	it("rejects zero in sequence sets", () => {
		const tools = imapTools as unknown as {
			validateSequence: (range: string) => boolean;
		};
		expect(tools.validateSequence("1:*")).toBe(true);
		expect(tools.validateSequence("0")).toBe(false);
		expect(tools.validateSequence("0:*")).toBe(false);
		expect(tools.validateSequence("1,0")).toBe(false);
	});

	it("ignores ENABLE CONDSTORE while preserving ENABLE UTF8=ACCEPT", () => {
		const enable =
			require("../vendor/imap-core/lib/commands/enable.js") as CommandModule;
		const sent: string[] = [];
		const connection: {
			condstoreEnabled?: boolean;
			acceptUTF8Enabled?: boolean;
			send: (value: string) => void;
		} = {
			send: (value) => sent.push(value),
		};
		enable.handler.call(
			connection,
			{
				command: "ENABLE",
				attributes: [{ value: "CONDSTORE" }, { value: "UTF8=ACCEPT" }],
			},
			() => undefined,
		);

		expect(connection.condstoreEnabled).not.toBe(true);
		expect(connection.acceptUTF8Enabled).toBe(true);
		expect(sent).toEqual(["* ENABLED UTF8=ACCEPT"]);
	});

	it("preserves the selected mailbox path when CLOSE deselects before expunging", () => {
		const close =
			require("../vendor/imap-core/lib/commands/close.js") as CommandModule;
		const selected = { mailbox: "inbox", path: "INBOX", readOnly: false };
		const session: { selected: typeof selected | false } = { selected };
		let expunge: { mailbox?: string; path?: string; silent?: boolean } = {};
		close.handler.call(
			{
				selected,
				session,
				_server: {
					onExpunge: (
						mailbox: string,
						update: { path: string; silent: boolean },
						_session: object,
						callback: () => void,
					) => {
						expunge = { mailbox, ...update };
						callback();
					},
				},
			},
			{ command: "CLOSE", attributes: [] },
			() => undefined,
		);

		expect(session.selected).toBe(false);
		expect(expunge).toMatchObject({
			mailbox: "inbox",
			path: "INBOX",
			silent: true,
		});
	});

	it("rejects CONDSTORE selection and HIGHESTMODSEQ status requests", () => {
		const select =
			require("../vendor/imap-core/lib/commands/select.js") as CommandModule;
		let selectResponse: ProtocolResponse | undefined;
		select.handler.call(
			{},
			{
				command: "SELECT",
				attributes: [{ value: "INBOX" }, [{ value: "CONDSTORE" }]],
			},
			(_error, response) => {
				selectResponse = response;
			},
		);

		const status =
			require("../vendor/imap-core/lib/commands/status.js") as CommandModule;
		let statusResponse: ProtocolResponse | undefined;
		status.handler.call(
			{ _server: { onStatus: () => undefined } },
			{
				command: "STATUS",
				attributes: [{ value: "INBOX" }, [{ value: "HIGHESTMODSEQ" }]],
			},
			(_error, response) => {
				statusResponse = response;
			},
		);

		expect(selectResponse).toMatchObject({ response: "BAD" });
		expect(statusResponse).toMatchObject({ response: "BAD" });
	});

	it("rejects implicit CONDSTORE activation through STORE, FETCH, and SEARCH", () => {
		for (const [module, commandName] of [
			["store", "STORE"],
			["uid-store", "UID STORE"],
		] as const) {
			const command = require(
				`../vendor/imap-core/lib/commands/${module}.js`,
			) as CommandModule;
			let response: ProtocolResponse | undefined;
			command.handler.call(
				{
					_server: { onStore: () => undefined },
					selected: { readOnly: false, uidList: [1] },
				},
				{
					command: commandName,
					attributes: [
						{ value: "1" },
						[{ value: "UNCHANGEDSINCE" }, { value: "1" }],
						{ value: "+FLAGS" },
						[{ value: "\\Seen" }],
					],
				},
				(_error, result) => {
					response = result;
				},
			);
			expect(response).toMatchObject({ response: "BAD" });
		}

		const fetch =
			require("../vendor/imap-core/lib/commands/fetch.js") as CommandModule;
		for (const attributes of [
			[
				{ value: "1" },
				[{ value: "FLAGS", type: "ATOM" }],
				[{ value: "CHANGEDSINCE" }, { value: "1" }],
			],
			[{ value: "1" }, [{ value: "MODSEQ", type: "ATOM" }]],
		]) {
			let response: ProtocolResponse | undefined;
			fetch.handler.call(
				{
					_server: { onFetch: () => undefined },
					selected: { readOnly: false, uidList: [1] },
				},
				{ command: "FETCH", attributes },
				(_error, result) => {
					response = result;
				},
			);
			expect(response).toMatchObject({ response: "BAD" });
		}

		const search =
			require("../vendor/imap-core/lib/commands/search.js") as CommandModule;
		let searchResponse: ProtocolResponse | undefined;
		search.handler.call(
			{
				_server: { onSearch: () => undefined },
				selected: { uidList: [1] },
			},
			{
				command: "SEARCH",
				attributes: [{ value: "MODSEQ" }, { value: "1" }],
			},
			(_error, response) => {
				searchResponse = response;
			},
		);
		expect(searchResponse).toMatchObject({ response: "BAD" });
	});

	it("enforces configured APPEND limits smaller than the historical default", () => {
		const { IMAPCommand } =
			require("../vendor/imap-core/lib/imap-command.js") as {
				IMAPCommand: new (
					connection: object,
				) => {
					append: (
						command: { value: string; literal: boolean; expecting: number },
						callback: (error?: Error) => void,
					) => void;
				};
			};
		const responses: string[] = [];
		const parser = new IMAPCommand({
			_server: { options: { maxMessage: 512 } },
			logger: { debug: () => undefined },
			loggelf: () => undefined,
			send: (value: string) => responses.push(value),
		});
		let error: Error | undefined;
		parser.append(
			{ value: "A1 APPEND INBOX {513}", literal: true, expecting: 513 },
			(result) => {
				error = result;
			},
		);

		expect(error).toBeInstanceOf(Error);
		expect(responses[0]).toContain("maximum allowed is 512 bytes");
	});

	it("does not emit unsupported HIGHESTMODSEQ data during SELECT", () => {
		const select =
			require("../vendor/imap-core/lib/commands/select.js") as CommandModule;
		const responses: string[] = [];
		select.handler.call(
			{
				_server: {
					onOpen: (
						_path: string,
						_session: object,
						callback: (error: null, mailbox: object) => void,
					) => {
						callback(null, {
							_id: "inbox",
							uidList: [1],
							uidValidity: 1,
							uidNext: 2,
							modifyIndex: 1,
							flags: [],
							readOnly: false,
						});
					},
				},
				session: { user: { id: "user" }, commandCounters: { SELECT: 0 } },
				send: (response: string | Buffer) => {
					responses.push(response.toString());
				},
			},
			{ command: "SELECT", attributes: [{ value: "INBOX" }] },
			() => undefined,
		);
		expect(responses.join("\n")).not.toContain("HIGHESTMODSEQ");
	});

	it("preserves folder flags provided by backend handlers", () => {
		const folders = imapTools.generateFolderListing([
			{ path: "Scopes", flags: ["\\Noselect", "\\HasChildren"] },
			{ path: "Scopes/user@example.com", flags: ["\\NoInferiors"] },
		]);
		expect(folders.find((folder) => folder.path === "Scopes")?.flags).toContain(
			"\\Noselect",
		);
		expect(
			folders.find((folder) => folder.path === "Scopes/user@example.com")
				?.flags,
		).toContain("\\NoInferiors");
	});
});

const folders = [
	"INBOX",
	"Archive",
	"Archive/2024",
	"Archive/2024/Q1",
	"Scopes",
	"Scopes/*@example.com",
	"Sent",
].map((path) => ({ path }));

function listPaths(query: string): string[] {
	return imapTools.filterFolders(folders, query).map((folder) => folder.path);
}

describe("LIST pattern matching", () => {
	it("matches * across and % within hierarchy levels", () => {
		expect(listPaths("*")).toEqual(folders.map((folder) => folder.path));
		expect(listPaths("%")).toEqual(["INBOX", "Archive", "Scopes", "Sent"]);
		expect(listPaths("Archive/%")).toEqual(["Archive/2024"]);
		expect(listPaths("Archive/*")).toEqual(["Archive/2024", "Archive/2024/Q1"]);
		expect(listPaths("%/%")).toEqual(["Archive/2024", "Scopes/*@example.com"]);
		expect(listPaths("*/Q1")).toEqual(["Archive/2024/Q1"]);
		expect(listPaths("A%")).toEqual(["Archive"]);
		expect(listPaths("%*%")).toEqual(folders.map((folder) => folder.path));
		expect(listPaths("INBOX")).toEqual(["INBOX"]);
		expect(listPaths("inbox")).toEqual([]);
		expect(listPaths("Scopes/*@example.com")).toEqual(["Scopes/*@example.com"]);
		expect(listPaths("Arch(ive|x)")).toEqual([]);
		expect(listPaths("S.nt")).toEqual([]);
		expect(listPaths("")).toEqual([]);
	});

	it("completes adversarial patterns in linear time", () => {
		const long = Array.from({ length: 50 }, (_, index) => ({
			path: `${"a/".repeat(60)}${"x".repeat(120)}${index}`,
		}));
		const patterns = [
			"*%*%*%*%*%*%*%*%Q",
			`${"*%".repeat(120)}Q`,
			`${"%a".repeat(120)}Q`,
			`${"*a".repeat(120)}Q`,
		];
		const started = performance.now();
		for (const pattern of patterns) {
			expect(imapTools.filterFolders(long, pattern)).toEqual([]);
		}
		expect(performance.now() - started).toBeLessThan(500);
	});

	it("returns BAD for LIST and LSUB patterns longer than 255 characters", () => {
		for (const name of ["list", "lsub"]) {
			const command = require(
				`../vendor/imap-core/lib/commands/${name}.js`,
			) as CommandModule;
			let response: ProtocolResponse | undefined;
			let backendCalled = false;
			command.handler.call(
				{
					_server: {
						onList: () => {
							backendCalled = true;
						},
						onLsub: () => {
							backendCalled = true;
						},
					},
					session: { user: { id: "user" } },
					send: () => undefined,
				},
				{
					command: name.toUpperCase(),
					attributes: [{ value: "" }, { value: "*".repeat(256) }],
				},
				(_error, result) => {
					response = result;
				},
			);
			expect(response).toMatchObject({ response: "BAD" });
			expect(backendCalled).toBe(false);
		}
	});
});

describe("FETCH raw content", () => {
	const raw = Buffer.from(
		"Subject: =?UTF-8?Q?h=C3=A9?=\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nbody é\r\n",
	);

	it("serves BODY[], partial BODY[] and RFC822 straight from the stored bytes", () => {
		const values = imapTools.getQueryResponse(
			[
				{ item: "body", path: "", type: "content", original: {} },
				{
					item: "body",
					path: "",
					type: "content",
					partial: { startFrom: 2, maxLength: 5 },
					original: { partial: [2, 5] },
				},
				{ item: "rfc822", original: {} },
				{ item: "rfc822.text", original: {} },
			],
			{ raw, size: raw.length },
		);
		expect(values[0]).toBe(raw);
		expect((values[1] as Buffer).toString()).toBe(raw.subarray(2, 7).toString());
		expect(values[2]).toBe(raw);
		expect((values[3] as Buffer).toString()).toBe("body é\r\n");
	});

	it("announces literal lengths in bytes for multi-byte content", async () => {
		const { imapHandler } = require("../vendor/imap-core/index.js") as {
			imapHandler: {
				compileStream: (response: object) => NodeJS.ReadableStream;
			};
		};
		const stream = imapHandler.compileStream({
			tag: "*",
			command: "1",
			attributes: [
				{ type: "ATOM", value: "FETCH" },
				[
					{ type: "ATOM", value: "BODY", section: [] },
					{ type: "LITERAL", value: raw },
				],
			],
		});
		const chunks: Buffer[] = [];
		for await (const chunk of stream) chunks.push(Buffer.from(chunk));
		const output = Buffer.concat(chunks);
		expect(output.toString("latin1")).toContain(`{${raw.length}}\r\n`);
		expect(output.includes(raw)).toBe(true);
	});

	it("still parses MIME for section fetches", () => {
		const [header] = imapTools.getQueryResponse(
			[{ item: "body", path: "", type: "header", original: {} }],
			{ raw },
		);
		expect(String(header)).toContain("Subject:");
		expect(String(header)).not.toContain("body");
	});
});

describe("STARTTLS parser reset", () => {
	it("drops buffered plaintext so it is never prepended to encrypted commands", async () => {
		const { IMAPStream } = require("../vendor/imap-core/lib/imap-stream.js") as {
			IMAPStream: new () => {
				oncommand: (command: { value: string }, done: () => void) => void;
				write: (chunk: Buffer, done: () => void) => void;
				reset: () => void;
			};
		};
		const parser = new IMAPStream();
		const lines: string[] = [];
		parser.oncommand = (command, done) => {
			lines.push(command.value);
			done();
		};
		await new Promise<void>((resolve) =>
			parser.write(Buffer.from("A1 STARTTLS\r\nA2 LOG"), resolve),
		);
		await Bun.sleep(5);
		parser.reset();
		await new Promise<void>((resolve) =>
			parser.write(Buffer.from("A3 NOOP\r\n"), resolve),
		);
		await Bun.sleep(5);
		expect(lines).toEqual(["A1 STARTTLS", "A3 NOOP"]);
	});
});

describe("connection admission", () => {
	const { IMAPServer } = require("../vendor/imap-core/index.js") as {
		IMAPServer: new (
			options: object,
		) => {
			listen: (port: number, host: string, callback: () => void) => void;
			close: (callback: () => void) => void;
			server: net.Server;
			logger: object;
		};
	};

	async function startServer(options: object) {
		const server = new IMAPServer({
			secure: false,
			disableSTARTTLS: true,
			ignoreSTARTTLS: true,
			...options,
		});
		server.logger = {
			info: () => undefined,
			debug: () => undefined,
			error: () => undefined,
		};
		await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
		const address = server.server.address() as net.AddressInfo;
		return { server, port: address.port };
	}

	function connect(port: number) {
		const socket = net.connect(port, "127.0.0.1");
		let data = "";
		socket.on("data", (chunk) => {
			data += chunk.toString();
		});
		socket.on("error", () => undefined);
		const closed = new Promise<void>((resolve) => socket.once("close", () => resolve()));
		return { socket, closed, output: () => data };
	}

	it("drops connections over the per-IP cap at TCP accept, before any processing", async () => {
		const { ConnectionLimits } = await import("./limits.ts");
		const limits = new ConnectionLimits(2, 10, 60_000);
		const { server, port } = await startServer({
			onSocket: (socket: net.Socket) => limits.acceptSocket(socket),
		});
		const first = connect(port);
		const second = connect(port);
		await Bun.sleep(50);
		const third = connect(port);
		await third.closed;
		expect(third.output()).toBe("");
		expect(limits.openConnections("127.0.0.1")).toBe(2);
		first.socket.destroy();
		await first.closed;
		await Bun.sleep(20);
		expect(limits.openConnections("127.0.0.1")).toBe(1);
		second.socket.destroy();
		await new Promise<void>((resolve) => server.close(resolve));
	});

	it("releases the per-IP slot of connections closed after STARTTLS", async () => {
		const { ConnectionLimits } = await import("./limits.ts");
		const limits = new ConnectionLimits(2, 10, 60_000);
		const { server, port } = await startServer({
			disableSTARTTLS: false,
			ignoreSTARTTLS: false,
			onSocket: (socket: net.Socket) => limits.acceptSocket(socket),
			onClose: (session: { socket?: object }, callback: () => void) => {
				limits.releaseSocket(session.socket);
				callback();
			},
		});
		const client = connect(port);
		await Bun.sleep(50);
		client.socket.write("A1 STARTTLS\r\n");
		const deadline = Date.now() + 1_000;
		while (!client.output().includes("A1 OK") && Date.now() < deadline) {
			await Bun.sleep(5);
		}
		expect(client.output()).toContain("A1 OK");
		await Bun.sleep(20);
		expect(limits.openConnections("127.0.0.1")).toBe(1);
		client.socket.destroy();
		await client.closed;
		await Bun.sleep(50);
		expect(limits.openConnections("127.0.0.1")).toBe(0);
		await new Promise<void>((resolve) => server.close(resolve));
	});

	it("closes unauthenticated connections at an absolute deadline despite traffic", async () => {
		const { server, port } = await startServer({ authTimeout: 300 });
		const client = connect(port);
		const keepAlive = setInterval(() => client.socket.write("a NOOP\r\n"), 50);
		const started = Date.now();
		await client.closed;
		clearInterval(keepAlive);
		expect(Date.now() - started).toBeLessThan(2_000);
		expect(client.output()).toContain("* BYE Authentication timeout");
		await new Promise<void>((resolve) => server.close(resolve));
	});
});
