import { readFileSync } from "node:fs";
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

export class SmtpGateway {
	private config: GatewayConfig;
	private client: InboundApiClient;
	private authFailures = new Map<string, FailureRecord>();
	private servers: SMTPServer[] = [];
	private activeData = 0;
	private dataQueue: Array<(release: () => void) => void> = [];

	constructor(config: GatewayConfig) {
		this.config = config;
		this.client = new InboundApiClient(config);
	}

	start(): void {
		const tls = this.tlsOptions();
		if (this.config.starttlsPort > 0) {
			this.listen(
				new SMTPServer({ ...this.baseOptions(tls), secure: false }),
				this.config.starttlsPort,
				"STARTTLS",
			);
		}
		if (this.config.implicitTlsPort > 0) {
			if (!tls) {
				throw new Error(
					"SMTP_TLS_KEY_PATH and SMTP_TLS_CERT_PATH are required for the implicit TLS listener (set SMTP_IMPLICIT_TLS_PORT=0 to disable)",
				);
			}
			this.listen(
				new SMTPServer({ ...this.baseOptions(tls), secure: true }),
				this.config.implicitTlsPort,
				"implicit TLS",
			);
		}
		if (this.servers.length === 0) {
			throw new Error("No listeners configured");
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

	private tlsOptions(): { key: Buffer; cert: Buffer } | null {
		if (!this.config.tlsKeyPath || !this.config.tlsCertPath) return null;
		return {
			key: readFileSync(this.config.tlsKeyPath),
			cert: readFileSync(this.config.tlsCertPath),
		};
	}

	private baseOptions(
		tls: { key: Buffer; cert: Buffer } | null,
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
			onAuth: (auth, session, callback) => {
				this.handleAuth(auth, session)
					.then((response) => callback(null, response))
					.catch((error: unknown) => callback(toSmtpError(error)));
			},
			onData: (stream, session, callback) => {
				this.handleData(stream, session)
					.then((message) => callback(null, message))
					.catch((error: unknown) => callback(toSmtpError(error)));
			},
		};
	}

	private listen(server: SMTPServer, port: number, label: string): void {
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

		this.authFailures.delete(this.authKey(ip, username));
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

		const release = await this.acquireDataSlot();
		try {
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
				idempotencyKeyFor(raw, user.apiKey),
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

	private acquireDataSlot(): Promise<() => void> {
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
		return new Promise((resolve) => this.dataQueue.push(resolve));
	}

	private releaseDataSlot(): void {
		const next = this.dataQueue.shift();
		if (next) {
			next(() => this.releaseDataSlot());
			return;
		}
		this.activeData--;
	}

	private assertNotThrottled(ip: string, username: string): void {
		const key = this.authKey(ip, username);
		const record = this.authFailures.get(key);
		if (!record) return;
		const expired =
			Date.now() - record.windowStart > this.config.authFailureWindowMs;
		if (expired) {
			this.authFailures.delete(key);
			return;
		}
		if (record.count >= this.config.authFailureLimit) {
			throw new SmtpRelayError({
				responseCode: 421,
				message: "4.7.0 Too many failed authentication attempts, slow down",
			});
		}
	}

	private recordFailure(ip: string, username: string): void {
		const now = Date.now();
		const key = this.authKey(ip, username);
		const record = this.authFailures.get(key);
		if (!record || now - record.windowStart > this.config.authFailureWindowMs) {
			this.authFailures.set(key, { count: 1, windowStart: now });
			return;
		}
		record.count += 1;
	}

	private authKey(ip: string, username: string): string {
		return `${ip}\0${username}`;
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
		stream.on("end", () => resolve(Buffer.concat(chunks)));
		stream.on("error", reject);
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
