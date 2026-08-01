import type { Message } from "./message";

export type ValidationIssue = {
	code: string;
	path: string;
	message: string;
};

export type ValidationResult = {
	valid: boolean;
	errors: ValidationIssue[];
	warnings: ValidationIssue[];
};

const ADDRESS_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PLACEHOLDER_PATTERN = /{{[^}]+}}|\$\{[^}]+}|\[\[[^\]]+\]\]/;

export function validateMessage(
	message: Message,
	options: { reply?: boolean } = {},
): ValidationResult {
	const errors: ValidationIssue[] = [];
	const warnings: ValidationIssue[] = [];
	if (!message.from)
		add(errors, "missing_sender", "from", "A sender is required.");
	else if (!validAddress(message.from))
		add(errors, "invalid_sender", "from", "The sender address is invalid.");
	if (!options.reply && !message.to?.length)
		add(
			errors,
			"missing_recipient",
			"to",
			"At least one recipient is required.",
		);
	for (const [path, addresses] of Object.entries({
		to: message.to,
		cc: message.cc,
		bcc: message.bcc,
		reply_to: message.reply_to,
	})) {
		for (const address of addresses || []) {
			if (!validAddress(address))
				add(
					errors,
					"invalid_recipient",
					path,
					`Invalid email address '${address}'.`,
				);
		}
	}
	if (!options.reply && !message.subject?.trim())
		add(errors, "missing_subject", "subject", "A subject is required.");
	if (!message.text?.trim() && !message.html?.trim()) {
		add(errors, "missing_body", "body", "A text or HTML body is required.");
	}
	if (
		message.text &&
		/[\u0000\u0008\u000B\u000C\u000E-\u001F]/.test(message.text)
	) {
		add(
			errors,
			"invalid_control_character",
			"text",
			"The text body contains unsupported control characters.",
		);
	}
	if (message.html) {
		if (/<\s*(script|iframe|object|embed|form)\b/i.test(message.html)) {
			add(
				errors,
				"unsafe_html_element",
				"html",
				"HTML contains an unsafe element.",
			);
		}
		if (
			/\son[a-z]+\s*=/i.test(message.html) ||
			/(?:href|src)\s*=\s*["']?javascript:/i.test(message.html)
		) {
			add(
				errors,
				"unsafe_html_attribute",
				"html",
				"HTML contains an unsafe attribute or URL.",
			);
		}
		if (!message.text?.trim())
			add(
				warnings,
				"missing_text_fallback",
				"text",
				"HTML has no plain-text fallback.",
			);
		if (/<img\b(?![^>]*\balt\s*=)[^>]*>/i.test(message.html)) {
			add(
				warnings,
				"missing_image_alt",
				"html",
				"An image is missing alt text.",
			);
		}
	}
	for (const [path, value] of [
		["subject", message.subject],
		["text", message.text],
		["html", message.html],
	] as const) {
		if (value && PLACEHOLDER_PATTERN.test(value)) {
			add(
				warnings,
				"unresolved_placeholder",
				path,
				"Content may contain an unresolved template placeholder.",
			);
		}
	}
	if ((message.text?.length || 0) + (message.html?.length || 0) > 500_000) {
		add(
			warnings,
			"large_body",
			"body",
			"The combined message body is larger than 500 KB.",
		);
	}
	return { valid: errors.length === 0, errors, warnings };
}

function validAddress(value: string): boolean {
	const match = /<([^>]+)>$/.exec(value.trim());
	return ADDRESS_PATTERN.test(match?.[1] || value.trim());
}

function add(
	issues: ValidationIssue[],
	code: string,
	path: string,
	message: string,
): void {
	issues.push({ code, path, message });
}
