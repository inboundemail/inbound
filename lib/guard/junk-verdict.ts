import type { ClassificationSummary } from "@/lib/guard/classification";
import type { GuardEvaluationResult } from "@/lib/guard/rule-matcher";

export const SPAM_FILTER_LEVELS = ["off", "lenient", "standard", "strict"] as const;
export type SpamFilterLevel = (typeof SPAM_FILTER_LEVELS)[number];
export const DEFAULT_SPAM_FILTER_LEVEL: SpamFilterLevel = "standard";

export type JunkReason = "classifier" | "ses_spam" | "guard_rule" | "user";

export interface JunkVerdict {
	isJunk: boolean;
	reason: JunkReason | null;
}

/** Minimum classification level (0-4) that makes an email junk, per filter level. */
export const JUNK_THRESHOLDS: Record<Exclude<SpamFilterLevel, "off">, number> = {
	lenient: 4,
	standard: 3,
	strict: 2,
};

const JUNK_DIMENSIONS = [
	"spam",
	"phishing",
	"fraud",
	"malware",
	"impersonation",
] as const;

export function isSpamFilterLevel(value: unknown): value is SpamFilterLevel {
	return (
		typeof value === "string" &&
		(SPAM_FILTER_LEVELS as readonly string[]).includes(value)
	);
}

/**
 * The spam filter's verdict for an email, from its Jev classification summary
 * and the SES spam verdict. Returns null when there is nothing to decide on
 * (no classification and no SES spam failure), so an earlier verdict is kept.
 */
export function classifierJunkVerdict(
	level: SpamFilterLevel,
	summary: ClassificationSummary | null | undefined,
	sesSpamVerdict: string | null | undefined,
): JunkVerdict | null {
	if (level === "off") return { isJunk: false, reason: null };
	if (sesSpamVerdict?.toUpperCase() === "FAIL") {
		return { isJunk: true, reason: "ses_spam" };
	}
	if (!summary) return null;
	const threshold = JUNK_THRESHOLDS[level];
	const junk = JUNK_DIMENSIONS.some(
		(dimension) => (summary[dimension]?.level ?? 0) >= threshold,
	);
	return { isJunk: junk, reason: "classifier" };
}

/**
 * Combines Guard and the spam filter: a matching Guard `junk` rule marks the
 * email junk, a matching Guard `allow` rule marks it not junk, and otherwise
 * the classifier decides.
 */
export function resolveJunkVerdict(
	guard: Pick<GuardEvaluationResult, "action" | "matchedRule"> | null,
	level: SpamFilterLevel,
	summary: ClassificationSummary | null | undefined,
	sesSpamVerdict: string | null | undefined,
): JunkVerdict | null {
	if (guard?.matchedRule && guard.action === "junk") {
		return { isJunk: true, reason: "guard_rule" };
	}
	if (guard?.matchedRule && guard.action === "allow") {
		return { isJunk: false, reason: "guard_rule" };
	}
	return classifierJunkVerdict(level, summary, sesSpamVerdict);
}

/** The `spam` object exposed in webhooks and the API. */
export function spamInfo(email: {
	isJunk: boolean | null;
	junkReason: string | null;
}): { isJunk: boolean; reason: string | null } {
	return { isJunk: email.isJunk === true, reason: email.junkReason ?? null };
}
