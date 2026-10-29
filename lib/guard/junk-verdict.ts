import type {
	ClassificationSummary,
	DimensionSummary,
} from "@/lib/guard/classification";
import type { GuardEvaluationResult } from "@/lib/guard/rule-matcher";

export const SPAM_FILTER_LEVELS = ["off", "lenient", "standard", "strict"] as const;
export type SpamFilterLevel = (typeof SPAM_FILTER_LEVELS)[number];
export const DEFAULT_SPAM_FILTER_LEVEL: SpamFilterLevel = "standard";

export type JunkReason = "classifier" | "ses_spam" | "guard_rule" | "user";

export interface JunkVerdict {
	isJunk: boolean;
	reason: JunkReason | null;
}

/** Confidence (0-1) at which Jev's answer counts as confident. */
export const CONFIDENT = 0.6;

const JUNK_DIMENSIONS = [
	"spam",
	"phishing",
	"fraud",
	"malware",
	"impersonation",
] as const;

/**
 * Whether Jev itself is confident the label applies: its confidence is at
 * least 0.6 and its own answer, before the authentication and reply-to rules
 * raised the level, was level 2 or higher. Without the second check a
 * confident "no" (a noul of 0.2, or a score of 1) raised by those rules would
 * count as confident. For a noul at level 3+ this means a probability of 0.8+.
 */
function isConfident(dimension: DimensionSummary): boolean {
	return (
		dimension.confidence >= CONFIDENT &&
		(dimension.base_level ?? dimension.level) >= 2
	);
}

/**
 * Whether one label makes the email junk at a filter level.
 *
 * - lenient: level 4 and confident.
 * - standard: level 3+ and confident.
 * - strict: level 3+ at any confidence, or level 2 and confident.
 *
 * Levels raised only by the authentication rules, without a confident answer
 * from Jev, count at strict but not at standard or lenient.
 */
function dimensionIsJunk(
	level: Exclude<SpamFilterLevel, "off">,
	dimension: DimensionSummary,
): boolean {
	const confident = isConfident(dimension);
	switch (level) {
		case "lenient":
			return dimension.level >= 4 && confident;
		case "standard":
			return dimension.level >= 3 && confident;
		case "strict":
			return dimension.level >= 3 || (dimension.level >= 2 && confident);
	}
}

export function isSpamFilterLevel(value: unknown): value is SpamFilterLevel {
	return (
		typeof value === "string" &&
		(SPAM_FILTER_LEVELS as readonly string[]).includes(value)
	);
}

/**
 * The spam filter's verdict for an email, from its Jev classification summary
 * and the SES spam verdict (see dimensionIsJunk; prompt injection never makes
 * an email junk by itself). Returns null when there is nothing to decide on
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
	const junk = JUNK_DIMENSIONS.some((name) => {
		const dimension = summary[name];
		return dimension ? dimensionIsJunk(level, dimension) : false;
	});
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
