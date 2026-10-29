export interface SesSendErrorResponse {
	status: number;
	error: string;
}

const REJECTED_INPUT: Record<string, string> = {
	MessageRejected: "Email rejected by the email provider",
	BadRequestException: "Email rejected by the email provider as invalid",
	InvalidParameterValue: "Email rejected by the email provider as invalid",
	MailFromDomainNotVerifiedException:
		"The custom MAIL FROM domain for this sender is not verified",
};

const DETAIL_PASSTHROUGH = new Set([
	"MessageRejected",
	"BadRequestException",
	"InvalidParameterValue",
]);

const SENDING_PAUSED = new Set([
	"AccountSuspendedException",
	"SendingPausedException",
	"AccountSendingPausedException",
	"ConfigurationSetSendingPausedException",
]);

const THROTTLED = new Set([
	"TooManyRequestsException",
	"LimitExceededException",
	"Throttling",
	"ThrottlingException",
]);

const FAILED = {
	status: 500,
	error: "Failed to send email. Please try again later.",
};

interface SesErrorLike {
	name?: unknown;
	message?: unknown;
	$metadata?: { httpStatusCode?: unknown };
	$retryable?: { throttling?: unknown };
}

function asSesError(error: unknown): SesErrorLike {
	return error && typeof error === "object" ? (error as SesErrorLike) : {};
}

function errorName(error: unknown): string {
	const { name } = asSesError(error);
	return typeof name === "string" ? name : "";
}

export function isSendingPausedError(error: unknown): boolean {
	return SENDING_PAUSED.has(errorName(error));
}

/**
 * Provider text for the caller, without line breaks or details of our AWS
 * setup (ARNs, account ids, regions).
 */
function providerDetail(message: unknown): string {
	if (typeof message !== "string") return "";
	return message
		.replace(/[\u0000-\u001f\u007f]+/g, " ")
		.replace(/\barn:aws[\w-]*:\S*/gi, "")
		.replace(/\s*\bin region\s+[a-z]{2}(?:-[a-z]+)+-\d+\b/gi, "")
		.replace(/\b[a-z]{2}(?:-gov)?-[a-z]+-\d+\b/gi, "")
		.replace(/\b\d{12}\b/g, "")
		.replace(/\s+([.,:;])/g, "$1")
		.replace(/\s{2,}/g, " ")
		.trim()
		.slice(0, 300);
}

/**
 * Maps an SES SendEmail failure to an API response. Rejections of the
 * caller's message are 422 and a pause of the sender's own tenant is 403, so
 * SMTP clients get a permanent failure instead of retrying for days.
 * Throttling stays 429, and a pause while the tenant is active (Inbound's
 * whole SES account), outages and our own configuration errors are 500.
 */
export function sesSendErrorResponse(
	error: unknown,
	options: { tenantSendingActive?: boolean } = {},
): SesSendErrorResponse {
	const candidate = asSesError(error);
	const name = errorName(error);

	if (
		THROTTLED.has(name) ||
		candidate.$metadata?.httpStatusCode === 429 ||
		candidate.$retryable?.throttling === true
	) {
		return {
			status: 429,
			error: "Sending rate limit reached. Please try again later.",
		};
	}

	if (SENDING_PAUSED.has(name)) {
		if (options.tenantSendingActive !== false) return FAILED;
		return {
			status: 403,
			error: "Sending is paused for this account. Please contact support.",
		};
	}

	const rejected = REJECTED_INPUT[name];
	if (rejected) {
		const detail = DETAIL_PASSTHROUGH.has(name)
			? providerDetail(candidate.message)
			: "";
		return { status: 422, error: detail ? `${rejected}: ${detail}` : rejected };
	}

	return FAILED;
}
