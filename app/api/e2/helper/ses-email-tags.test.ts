import { describe, expect, it } from "bun:test";
import {
	buildSentEmailTags,
	SENT_EMAIL_ID_TAG,
} from "@/app/api/e2/helper/ses-email-tags";
import {
	isSendingPausedError,
	sesSendErrorResponse,
} from "@/app/api/e2/helper/ses-send-errors";

describe("buildSentEmailTags", () => {
	it("adds the internal sent email id to SES events", () => {
		expect(buildSentEmailTags("email_123")).toEqual([
			{ Name: SENT_EMAIL_ID_TAG, Value: "email_123" },
		]);
	});
});

describe("sesSendErrorResponse", () => {
	function sesError(name: string, message = "", httpStatusCode = 400) {
		return Object.assign(new Error(message), {
			name,
			$metadata: { httpStatusCode },
		});
	}

	it.each([
		"MessageRejected",
		"BadRequestException",
		"InvalidParameterValue",
	])("maps %s to a 422 with the provider detail", (name) => {
		const response = sesSendErrorResponse(
			sesError(name, "Illegal header\r\n250 OK"),
		);
		expect(response.status).toBe(422);
		expect(response.error).toContain("Illegal header 250 OK");
		expect(response.error).not.toMatch(/[\r\n]/);
	});

	it("strips ARNs, account ids and regions from the provider detail", () => {
		const response = sesSendErrorResponse(
			sesError(
				"MessageRejected",
				"Email address is not verified. The following identities failed the check in region US-EAST-2: arn:aws:ses:us-east-2:123456789012:identity/example.com, sender@example.com",
			),
		);
		expect(response.status).toBe(422);
		expect(response.error).toBe(
			"Email rejected by the email provider: Email address is not verified. The following identities failed the check: sender@example.com",
		);
	});

	it("maps an unverified MAIL FROM domain to 422 without the provider detail", () => {
		expect(
			sesSendErrorResponse(
				sesError(
					"MailFromDomainNotVerifiedException",
					"arn:aws:ses:us-east-2:123456789012:configuration-set/x",
				),
			),
		).toEqual({
			status: 422,
			error: "The custom MAIL FROM domain for this sender is not verified",
		});
	});

	it.each([
		"AccountSuspendedException",
		"SendingPausedException",
	])("maps %s to 403 only when the tenant itself is not active", (name) => {
		expect(isSendingPausedError(sesError(name))).toBe(true);
		expect(
			sesSendErrorResponse(sesError(name), { tenantSendingActive: false })
				.status,
		).toBe(403);
		expect(
			sesSendErrorResponse(sesError(name), { tenantSendingActive: true }),
		).toEqual({
			status: 500,
			error: "Failed to send email. Please try again later.",
		});
		expect(sesSendErrorResponse(sesError(name)).status).toBe(500);
	});

	it("keeps throttling retryable as 429", () => {
		expect(
			sesSendErrorResponse(sesError("TooManyRequestsException", "", 429))
				.status,
		).toBe(429);
		expect(
			sesSendErrorResponse(sesError("LimitExceededException")).status,
		).toBe(429);
		expect(
			sesSendErrorResponse(
				Object.assign(new Error("slow down"), {
					name: "Unknown",
					$retryable: { throttling: true },
				}),
			).status,
		).toBe(429);
	});

	it("keeps outages, configuration errors and unknown failures as 500", () => {
		expect(
			sesSendErrorResponse(sesError("InternalServiceErrorException", "", 500)),
		).toEqual({
			status: 500,
			error: "Failed to send email. Please try again later.",
		});
		expect(
			sesSendErrorResponse(sesError("NotFoundException", "arn")).status,
		).toBe(500);
		expect(sesSendErrorResponse(new TypeError("fetch failed")).status).toBe(
			500,
		);
		expect(sesSendErrorResponse("boom").status).toBe(500);
	});
});
