import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import type { Server, Socket } from "node:net";
import { createServer as createTlsServer } from "node:tls";
import { domainToASCII } from "node:url";
import {
	SMTPServer,
	type SMTPServerAddress,
	type SMTPServerAuthentication,
	type SMTPServerAuthenticationResponse,
	type SMTPServerDataStream,
	type SMTPServerOptions,
	type SMTPServerSession,
} from "smtp-server";
import {
	InboundApiClient,
	type SmtpIdentity,
	SmtpRelayError,
} from "./api-client.ts";
import type { GatewayConfig } from "./config.ts";
import { clientIp, logEvent, shortHash } from "./log.ts";
import { idempotencyKeyFor, mapRawMessageInWorker } from "./mapper.ts";

interface ConnectionInternals {
	secure: boolean;
	hostNameAppearsAs: string | false;
	openingCommand: string | false;
	_server: { options: { allowInsecureAuth?: boolean; authMethods: string[] } };
	_resetSession(): void;
}
type Handler = (this: ConnectionInternals, ...args: unknown[]) => void;
const connectionPrototype: Record<string, Handler> = createRequire(
	import.meta.url,
)("smtp-server/lib/smtp-connection.js").SMTPConnection.prototype;

// smtp-server offers AUTH before STARTTLS even when it will refuse it (538), inviting clients to
// send AUTH PLAIN credentials in cleartext. Hide it until TLS unless insecure auth is allowed.
const handleEhlo = connectionPrototype.handler_EHLO;
connectionPrototype.handler_EHLO = function (command, callback) {
	const options = this._server.options;
	if (this.secure || options.allowInsecureAuth) {
		return handleEhlo.call(this, command, callback);
	}
	const authMethods = options.authMethods;
	const restore = () => {
		options.authMethods = authMethods;
	};
	options.authMethods = [];
	try {
		handleEhlo.call(this, command, () => {
			restore();
			(callback as () => void)();
		});
	} finally {
		restore();
	}
};

// RFC 3207 4.2: after STARTTLS, discard the pre-TLS EHLO so the client must greet again.
const upgrade = connectionPrototype.upgrade;
connectionPrototype.upgrade = function (callback, secureCallback) {
	return upgrade.call(this, callback, () => {
		this.hostNameAppearsAs = false;
		this.openingCommand = false;
		this._resetSession();
		if (typeof secureCallback === "function") secureCallback();
	});
};

type TlsOptions = { key: Buffer; cert: Buffer; minVersion: "TLSv1.2" };

interface AuthenticatedUser {
	apiKey: string;
	identity: SmtpIdentity;
}

interface FailureRecord {
	count: number;
	windowStart: number;
}

interface DataQueueEntry {
	signal?: AbortSignal;
	resolve: (release: () => void) => void;
	reject: (error: SmtpRelayError) => void;
	cancel: () => void;
	cleanup: () => void;
	canceled: boolean;
}

interface SessionData {
	stream: SMTPServerDataStream;
	controller: AbortController;
}

interface SessionState {
	preAuth?: ReturnType<typeof setTimeout>;
	lifetime: ReturnType<typeof setTimeout>;
	releaseConnection?: () => void;
	expired?: boolean;
}

interface ByteBudget {
	reserve(bytes: number): boolean;
	release(): void;
}

interface SmtpConnectionHandle {
	id: string;
	_socket: Socket;
	send(code: number, message: string): void;
	close(): void;
}

export class SmtpGateway {
	private config: GatewayConfig;
	private client: InboundApiClient;
	private authFailures = new Map<string, FailureRecord>();
	private successfulAuth = new Map<string, number>();
	private connectionsByIp = new Map<string, number>();
	private connectionReleases = new WeakMap<Socket, () => void>();
	private sessionData = new Map<string, SessionData>();
	private sessionTimers = new Map<string, SessionState>();
	private dataByCredential = new Map<string, number>();
	private dataByIp = new Map<string, number>();
	private bufferedBytes = 0;
	private servers: SMTPServer[] = [];
	private activeData = 0;
	private dataQueue: DataQueueEntry[] = [];
	private activeParses = 0;
	private parseQueue: Array<() => void> = [];

	constructor(config: GatewayConfig) {
		this.config = config;
		this.client = new InboundApiClient(config);
	}

