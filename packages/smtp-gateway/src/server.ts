import { readFileSync } from "node:fs";
import type { Socket } from "node:net";
import {
	SMTPServer,
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
import { idempotencyKeyFor, mapRawMessage } from "./mapper.ts";

interface AuthenticatedUser {
	apiKey: string;
	identity: SmtpIdentity;
}

interface FailureRecord {
	count: number;
	windowStart: number;
}

interface DataQueueEntry {
	stream?: SMTPServerDataStream;
	resolve: (release: () => void) => void;
	reject: (error: SmtpRelayError) => void;
	cancel: () => void;
	cleanup: () => void;
	canceled: boolean;
}

export class SmtpGateway {
	private config: GatewayConfig;
	private client: InboundApiClient;
	private authFailures = new Map<string, FailureRecord>();
	private successfulAuth = new Map<string, number>();
	private tlsHandshakeTimers = new Map<string, ReturnType<typeof setTimeout>>();
	private sessionDataStreams = new Map<string, SMTPServerDataStream>();
	private servers: SMTPServer[] = [];
	private activeData = 0;
	private dataQueue: DataQueueEntry[] = [];

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
			this.listen(
				new SMTPServer({ ...this.baseOptions(tls), secure: false }),
				this.config.starttlsPort,
				"STARTTLS",
			);
		}
		if (this.config.implicitTlsPort > 0) {
			this.listen(
				new SMTPServer({ ...this.baseOptions(tls), secure: true }),
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

	private tlsOptions(): {
		key: Buffer;
		cert: Buffer;
		minVersion: "TLSv1.2";
	} | null {
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

	private baseOptions(
		tls: { key: Buffer; cert: Buffer; minVersion: "TLSv1.2" } | null,
	): SMTPServerOptions {
		return {
			name: this.config.hostname,
			banner: "inbound SMTP gateway",
			size: this.config.maxMessageBytes,
			authMethods: ["PLAIN", "LOGIN"],
			allowInsecureAuth: this.config.allowInsecureAuth,
			disabledCommands: tls ? [] : ["STARTTLS"],
			socketTimeout: this.config.socketTimeoutMs,
			maxClients: this.config.maxConnections,
			...(tls ?? {}),
			onSecure: (socket, session, callback) => {
				const key = this.handshakeKey(
					socket.remoteAddress ?? session.remoteAddress,
					socket.remotePort ?? session.remotePort,
					socket.localPort ?? session.localPort,
				);
				const timer = this.tlsHandshakeTimers.get(key);
				if (timer) {
					clearTimeout(timer);
					this.tlsHandshakeTimers.delete(key);
				}
				socket.setTimeout(this.config.socketTimeoutMs);
				callback();
			},
			onAuth: (auth, session, callback) => {
				this.handleAuth(auth, session)
					.then((response) => callback(null, response))
					.catch((error: unknown) => callback(toSmtpError(error)));
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
					if (address.address) {
						this.assertSenderAllowed(user.identity, address.address);
					}
					callback();
				} catch (error: unknown) {
					callback(toSmtpError(error));
				}
			},
			onRcptTo: (address, session, callback) => {
				const duplicate = session.envelope.rcptTo.some(
					(recipient) =>
						recipient.address.toLowerCase() === address.address.toLowerCase(),
				);
				if (
					!duplicate &&
					session.envelope.rcptTo.length >=
						Math.min(this.config.maxRecipients, 50)
				) {
					callback(
						toSmtpError(
							new SmtpRelayError({
								responseCode: 452,
								message: "4.5.3 Too many recipients",
							}),
						),
					);
					return;
				}
				callback();
			},
			onData: (stream, session, callback) => {
				this.sessionDataStreams.set(session.id, stream);
				this.handleData(stream, session)
					.then((message) => callback(null, message))
					.catch((error: unknown) => {
						stream.resume();
						callback(toSmtpError(error));
					})
					.finally(() => {
						if (this.sessionDataStreams.get(session.id) === stream) {
							this.sessionDataStreams.delete(session.id);
						}
					});
			},
			onClose: (session, callback) => {
				const stream = this.sessionDataStreams.get(session.id);
				if (stream) {
					this.sessionDataStreams.delete(session.id);
					stream.destroy();
				}
				const key = this.handshakeKey(
					session.remoteAddress,
					session.remotePort,
					session.localPort,
				);
				const timer = this.tlsHandshakeTimers.get(key);
				if (timer) {
					clearTimeout(timer);
					this.tlsHandshakeTimers.delete(key);
				}
				callback?.();
			},
		};
	}

	private listen(server: SMTPServer, port: number, label: string): void {
		server.server.maxConnections = this.config.maxConnections;
		if (server.options.secure) {
			server.server.on("connection", (socket) => {
				this.startHandshakeTimer(socket);
			});
		} else if (!server.options.disabledCommands?.includes("STARTTLS")) {
			server.server.on("connection", (socket) => {
				this.monitorStartTls(socket);
			});
		}
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

	private monitorStartTls(socket: Socket): void {
		let command = "";
		let overflow = false;
		const onData = (chunk: Buffer | string) => {
			const bytes = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
			for (const byte of bytes) {
				if (byte === 10) {
					if (!overflow && command.trim().toUpperCase() === "STARTTLS") {
						socket.removeListener("data", onData);
						this.startHandshakeTimer(socket);
						return;
					}
					command = "";
					overflow = false;
					continue;
				}
				if (command.length < 512) {
					command += String.fromCharCode(byte);
				} else {
					overflow = true;
				}
			}
		};
		socket.on("data", onData);
		socket.once("close", () => socket.removeListener("data", onData));
	}

	private startHandshakeTimer(socket: Socket): void {
		const key = this.handshakeKey(
			socket.remoteAddress ?? "",
			socket.remotePort ?? 0,
			socket.localPort ?? 0,
		);
		const previous = this.tlsHandshakeTimers.get(key);
		if (previous) clearTimeout(previous);
		const timer = setTimeout(() => {
			this.tlsHandshakeTimers.delete(key);
			socket.destroy();
		}, this.config.tlsHandshakeTimeoutMs);
		timer.unref();
		this.tlsHandshakeTimers.set(key, timer);
		socket.once("close", () => {
			if (this.tlsHandshakeTimers.get(key) === timer) {
				clearTimeout(timer);
				this.tlsHandshakeTimers.delete(key);
			}
		});
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
		this.assertNotThrottled(ip, username);

		if (!username.includes("@") || password.length === 0) {
			this.recordFailure(ip, username);
			throw new SmtpRelayError({
				responseCode: 535,
				message: "5.7.8 Authentication failed: invalid mailbox credentials",
			});
		}

		const identity = await this.client.authenticateSmtp(username, password);
		if (!identity) {
			this.recordFailure(ip, username);
			throw new SmtpRelayError({
				responseCode: 535,
				message: "5.7.8 Authentication failed: invalid mailbox credentials",
			});
		}

		const key = this.authKey(ip, username);
		this.authFailures.delete(key);
		this.successfulAuth.delete(key);
		this.successfulAuth.set(key, Date.now());
		this.limitRecords(this.successfulAuth);
		const user: AuthenticatedUser = { apiKey: password, identity };
		return { user };
	}

	private async handleData(
		stream: SMTPServerDataStream,
		session: SMTPServerSession,
	): Promise<string> {
		const user = session.user as AuthenticatedUser | undefined;
		if (!user?.apiKey) {
			throw new SmtpRelayError({
				responseCode: 530,
				message: "5.7.0 Authentication required",
			});
		}

		const release = await this.acquireDataSlot(stream);
		try {
			if (stream.destroyed && !stream.readableEnded) {
				throw new SmtpRelayError({
					responseCode: 451,
					message: "4.3.0 SMTP connection closed before message processing",
				});
			}
			const raw = await collectStream(stream, this.config.maxMessageBytes);
			if (stream.sizeExceeded) {
				throw new SmtpRelayError({
					responseCode: 552,
					message: "5.3.4 Message size exceeds fixed maximum message size",
				});
			}

			const envelope = {
				mailFrom: session.envelope.mailFrom
					? session.envelope.mailFrom.address
					: null,
				rcptTo: session.envelope.rcptTo.map((recipient) => recipient.address),
			};

			const mapped = await mapRawMessage(raw, envelope);
			this.assertSenderAllowed(user.identity, mapped.fromAddress);
			if (envelope.mailFrom) {
				this.assertSenderAllowed(
					user.identity,
					envelope.mailFrom.toLowerCase(),
				);
			}
			const result = await this.client.sendEmail(
				user.apiKey,
				mapped.payload,
				idempotencyKeyFor(raw, user.identity.credentialId, envelope),
			);
			console.log(
				`[smtp-gateway] relayed message ${result.id} from=${mapped.payload.from} recipients=${envelope.rcptTo.length}`,
			);
			return `Queued as ${result.id}`;
		} finally {
			release();
		}
	}

	private assertSenderAllowed(identity: SmtpIdentity, address: string): void {
		const normalized = address.toLowerCase();
		const domain = normalized.split("@")[1] ?? "";
		const allowed =
			identity.sendingMode === "identity"
				? normalized === identity.sendingAddress?.toLowerCase()
				: identity.allowedDomains.includes(domain);
		if (!allowed) {
			throw new SmtpRelayError({
				responseCode: 553,
				message: "5.7.1 Sender address is not allowed for this credential",
			});
		}
	}

	private acquireDataSlot(stream?: SMTPServerDataStream): Promise<() => void> {
		if (this.activeData < this.config.maxConcurrentData) {
			this.activeData++;
			return Promise.resolve(() => this.releaseDataSlot());
		}
		if (this.dataQueue.length >= this.config.maxDataQueue) {
			throw new SmtpRelayError({
				responseCode: 451,
				message: "4.3.2 Gateway busy, try again later",
			});
		}
		return new Promise((resolve, reject) => {
			const entry: DataQueueEntry = {
				stream,
				resolve,
				reject,
				canceled: false,
				cancel: () => {
					if (entry.canceled) return;
					entry.canceled = true;
					entry.cleanup();
					const index = this.dataQueue.indexOf(entry);
					if (index >= 0) this.dataQueue.splice(index, 1);
					entry.reject(
						new SmtpRelayError({
							responseCode: 451,
							message: "4.3.0 SMTP connection closed before message processing",
						}),
					);
				},
				cleanup: () => {
					stream?.removeListener("close", entry.cancel);
					stream?.removeListener("error", entry.cancel);
				},
			};
			if (stream?.destroyed) {
				entry.cancel();
				return;
			}
			stream?.once("close", entry.cancel);
			stream?.once("error", entry.cancel);
			this.dataQueue.push(entry);
		});
	}

	private releaseDataSlot(): void {
		while (this.dataQueue.length > 0) {
			const next = this.dataQueue.shift();
			if (!next) break;
			if (next.canceled || next.stream?.destroyed) {
				next.cancel();
				continue;
			}
			next.cleanup();
			next.resolve(() => this.releaseDataSlot());
			return;
		}
		this.activeData--;
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
		if (
			!record &&
			!aggregate &&
			this.authFailures.size >= this.config.maxAuthFailureRecords &&
			[...this.authFailures].every(
				([failureKey, failure]) =>
					now - failure.windowStart <= this.config.authFailureWindowMs &&
					this.failureBlocked(failureKey, failure),
			)
		) {
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
			if (this.reserveFailureRecord(now)) {
				this.authFailures.set(key, { count: 1, windowStart: now });
			}
		}
	}

	private reserveFailureRecord(now: number): boolean {
		if (this.authFailures.size < this.config.maxAuthFailureRecords) return true;
		let candidate: string | undefined;
		for (const [key, record] of this.authFailures) {
			if (now - record.windowStart > this.config.authFailureWindowMs) {
				this.authFailures.delete(key);
				return true;
			}
			if (this.failureBlocked(key, record)) continue;
			if (candidate === undefined || key.startsWith("user:")) {
				candidate = key;
				if (key.startsWith("user:")) break;
			}
		}
		if (candidate === undefined) return false;
		this.authFailures.delete(candidate);
		return true;
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

	private handshakeKey(
		remoteAddress: string,
		remotePort: number,
		localPort: number,
	): string {
		return `${remoteAddress.replace(/^::ffff:/, "")}\0${remotePort}\0${localPort}`;
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
): Promise<Buffer> {
	return new Promise((resolve, reject) => {
		const chunks: Buffer[] = [];
		let total = 0;
		stream.on("data", (chunk: Buffer) => {
			total += chunk.length;
			if (total <= maxBytes) chunks.push(chunk);
		});
		stream.once("end", () => resolve(Buffer.concat(chunks)));
		stream.once("error", reject);
		stream.once("close", () => {
			if (!stream.readableEnded) {
				reject(
					new SmtpRelayError({
						responseCode: 451,
						message: "4.3.0 SMTP connection closed during message processing",
					}),
				);
			}
		});
	});
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
