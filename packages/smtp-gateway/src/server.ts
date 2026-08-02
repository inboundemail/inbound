import { readFileSync } from "node:fs";
import type { Server } from "node:net";
import {
	SMTPServer,
	type SMTPServerAuthentication,
	type SMTPServerAuthenticationResponse,
	type SMTPServerDataStream,
	type SMTPServerOptions,
	type SMTPServerSession,
} from "smtp-server";
import { InboundApiClient, SmtpRelayError } from "./api-client.ts";
import type { GatewayConfig } from "./config.ts";
import { idempotencyKeyFor, mapRawMessage } from "./mapper.ts";

const SMTP_USERNAME = "inbound";

interface AuthenticatedUser {
	apiKey: string;
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
		this.assertNotThrottled(ip);

		const username = (auth.username ?? "").trim().toLowerCase();
		const password = (auth.password ?? "").trim();

		if (username !== SMTP_USERNAME || password.length === 0) {
			this.recordFailure(ip);
			throw new SmtpRelayError({
				responseCode: 535,
				message:
					'5.7.8 Authentication failed: use username "inbound" and your API key as the password',
			});
		}

		const valid = await this.client.verifyApiKey(password);
		if (!valid) {
			this.recordFailure(ip);
			throw new SmtpRelayError({
				responseCode: 535,
				message: "5.7.8 Authentication failed: invalid API key",
			});
		}

		this.authFailures.delete(ip);
		const user: AuthenticatedUser = { apiKey: password };
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

		const payload = await mapRawMessage(raw, envelope);
		const result = await this.client.sendEmail(
			user.apiKey,
			payload,
			idempotencyKeyFor(raw, user.apiKey),
		);
		console.log(
			`[smtp-gateway] relayed message ${result.id} from=${payload.from} recipients=${envelope.rcptTo.length}`,
		);
		return `Queued as ${result.id}`;
	}

	private assertNotThrottled(ip: string): void {
		const record = this.authFailures.get(ip);
		if (!record) return;
		const expired =
			Date.now() - record.windowStart > this.config.authFailureWindowMs;
		if (expired) {
			this.authFailures.delete(ip);
			return;
		}
		if (record.count >= this.config.authFailureLimit) {
			throw new SmtpRelayError({
				responseCode: 421,
				message: "4.7.0 Too many failed authentication attempts, slow down",
			});
		}
	}

	private recordFailure(ip: string): void {
		const now = Date.now();
		const record = this.authFailures.get(ip);
		if (!record || now - record.windowStart > this.config.authFailureWindowMs) {
			this.authFailures.set(ip, { count: 1, windowStart: now });
			return;
		}
		record.count += 1;
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