	start(): void {
		const tls = this.tlsOptions();
		if (this.config.starttlsPort === 0 && this.config.implicitTlsPort === 0) {
			throw new Error("No listeners configured");
		}
		if (!tls && !this.config.allowInsecureAuth) {
			throw new Error(
				"SMTP_TLS_KEY_PATH and SMTP_TLS_CERT_PATH are required unless SMTP_ALLOW_INSECURE_AUTH=true",
			);
		}
		if (this.config.implicitTlsPort > 0 && !tls) {
			throw new Error(
				"SMTP_TLS_KEY_PATH and SMTP_TLS_CERT_PATH are required for the implicit TLS listener (set SMTP_IMPLICIT_TLS_PORT=0 to disable)",
			);
		}
		if (this.config.starttlsPort > 0) {
			const smtp = new SMTPServer({ ...this.baseOptions(tls), secure: false });
			smtp.server.on("connection", destroyAfterEnd);
			this.listen(smtp, this.config.starttlsPort, "STARTTLS");
		}
		if (tls && this.config.implicitTlsPort > 0) {
			this.listen(
				this.implicitTlsServer(tls),
				this.config.implicitTlsPort,
				"implicit TLS",
			);
		}
	}

	async stop(): Promise<void> {
		await Promise.all(
			this.servers.map(
				(server) =>
					new Promise<void>((resolve) => {
						server.close(() => resolve());
					}),
			),
		);
	}

	private tlsOptions(): TlsOptions | null {
		if (Boolean(this.config.tlsKeyPath) !== Boolean(this.config.tlsCertPath)) {
			throw new Error(
				"SMTP_TLS_KEY_PATH and SMTP_TLS_CERT_PATH must both be configured",
			);
		}
		if (!this.config.tlsKeyPath || !this.config.tlsCertPath) return null;
		return {
			key: readFileSync(this.config.tlsKeyPath),
			cert: readFileSync(this.config.tlsCertPath),
			minVersion: "TLSv1.2",
		};
	}

	private baseOptions(tls: TlsOptions | null): SMTPServerOptions {
		return {
			name: this.config.hostname,
			banner: "inbound SMTP gateway",
			size: this.config.maxMessageBytes,
			authMethods: ["PLAIN", "LOGIN"],
			allowInsecureAuth: this.config.allowInsecureAuth,
			disabledCommands: tls ? [] : ["STARTTLS"],
			// Addresses are relayed to SES, which does not support SMTPUTF8 (RFC 6531).
			hideSMTPUTF8: true,
			disableReverseLookup: true,
			socketTimeout: this.config.socketTimeoutMs,
			maxClients: this.config.maxConnections,
			...(tls ?? {}),
			onConnect: (session, callback) => {
				logEvent("connect", {
					ip: clientIp(session.remoteAddress),
					tls: session.secure ? 1 : 0,
				});
				this.startSessionTimers(session.id);
				callback();
			},
			onSecure: (socket, _session, callback) => {
				destroyAfterEnd(socket);
				callback();
			},
			onAuth: (auth, session, callback) => {
				const ip = clientIp(session.remoteAddress);
				this.handleAuth(auth, session)
					.then((response) => {
						const user = response.user as AuthenticatedUser;
						logEvent("auth", {
							result: "ok",
							ip,
							cred: shortHash(user.identity.credentialId),
						});
						callback(null, response);
					})
					.catch((error: unknown) => {
						const smtpError = toSmtpError(error);
						logEvent("auth", {
							result: authResult(smtpError.responseCode),
							ip,
							code: smtpError.responseCode,
						});
						callback(smtpError);
					});
			},
			onMailFrom: (address, session, callback) => {
				try {
					const user = session.user as AuthenticatedUser | undefined;
					if (!user?.identity) {
						throw new SmtpRelayError({
							responseCode: 530,
							message: "5.7.0 Authentication required",
						});
					}
					assertSupportedParameters(address, ["SIZE", "BODY", "AUTH"]);
					if (address.address) {
						assertAsciiAddress(address.address);
						this.assertSenderAllowed(user.identity, address.address);
					}
					callback();
				} catch (error: unknown) {
					callback(toSmtpError(error));
				}
			},
			onRcptTo: (address, session, callback) => {
				try {
					assertSupportedParameters(address, []);
					assertAsciiAddress(address.address);
				} catch (error: unknown) {
					callback(toSmtpError(error));
					return;
				}
				const duplicate = session.envelope.rcptTo.some(
					(recipient) =>
						recipient.address.toLowerCase() === address.address.toLowerCase(),
				);
				if (
					!duplicate &&
					session.envelope.rcptTo.length >=
						Math.min(this.config.maxRecipients, 50)
				) {
					callback(smtpError(452, "4.5.3 Too many recipients"));
					return;
				}
				callback();
			},
			onData: (stream, session, callback) => {
				const startedAt = Date.now();
				const entry: SessionData = {
					stream,
					controller: new AbortController(),
				};
				this.sessionData.set(session.id, entry);
				this.handleData(stream, session, entry.controller.signal)
					.then((message) => {
						logEvent("data", {
							result: "ok",
							ms: Date.now() - startedAt,
							rcpt: session.envelope.rcptTo.length,
						});
						callback(null, message);
					})
					.catch((error: unknown) => {
						if (!stream.destroyed && !stream.readableEnded) {
							this.drainRejectedData(stream, session.id, startedAt);
						}
						const smtpError = toSmtpError(error);
						logEvent("data", {
							result: "fail",
							code: smtpError.responseCode,
							ms: Date.now() - startedAt,
						});
						callback(smtpError);
					})
					.finally(() => {
						if (this.sessionData.get(session.id) === entry) {
							this.sessionData.delete(session.id);
						}
						if (this.sessionTimers.get(session.id)?.expired) {
							this.closeExpiredSession(session.id);
						}
					});
			},
			onClose: (session, callback) => {
				const state = this.sessionTimers.get(session.id);
				if (state) {
					this.sessionTimers.delete(session.id);
					clearTimeout(state.preAuth);
					clearTimeout(state.lifetime);
					state.releaseConnection?.();
				}
				const entry = this.sessionData.get(session.id);
				if (entry) {
					this.sessionData.delete(session.id);
					entry.controller.abort();
					entry.stream.destroy();
				}
				callback?.();
			},
		};
	}

