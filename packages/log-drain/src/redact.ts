import { hmacHex } from "./crypto";

type Replacer = (match: string, offset: number, whole: string) => string;
type Rule = [RegExp, string | Replacer];

const SECRET_KEY_NAMES =
	"api[_-]?key|apikey|x-api-key|secret|client[_-]?secret|password|passwd|pwd|token|access[_-]?token|refresh[_-]?token|id[_-]?token|auth[_-]?token|session[_-]?token|authorization|cookie|set-cookie|signature|private[_-]?key";

const RULES: Rule[] = [
	[/\b(Bearer|Basic|Token)\s+[A-Za-z0-9._~+/=-]{8,}/gi, "$1 [REDACTED]"],
	[/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, "[REDACTED_JWT]"],
	[/\b(?:AKIA|ASIA|AGPA|AIDA|AROA|ANPA|ANVA)[A-Z0-9]{16}\b/g, "[REDACTED_AWS_KEY]"],
	[/\b(?:mail|imap)_[A-Za-z0-9_-]{8,}/g, "[REDACTED_INBOUND_KEY]"],
	[/\b(?:sk|rk|pk_live|whsec)[-_][A-Za-z0-9_-]{16,}/g, "[REDACTED_KEY]"],
	[/\bgh[pousr]_[A-Za-z0-9]{30,}/g, "[REDACTED_KEY]"],
	[/\bxox[abprs]-[A-Za-z0-9-]{10,}/g, "[REDACTED_KEY]"],
	[
		new RegExp(
			`(\\b(?:${SECRET_KEY_NAMES})\\b(?:\\\\?["'])?\\s*[:=]\\s*(?:\\\\?["'])?)(?!\\[REDACTED)([^"'\\\\\\s,;&}\\]]{4,})`,
			"gi",
		),
		"$1[REDACTED]",
	],
	[
		/\b[A-Za-z0-9]{40,}\b/g,
		(match: string, offset: number, whole: string) =>
			/[a-z]/.test(match) && /[A-Z]/.test(match) && whole[offset + match.length] !== "@"
				? "[REDACTED_TOKEN]"
				: match,
	],
];

const EMAIL =
	/([A-Za-z0-9._%+-]{1,64})(@|%40)([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,})/gi;

export function redact(input: string, emailHashKey?: string): string {
	let out = input;
	for (const [pattern, replacement] of RULES) {
		out =
			typeof replacement === "string"
				? out.replace(pattern, replacement)
				: out.replace(pattern, replacement);
	}
	return out.replace(EMAIL, (_match, local: string, at: string, domain: string) => {
		const masked = `${local[0]}***`;
		if (!emailHashKey) return `${masked}${at}${domain}`;
		const plainLocal = at === "@" ? local : safeDecode(local);
		const tag = hmacHex(emailHashKey, `${plainLocal.toLowerCase()}@${domain.toLowerCase()}`, 8);
		return `${masked}~${tag}${at}${domain}`;
	});
}

function safeDecode(value: string): string {
	try {
		return decodeURIComponent(value);
	} catch {
		return value;
	}
}

export function emailTag(email: string, emailHashKey: string): string | null {
	const match = /^([A-Za-z0-9._%+-]{1,64})@([A-Za-z0-9.-]+)$/.exec(email.trim());
	if (!match) return null;
	return hmacHex(emailHashKey, `${match[1].toLowerCase()}@${match[2].toLowerCase()}`, 8);
}
