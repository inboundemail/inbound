import { createHash } from "node:crypto";
import { format } from "node:util";

const MAX_LOG_LINE = 2048;

const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g;

export function sanitizeLogValue(value: unknown): string {
	const text = typeof value === "string" ? value : String(value);
	const clean = text.replace(CONTROL_CHARACTERS, (char) =>
		char === "\n" || char === "\r" ? " " : "?",
	);
	return clean.length > MAX_LOG_LINE
		? `${clean.slice(0, MAX_LOG_LINE)}…`
		: clean;
}

export function formatLogLine(args: unknown[]): string {
	const message =
		typeof args[0] === "object" && args[0] !== null
			? format(...args.slice(1))
			: format(...args);
	return sanitizeLogValue(message);
}

// Whitespace would split a key=value pair.
const UNSAFE_EVENT_VALUE = /[\s\u0000-\u001f\u007f-\u009f\u2028\u2029]/g;

export type EventFields = Record<
	string,
	string | number | boolean | null | undefined
>;

/**
 * Logs one machine-readable line, `[imap-gateway] event=<name> key=value ...`. The host's
 * inbound-health check and daily report (infra/gateways/host/sbin/inbound-health) count these.
 * Never pass message content, passwords or email addresses: IPs, codes and opaque IDs only.
 */
export function logEvent(event: string, fields: EventFields = {}): void {
	let line = `[imap-gateway] event=${event}`;
	for (const [key, value] of Object.entries(fields)) {
		if (value === undefined || value === null || value === "") continue;
		line += ` ${key}=${String(value).replace(UNSAFE_EVENT_VALUE, "_").slice(0, 128)}`;
	}
	console.log(line);
}

/** First 12 hex characters of SHA-256: lets the health report count distinct values without logging them. */
export function shortHash(value: string): string {
	return createHash("sha256").update(value).digest("hex").slice(0, 12);
}