	// smtp-server's own implicit TLS has no handshake deadline, and destroying the raw socket it
	// wraps crashes Node. Terminate TLS in a tls.Server, which enforces handshakeTimeout itself,
	// and hand secured sockets to smtp-server.
	private implicitTlsServer(tls: TlsOptions): SMTPServer {
		const smtp = new SMTPServer({
			...this.baseOptions(tls),
			secure: true,
			secured: true,
		});
		const accept = smtp.server;
		smtp.server = createTlsServer(
			{ ...tls, handshakeTimeout: this.config.tlsHandshakeTimeoutMs },
			(socket) => {
				destroyAfterEnd(socket);
				accept.emit("connection", socket);
			},
		)
			.on("tlsClientError", (error: Error & { code?: string }, socket) => {
				logEvent("tls_fail", {
					ip: clientIp(socket.remoteAddress),
					code: error.code ?? "-",
				});
				socket.destroy();
			})
			.on("error", (error) => smtp.emit("error", error));
		return smtp;
	}

	// Per-address limits must apply before the TLS handshake and before smtp-server allocates a
	// connection, so they are enforced on the raw TCP socket of every listener.
	private gateConnections(server: Server): void {
		const listeners = server.listeners("connection") as Array<
			(this: Server, socket: Socket) => void
		>;
		server.removeAllListeners("connection");
		server.on("connection", (socket: Socket) => {
			if (!this.admitSocket(socket)) {
				logEvent("conn_limit", { ip: clientIp(socket.remoteAddress) });
				socket.destroy();
				return;
			}
			for (const listener of listeners) listener.call(server, socket);
		});
	}

	private admitSocket(socket: Socket): boolean {
		const ip = socket.remoteAddress?.replace(
			/^::ffff:(?=\d+\.\d+\.\d+\.\d+$)/i,
			"",
		);
		if (!ip) return false;
		const count = this.connectionsByIp.get(ip) ?? 0;
		if (count >= this.config.maxConnectionsPerIp) return false;
		this.connectionsByIp.set(ip, count + 1);
		const release = once(() => decrement(this.connectionsByIp, ip));
		// After STARTTLS the TLS socket owns the handle and Node never emits "close" on the
		// raw socket, so the SMTP session's onClose releases the count as well.
		socket.once("close", release);
		this.connectionReleases.set(socket, release);
		return true;
	}

