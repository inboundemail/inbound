import { describe, expect, it } from "bun:test";
import {
	buildSentEmailTags,
	SENT_EMAIL_ID_TAG,
} from "@/app/api/e2/helper/ses-email-tags";

describe("buildSentEmailTags", () => {
	it("adds the internal sent email id to SES events", () => {
		expect(buildSentEmailTags("email_123")).toEqual([
			{ Name: SENT_EMAIL_ID_TAG, Value: "email_123" },
		]);
	});
});
