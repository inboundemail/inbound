import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { ApiAuth } from "./auth.ts";
import { loadConfig } from "./config.ts";
import { MailStore } from "./db.ts";
import { buildHandlers } from "./handlers.ts";
import { ConnectionLimits } from "./limits.ts";
import { PgNotifier } from "./notifier.ts";

const require = createRequire(import.meta.url);
const { IMAPServer } = require("../vendor/imap-core/index.js");

const config = loadConfig();
const store = new MailStore(config.databaseUrl, {
	appendMaxBytesPerUser: config.appendMaxBytesPerUser,
	appendMaxMessagesPerUser: config.appendMaxMessagesPerUser,
});
const auth = new ApiAuth(config);
const limits = new ConnectionLimits(
	config.maxConnectionsPerIp,
	config.authFailureLimit,
	config.authFailureWindowMs,
);
const handlers = buildHandlers(auth, store, limits);
const notifier = new PgNotifier(
	config.databaseUrl.replace("-pooler", ""),
	store,
);
await notifier.start();
const orphanCleanup = setInterval(() => {
	store.cleanupOrphanedAppendedMessages().catch((err: Error) => {
		console.error("[imap-gateway] orphan cleanup failed", err.message);
	});
}, 60 * 60_000);
orphanCleanup.unref();
await store.cleanupOrphanedAppendedMessages();

function readTls() {
	return config.tlsKeyPath && config.tlsCertPath
		? {
				key: readFileSync(config.tlsKeyPath),
				cert: readFileSync(config.tlsCertPath),
				minVersion: "TLSv1.2" as const,
			}
		: null;
}

const tls = readTls();

if (!tls && !config.allowPlaintext) {
	throw new Error(
		"TLS cert/key required (or set IMAP_ALLOW_PLAINTEXT=true for local dev)",
	);
}

function startServer(secure: boolean, port: number) {
	const server = new IMAPServer({
		name: config.hostname,
		id: { name: "Inbound IMAP" },
		secure,
		disableSTARTTLS: !tls,
		ignoreSTARTTLS: !tls,
		useProxy: false,
		maxConnections: config.maxConnections,
		maxMessage: config.maxMessageBytes,
		...(tls ?? {}),
		SNICallback: (_servername: unknown, cb: (err: Error | null) => void) =>
			cb(null),
	});

	server.logger = handlers.logger;
	server.notifier = notifier;
	server.onConnect = (
		session: { remoteAddress?: string },
		callback: (err?: Error | null) => void,
	) => callback(limits.onConnect(session));
	server.onClose = (
		session: { remoteAddress?: string },
		callback: () => void,
	) => {
		limits.onClose(session);
		callback();
	};
	server.onAuth = handlers.onAuth;
	server.onList = handlers.onList;
	server.onLsub = handlers.onLsub;
	server.onSubscribe = handlers.onSubscribe;
	server.onUnsubscribe = handlers.onUnsubscribe;
	server.onOpen = handlers.onOpen;
	server.onStatus = handlers.onStatus;
	server.onCreate = handlers.onCreate;
	server.onRename = handlers.onRename;
	server.onDelete = handlers.onDelete;
	server.onAppend = handlers.onAppend;
	server.onCopy = handlers.onCopy;
	server.onMove = handlers.onMove;
	server.onFetch = handlers.onFetch;
	server.onSearch = handlers.onSearch;
	server.onStore = handlers.onStore;
	server.onExpunge = handlers.onExpunge;

	server.on("error", (err: Error) => {
		console.error("[imap-gateway] server error", err);
	});

	server.server.maxConnections = config.maxConnections;
	server.listen(port, () => {
		console.log(
			`[imap-gateway] ${config.hostname} listening on :${port} (${secure ? "TLS" : "plaintext dev"})`,
		);
	});
	return server;
}

const servers: Array<{
	close: (callback: () => void) => void;
	updateSecureContext: (options: object) => void;
}> = [];
if (tls) servers.push(startServer(true, config.securePort));
if (config.allowPlaintext) servers.push(startServer(false, config.port));

const tlsReload = setInterval(() => {
	try {
		const next = readTls();
		if (next) for (const server of servers) server.updateSecureContext(next);
	} catch (err) {
		console.error(
			"[imap-gateway] TLS certificate reload failed",
			(err as Error).message,
		);
	}
}, 12 * 60 * 60_000);
tlsReload.unref();

let shuttingDown = false;
function shutdown(): void {
	if (shuttingDown) return;
	shuttingDown = true;
	clearInterval(orphanCleanup);
	clearInterval(tlsReload);
	const shutdownTimeout = setTimeout(() => {
		console.error("[imap-gateway] graceful shutdown timed out");
		process.exit(1);
	}, 10_000);
	shutdownTimeout.unref();
	Promise.all([
		...servers.map(
			(server) => new Promise<void>((resolve) => server.close(resolve)),
		),
		notifier.stop(),
	])
		.then(() => store.end())
		.then(() => {
			clearTimeout(shutdownTimeout);
			process.exit(0);
		})
		.catch((err: Error) => {
			clearTimeout(shutdownTimeout);
			console.error("[imap-gateway] graceful shutdown failed", err.message);
			process.exit(1);
		});
}

process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);