	private drainRejectedData(
		stream: SMTPServerDataStream,
		sessionId: string,
		startedAt: number,
	): void {
		const timer = setTimeout(
			() => {
				this.closeSession(
					sessionId,
					451,
					"4.4.2 Message transfer deadline exceeded",
				);
				stream.destroy();
			},
			Math.max(0, startedAt + this.config.dataTimeoutMs - Date.now()),
		);
		timer.unref();
		stream.once("close", () => clearTimeout(timer));
		stream.once("end", () => clearTimeout(timer));
		stream.resume();
	}

	private startSessionTimers(sessionId: string): void {
		const preAuth = setTimeout(() => {
			this.closeSession(
				sessionId,
				421,
				"4.4.2 Authentication timeout, closing connection",
			);
		}, this.config.preAuthTimeoutMs);
		// A message in flight (bounded by SMTP_DATA_TIMEOUT_MS) gets its reply first; onData closes
		// the session once it completes.
		const lifetime = setTimeout(() => {
			const state = this.sessionTimers.get(sessionId);
			if (state && this.sessionData.has(sessionId)) {
				state.expired = true;
				return;
			}
			this.closeExpiredSession(sessionId);
		}, this.config.maxSessionMs);
		preAuth.unref();
		lifetime.unref();
		const socket = this.findConnection(sessionId)?._socket;
		this.sessionTimers.set(sessionId, {
			preAuth,
			lifetime,
			releaseConnection: socket && this.connectionReleases.get(socket),
		});
	}

	private closeExpiredSession(sessionId: string): void {
		this.closeSession(
			sessionId,
			421,
			"4.4.2 Maximum session duration reached, closing connection",
		);
	}

	private findConnection(sessionId: string): SmtpConnectionHandle | undefined {
		for (const server of this.servers) {
			const connections = (
				server as unknown as { connections: Set<SmtpConnectionHandle> }
			).connections;
			for (const connection of connections) {
				if (connection.id === sessionId) return connection;
			}
		}
		return undefined;
	}

	private closeSession(sessionId: string, code: number, message: string): void {
		const connection = this.findConnection(sessionId);
		if (!connection) return;
		const socket = connection._socket;
		connection.send(code, message);
		connection.close();
		setTimeout(() => socket.destroy(), 1_000).unref();
	}

	private listen(server: SMTPServer, port: number, label: string): void {
		server.server.maxConnections = this.config.maxConnections;
		this.gateConnections(server.server);
		server.on("error", (error) => {
			console.error(`[smtp-gateway] ${label} listener error`, error);
		});
		server.listen(port, () => {
			console.log(
				`[smtp-gateway] ${this.config.hostname} listening on :${port} (${label})`,
			);
		});
		this.servers.push(server);
	}

	private async handleAuth(
		auth: SMTPServerAuthentication,
		session: SMTPServerSession,
	): Promise<SMTPServerAuthenticationResponse> {
		if (!session.secure && !this.config.allowInsecureAuth) {
			throw new SmtpRelayError({
				responseCode: 538,
				message: "5.7.11 Encryption required for authentication",
			});
		}
		const ip = session.remoteAddress;
		const username = (auth.username ?? "").trim().toLowerCase();
		const password = (auth.password ?? "").trim();
		// RFC 4616: acting as a different authorization identity is not supported.
		const authzid = ((auth as { authzid?: string }).authzid ?? "")
			.trim()
			.toLowerCase();
		this.assertNotThrottled(ip, username);

		if (
			!username.includes("@") ||
			password.length === 0 ||
			(authzid && authzid !== username)
		) {
			this.recordFailure(ip, username);
			throw new SmtpRelayError({
				responseCode: 535,
				message: "5.7.8 Authentication failed: invalid mailbox credentials",
			});
		}

		const identity = await this.client.authenticateSmtp(username, password, ip);
		if (!identity) {
			this.recordFailure(ip, username);
			throw new SmtpRelayError({
				responseCode: 535,
				message: "5.7.8 Authentication failed: invalid mailbox credentials",
			});
		}
		if (identity.accessMode !== "read_write") {
			throw new SmtpRelayError({
				responseCode: 535,
				message: "5.7.8 This credential is read-only",
			});
		}

		const key = this.authKey(ip, username);
		this.authFailures.delete(key);
		this.successfulAuth.delete(key);
		this.successfulAuth.set(key, Date.now());
		this.limitRecords(this.successfulAuth);
		const state = this.sessionTimers.get(session.id);
		if (state?.preAuth) {
			clearTimeout(state.preAuth);
			state.preAuth = undefined;
		}
		const user: AuthenticatedUser = { apiKey: password, identity };
		return { user };
	}

