import type { JsonRecord } from "./http";
import type { ValidationResult } from "./validate";

export function printResult(value: unknown, asJson: boolean): void {
	if (asJson) {
		console.log(JSON.stringify(value, null, 2));
		return;
	}
	if (typeof value === "string") {
		console.log(value);
		return;
	}
	if (isRecord(value) && Array.isArray(value.data)) {
		printEmails(value.data);
		printContext(value);
		return;
	}
	if (isRecord(value) && Array.isArray(value.mailboxes)) {
		for (const item of value.mailboxes) {
			if (!isRecord(item)) continue;
			const marker = item.default === true ? "*" : "-";
			const selectors = Array.isArray(item.selectors)
				? item.selectors.join(", ")
				: "";
			console.log(`${marker} ${item.name}: ${selectors}`);
		}
		return;
	}
	if (isRecord(value) && Array.isArray(value.threads)) {
		for (const item of value.threads) {
			if (!isRecord(item)) continue;
			const subject = stringValue(item.normalized_subject) || "(no subject)";
			console.log(`${stringValue(item.id) || "-"}  ${subject}`);
		}
		return;
	}
	if (isValidation(value)) {
		printValidation(value);
		const message = (value as ValidationResult & JsonRecord).message;
		if (isRecord(message)) {
			console.log("\nMessage:");
			console.log(JSON.stringify(message, null, 2));
		}
		return;
	}
	if (isRecord(value) && typeof value.message === "string") {
		console.log(value.message);
		const rest = { ...value };
		delete rest.message;
		if (Object.keys(rest).length > 0)
			console.log(JSON.stringify(rest, null, 2));
		return;
	}
	console.log(JSON.stringify(value, null, 2));
}

function printEmails(values: unknown[]): void {
	if (values.length === 0) {
		console.log("No emails found.");
		return;
	}
	for (const value of values) {
		if (!isRecord(value)) continue;
		const read = value.is_read === true ? "read" : "unread";
		const from = stringValue(value.from) || "unknown";
		const subject = stringValue(value.subject) || "(no subject)";
		console.log(
			`${stringValue(value.id) || "-"}  ${read.padEnd(6)}  ${from}  ${subject}`,
		);
	}
}

function printContext(value: JsonRecord): void {
	if (!isRecord(value.context)) return;
	const mailbox = stringValue(value.context.mailbox);
	const status = stringValue(value.context.status);
	if (mailbox || status)
		console.log(`\nMailbox: ${mailbox || "-"}  Status: ${status || "all"}`);
}

function printValidation(value: ValidationResult): void {
	for (const issue of value.errors) {
		console.log(`error ${issue.code} (${issue.path}): ${issue.message}`);
	}
	for (const issue of value.warnings) {
		console.log(`warning ${issue.code} (${issue.path}): ${issue.message}`);
	}
	if (value.errors.length === 0 && value.warnings.length === 0) {
		console.log("Message is valid.");
	}
}

function isValidation(value: unknown): value is ValidationResult {
	return (
		isRecord(value) &&
		typeof value.valid === "boolean" &&
		Array.isArray(value.errors) &&
		Array.isArray(value.warnings)
	);
}

function isRecord(value: unknown): value is JsonRecord {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
	return typeof value === "string" ? value : undefined;
}
