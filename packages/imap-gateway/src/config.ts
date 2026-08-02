export interface ImapConfig {
	hostname: string;
	port: number;
	securePort: number;
	tlsKeyPath: string | null;
	tlsCertPath: string | null;
	allowPlaintext: boolean;
	databaseUrl: string;
	apiBaseUrl: string;
	maxConnections: number;
	maxConnectionsPerIp: number;
	authFailureLimit: number;
	authFailureWindowMs: number;
	appendMaxBytesPerUser: number;
	appendMaxMessagesPerUser: number;
}

function envNumber(name: string, fallback: number): number {
	const value = process.env[name];
	if (!value) return fallback;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : fallback;
}

export function loadConfig(): ImapConfig {
	const databaseUrl = process.env.DATABASE_URL;
	if (!databaseUrl) throw new Error("DATABASE_URL is required");

	return {
		hostname: process.env.IMAP_HOSTNAME ?? "imap.inboundemail.com",
		port: envNumber("IMAP_PORT", 143),
		securePort: envNumber("IMAP_SECURE_PORT", 993),
		tlsKeyPath: process.env.IMAP_TLS_KEY_PATH ?? null,
		tlsCertPath: process.env.IMAP_TLS_CERT_PATH ?? null,
		allowPlaintext: process.env.IMAP_ALLOW_PLAINTEXT === "true",
		databaseUrl,
		apiBaseUrl: (
			process.env.INBOUND_API_BASE_URL ?? "https://inbound.new/api/e2"
		).replace(/\/$/, ""),
		maxConnections: envNumber("IMAP_MAX_CONNECTIONS", 200),
		maxConnectionsPerIp: envNumber("IMAP_MAX_CONNECTIONS_PER_IP", 20),
		authFailureLimit: envNumber("IMAP_AUTH_FAILURE_LIMIT", 10),
		authFailureWindowMs: envNumber("IMAP_AUTH_FAILURE_WINDOW_MS", 15 * 60_000),
		appendMaxBytesPerUser: envNumber(
			"IMAP_APPEND_MAX_BYTES_PER_USER",
			250 * 1024 * 1024,
		),
		appendMaxMessagesPerUser: envNumber(
			"IMAP_APPEND_MAX_MESSAGES_PER_USER",
			5_000,
		),
	};
}