	private async handleData(
		stream: SMTPServerDataStream,
		session: SMTPServerSession,
		sessionSignal?: AbortSignal,
	): Promise<string> {
		const user = session.user as AuthenticatedUser | undefined;
		if (!user?.apiKey) {
			throw new SmtpRelayError({
				responseCode: 530,
				message: "5.7.0 Authentication required",
			});
		}
		const releaseSender = this.claimSenderData(
			user.identity.credentialId,
			session.remoteAddress,
		);

		const controller = new AbortController();
		const abort = () => controller.abort();
		if (sessionSignal?.aborted) abort();
		sessionSignal?.addEventListener("abort", abort, { once: true });
		const budget = this.byteBudget();
		const envelope = {
			mailFrom: session.envelope.mailFrom
				? session.envelope.mailFrom.address
				: null,
			rcptTo: session.envelope.rcptTo.map((recipient) => recipient.address),
		};
		const work = this.relayData(
			stream,
			user,
			envelope,
			controller.signal,
			budget,
		).finally(() => {
			sessionSignal?.removeEventListener("abort", abort);
			budget.release();
			releaseSender();
		});
		work.catch(() => {});

		let timer: ReturnType<typeof setTimeout> | undefined;
		const deadline = new Promise<never>((_resolve, reject) => {
			timer = setTimeout(() => {
				const message = "4.4.2 Message transfer deadline exceeded";
				this.closeSession(session.id, 451, message);
				controller.abort();
				stream.destroy();
				reject(new SmtpRelayError({ responseCode: 451, message }));
			}, this.config.dataTimeoutMs);
			timer.unref();
		});
		try {
			return await Promise.race([work, deadline]);
		} finally {
			clearTimeout(timer);
		}
	}

	// The body is buffered before a processing slot is taken, so slow clients never hold one;
	// the slot covers only parsing and the upstream request.
	private async relayData(
		stream: SMTPServerDataStream,
		user: AuthenticatedUser,
		envelope: { mailFrom: string | null; rcptTo: string[] },
		signal: AbortSignal,
		budget: ByteBudget,
	): Promise<string> {
		const { raw, oversized, overBudget } = await collectStream(
			stream,
			this.config.maxMessageBytes,
			signal,
			budget,
		);
		if (stream.sizeExceeded || oversized) {
			throw new SmtpRelayError({
				responseCode: 552,
				message: "5.3.4 Message size exceeds fixed maximum message size",
			});
		}
		if (overBudget) {
			throw new SmtpRelayError({
				responseCode: 451,
				message: "4.3.2 Gateway busy, try again later",
			});
		}

		const release = await this.acquireDataSlot(signal);
		try {
			const releaseParse = await this.acquireParseSlot(signal);
			const mapped = await mapRawMessageInWorker(raw, envelope, {
				maxMimeParts: this.config.maxMimeParts,
				timeoutMs: this.config.parseTimeoutMs,
				heapMb: this.config.parseHeapMb,
				signal,
			}).finally(releaseParse);
			this.assertSenderAllowed(user.identity, mapped.fromAddress);
			if (envelope.mailFrom) {
				this.assertSenderAllowed(user.identity, envelope.mailFrom);
			}
			const idempotencyKey = idempotencyKeyFor(
				raw,
				user.identity.credentialId,
				envelope,
			);
			const rawResult = mapped.relayRaw
				? await this.client.sendRawEmail(
						user.apiKey,
						{ raw: raw.toString("base64"), recipients: envelope.rcptTo },
						idempotencyKey,
					)
				: null;
			const result =
				rawResult ??
				(await this.client.sendEmail(
					user.apiKey,
					mapped.payload,
					idempotencyKey,
				));
			console.log(
				`[smtp-gateway] relayed ${rawResult ? "raw " : ""}message ${result.id} recipients=${envelope.rcptTo.length}`,
			);
			return `Queued as ${result.id}`;
		} finally {
			release();
		}
	}

