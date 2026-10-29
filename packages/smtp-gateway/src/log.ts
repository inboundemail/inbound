// Whitespace and control characters would split a key=value pair or forge a log line.
const UNSAFE = /[\s\u0000-\u001f\u007f-\u009f\u2028\u2029]/g;
const MAX_VALUE = 128;

export type EventFields = Record<
	string,
	string | number | boolean | null | undefined
>;

/**
 * Logs one machine-readable line, `[smtp-gateway] event=<name> key=value ...`. The host's
 * inbound-health check and daily report (infra/gateways/host/sbin/inbound-health) count these.
 * Never pass message content, passwords, API keys or email addresses: IPs, numeric codes and
 * opaque IDs only.
 */
export function logEvent(event: string, fields: EventFields = {}): void {
	let line = `[smtp-gateway] event=${event}`;
	for (const [key, value] of Object.entries(fields)) {
		if (value === undefined || value === null || value === "") continue;
		line += ` ${key}=${String(value).replace(UNSAFE, "_").slice(0, MAX_VALUE)}`;
	}
	console.log(line);
}

export function clientIp(address: string | undefined): string {
	return (address ?? "").replace(/^::ffff:(?=\d+\.\d+\.\d+\.\d+$)/i, "") || "-";
}
