/**
 * Webhook Trigger - Handles webhook delivery for email actions
 * This module is separated from the main webhook route to break circular dependencies
 * and provide a clean interface for triggering email actions.
 */

import { createHash, createHmac } from "crypto";
import { and, eq, gte, ilike, isNull, lt } from "drizzle-orm";
import { db } from "@/lib/db";
import {
	emailAddresses,
	structuredEmails,
	webhookDeliveries,
	webhooks,
} from "@/lib/db/schema";
import { generateNewWebhookVerificationToken } from "@/lib/webhooks/verification";
import { type ParsedEmailData, sanitizeHtml } from "./email-parser";

function buildLegacyWebhookDeliveryId(
	emailId: string,
	webhookId: string,
): string {
	const hash = createHash("sha256")
		.update(`${emailId}:${webhookId}`)
		.digest("hex")
		.slice(0, 16);

	return `whd_${hash}`;
}

function isUniqueConstraintError(error: unknown): boolean {
	if (!(error instanceof Error)) {
		return false;
	}

	const errorWithCode = error as Error & { code?: string };
	return (
		errorWithCode.code === "23505" || error.message.includes("duplicate key")
	);
}

type LegacyDeliveryClaim = { attempts: number; updatedAt: Date };

async function claimLegacyWebhookDelivery(
	deliveryId: string,
	emailId: string,
	webhookId: string,
	webhookUrl: string,
	payload: string,
	manualRetry = false,
): Promise<LegacyDeliveryClaim | null> {
	const now = new Date();

	try {
		await db.insert(webhookDeliveries).values({
			id: deliveryId,
			emailId,
			webhookId,
			endpoint: webhookUrl,
			payload,
			status: "processing",
			attempts: 1,
			lastAttemptAt: now,
			createdAt: now,
			updatedAt: now,
		});
		return { attempts: 1, updatedAt: now };
	} catch (error) {
		if (!isUniqueConstraintError(error)) {
			throw error;
		}
	}

	const [existingDelivery] = await db
		.select({
			id: webhookDeliveries.id,
			status: webhookDeliveries.status,
			attempts: webhookDeliveries.attempts,
			updatedAt: webhookDeliveries.updatedAt,
		})
		.from(webhookDeliveries)
		.where(eq(webhookDeliveries.id, deliveryId))
		.limit(1);

	if (!existingDelivery) {
		throw new Error(
			`Expected an existing legacy webhook delivery for ${deliveryId}`,
		);
	}

	if (existingDelivery.status === "success") {
		console.log(
			`⏭️  triggerEmailAction - Delivery already succeeded for emailId=${emailId}, webhookId=${webhookId}. Skipping duplicate.`,
		);
		return null;
	}

	// A 'processing' delivery is retryable if the worker likely crashed:
	// use a 5-minute timeout as a conservative stale-lock threshold.
	const PROCESSING_STALE_MS = 5 * 60 * 1000;
	if (existingDelivery.status === "processing") {
		const staleAt = new Date(
			(existingDelivery.updatedAt?.getTime() ?? 0) + PROCESSING_STALE_MS,
		);
		if (manualRetry || now < staleAt) {
			console.log(
				`⏭️  triggerEmailAction - Delivery is already in progress (not yet stale) for emailId=${emailId}, webhookId=${webhookId}. Skipping duplicate.`,
			);
			return null;
		}
		console.log(
			`⚠️  triggerEmailAction - Stale processing delivery detected (>${PROCESSING_STALE_MS / 1000}s) for emailId=${emailId}, webhookId=${webhookId}. Reclaiming.`,
		);
	}
	// Any other status ('pending', 'failed') falls through to the CAS update below.
	// These are explicitly retryable — a failed delivery should be reattempted.

	const attempts = (existingDelivery.attempts ?? 0) + 1;
	const [claimedDelivery] = await db
		.update(webhookDeliveries)
		.set({
			status: "processing",
			attempts,
			lastAttemptAt: now,
			updatedAt: now,
			endpoint: webhookUrl,
			payload,
		})
		.where(
			and(
				eq(webhookDeliveries.id, deliveryId),
				eq(webhookDeliveries.status, existingDelivery.status),
				existingDelivery.attempts === null
					? isNull(webhookDeliveries.attempts)
					: eq(webhookDeliveries.attempts, existingDelivery.attempts),
				existingDelivery.updatedAt === null
					? isNull(webhookDeliveries.updatedAt)
					: and(
							gte(webhookDeliveries.updatedAt, existingDelivery.updatedAt),
							lt(
								webhookDeliveries.updatedAt,
								new Date(existingDelivery.updatedAt.getTime() + 1),
							),
						),
			),
		)
		.returning({ id: webhookDeliveries.id });

	if (!claimedDelivery) {
		console.log(
			`⏭️  triggerEmailAction - Another worker claimed delivery ${deliveryId} for emailId=${emailId}, webhookId=${webhookId}. Skipping duplicate.`,
		);
		return null;
	}

	console.log(
		`🔄 triggerEmailAction - Reclaiming delivery ${deliveryId} for retry (was: ${existingDelivery.status}) for emailId=${emailId}, webhookId=${webhookId}.`,
	);
	return { attempts, updatedAt: now };
}