	private claimSenderData(credentialId: string, ip: string): () => void {
		const byCredential = this.dataByCredential.get(credentialId) ?? 0;
		const byIp = this.dataByIp.get(ip) ?? 0;
		if (
			byCredential >= this.config.maxDataPerCredential ||
			byIp >= this.config.maxDataPerIp
		) {
			throw new SmtpRelayError({
				responseCode: 451,
				message:
					"4.3.2 Another message is already being transferred, try again later",
			});
		}
		this.dataByCredential.set(credentialId, byCredential + 1);
		this.dataByIp.set(ip, byIp + 1);
		let released = false;
		return () => {
			if (released) return;
			released = true;
			decrement(this.dataByCredential, credentialId);
			decrement(this.dataByIp, ip);
		};
	}

	private byteBudget(): ByteBudget {
		let reserved = 0;
		return {
			reserve: (bytes) => {
				if (this.bufferedBytes + bytes > this.config.maxBufferedBytes) {
					return false;
				}
				this.bufferedBytes += bytes;
				reserved += bytes;
				return true;
			},
			release: () => {
				this.bufferedBytes -= reserved;
				reserved = 0;
			},
		};
	}

	private assertSenderAllowed(identity: SmtpIdentity, address: string): void {
		const sender = normalizeMailbox(address);
		const allowed =
			sender !== null &&
			(identity.sendingMode === "identity"
				? identity.sendingAddress !== null &&
					sender.address === normalizeMailbox(identity.sendingAddress)?.address
				: identity.allowedDomains.some(
						(domain) => asciiDomain(domain) === sender.domain,
					));
		if (!allowed) {
			throw new SmtpRelayError({
				responseCode: 553,
				message: "5.7.1 Sender address is not allowed for this credential",
			});
		}
	}

	private acquireDataSlot(signal?: AbortSignal): Promise<() => void> {
		if (signal?.aborted) {
			return Promise.reject(connectionClosedBeforeProcessing());
		}
		if (this.activeData < this.config.maxConcurrentData) {
			this.activeData++;
			return Promise.resolve(once(() => this.releaseDataSlot()));
		}
		if (this.dataQueue.length >= this.config.maxDataQueue) {
			return Promise.reject(
				new SmtpRelayError({
					responseCode: 451,
					message: "4.3.2 Gateway busy, try again later",
				}),
			);
		}
		return new Promise((resolve, reject) => {
			const entry: DataQueueEntry = {
				signal,
				resolve,
				reject,
				canceled: false,
				cancel: () => {
					if (entry.canceled) return;
					entry.canceled = true;
					entry.cleanup();
					const index = this.dataQueue.indexOf(entry);
					if (index >= 0) this.dataQueue.splice(index, 1);
					entry.reject(connectionClosedBeforeProcessing());
				},
				cleanup: () => {
					signal?.removeEventListener("abort", entry.cancel);
				},
			};
			signal?.addEventListener("abort", entry.cancel, { once: true });
			this.dataQueue.push(entry);
		});
	}

	private releaseDataSlot(): void {
		while (this.dataQueue.length > 0) {
			const next = this.dataQueue.shift();
			if (!next) break;
			if (next.canceled || next.signal?.aborted) {
				next.cancel();
				continue;
			}
			next.cleanup();
			next.resolve(once(() => this.releaseDataSlot()));
			return;
		}
		this.activeData--;
	}

	// Each parse worker may use up to SMTP_PARSE_HEAP_MB of heap, so parses are limited separately
	// from the DATA slots, which also cover the upstream request. Waiters are bounded by the DATA
	// slots.
	private acquireParseSlot(signal: AbortSignal): Promise<() => void> {
		if (signal.aborted) {
			return Promise.reject(connectionClosedBeforeProcessing());
		}
		if (this.activeParses < this.config.maxConcurrentParses) {
			this.activeParses++;
			return Promise.resolve(once(() => this.releaseParseSlot()));
		}
		return new Promise((resolve, reject) => {
			const start = () => {
				signal.removeEventListener("abort", cancel);
				resolve(once(() => this.releaseParseSlot()));
			};
			const cancel = () => {
				const index = this.parseQueue.indexOf(start);
				if (index >= 0) this.parseQueue.splice(index, 1);
				reject(connectionClosedBeforeProcessing());
			};
			signal.addEventListener("abort", cancel, { once: true });
			this.parseQueue.push(start);
		});
	}

