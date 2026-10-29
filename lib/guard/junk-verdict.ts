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

/** Confidence (0-1) at which a noul answer counts as confident. */
export const CONFIDENT = 0.6;
/** Probability mass at which a score answer counts as likely. */
export const LIKELY = 0.7;
/** Probability mass at which a score answer counts as possible (strict only). */
export const POSSIBLE = 0.5;

const JUNK_DIMENSIONS = [
	"spam",
	"phishing",
	"fraud",
	"malware",
	"impersonation",
] as const;

/**
 * Noul labels (and score labels without probabilities): whether Jev itself is
 * confident the label applies. Its confidence is at least 0.6 and its own
 * answer, before the authentication and reply-to rules raised the level, was
 * level 2 or higher. Without the second check a confident "no" (a noul of
 * 0.2) raised by those rules would count as confident. For a noul at level 3+
 * this means a probability of 0.8+.
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
 * Score labels (spam, phishing, fraud) with probabilities use Jev's
 * probability mass on the junk side, since score confidence only measures how
 * peaked the answer is ({3: 0.5, 4: 0.5} has confidence 0.58 but is clearly
 * level 3+):
 * - lenient: P(level 4) >= 0.7.
 * - standard: P(level >= 3) >= 0.7.
 * - strict: level 3+, or P(level >= 3) >= 0.5, or P(level >= 2) >= 0.7.
 *
 * Noul labels (malware, impersonation) and score labels without probabilities:
 * - lenient: level 4 and confident.
 * - standard: level 3+ and confident.
 * - strict: level 3+ at any confidence, or level 2 and confident.
 *
 * Levels raised only by the authentication rules, without Jev backing them,
 * count at strict but not at standard or lenient.
 */
function dimensionIsJunk(
	level: Exclude<SpamFilterLevel, "off">,
	dimension: DimensionSummary,
): boolean {
	const { p_ge2, p_ge3, p_eq4 } = dimension;
	if (p_ge2 !== undefined && p_ge3 !== undefined && p_eq4 !== undefined) {
		switch (level) {
			case "lenient":
				return p_eq4 >= LIKELY;
			case "standard":
				return p_ge3 >= LIKELY;
			case "strict":
				return dimension.level >= 3 || p_ge3 >= POSSIBLE || p_ge2 >= LIKELY;
		}
	}
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
 * and the SES spam and virus verdicts (see dimensionIsJunk; prompt injection
 * never makes an email junk by itself). An SES spam failure is junk. Without a
 * classification, an SES virus failure is junk too (with one, it already sets
 * malware to 4); both report `ses_spam`, the SES scan. Returns null when there
 * is nothing to decide on, so an earlier verdict is kept.
 */
export function classifierJunkVerdict(
	level: SpamFilterLevel,
	summary: ClassificationSummary | null | undefined,
	sesSpamVerdict: string | null | undefined,
	sesVirusVerdict?: string | null,
): JunkVerdict | null {
	if (level === "off") return { isJunk: false, reason: null };
	if (sesSpamVerdict?.toUpperCase() === "FAIL") {
		return { isJunk: true, reason: "ses_spam" };
	}
	if (!summary) {
		return sesVirusVerdict?.toUpperCase() === "FAIL"
			? { isJunk: true, reason: "ses_spam" }
			: null;
	}
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
	sesVirusVerdict?: string | null,
): JunkVerdict | null {
	if (guard?.matchedRule && guard.action === "junk") {
		return { isJunk: true, reason: "guard_rule" };
	}
	if (guard?.matchedRule && guard.action === "allow") {
		return { isJunk: false, reason: "guard_rule" };
	}
	return classifierJunkVerdict(level, summary, sesSpamVerdict, sesVirusVerdict);
}

/** The `spam` object exposed in webhooks and the API. */
export function spamInfo(email: {
	isJunk: boolean | null;
	junkReason: string | null;
}): { isJunk: boolean; reason: string | null } {
	return { isJunk: email.isJunk === true, reason: email.junkReason ?? null };
}
