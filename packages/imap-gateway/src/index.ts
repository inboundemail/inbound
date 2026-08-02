import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createSecureContext } from "node:tls";
import { ApiAuth } from "./auth.ts";
import { loadConfig } from "./config.ts";
import { MailStore } from "./db.ts";
import { buildHandlers } from "./handlers.ts";

const require = createRequire(import.meta.url);
const { IMAPServer } = require("../vendor/imap-core/index.js");

const config = loadConfig();
const store = new MailStore(config.databaseUrl);
const auth = new ApiAuth(config);
const handlers = buildHandlers(auth, store);

const tls =
	config.tlsKeyPath && config.tlsCertPath
		? {
				key: readFileSync(config.tlsKeyPath),
				cert: readFileSync(config.tlsCertPath),
			}
		: null;

if (!tls && !config.allowPlaintext) {
	throw new Error(
		"TLS cert/key required (or set IMAP_ALLOW_PLAINTEXT=true for local dev)",
	);
}

function startServer(secure: boolean, port: number) {
	const server = new IMAPServer({
		name: config.hostname,
		version: "0.1.0",
		secure,
		disableSTARTTLS: !tls,
		ignoreSTARTTLS: !tls,
		useProxy: false,
		maxConnections: config.maxConnections,
		...(tls ?? {}),
		...(tls
			? {
					SNICallback: (
						_servername: string,
						cb: (err: Error | null, ctx?: unknown) => void,
					) => cb(null, createSecureContext(tls)),
				}
			: {}),
	});

	server.logger = handlers.logger;
	server.notifier = handlers.notifier;
	server.onAuth = handlers.onAuth;
	server.onList = handlers.onList;
	server.onLsub = handlers.onLsub;
	server.onSubscribe = handlers.onSubscribe;
	server.onUnsubscribe = handlers.onUnsubscribe;
	server.onOpen = handlers.onOpen;
	server.onStatus = handlers.onStatus;
	server.onFetch = handlers.onFetch;
	server.onSearch = handlers.onSearch;
	server.onStore = handlers.onStore;
	server.onExpunge = handlers.onExpunge;

	server.on("error", (err: Error) => {
		console.error("[imap-gateway] server error", err);
	});

	server.listen(port, () => {
		console.log(
			`[imap-gateway] ${config.hostname} listening on :${port} (${secure ? "TLS" : "plaintext dev"})`,
		);
	});
	return server;
}

if (tls) startServer(true, config.securePort);
if (config.allowPlaintext) startServer(false, config.port);

process.on("SIGTERM", () => process.exit(0));
process.on("SIGINT", () => process.exit(0));