	private releaseParseSlot(): void {
		const next = this.parseQueue.shift();
		if (next) next();
		else this.activeParses--;
	}

	private assertNotThrottled(ip: string, username: string): void {
		const now = Date.now();
		const key = this.authKey(ip, username);
		const record = this.failureRecord(key, now);
		if (record && record.count >= this.config.authFailureLimit) {
			throw new SmtpRelayError({
				responseCode: 421,
				message: "4.7.0 Too many failed authentication attempts, slow down",
			});
		}
		const successfulAt = this.successfulAuth.get(key);
		if (successfulAt !== undefined) {
			if (now - successfulAt <= this.config.authFailureWindowMs) return;
			this.successfulAuth.delete(key);
		}
		const aggregate = this.failureRecord(this.ipAuthKey(ip), now);
		if (aggregate && aggregate.count >= this.config.authFailureIpLimit) {
			throw new SmtpRelayError({
				responseCode: 421,
				message: "4.7.0 Too many failed authentication attempts, slow down",
			});
		}
	}

	private recordFailure(ip: string, username: string): void {
		const now = Date.now();
		for (const key of [this.authKey(ip, username), this.ipAuthKey(ip)]) {
			const record = this.failureRecord(key, now);
			if (record) {
				record.count += 1;
				continue;
			}
			this.reserveFailureRecord(now);
			this.authFailures.set(key, { count: 1, windowStart: now });
		}
	}

	// Records are kept in insertion order, so the first expired or unblocked entry is the oldest.
	// A full table evicts rather than refusing logins that have no record.
	private reserveFailureRecord(now: number): void {
		if (this.authFailures.size < this.config.maxAuthFailureRecords) return;
		let oldest: string | undefined;
		let oldestUnblocked: string | undefined;
		for (const [key, record] of this.authFailures) {
			if (now - record.windowStart > this.config.authFailureWindowMs) {
				this.authFailures.delete(key);
				continue;
			}
			oldest ??= key;
			if (!this.failureBlocked(key, record)) {
				oldestUnblocked = key;
				break;
			}
		}
		while (this.authFailures.size >= this.config.maxAuthFailureRecords) {
			const victim =
				oldestUnblocked ?? oldest ?? this.authFailures.keys().next().value;
			if (victim === undefined) return;
			this.authFailures.delete(victim);
			oldestUnblocked = undefined;
			oldest = undefined;
		}
	}

	private failureBlocked(key: string, record: FailureRecord): boolean {
		const limit = key.startsWith("ip:")
			? this.config.authFailureIpLimit
			: this.config.authFailureLimit;
		return record.count >= limit;
	}

	private failureRecord(key: string, now: number): FailureRecord | undefined {
		const record = this.authFailures.get(key);
		if (record && now - record.windowStart > this.config.authFailureWindowMs) {
			this.authFailures.delete(key);
			return;
		}
		return record;
	}

	private limitRecords<T>(records: Map<string, T>): void {
		while (records.size > this.config.maxAuthFailureRecords) {
			const oldest = records.keys().next().value;
			if (oldest === undefined) return;
			records.delete(oldest);
		}
	}

	private authKey(ip: string, username: string): string {
		return `user:${ip}\0${username}`;
	}

	private ipAuthKey(ip: string): string {
		return `ip:${ip}`;
	}
}

