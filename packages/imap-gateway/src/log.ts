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
