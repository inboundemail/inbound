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

/**
 * Maps an SES SendEmail failure to an API response. Rejections of the
 * caller's message are 422 and paused or suspended sending is 403, so SMTP
 * clients get a permanent failure instead of retrying for days; throttling
 * stays 429 and everything else (outages, our own configuration) 500.
 */
export function sesSendErrorResponse(error: unknown): SesSendErrorResponse {
	const candidate =
		error && typeof error === "object"
			? (error as {
					name?: unknown;
					message?: unknown;
					$metadata?: { httpStatusCode?: unknown };
					$retryable?: { throttling?: unknown };
				})
			: {};
	const name = typeof candidate.name === "string" ? candidate.name : "";

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
		return {
			status: 403,
			error: "Sending is paused for this account. Please contact support.",
		};
	}

	const rejected = REJECTED_INPUT[name];
	if (rejected) {
		const detail =
			typeof candidate.message === "string"
				? candidate.message
						.replace(/[\u0000-\u001f\u007f]+/g, " ")
						.trim()
						.slice(0, 300)
				: "";
		return { status: 422, error: detail ? `${rejected}: ${detail}` : rejected };
	}

	return {
		status: 500,
		error: "Failed to send email. Please try again later.",
	};
}
