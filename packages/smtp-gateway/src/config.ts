export interface GatewayConfig {
	apiBaseUrl: string;
	sendPath: string;
	hostname: string;
	starttlsPort: number;
	implicitTlsPort: number;
	maxMessageBytes: number;
	maxRecipients: number;
	tlsKeyPath: string | null;
	tlsCertPath: string | null;
	tlsHandshakeTimeoutMs: number;
	allowInsecureAuth: boolean;
	authFailureWindowMs: number;
	authFailureLimit: number;
	authFailureIpLimit: number;
	maxAuthFailureRecords: number;
	authRequestTimeoutMs: number;
	sendRequestTimeoutMs: number;
	socketTimeoutMs: number;
	maxConnections: number;
	maxConcurrentData: number;
	maxDataQueue: number;
}

function envString(name: string, fallback: string): string {
	const value = process.env[name];
	return value && value.length > 0 ? value : fallback;
}

function envNumber(
	name: string,
	fallback: number,
	minimum = 1,
	maximum = Number.MAX_SAFE_INTEGER,
): number {
	const value = process.env[name];
	if (!value) return fallback;
	const parsed = Number(value);
	if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
		throw new Error(
			`${name} must be an integer between ${minimum} and ${maximum}`,
		);
	}
	return parsed;
}

export function loadConfig(): GatewayConfig {
	return {
		apiBaseUrl: envString(
			"INBOUND_API_BASE_URL",
			"https://inbound.new/api/e2",
		).replace(/\/$/, ""),
		sendPath: envString("INBOUND_SEND_PATH", "/emails"),
		hostname: envString("SMTP_HOSTNAME", "smtp.inboundemail.com"),
		starttlsPort: envNumber("SMTP_STARTTLS_PORT", 587, 0, 65_535),
		implicitTlsPort: envNumber("SMTP_IMPLICIT_TLS_PORT", 465, 0, 65_535),
		maxMessageBytes: envNumber("SMTP_MAX_MESSAGE_BYTES", 25 * 1024 * 1024),
		maxRecipients: envNumber("SMTP_MAX_RECIPIENTS", 50, 1, 50),
		tlsKeyPath: process.env.SMTP_TLS_KEY_PATH || null,
		tlsCertPath: process.env.SMTP_TLS_CERT_PATH || null,
		tlsHandshakeTimeoutMs: envNumber("SMTP_TLS_HANDSHAKE_TIMEOUT_MS", 10_000),
		allowInsecureAuth: process.env.SMTP_ALLOW_INSECURE_AUTH === "true",
		authFailureWindowMs: envNumber("SMTP_AUTH_FAILURE_WINDOW_MS", 15 * 60_000),
		authFailureLimit: envNumber("SMTP_AUTH_FAILURE_LIMIT", 10),
		authFailureIpLimit: envNumber("SMTP_AUTH_FAILURE_IP_LIMIT", 50),
		maxAuthFailureRecords: envNumber("SMTP_MAX_AUTH_FAILURE_RECORDS", 10_000),
		authRequestTimeoutMs: envNumber("SMTP_AUTH_REQUEST_TIMEOUT_MS", 10_000),
		sendRequestTimeoutMs: envNumber("SMTP_SEND_REQUEST_TIMEOUT_MS", 30_000),
		socketTimeoutMs: envNumber("SMTP_SOCKET_TIMEOUT_MS", 60_000),
		maxConnections: envNumber("SMTP_MAX_CONNECTIONS", 50),
		maxConcurrentData: envNumber("SMTP_MAX_CONCURRENT_DATA", 2),
		maxDataQueue: envNumber("SMTP_MAX_DATA_QUEUE", 20, 0),
	};
}
