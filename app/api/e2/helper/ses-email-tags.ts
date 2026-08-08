import type { MessageTag } from "@aws-sdk/client-sesv2";

export const SENT_EMAIL_ID_TAG = "sent_email_id";

export function buildSentEmailTags(sentEmailId: string): MessageTag[] {
	return [{ Name: SENT_EMAIL_ID_TAG, Value: sentEmailId }];
}
