/**
 * Webhook payload construction and size management
 *
 * Extracted from email-router.ts to keep handleWebhookEndpoint focused on
 * orchestration (delivery record management, HTTP request, logging).
 */

import type { Endpoint } from "@/features/endpoints/types";
import type { ParsedEmailData } from "./email-parser";
import { sanitizeHtml } from "./email-parser";

// Maximum webhook payload size (1 MB safety margin)
export const MAX_WEBHOOK_PAYLOAD_SIZE = 1_000_000;

interface EmailData {
	structuredId: string;
	messageId: string | null;
	fromData: string | null;
	toData: string | null;
	recipient: string | null;
	subject: string | null;
	date: Date | null;
	threadId: string | null;
	threadPosition: number | null;
}

/**
 * Build the webhook payload from structured email data.
 */
export function constructWebhookPayload(
	emailData: EmailData,
	parsedEmailData: ParsedEmailData,
	attachmentsWithUrls: Array<Record<string, unknown>>,
	endpoint: Pick<Endpoint, "id" | "name" | "type">,
) {
	const enhancedParsedData = {
		...parsedEmailData,
		attachments: attachmentsWithUrls,
	};

	return {
		event: "email.received" as const,
		timestamp: new Date().toISOString(),
		email: {
			id: emailData.structuredId,
			messageId: emailData.messageId,
			from: emailData.fromData ? JSON.parse(emailData.fromData) : null,
			to: emailData.toData ? JSON.parse(emailData.toData) : null,
			recipient: emailData.recipient,
			subject: emailData.subject,
			receivedAt: emailData.date,

			threadId: emailData.threadId || null,
			threadPosition: emailData.threadPosition || null,

			parsedData: enhancedParsedData,

			cleanedContent: {
				html: parsedEmailData.htmlBody
					? sanitizeHtml(parsedEmailData.htmlBody)
					: null,
				text: parsedEmailData.textBody || null,
				hasHtml: !!parsedEmailData.htmlBody,
				hasText: !!parsedEmailData.textBody,
				attachments: attachmentsWithUrls,
				headers: parsedEmailData.headers || {},
			},
		},
		endpoint: {
			id: endpoint.id,
			name: endpoint.name,
			type: endpoint.type,
		},
	};
}

/**
 * Ensure the serialised payload fits within `maxSize` bytes.
 *
 * Strategy (applied in order until the payload fits):
 * 1. Strip base64-encoded attachment bodies from the `raw` field.
 * 2. Also strip the `headers` object from `parsedData`.
 *
 * Returns the (possibly reduced) payload string and a list of field names
 * that were stripped.
 */
export function ensurePayloadSize(
	webhookPayload: ReturnType<typeof constructWebhookPayload>,
	maxSize: number = MAX_WEBHOOK_PAYLOAD_SIZE,
): { payloadString: string; strippedFields: string[] } {
	const payloadString = JSON.stringify(webhookPayload);
	const strippedFields: string[] = [];

	if (payloadString.length <= maxSize) {
		return { payloadString, strippedFields };
	}

	console.warn(
		`⚠️ Webhook payload too large (${payloadString.length} bytes), stripping attachment bodies from raw field`,
	);

	const rawField = webhookPayload.email.parsedData.raw;
	if (!rawField) {
		return { payloadString, strippedFields };
	}

	// Remove base64-encoded attachment bodies while preserving MIME structure
	const cleanedRaw = rawField.replace(
		/Content-Transfer-Encoding:\s*base64\s*[\r\n]+[\r\n]+([\s\S]+?)(?=\r?\n--|\r?\n\r?\nContent-|$)/gi,
		"Content-Transfer-Encoding: base64\r\n\r\n[binary attachment data removed - use Attachments API]\r\n",
	);

	const payloadWithCleanedRaw = {
		...webhookPayload,
		email: {
			...webhookPayload.email,
			parsedData: {
				...webhookPayload.email.parsedData,
				raw: cleanedRaw,
			},
		},
	};
	const payloadStringWithCleanedRaw = JSON.stringify(payloadWithCleanedRaw);

	if (payloadStringWithCleanedRaw.length <= maxSize) {
		strippedFields.push("raw (attachment bodies removed)");
		console.log(
			`✅ Removed attachment bodies from raw field, new size: ${payloadStringWithCleanedRaw.length} bytes`,
		);
		return { payloadString: payloadStringWithCleanedRaw, strippedFields };
	}

	// Still too large — also strip headers
	const payloadWithNoHeaders = {
		...payloadWithCleanedRaw,
		email: {
			...payloadWithCleanedRaw.email,
			parsedData: {
				...payloadWithCleanedRaw.email.parsedData,
				headers: {},
			},
		},
	};
	const finalString = JSON.stringify(payloadWithNoHeaders);
	strippedFields.push("raw (attachment bodies removed)", "headers");
	console.warn(
		`⚠️ Also removed headers, final size: ${finalString.length} bytes`,
	);
	return { payloadString: finalString, strippedFields };
}