function collectStream(
	stream: SMTPServerDataStream,
	maxBytes: number,
	signal: AbortSignal,
	budget: ByteBudget,
): Promise<{ raw: Buffer; oversized: boolean; overBudget: boolean }> {
	return new Promise((resolve, reject) => {
		const closed = () =>
			new SmtpRelayError({
				responseCode: 451,
				message: "4.3.0 SMTP connection closed during message processing",
			});
		if (signal.aborted || (stream.destroyed && !stream.readableEnded)) {
			reject(closed());
			return;
		}
		let chunks: Buffer[] = [];
		let total = 0;
		let overBudget = false;
		const onAbort = () => {
			chunks = [];
			reject(closed());
		};
		signal.addEventListener("abort", onAbort, { once: true });
		stream.on("data", (chunk: Buffer) => {
			total += chunk.length;
			if (total > maxBytes || overBudget) {
				chunks = [];
				budget.release();
				return;
			}
			if (budget.reserve(chunk.length)) {
				chunks.push(chunk);
				return;
			}
			overBudget = true;
			chunks = [];
			budget.release();
		});
		stream.once("end", () => {
			signal.removeEventListener("abort", onAbort);
			resolve({
				raw: Buffer.concat(chunks),
				oversized: total > maxBytes,
				overBudget,
			});
		});
		stream.once("error", (error) => {
			signal.removeEventListener("abort", onAbort);
			reject(error);
		});
		stream.once("close", () => {
			signal.removeEventListener("abort", onAbort);
			if (!stream.readableEnded) reject(closed());
		});
	});
}

function once(callback: () => void): () => void {
	let called = false;
	return () => {
		if (called) return;
		called = true;
		callback();
	};
}

function decrement(counts: Map<string, number>, key: string): void {
	const remaining = (counts.get(key) ?? 1) - 1;
	if (remaining > 0) counts.set(key, remaining);
	else counts.delete(key);
}

function connectionClosedBeforeProcessing(): SmtpRelayError {
	return new SmtpRelayError({
		responseCode: 451,
		message: "4.3.0 SMTP connection closed before message processing",
	});
}

function asciiDomain(domain: string): string {
	const trimmed = domain.trim().replace(/\.$/, "");
	return trimmed ? domainToASCII(trimmed).toLowerCase() : "";
}

// Matches the API's parseMailbox: the domain follows the last "@" and is compared in its
// ASCII (punycode) form, since smtp-server and mailparser hand over Unicode IDN domains.
function normalizeMailbox(
	address: string,
): { address: string; domain: string } | null {
	const value = address.trim();
	const at = value.lastIndexOf("@");
	if (at <= 0) return null;
	const domain = asciiDomain(value.slice(at + 1));
	if (!domain) return null;
	return {
		address: `${value.slice(0, at).toLowerCase()}@${domain}`,
		domain,
	};
}

// smtp-server only half-closes (end()) on QUIT, timeouts and errors; a peer that never closes its
// side would hold a connection slot forever.
function destroyAfterEnd(socket: Socket): void {
	socket.once("finish", () => {
		setTimeout(() => socket.destroy(), 5_000).unref();
	});
}

function assertSupportedParameters(
	address: SMTPServerAddress,
	supported: string[],
): void {
	const args = (address.args || {}) as Record<string, string | true>;
	if (Object.keys(args).some((key) => !supported.includes(key))) {
		throw new SmtpRelayError({
			responseCode: 555,
			message: "5.5.4 Unsupported parameter",
		});
	}
	if (args.SIZE !== undefined && !/^\d+$/.test(String(args.SIZE))) {
		throw new SmtpRelayError({
			responseCode: 501,
			message: "5.5.4 Invalid SIZE parameter",
		});
	}
}

function assertAsciiAddress(address: string): void {
	// RFC 6531 3.5: without SMTPUTF8, non-ASCII mailbox names are not permitted.
	if (/[^\x21-\x7e]/.test(address.slice(0, address.lastIndexOf("@")))) {
		throw new SmtpRelayError({
			responseCode: 553,
			message: "5.6.7 Non-ASCII addresses are not supported",
		});
	}
}

// Result label of an `event=auth` line, by the SMTP reply code the client got.
function authResult(responseCode: number | undefined): string {
	if (responseCode === 535) return "fail";
	if (responseCode === 421) return "throttled";
	if (responseCode === 538) return "tls_required";
	return "error";
}

function smtpError(responseCode: number, message: string) {
	return toSmtpError(new SmtpRelayError({ responseCode, message }));
}

function toSmtpError(error: unknown): Error & { responseCode?: number } {
	if (error instanceof SmtpRelayError) {
		const smtpError: Error & { responseCode?: number } = new Error(
			error.message,
		);
		smtpError.responseCode = error.responseCode;
		return smtpError;
	}
	console.error("[smtp-gateway] unexpected error", error);
	const fallback: Error & { responseCode?: number } = new Error(
		"4.3.0 Internal gateway error, try again later",
	);
	fallback.responseCode = 451;
	return fallback;
}
