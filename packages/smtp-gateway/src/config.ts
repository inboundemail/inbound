export interface GatewayConfig {
	apiBaseUrl: string;
	authCheckPath: string;
	sendPath: string;
	hostname: string;
	starttlsPort: number;
	implicitTlsPort: number;
	maxMessageBytes: number;
	tlsKeyPath: string | null;
	tlsCertPath: string | null;
	allowInsecureAuth: boolean;
	authFailureWindowMs: number;
	authFailureLimit: number;
	socketTimeoutMs: number;
	maxConnections: number;
}

function envString(name: string, fallback: string): string {
	const value = process.env[name];
	return value && value.length > 0 ? value : fallback;
}

function envNumber(name: string, fallback: number): number {
	const value = process.env[name];
	if (!value) return fallback;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : fallback;
}

export function loadConfig(): GatewayConfig {
	return {
		apiBaseUrl: envString(
			"INBOUND_API_BASE_URL",
			"https://inbound.new/api/e2",
		).replace(/\/$/, ""),
		authCheckPath: envString("INBOUND_AUTH_CHECK_PATH", "/domains?limit=1"),
		sendPath: envString("INBOUND_SEND_PATH", "/emails"),
		hostname: envString("SMTP_HOSTNAME", "smtp.inboundemail.com"),
		starttlsPort: envNumber("SMTP_STARTTLS_PORT", 587),
		implicitTlsPort: envNumber("SMTP_IMPLICIT_TLS_PORT", 465),
		maxMessageBytes: envNumber("SMTP_MAX_MESSAGE_BYTES", 25 * 1024 * 1024),
		tlsKeyPath: process.env.SMTP_TLS_KEY_PATH ?? null,
		tlsCertPath: process.env.SMTP_TLS_CERT_PATH ?? null,
		allowInsecureAuth: process.env.SMTP_ALLOW_INSECURE_AUTH === "true",
		authFailureWindowMs: envNumber("SMTP_AUTH_FAILURE_WINDOW_MS", 15 * 60_000),
		authFailureLimit: envNumber("SMTP_AUTH_FAILURE_LIMIT", 10),
		socketTimeoutMs: envNumber("SMTP_SOCKET_TIMEOUT_MS", 60_000),
		maxConnections: envNumber("SMTP_MAX_CONNECTIONS", 200),
	};
}
