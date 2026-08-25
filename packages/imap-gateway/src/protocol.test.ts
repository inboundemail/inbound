import { describe, expect, it } from "bun:test";
import { createRequire } from "node:module";

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
) => { minVersion: string };
const imapTools = require("../vendor/imap-core/lib/imap-tools.js") as {
	sendCapabilityResponse: (connection: object) => void;
	generateFolderListing: (
		folders: Array<{ path: string; flags: string[] }>,
	) => Array<{ path: string; flags: string[] }>;
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