/**
 * Trigger email action by emailID - looks up email data and sends to configured webhook
 * This function separates webhook processing from the main email ingestion flow
 */
export async function triggerEmailAction(
	emailId: string,
	options: { manualRetry?: boolean; userId?: string } = {},
): Promise<{ success: boolean; error?: string; deliveryId?: string }> {
	let claimedDeliveryId: string | undefined;
	try {
		console.log(`🎯 triggerEmailAction - Processing email ID: ${emailId}`);

		// Get the structured email record directly
		const emailRecords = await db
			.select({
				// All structured email data
				id: structuredEmails.id,
				emailId: structuredEmails.emailId,
				messageId: structuredEmails.messageId,
				date: structuredEmails.date,
				subject: structuredEmails.subject,
				recipient: structuredEmails.recipient,
				fromData: structuredEmails.fromData,
				toData: structuredEmails.toData,
				ccData: structuredEmails.ccData,
				bccData: structuredEmails.bccData,
				replyToData: structuredEmails.replyToData,
				inReplyTo: structuredEmails.inReplyTo,
				references: structuredEmails.references,
				textBody: structuredEmails.textBody,
				htmlBody: structuredEmails.htmlBody,
				rawContent: structuredEmails.rawContent,
				attachments: structuredEmails.attachments,
				headers: structuredEmails.headers,
				priority: structuredEmails.priority,
				parseSuccess: structuredEmails.parseSuccess,
				parseError: structuredEmails.parseError,
				userId: structuredEmails.userId,
			})
			.from(structuredEmails)
			.where(
				and(
					eq(structuredEmails.id, emailId),
					options.userId
						? eq(structuredEmails.userId, options.userId)
						: undefined,
				),
			)
			.limit(1);

		if (!emailRecords[0]) {
			return { success: false, error: "Email not found" };
		}

		const emailData = emailRecords[0];

		// Check if parsing was successful
		if (!emailData.parseSuccess) {
			return {
				success: false,
				error: `Email parsing failed: ${emailData.parseError || "Unknown error"}`,
			};
		}

		// Check if recipient exists
		if (!emailData.recipient) {
			return {
				success: false,
				error: "Email recipient not found",
			};
		}

		// Look up the email address to find the configured webhook
		const emailAddressRecord = await db
			.select({
				webhookId: emailAddresses.webhookId,
				address: emailAddresses.address,
				isActive: emailAddresses.isActive,
			})
			.from(emailAddresses)
			.where(
				and(
					ilike(
						emailAddresses.address,
						emailData.recipient.trim().replace(/[\\%_]/g, "\\$&"),
					),
					eq(emailAddresses.isActive, true),
					eq(emailAddresses.userId, emailData.userId),
				),
			)
			.limit(1);

		if (!emailAddressRecord[0]?.webhookId) {
			return {
				success: false,
				error: `No webhook configured for ${emailData.recipient}`,
			};
		}

		const webhookId = emailAddressRecord[0].webhookId;

		// Get the webhook configuration
		const webhookRecord = await db
			.select()
			.from(webhooks)
			.where(
				and(
					eq(webhooks.id, webhookId),
					eq(webhooks.isActive, true),
					eq(webhooks.userId, emailData.userId),
				),
			)
			.limit(1);

		if (!webhookRecord[0]) {
			return {
				success: false,
				error: `Webhook ${webhookId} not found or disabled for ${emailData.recipient}`,
			};
		}

		const webhook = webhookRecord[0];

		console.log(
			`📤 triggerEmailAction - Sending email ${emailData.messageId} to webhook: ${webhook.name} (${webhook.url})`,
		);

		// Reconstruct ParsedEmailData from structured data
		const parsedEmailData: ParsedEmailData = {
			messageId: emailData.messageId || undefined,
			date: emailData.date || undefined,
			subject: emailData.subject || undefined,
			from: emailData.fromData ? JSON.parse(emailData.fromData) : null,
			to: emailData.toData ? JSON.parse(emailData.toData) : null,
			cc: emailData.ccData ? JSON.parse(emailData.ccData) : null,
			bcc: emailData.bccData ? JSON.parse(emailData.bccData) : null,
			replyTo: emailData.replyToData ? JSON.parse(emailData.replyToData) : null,
			inReplyTo: emailData.inReplyTo || undefined,
			references: emailData.references
				? JSON.parse(emailData.references)
				: undefined,
			textBody: emailData.textBody || undefined,
			htmlBody: emailData.htmlBody || undefined,
			raw: emailData.rawContent || undefined,
			attachments: emailData.attachments
				? JSON.parse(emailData.attachments)
				: [],
			headers: emailData.headers ? JSON.parse(emailData.headers) : {},
			priority:
				emailData.priority === "false"
					? false
					: emailData.priority || undefined,
		};

		// Create webhook payload with the exact ParsedEmailData structure
		const webhookPayload = {
			event: "email.received",
			timestamp: new Date().toISOString(),
			email: {
				id: emailData.id, // structuredEmails.id
				messageId: emailData.messageId,
				from: emailData.fromData ? JSON.parse(emailData.fromData) : null,
				to: emailData.toData ? JSON.parse(emailData.toData) : null,
				recipient: emailData.recipient,
				subject: emailData.subject,
				receivedAt: emailData.date,

				// Full ParsedEmailData structure
				parsedData: parsedEmailData,

				// Cleaned content for backward compatibility
				cleanedContent: {
					html: parsedEmailData.htmlBody
						? sanitizeHtml(parsedEmailData.htmlBody)
						: null,
					text: parsedEmailData.textBody || null,
					hasHtml: !!parsedEmailData.htmlBody,
					hasText: !!parsedEmailData.textBody,
					attachments: parsedEmailData.attachments || [],
					headers: parsedEmailData.headers || {},
				},
			},
			webhook: {
				id: webhook.id,
				name: webhook.name,
			},
		};

		const payloadString = JSON.stringify(webhookPayload);

		// Create webhook signature if secret exists
		let signature = null;
		if (webhook.secret) {
			const hmac = createHmac("sha256", webhook.secret);
			hmac.update(payloadString);
			signature = `sha256=${hmac.digest("hex")}`;
		}

		// For legacy webhooks, generate a token (not persisted - endpoints have proper storage)
		// TODO: Legacy webhooks should migrate to endpoints for full verification token support
		// For now, we generate a token but users need the endpoint config to verify
		let verificationToken = "";
		const webhookWithVerificationToken = webhook as typeof webhook & {
			verificationToken?: string | null;
		};
		// Note: Legacy webhooks can't persist tokens easily, so this is a placeholder
		// Users should migrate to endpoints for full verification support
		if (webhookWithVerificationToken.verificationToken) {
			verificationToken = webhookWithVerificationToken.verificationToken;
		} else {
			// Generate a temporary token (won't be persisted for legacy webhooks)
			verificationToken = generateNewWebhookVerificationToken();
		}

		// Prepare headers
		const headers: Record<string, string> = {
			"Content-Type": "application/json",
			"User-Agent": "InboundEmail-Webhook/1.0",
			"X-Webhook-Event": "email.received",
			"X-Webhook-ID": webhook.id,
			"X-Webhook-Timestamp": webhookPayload.timestamp,
			"X-Email-ID": emailData.id,
			"X-Message-ID": emailData.messageId || "",
			"X-Webhook-Verification-Token": verificationToken, // Non-breaking verification token
		};

		if (signature) {
			headers["X-Webhook-Signature"] = signature;
		}

		// Add custom headers if any
		if (webhook.headers) {
			try {
				const customHeaders = JSON.parse(webhook.headers);
				Object.assign(headers, customHeaders);
			} catch (error) {
				console.error("Error parsing custom headers:", error);
			}
		}

		const deliveryId = buildLegacyWebhookDeliveryId(emailData.id, webhook.id);
		const claim = await claimLegacyWebhookDelivery(
			deliveryId,
			emailData.id,
			webhook.id,
			webhook.url,
			payloadString,
			options.manualRetry,
		);

		if (!claim) {
			if (!options.manualRetry) return { success: true, deliveryId };
			const [delivery] = await db
				.select({ status: webhookDeliveries.status })
				.from(webhookDeliveries)
				.where(eq(webhookDeliveries.id, deliveryId))
				.limit(1);
			return {
				success: delivery?.status === "success",
				deliveryId,
				error:
					delivery?.status === "success"
						? undefined
						: "Delivery is already in progress or changed; no new attempt was made",
			};
		}
		claimedDeliveryId = deliveryId;
		// Send the webhook
		const startTime = Date.now();
		let deliverySuccess = false;
		let responseCode = 0;
		let responseBody = "";
		let errorMessage = "";
		let deliveryTime = 0;

		try {
			const response = await fetch(webhook.url, {
				method: "POST",
				headers,
				body: payloadString,
				signal: AbortSignal.timeout((webhook.timeout || 30) * 1000),
			});

			deliveryTime = Date.now() - startTime;
			responseCode = response.status;
			responseBody = await response
				.text()
				.catch(() => "Unable to read response body");
			deliverySuccess = response.ok;

			console.log(
				`${deliverySuccess ? "✅" : "❌"} triggerEmailAction - Delivery ${deliverySuccess ? "succeeded" : "failed"} for ${emailData.recipient}: ${responseCode} in ${deliveryTime}ms`,
			);
		} catch (error) {
			deliveryTime = Date.now() - startTime;
			deliverySuccess = false;

			if (error instanceof Error) {
				if (error.name === "AbortError") {
					errorMessage = `Request timeout after ${webhook.timeout}s`;
				} else {
					errorMessage = error.message;
				}
			} else {
				errorMessage = "Unknown error";
			}

			console.error(
				`❌ triggerEmailAction - Delivery failed for ${emailData.recipient}:`,
				errorMessage,
			);
		}

		const [recorded] = await db
			.update(webhookDeliveries)
			.set({
				endpoint: webhook.url,
				payload: payloadString,
				status: deliverySuccess ? ("success" as const) : ("failed" as const),
				lastAttemptAt: new Date(),
				responseCode: responseCode || null,
				responseBody: responseBody ? responseBody.substring(0, 2000) : null,
				deliveryTime: deliveryTime,
				error: errorMessage || null,
				updatedAt: new Date(),
			})
			.where(
				and(
					eq(webhookDeliveries.id, deliveryId),
					eq(webhookDeliveries.status, "processing"),
					eq(webhookDeliveries.attempts, claim.attempts),
					eq(webhookDeliveries.updatedAt, claim.updatedAt),
				),
			)
			.returning({ status: webhookDeliveries.status });
		if (!recorded) {
			return {
				success: false,
				error:
					"Delivery changed while sending; this attempt's outcome could not be recorded",
				deliveryId,
			};
		}

		// Update webhook stats
		await db
			.update(webhooks)
			.set({
				lastUsed: new Date(),
				totalDeliveries: (webhook.totalDeliveries || 0) + 1,
				successfulDeliveries: deliverySuccess
					? (webhook.successfulDeliveries || 0) + 1
					: webhook.successfulDeliveries || 0,
				failedDeliveries: deliverySuccess
					? webhook.failedDeliveries || 0
					: (webhook.failedDeliveries || 0) + 1,
				updatedAt: new Date(),
			})
			.where(eq(webhooks.id, webhook.id));

		console.log(
			`📊 triggerEmailAction - Updated webhook stats for ${webhook.name}`,
		);

		return {
			success: deliverySuccess,
			error: deliverySuccess ? undefined : errorMessage,
			deliveryId: deliveryId,
		};
	} catch (error) {
		console.error(
			`❌ triggerEmailAction - Error processing email ${emailId}:`,
			error,
		);
		return {
			success: false,
			error: error instanceof Error ? error.message : "Unknown error",
			deliveryId: claimedDeliveryId,
		};
	}
}
