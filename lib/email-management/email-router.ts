/**
 * Email Router - Core email routing system for inbound emails
 * Routes incoming emails to configured endpoints (webhooks, email forwarding, email groups) based on recipient configuration.
 * Handles both legacy webhook systems and new unified endpoint architecture with fallback logic.
 * Used by the webhook API route after email ingestion to deliver emails to their configured destinations.
 */

import { Autumn as autumn } from "autumn-js";
import { and, asc, eq, gte, ilike, isNull, lt, or } from "drizzle-orm";
import { nanoid } from "nanoid";
import type { Endpoint } from "@/features/endpoints/types";
import { getTenantSendingInfoForDomainOrParent } from "@/lib/aws-ses/identity-arn-helper";
import { db } from "@/lib/db";
import {
	emailAddresses,
	emailDomains,
	endpointDeliveries,
	endpoints,
	sesEvents,
	structuredEmails,
	webhookDeliveries,
} from "@/lib/db/schema";
import { getOrCreateVerificationToken } from "@/lib/webhooks/verification";
import { evaluateGuardRules } from "../guard/rule-matcher";
import { isDsn } from "@/lib/email-management/dsn-parser";
import {
	checkRecipientsAgainstBlocklist,
	isEmailBlocked,
} from "@/lib/email-management/email-blocking";
import { EmailForwarder } from "./email-forwarder";
import type { ParsedEmailData } from "./email-parser";
import { sanitizeHtml } from "./email-parser";
import { EmailThreader, type ThreadingResult } from "./email-threader";
import { triggerEmailAction } from "./webhook-trigger";

// Maximum webhook payload size (5MB safety margin)
const MAX_WEBHOOK_PAYLOAD_SIZE = 1_000_000;

type StructuredEmailWithData = NonNullable<
	Awaited<ReturnType<typeof getEmailWithStructuredData>>
>;

/**
 * Main email routing function - routes emails to appropriate endpoints
 */
type DeliveryResult = {
	success: boolean;
	message: string;
	delivery_id?: string;
};

type RetryTarget = {
	deliveryId?: string;
	endpointId?: string;
};

type RetryOptions = RetryTarget & { userId: string };

export class EmailRetryError extends Error {
	constructor(
		message: string,
		public readonly status: 400 | 404,
	) {
		super(message);
	}
}

export async function retryEmailDelivery(
	emailId: string,
	userId: string,
	target: RetryTarget = {},
): Promise<DeliveryResult> {
	if (target.deliveryId !== undefined && target.endpointId !== undefined) {
		throw new EmailRetryError(
			"Choose either delivery_id or endpoint_id, not both",
			400,
		);
	}
	if (target.deliveryId === "" || target.endpointId === "") {
		throw new EmailRetryError(
			"Delivery and endpoint IDs must not be empty",
			400,
		);
	}
	return routeEmailWithResult(emailId, { ...target, userId });
}

export async function routeEmail(emailId: string): Promise<void> {
	await routeEmailWithResult(emailId);
}

async function routeEmailWithResult(
	emailId: string,
	retry?: RetryOptions,
): Promise<DeliveryResult> {
	console.log(`🎯 routeEmail - Processing email ID: ${emailId}`);

	try {
		// Get email with structured data
		const emailData = await getEmailWithStructuredData(emailId, retry?.userId);
		if (!emailData) {
			throw new EmailRetryError(
				"Email not found or missing structured data",
				404,
			);
		}
		emailId = emailData.emailId;
		if (retry && !emailData.parseSuccess) {
			throw new EmailRetryError(
				"Email parsing failed; delivery cannot be retried",
				400,
			);
		}
		if (retry && emailData.guardBlocked) {
			throw new EmailRetryError(
				"Email is blocked by Guard and cannot be retried",
				400,
			);
		}
		if (retry) {
			const headers: Record<string, unknown> = emailData.headers
				? JSON.parse(emailData.headers)
				: {};
			if (
				isDsn(
					emailData.rawContent ||
						emailData.textBody ||
						emailData.htmlBody ||
						"",
					headers,
				)
			) {
				throw new EmailRetryError(
					"Delivery status notifications cannot be retried",
					400,
				);
			}
			const [sesEvent] = await db
				.select({ source: sesEvents.source })
				.from(sesEvents)
				.where(eq(sesEvents.id, emailData.sesEventId))
				.limit(1);
			if (!sesEvent) {
				throw new EmailRetryError(
					"Unable to verify the original envelope sender; delivery was not attempted",
					400,
				);
			}
			if (await isEmailBlocked(sesEvent.source, { throwOnError: true })) {
				throw new EmailRetryError(
					"The original envelope sender is blocked; delivery was not attempted",
					400,
				);
			}
		}
		let targetEndpoint: Endpoint | null = null;
		let targetEndpointId = retry?.endpointId;
		if (retry?.deliveryId) {
			const [delivery] = await db
				.select()
				.from(endpointDeliveries)
				.where(
					and(
						eq(endpointDeliveries.id, retry.deliveryId),
						eq(endpointDeliveries.emailId, emailId),
					),
				)
				.limit(1);
			if (!delivery) {
				throw new EmailRetryError("Delivery not found for this email", 404);
			}
			if (delivery.status === "success") {
				throw new EmailRetryError(
					"Delivery already succeeded. Use resend to deliver again.",
					400,
				);
			}
			if (delivery.status === "processing") {
				throw new EmailRetryError("Delivery is already in progress", 400);
			}
			targetEndpointId = delivery.endpointId;
		}
		if (targetEndpointId) {
			const [endpoint] = await db
				.select()
				.from(endpoints)
				.where(
					and(
						eq(endpoints.id, targetEndpointId),
						eq(endpoints.userId, emailData.userId),
						eq(endpoints.isActive, true),
					),
				)
				.limit(1);
			if (!endpoint) {
				throw new EmailRetryError("Endpoint not found or is inactive", 404);
			}
			targetEndpoint = endpoint;
		}

		// 🧵 NEW: Process threading before routing
		let threadingResult: ThreadingResult | null = null;
		try {
			threadingResult = retry
				? emailData.threadId && emailData.threadPosition
					? {
							threadId: emailData.threadId,
							threadPosition: emailData.threadPosition,
							isNewThread: false,
						}
					: null
				: await EmailThreader.processEmailForThreading(
						emailId,
						emailData.userId,
					);
			if (threadingResult)
				console.log(
					`🧵 Email ${emailId} assigned to thread ${threadingResult.threadId} at position ${threadingResult.threadPosition}${threadingResult.isNewThread ? " (new thread)" : ""}`,
				);
		} catch (threadingError) {
			// Don't fail routing if threading fails - log error and continue
			console.error(`⚠️ Threading failed for email ${emailId}:`, threadingError);
		}

		// Find associated endpoint for this email
		if (!emailData.recipient) {
			throw new Error("Email recipient not found");
		}

		// Check if this is a DMARC email and handle according to domain settings
		const isDmarcEmail = await checkIfDmarcEmail(
			emailData.recipient,
			emailData.userId,
		);
		if (isDmarcEmail) {
			console.log(
				`📊 routeEmail - DMARC email detected for ${emailData.recipient}, checking domain settings`,
			);
			return {
				success: false,
				message: "DMARC delivery is disabled by domain settings",
			};
		}

		// 🛡️ GUARD: Check feature flag before evaluating Guard rules
		let guardFeatureEnabled = false;
		try {
			const { data: guardCheck, error: guardCheckError } = await autumn.check({
				customer_id: emailData.userId,
				feature_id: "inbound_guard",
			});
			if (guardCheckError) {
				if (retry) {
					throw new EmailRetryError(
						"Unable to verify Guard policy; try again later",
						400,
					);
				}
				console.error(
					`⚠️ routeEmail - Autumn inbound_guard check error for user ${emailData.userId}:`,
					guardCheckError,
				);
			} else {
				guardFeatureEnabled = !!guardCheck?.allowed;
			}
		} catch (featureError) {
			if (retry) {
				throw new EmailRetryError(
					"Unable to verify Guard policy; try again later",
					400,
				);
			}
			console.error(
				"⚠️ routeEmail - Failed to check inbound_guard feature:",
				featureError,
			);
		}

		if (guardFeatureEnabled) {
			// 🛡️ GUARD: Evaluate Guard rules before routing
			const guardResult = await evaluateGuardRules(
				emailData.structuredId,
				emailData.userId,
			);

			if (guardResult.shouldBlock) {
				console.log(
					`🛡️ routeEmail - Email ${emailId} BLOCKED by Guard rule: ${guardResult.matchedRule?.name}`,
				);

				// Update the structured email record with Guard information
				await db
					.update(structuredEmails)
					.set({
						guardBlocked: true,
						guardReason:
							guardResult.reason ||
							`Blocked by rule: ${guardResult.matchedRule?.name}`,
						guardAction: "block",
						guardRuleId: guardResult.matchedRule?.id || null,
						guardMetadata: guardResult.metadata
							? JSON.stringify(guardResult.metadata)
							: null,
					})
					.where(eq(structuredEmails.id, emailData.structuredId));

				console.log(
					`✅ routeEmail - Updated email ${emailId} with Guard block information`,
				);

				// Email is stored but not routed - blocked by Guard
				return {
					success: false,
					message: "Email is blocked by Guard and cannot be delivered",
				};
			}

			// Handle other Guard actions (flag, label) that don't block
			if (
				guardResult.action &&
				guardResult.action !== "allow" &&
				!guardResult.shouldBlock
			) {
				console.log(
					`🛡️ routeEmail - Email ${emailId} flagged by Guard rule: ${guardResult.matchedRule?.name} (action: ${guardResult.action})`,
				);

				// Update the structured email record with Guard information
				await db
					.update(structuredEmails)
					.set({
						guardBlocked: false,
						guardReason:
							guardResult.reason ||
							`Flagged by rule: ${guardResult.matchedRule?.name}`,
						guardAction: guardResult.action,
						guardRuleId: guardResult.matchedRule?.id || null,
						guardMetadata: guardResult.metadata
							? JSON.stringify(guardResult.metadata)
							: null,
					})
					.where(eq(structuredEmails.id, emailData.structuredId));

				console.log(
					`✅ routeEmail - Updated email ${emailId} with Guard flag information (${guardResult.action})`,
				);
			}

			if (guardResult.action === "route" && guardResult.routeToEndpointId) {
				if (
					targetEndpoint &&
					targetEndpoint.id !== guardResult.routeToEndpointId
				) {
					throw new EmailRetryError(
						"Guard policy routes this email to a different endpoint",
						400,
					);
				}
				console.log(
					`🛡️ routeEmail - Email ${emailId} ROUTED by Guard rule to endpoint: ${guardResult.routeToEndpointId}`,
				);

				// Update the structured email record with Guard information
				await db
					.update(structuredEmails)
					.set({
						guardBlocked: false,
						guardReason:
							guardResult.reason ||
							`Routed by rule: ${guardResult.matchedRule?.name}`,
						guardAction: "route",
						guardRuleId: guardResult.matchedRule?.id || null,
						guardMetadata: guardResult.metadata
							? JSON.stringify(guardResult.metadata)
							: null,
					})
					.where(eq(structuredEmails.id, emailData.structuredId));

				// Fetch the specific endpoint
				const [guardEndpoint] = await db
					.select()
					.from(endpoints)
					.where(
						and(
							eq(endpoints.id, guardResult.routeToEndpointId),
							eq(endpoints.isActive, true),
							eq(endpoints.userId, emailData.userId),
						),
					)
					.limit(1);

				if (guardEndpoint) {
					targetEndpoint = guardEndpoint;
				} else {
					console.warn(
						`⚠️ routeEmail - Guard specified endpoint ${guardResult.routeToEndpointId} not found, falling back to normal routing`,
					);
				}
			}
		} else {
			console.log(
				"🛡️ routeEmail - Skipping Guard evaluation (feature inbound_guard disabled for user)",
			);
		}

		// 🧵 Thread Continuity: Check if this is a thread reply and route to original endpoint
		let endpoint: Endpoint | null = targetEndpoint;
		if (
			!endpoint &&
			threadingResult &&
			!threadingResult.isNewThread &&
			threadingResult.threadPosition &&
			threadingResult.threadPosition > 1
		) {
			console.log(
				`🧵 routeEmail - Email ${emailId} is a thread reply (position ${threadingResult.threadPosition}), checking for root endpoint routing`,
			);
			const rootEndpoint = await getThreadRootEndpoint(
				threadingResult.threadId,
				emailData.userId,
				emailData.recipient,
			);
			if (rootEndpoint) {
				endpoint = rootEndpoint;
				console.log(
					`🧵 routeEmail - Thread Continuity: Routing reply to original endpoint ${rootEndpoint.name} from root message`,
				);
			} else {
				console.log(
					`🧵 routeEmail - Thread Continuity: No root endpoint found or root recipient matches current, using normal routing`,
				);
			}
		}

		// If thread routing didn't find an endpoint, use normal endpoint lookup
		if (!endpoint) {
			// Pass userId to findEndpointForEmail to ensure proper filtering
			endpoint = await findEndpointForEmail(
				emailData.recipient,
				emailData.userId,
			);
		}
		if (!endpoint) {
			console.warn(
				`⚠️ routeEmail - No endpoint configured for ${emailData.recipient}, falling back to legacy webhook lookup`,
			);
			// Fallback to existing webhook logic for backward compatibility
			const result = await triggerEmailAction(
				emailData.structuredId,
				retry ? { manualRetry: true, userId: retry.userId } : undefined,
			);
			if (retry && result.deliveryId) {
				const [delivery] = await db
					.select({
						status: webhookDeliveries.status,
						error: webhookDeliveries.error,
						responseCode: webhookDeliveries.responseCode,
					})
					.from(webhookDeliveries)
					.where(
						and(
							eq(webhookDeliveries.id, result.deliveryId),
							eq(webhookDeliveries.emailId, emailData.structuredId),
						),
					)
					.limit(1);
				return {
					success: delivery?.status === "success",
					message:
						delivery?.status === "success"
							? "Legacy webhook delivery completed"
							: delivery?.status === "processing"
								? "Legacy webhook delivery is already in progress"
								: delivery?.error ||
									result.error ||
									(delivery?.responseCode
										? `Legacy webhook delivery failed with HTTP ${delivery.responseCode}`
										: "Legacy webhook delivery did not complete"),
					delivery_id: result.deliveryId,
				};
			}
			if (!result.success) {
				// Log the error but don't throw - this allows the email to be processed even without a webhook
				console.warn(
					`⚠️ routeEmail - No webhook configured for ${emailData.recipient}: ${result.error || "Legacy webhook processing failed"}`,
				);
				console.log(
					`📧 routeEmail - Email ${emailId} processed but not routed (no webhook/endpoint configured)`,
				);
				return {
					success: false,
					message: result.error || "Legacy webhook processing failed",
					delivery_id: result.deliveryId,
				};
			}
			return {
				success: true,
				message: "Legacy webhook delivery completed",
				delivery_id: result.deliveryId,
			};
		}

		console.log(
			`📍 routeEmail - Found endpoint: ${endpoint.name} (type: ${endpoint.type}) for ${emailData.recipient}`,
		);

		switch (endpoint.type) {
			case "webhook":
				return handleWebhookEndpoint(emailId, endpoint, retry);
			case "email":
			case "email_group":
				return handleEmailForwardEndpoint(emailId, endpoint, emailData, retry);
			default:
				throw new EmailRetryError(
					`Unsupported endpoint type: ${endpoint.type}`,
					400,
				);
		}
	} catch (error) {
		console.error(`❌ routeEmail - Error processing email ${emailId}:`, error);
		throw error;
	}
}

/**
 * Get email data with structured information
 */
async function getEmailWithStructuredData(emailId: string, userId?: string) {
	// Get the full structured email data in a single query
	const emailWithStructuredData = await db
		.select({
			// Email record fields
			emailId: structuredEmails.emailId,
			userId: structuredEmails.userId,
			sesEventId: structuredEmails.sesEventId,

			// Structured email data (ParsedEmailData)
			structuredId: structuredEmails.id,
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
			guardBlocked: structuredEmails.guardBlocked,

			// Threading fields
			threadId: structuredEmails.threadId,
			threadPosition: structuredEmails.threadPosition,
		})
		.from(structuredEmails)
		.where(
			and(
				or(
					eq(structuredEmails.id, emailId),
					eq(structuredEmails.emailId, emailId),
				),
				userId ? eq(structuredEmails.userId, userId) : undefined,
			),
		)
		.limit(1);

	const result = emailWithStructuredData[0];
	if (!result) {
		return null;
	}

	// Recipient is now stored directly in structuredEmails.recipient
	return result;
}

/**
 * Get the endpoint for the root email in a thread (Thread Continuity feature)
 * Routes thread replies to the original endpoint that received the first message
 */
async function getThreadRootEndpoint(
	threadId: string,
	userId: string,
	currentRecipient: string,
): Promise<Endpoint | null> {
	try {
		console.log(
			`🧵 getThreadRootEndpoint - Looking for root endpoint in thread ${threadId} (current recipient: ${currentRecipient})`,
		);

		// First try to find email with threadPosition = 1
		let rootEmail = await db
			.select({
				recipient: structuredEmails.recipient,
				threadPosition: structuredEmails.threadPosition,
				id: structuredEmails.id,
				date: structuredEmails.date,
			})
			.from(structuredEmails)
			.where(
				and(
					eq(structuredEmails.threadId, threadId),
					eq(structuredEmails.threadPosition, 1),
					eq(structuredEmails.userId, userId),
				),
			)
			.limit(1);

		// If not found, fall back to finding the earliest email by threadPosition or date
		if (!rootEmail[0]) {
			console.log(
				`⚠️ getThreadRootEndpoint - No email with threadPosition=1 found, looking for earliest email in thread ${threadId}`,
			);

			// Find all emails in thread, ordered by threadPosition (nulls last), then by date
			const allThreadEmails = await db
				.select({
					recipient: structuredEmails.recipient,
					threadPosition: structuredEmails.threadPosition,
					id: structuredEmails.id,
					date: structuredEmails.date,
				})
				.from(structuredEmails)
				.where(
					and(
						eq(structuredEmails.threadId, threadId),
						eq(structuredEmails.userId, userId),
					),
				)
				.orderBy(
					// Order by threadPosition ascending (nulls will naturally sort last), then by date ascending
					asc(structuredEmails.threadPosition),
					asc(structuredEmails.date),
				)
				.limit(1);

			if (allThreadEmails[0]) {
				rootEmail = [allThreadEmails[0]];
				console.log(
					`✅ getThreadRootEndpoint - Found earliest email in thread: ${rootEmail[0].id} (threadPosition: ${rootEmail[0].threadPosition || "null"})`,
				);
			}
		}

		if (!rootEmail[0]) {
			console.log(
				`⚠️ getThreadRootEndpoint - Root email not found in thread ${threadId}`,
			);
			return null;
		}

		const rootRecipient = rootEmail[0].recipient;
		if (!rootRecipient) {
			console.log(`⚠️ getThreadRootEndpoint - Root email has no recipient`);
			return null;
		}

		// If the current recipient is the same as root recipient, skip (already correct)
		if (rootRecipient === currentRecipient) {
			console.log(
				`🧵 getThreadRootEndpoint - Current recipient matches root recipient, using normal routing`,
			);
			return null;
		}

		console.log(
			`🧵 getThreadRootEndpoint - Found root email recipient: ${rootRecipient}`,
		);

		// Find the endpoint for the root recipient
		const rootEndpoint = await findEndpointForEmail(rootRecipient, userId);

		if (!rootEndpoint) {
			console.log(
				`⚠️ getThreadRootEndpoint - No endpoint configured for root recipient ${rootRecipient}`,
			);
			return null;
		}

		// Verify endpoint is active
		if (!rootEndpoint.isActive) {
			console.log(
				`⚠️ getThreadRootEndpoint - Root endpoint ${rootEndpoint.id} is inactive, falling back to normal routing`,
			);
			return null;
		}

		console.log(
			`✅ getThreadRootEndpoint - Found root endpoint: ${rootEndpoint.name} (type: ${rootEndpoint.type}) for recipient ${rootRecipient}`,
		);
		return rootEndpoint;
	} catch (error) {
		console.error(
			`❌ getThreadRootEndpoint - Error finding root endpoint for thread ${threadId}:`,
			error,
		);
		return null;
	}
}

/**
 * Find endpoint configuration for an email recipient
 * Priority: endpointId → webhookId → catch-all endpoint → catch-all webhook
 */
async function findEndpointForEmail(
	recipient: string,
	userId: string,
): Promise<Endpoint | null> {
	try {
		console.log(
			`🔍 findEndpointForEmail - Looking for endpoint for ${recipient} (userId: ${userId})`,
		);

		// Step 1: Look up the email address to find the configured endpoint
		const emailAddressRecord = await db
			.select({
				endpointId: emailAddresses.endpointId,
				webhookId: emailAddresses.webhookId, // Keep for backward compatibility
				address: emailAddresses.address,
				isActive: emailAddresses.isActive,
				domainId: emailAddresses.domainId,
			})
			.from(emailAddresses)
			.where(
				and(
					ilike(
						emailAddresses.address,
						recipient.trim().replace(/[\\%_]/g, "\\$&"),
					),
					eq(emailAddresses.isActive, true),
					eq(emailAddresses.userId, userId),
				),
			)
			.limit(1);

		if (emailAddressRecord[0]) {
			const { endpointId, webhookId } = emailAddressRecord[0];

			// Priority 1: Use endpointId if available
			if (endpointId) {
				const endpointRecord = await db
					.select()
					.from(endpoints)
					.where(
						and(
							eq(endpoints.id, endpointId),
							eq(endpoints.isActive, true),
							eq(endpoints.userId, userId),
						),
					)
					.limit(1);

				if (endpointRecord[0]) {
					console.log(
						`📍 findEndpointForEmail - Found email-specific endpoint: ${endpointRecord[0].name} for ${recipient}`,
					);
					return endpointRecord[0];
				}
			}

			// Priority 2: Fall back to webhookId for backward compatibility
			if (webhookId) {
				console.log(
					`🔄 findEndpointForEmail - Using legacy webhook ${webhookId} for ${recipient}`,
				);
				return null; // Return null to trigger legacy webhook processing
			}
		}

		// Step 2: Check for domain-level catch-all configuration
		const domain = recipient.split("@")[1];
		if (!domain) {
			console.warn(
				`⚠️ findEndpointForEmail - Invalid email format: ${recipient}`,
			);
			return null;
		}

		console.log(
			`🌐 findEndpointForEmail - Checking catch-all configuration for domain: ${domain}`,
		);

		const domainRecord = await db
			.select({
				isCatchAllEnabled: emailDomains.isCatchAllEnabled,
				catchAllEndpointId: emailDomains.catchAllEndpointId,
				catchAllWebhookId: emailDomains.catchAllWebhookId,
				domain: emailDomains.domain,
			})
			.from(emailDomains)
			.where(
				and(
					eq(emailDomains.domain, domain),
					eq(emailDomains.isCatchAllEnabled, true),
					eq(emailDomains.userId, userId),
				),
			)
			.limit(1);

		if (domainRecord[0]) {
			const { catchAllEndpointId, catchAllWebhookId } = domainRecord[0];
			console.log(
				`🌐 findEndpointForEmail - Found catch-all domain: ${domain}, endpointId: ${catchAllEndpointId}, webhookId: ${catchAllWebhookId}`,
			);

			// Priority 3: Use catch-all endpoint
			if (catchAllEndpointId) {
				const catchAllEndpointRecord = await db
					.select()
					.from(endpoints)
					.where(
						and(
							eq(endpoints.id, catchAllEndpointId),
							eq(endpoints.isActive, true),
							eq(endpoints.userId, userId),
						),
					)
					.limit(1);

				if (catchAllEndpointRecord[0]) {
					console.log(
						`🌐 findEndpointForEmail - Found catch-all endpoint: ${catchAllEndpointRecord[0].name} for ${recipient}`,
					);
					return catchAllEndpointRecord[0];
				} else {
					console.warn(
						`⚠️ findEndpointForEmail - Catch-all endpoint ${catchAllEndpointId} not found or inactive`,
					);
				}
			}

			// Priority 4: Fall back to catch-all webhook for backward compatibility
			if (catchAllWebhookId) {
				console.log(
					`🔄 findEndpointForEmail - Using catch-all legacy webhook ${catchAllWebhookId} for ${recipient}`,
				);
				return null; // Return null to trigger legacy webhook processing
			}
		} else {
			console.warn(
				`⚠️ findEndpointForEmail - No catch-all domain configuration found for ${domain} (userId: ${userId})`,
			);
		}

		console.warn(
			`⚠️ findEndpointForEmail - No endpoint, webhook, or catch-all configuration found for ${recipient}`,
		);
		return null;
	} catch (error) {
		console.error(
			`❌ findEndpointForEmail - Error finding endpoint for ${recipient}:`,
			error,
		);
		return null;
	}
}

type DeliveryClaim = {
	id: string;
	attempts: number;
	updatedAt: Date;
};

async function claimEndpointDelivery(
	emailId: string,
	endpoint: Endpoint,
	retry?: RetryOptions,
): Promise<DeliveryClaim | DeliveryResult> {
	const now = new Date();
	if (!retry?.deliveryId) {
		const [inserted] = await db
			.insert(endpointDeliveries)
			.values({
				id: nanoid(),
				emailId,
				endpointId: endpoint.id,
				deliveryType: endpoint.type === "webhook" ? "webhook" : "email_forward",
				status: "processing",
				attempts: 1,
				lastAttemptAt: now,
				createdAt: now,
				updatedAt: now,
			})
			.onConflictDoNothing({
				target: [endpointDeliveries.emailId, endpointDeliveries.endpointId],
			})
			.returning({ id: endpointDeliveries.id });
		if (inserted) {
			return { id: inserted.id, attempts: 1, updatedAt: now };
		}
	}
	const [existing] = await db
		.select()
		.from(endpointDeliveries)
		.where(
			and(
				eq(endpointDeliveries.emailId, emailId),
				eq(endpointDeliveries.endpointId, endpoint.id),
				retry?.deliveryId
					? eq(endpointDeliveries.id, retry.deliveryId)
					: undefined,
			),
		)
		.limit(1);
	if (!existing) {
		throw new EmailRetryError("Delivery not found for this email", 404);
	}
	if (existing.status === "success" && retry?.endpointId !== endpoint.id) {
		return {
			success: !retry,
			message: "Delivery already succeeded. Use resend to deliver again.",
			delivery_id: existing.id,
		};
	}
	if (
		existing.status === "processing" &&
		(retry ||
			now.getTime() - (existing.updatedAt?.getTime() ?? 0) < 5 * 60 * 1000)
	) {
		return {
			success: false,
			message: "Delivery is already in progress; no new attempt was made",
			delivery_id: existing.id,
		};
	}
	if (
		!["pending", "failed", "success", "processing"].includes(existing.status)
	) {
		return {
			success: false,
			message: "This delivery is not retryable",
			delivery_id: existing.id,
		};
	}
	const attempts = (existing.attempts ?? 0) + 1;
	const [claimed] = await db
		.update(endpointDeliveries)
		.set({
			status: "processing",
			attempts,
			lastAttemptAt: now,
			updatedAt: now,
		})
		.where(
			and(
				eq(endpointDeliveries.id, existing.id),
				eq(endpointDeliveries.emailId, emailId),
				eq(endpointDeliveries.endpointId, endpoint.id),
				eq(endpointDeliveries.status, existing.status),
				existing.attempts === null
					? isNull(endpointDeliveries.attempts)
					: eq(endpointDeliveries.attempts, existing.attempts),
				existing.updatedAt === null
					? isNull(endpointDeliveries.updatedAt)
					: and(
							gte(endpointDeliveries.updatedAt, existing.updatedAt),
							lt(
								endpointDeliveries.updatedAt,
								new Date(existing.updatedAt.getTime() + 1),
							),
						),
			),
		)
		.returning({ id: endpointDeliveries.id });
	if (!claimed) {
		return {
			success: false,
			message:
				"Delivery changed or another attempt claimed it; no new attempt was made",
			delivery_id: existing.id,
		};
	}
	return { id: claimed.id, attempts, updatedAt: now };
}

async function recordDeliveryResult(
	claim: DeliveryClaim,
	values: Pick<
		typeof endpointDeliveries.$inferInsert,
		"status" | "responseData"
	>,
	message: string,
): Promise<DeliveryResult> {
	const [recorded] = await db
		.update(endpointDeliveries)
		.set({
			...values,
			updatedAt: new Date(),
		})
		.where(
			and(
				eq(endpointDeliveries.id, claim.id),
				eq(endpointDeliveries.status, "processing"),
				eq(endpointDeliveries.attempts, claim.attempts),
				eq(endpointDeliveries.updatedAt, claim.updatedAt),
			),
		)
		.returning({ status: endpointDeliveries.status });
	return {
		success: recorded?.status === "success",
		message: recorded
			? message
			: "Delivery changed while sending; this attempt's outcome could not be recorded. Check delivery status before retrying.",
		delivery_id: claim.id,
	};
}

/**
 * Handle webhook endpoint routing (direct implementation for unified endpoints)
 */
async function handleWebhookEndpoint(
	emailId: string,
	endpoint: Endpoint,
	retry?: RetryOptions,
): Promise<DeliveryResult> {
	const claim = await claimEndpointDelivery(emailId, endpoint, retry);
	if (!("id" in claim)) {
		return claim;
	}
	const deliveryId = claim.id;

	try {
		console.log(
			`📡 handleWebhookEndpoint - Processing webhook endpoint: ${endpoint.name}`,
		);

		// Get email with structured data
		const emailData = await getEmailWithStructuredData(
			emailId,
			endpoint.userId,
		);
		if (!emailData) {
			throw new Error("Email not found or missing structured data");
		}

		// Parse endpoint configuration
		const config = JSON.parse(endpoint.config);
		const webhookUrl = config.url;
		const timeout = config.timeout || 30;
		const retryAttempts = config.retryAttempts || 3;
		const customHeaders = config.headers || {};

		if (!webhookUrl) {
			throw new Error("Webhook URL not configured");
		}

		// Get or create verification token (will be added to config if missing)
		const hadToken = !!config.verificationToken;
		const verificationToken = getOrCreateVerificationToken(config);

		// If we generated a new token, save it back to the database
		if (!hadToken) {
			await db
				.update(endpoints)
				.set({
					config: JSON.stringify(config),
					updatedAt: new Date(),
				})
				.where(eq(endpoints.id, endpoint.id));
			console.log(
				`🔐 handleWebhookEndpoint - Generated and saved new verification token for endpoint ${endpoint.id}`,
			);
		}

		// Reconstruct ParsedEmailData from structured data
		const parsedEmailData = reconstructParsedEmailData(emailData);

		// Get the base URL for attachment downloads (from environment or construct from request)
		const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://inbound.new";

		// Add download URLs to attachments in parsedData
		const attachmentsWithUrls =
			parsedEmailData.attachments?.map((att) => ({
				...att,
				downloadUrl: `${baseUrl}/api/e2/attachments/${emailData.structuredId}/${encodeURIComponent(att.filename || "attachment")}`,
			})) || [];

		// Create enhanced parsedData with download URLs
		const enhancedParsedData = {
			...parsedEmailData,
			attachments: attachmentsWithUrls,
		};

		// Create webhook payload with the exact structure expected
		const webhookPayload = {
			event: "email.received",
			timestamp: new Date().toISOString(),
			email: {
				id: emailData.structuredId, // Use structured email ID for v2 API compatibility
				messageId: emailData.messageId,
				from: emailData.fromData ? JSON.parse(emailData.fromData) : null,
				to: emailData.toData ? JSON.parse(emailData.toData) : null,
				recipient: emailData.recipient,
				subject: emailData.subject,
				receivedAt: emailData.date,

				// Threading information
				threadId: emailData.threadId || null,
				threadPosition: emailData.threadPosition || null,

				// Full ParsedEmailData structure with download URLs
				parsedData: enhancedParsedData,

				// Cleaned content for backward compatibility
				cleanedContent: {
					html: parsedEmailData.htmlBody
						? sanitizeHtml(parsedEmailData.htmlBody)
						: null,
					text: parsedEmailData.textBody || null,
					hasHtml: !!parsedEmailData.htmlBody,
					hasText: !!parsedEmailData.textBody,
					attachments: attachmentsWithUrls, // Include download URLs in cleaned content too
					headers: parsedEmailData.headers || {},
				},
			},
			endpoint: {
				id: endpoint.id,
				name: endpoint.name,
				type: endpoint.type,
			},
		};

		const payloadString = JSON.stringify(webhookPayload);

		// Prepare headers
		const headers: HeadersInit = {
			"Content-Type": "application/json",
			"User-Agent": "InboundEmail-Webhook/1.0",
			"X-Webhook-Event": "email.received",
			"X-Endpoint-ID": endpoint.id,
			"X-Webhook-Timestamp": webhookPayload.timestamp,
			"X-Email-ID": emailData.structuredId, // Use structured email ID for v2 API compatibility
			"X-Message-ID": emailData.messageId || "",
			"X-Webhook-Verification-Token": verificationToken, // Non-breaking verification token
			...customHeaders,
		};

		// Check payload size and strip fields if necessary
		let finalPayload = webhookPayload;
		let finalPayloadString = payloadString;
		const strippedFields: string[] = [];

		if (payloadString.length > MAX_WEBHOOK_PAYLOAD_SIZE) {
			console.warn(
				`⚠️ handleWebhookEndpoint - Webhook payload too large (${payloadString.length} bytes), stripping attachment bodies from raw field`,
			);

			// Try stripping attachment bodies from raw field first
			if (enhancedParsedData.raw) {
				// Remove base64-encoded attachment bodies while preserving MIME structure and headers
				// This regex finds ALL base64 content from header until next MIME boundary
				const cleanedRaw = enhancedParsedData.raw.replace(
					/Content-Transfer-Encoding:\s*base64\s*[\r\n]+[\r\n]+([\s\S]+?)(?=\r?\n--|\r?\n\r?\nContent-|$)/gi,
					"Content-Transfer-Encoding: base64\r\n\r\n[binary attachment data removed - use Attachments API]\r\n",
				);

				const payloadWithCleanedRaw = {
					...webhookPayload,
					email: {
						...webhookPayload.email,
						parsedData: {
							...enhancedParsedData,
							raw: cleanedRaw,
						},
					},
				};
				const payloadStringWithCleanedRaw = JSON.stringify(
					payloadWithCleanedRaw,
				);

				if (payloadStringWithCleanedRaw.length <= MAX_WEBHOOK_PAYLOAD_SIZE) {
					finalPayload = payloadWithCleanedRaw;
					finalPayloadString = payloadStringWithCleanedRaw;
					strippedFields.push("raw (attachment bodies removed)");
					console.log(
						`✅ handleWebhookEndpoint - Removed attachment bodies from raw field, new size: ${payloadStringWithCleanedRaw.length} bytes`,
					);
				} else {
					// Still too large, also strip headers
					const payloadWithCleanedRawAndNoHeaders = {
						...payloadWithCleanedRaw,
						email: {
							...payloadWithCleanedRaw.email,
							parsedData: {
								...enhancedParsedData,
								raw: cleanedRaw,
								headers: {},
							},
						},
					};
					const payloadStringWithCleanedRawAndNoHeaders = JSON.stringify(
						payloadWithCleanedRawAndNoHeaders,
					);
					finalPayload = payloadWithCleanedRawAndNoHeaders;
					finalPayloadString = payloadStringWithCleanedRawAndNoHeaders;
					strippedFields.push("raw (attachment bodies removed)", "headers");
					console.warn(
						`⚠️ handleWebhookEndpoint - Also removed headers, final size: ${payloadStringWithCleanedRawAndNoHeaders.length} bytes`,
					);
				}
			}

			if (strippedFields.length > 0) {
				console.log(
					`📋 handleWebhookEndpoint - Cleaned payload for ${endpoint.name}: ${strippedFields.join(", ")}`,
				);
			}
		}

		// Send the webhook
		const startTime = Date.now();
		let deliverySuccess = false;
		let responseCode = 0;
		let responseBody = "";
		const responseHeaders: Record<string, string> = {};
		let errorMessage = "";
		let deliveryTime = 0;

		// Log comprehensive request details BEFORE sending
		console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
		console.log(`📤 Webhook Request - Starting delivery`);
		console.log(`  Endpoint:       ${endpoint.name} (ID: ${endpoint.id})`);
		console.log(`  URL:            ${webhookUrl}`);
		console.log(`  Method:         POST`);
		console.log(`  Timeout:        ${timeout}s`);
		console.log(`  Email ID:       ${emailData.structuredId}`);
		console.log(`  Message ID:     ${emailData.messageId}`);
		console.log(`  Recipient:      ${emailData.recipient}`);
		console.log(`  Subject:        ${emailData.subject}`);
		console.log(
			`  Payload Size:   ${finalPayloadString.length.toLocaleString()} bytes`,
		);
		if (strippedFields.length > 0) {
			console.log(`  Stripped:       ${strippedFields.join(", ")}`);
		}
		console.log(`  Headers:`);
		Object.entries(headers).forEach(([key, value]) => {
			// Mask sensitive headers
			const displayValue =
				key.toLowerCase().includes("token") ||
				key.toLowerCase().includes("auth")
					? `${String(value).substring(0, 8)}...`
					: value;
			console.log(`    ${key}: ${displayValue}`);
		});
		console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

		try {
			const response = await fetch(webhookUrl, {
				method: "POST",
				headers,
				body: finalPayloadString, // Use finalPayloadString after stripping
				signal: AbortSignal.timeout(timeout * 1000),
			});

			deliveryTime = Date.now() - startTime;
			responseCode = response.status;
			responseBody = await response
				.text()
				.catch(() => "Unable to read response body");
			deliverySuccess = response.ok;

			// Capture response headers
			response.headers.forEach((value, key) => {
				responseHeaders[key] = value;
			});

			// Log comprehensive response details
			console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
			console.log(
				`${deliverySuccess ? "✅" : "❌"} Webhook Response - ${deliverySuccess ? "SUCCESS" : "FAILED"}`,
			);
			console.log(`  Status Code:    ${responseCode} ${response.statusText}`);
			console.log(`  Delivery Time:  ${deliveryTime}ms`);
			console.log(`  URL:            ${webhookUrl}`);
			console.log(`  Response Headers:`);
			Object.entries(responseHeaders).forEach(([key, value]) => {
				console.log(`    ${key}: ${value}`);
			});
			console.log(
				`  Response Body:  ${responseBody.length > 500 ? responseBody.substring(0, 500) + "... (truncated)" : responseBody}`,
			);
			console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

			if (!deliverySuccess) {
				console.log(`❌ Webhook Failed - Non-OK status code`);
				console.log(`  Expected: 2xx status code`);
				console.log(`  Received: ${responseCode}`);
				console.log(`  This usually indicates:`);
				if (responseCode === 404) {
					console.log(`    - The webhook endpoint URL doesn't exist`);
					console.log(`    - The endpoint path is incorrect`);
					console.log(
						`    - The server is not handling POST requests at this path`,
					);
				} else if (responseCode === 401 || responseCode === 403) {
					console.log(`    - Authentication/authorization failure`);
					console.log(`    - Check verification token or custom auth headers`);
				} else if (
					responseCode === 500 ||
					responseCode === 502 ||
					responseCode === 503
				) {
					console.log(`    - Server error on the webhook receiver side`);
					console.log(`    - Check the receiver's application logs`);
				} else if (responseCode === 400) {
					console.log(`    - Bad request - the payload may be invalid`);
					console.log(`    - Check the webhook receiver's expected format`);
				}
			}
		} catch (error) {
			deliveryTime = Date.now() - startTime;
			deliverySuccess = false;

			if (error instanceof Error) {
				if (error.name === "AbortError") {
					errorMessage = `Request timeout after ${timeout}s`;
				} else {
					errorMessage = error.message;
				}
			} else {
				errorMessage = "Unknown error";
			}

			// Log comprehensive error details
			console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
			console.error(`❌ Webhook Error - Request Failed`);
			console.error(
				`  Error Type:     ${error instanceof Error ? error.name : "Unknown"}`,
			);
			console.error(`  Error Message:  ${errorMessage}`);
			console.error(`  Delivery Time:  ${deliveryTime}ms (failed)`);
			console.error(`  URL:            ${webhookUrl}`);
			console.error(`  Timeout Config: ${timeout}s`);

			if (error instanceof Error) {
				if (error.name === "AbortError") {
					console.error(`  Cause:          Request exceeded timeout limit`);
					console.error(
						`  Resolution:     Increase timeout in endpoint config or optimize webhook handler`,
					);
				} else if (
					error.message.includes("fetch failed") ||
					error.message.includes("ECONNREFUSED")
				) {
					console.error(`  Cause:          Cannot connect to webhook URL`);
					console.error(
						`  Resolution:     Check if the URL is accessible and the server is running`,
					);
				} else if (
					error.message.includes("ENOTFOUND") ||
					error.message.includes("getaddrinfo")
				) {
					console.error(`  Cause:          DNS resolution failed`);
					console.error(
						`  Resolution:     Check if the domain name is correct and resolvable`,
					);
				} else if (
					error.message.includes("certificate") ||
					error.message.includes("SSL")
				) {
					console.error(`  Cause:          SSL/TLS certificate issue`);
					console.error(`  Resolution:     Check SSL certificate validity`);
				}

				if (error.stack) {
					console.error(`  Stack Trace:`);
					error.stack
						.split("\n")
						.slice(0, 5)
						.forEach((line) => {
							console.error(`    ${line}`);
						});
				}
			}
			console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
		}

		const result = await recordDeliveryResult(
			claim,
			{
				status: deliverySuccess ? "success" : "failed",
				responseData: JSON.stringify({
					responseCode,
					responseBody: responseBody ? responseBody.substring(0, 2000) : null,
					responseHeaders,
					deliveryTime,
					error: errorMessage || null,
					url: webhookUrl,
					payloadSize: finalPayloadString.length,
					strippedFields: strippedFields.length > 0 ? strippedFields : null,
					deliveredAt: new Date().toISOString(),
				}),
			},
			deliverySuccess
				? "Webhook delivered successfully"
				: errorMessage || `Webhook delivery failed with HTTP ${responseCode}`,
		);

		if (!deliverySuccess) {
			// Log the failure but don't throw - webhook receiver errors are not our fault
			console.log(
				`❌ handleWebhookEndpoint - Webhook delivery failed with status ${responseCode} for email ${emailId} to ${endpoint.name}`,
			);
			console.log(
				`   This is a receiver-side error and does not affect email processing`,
			);
			return result;
		}

		console.log(
			`✅ handleWebhookEndpoint - Successfully delivered email ${emailId} to webhook ${endpoint.name} (${deliveryTime}ms)`,
		);
		return result;
	} catch (error) {
		let result: DeliveryResult = {
			success: false,
			message:
				"Delivery failed and its outcome could not be recorded. Check delivery status before retrying.",
			delivery_id: deliveryId,
		};
		try {
			result = await recordDeliveryResult(
				claim,
				{
					status: "failed",
					responseData: JSON.stringify({
						error: error instanceof Error ? error.message : "Unknown error",
						errorType: error instanceof Error ? error.name : "Unknown",
						failedAt: new Date().toISOString(),
					}),
				},
				error instanceof Error ? error.message : "Webhook delivery failed",
			);
		} catch (updateError) {
			console.error(
				"❌ handleWebhookEndpoint - Failed to update delivery record:",
				updateError,
			);
		}

		console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
		console.error(`❌ handleWebhookEndpoint - Final Error Summary`);
		console.error(`  Endpoint:       ${endpoint.name} (ID: ${endpoint.id})`);
		console.error(`  Email ID:       ${emailId}`);
		console.error(
			`  Error:          ${error instanceof Error ? error.message : "Unknown error"}`,
		);
		console.error(`  Delivery ID:    ${deliveryId}`);
		console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
		if (retry) return result;
		throw error;
	}
}

/**
 * Handle email forwarding endpoints (email and email_group types)
 */
async function handleEmailForwardEndpoint(
	emailId: string,
	endpoint: Endpoint,
	emailData: StructuredEmailWithData,
	retry?: RetryOptions,
): Promise<DeliveryResult> {
	const claim = await claimEndpointDelivery(emailId, endpoint, retry);
	if (!("id" in claim)) {
		return claim;
	}
	const deliveryId = claim.id;

	try {
		console.log(
			`📨 handleEmailForwardEndpoint - Processing ${endpoint.type} endpoint: ${endpoint.name}`,
		);

		const config = JSON.parse(endpoint.config);
		const forwarder = new EmailForwarder();

		// Reconstruct ParsedEmailData from structured data
		const parsedEmailData = reconstructParsedEmailData(emailData);

		// Determine recipient addresses based on endpoint type
		let toAddresses: string[] =
			endpoint.type === "email_group" ? config.emails : [config.forwardTo];

		// Use the original recipient as the from address (e.g., ryan@inbound.new)
		const fromAddress = config.fromAddress || emailData.recipient;

		// 🚫 BLOCKLIST CHECK: Prevent forwarding to addresses that previously bounced
		// This avoids causing repeated bounces and reputation damage
		const blocklistCheck = await checkRecipientsAgainstBlocklist(toAddresses);
		if (blocklistCheck.hasBlockedRecipients) {
			console.warn(
				`🚫 handleEmailForwardEndpoint - Found blocked recipient(s) for email ${emailId}: ${blocklistCheck.blockedAddresses.join(", ")}`,
			);

			// Filter out blocked addresses
			// Must use same normalization as checkRecipientsAgainstBlocklist: extract from angle brackets + lowercase
			toAddresses = toAddresses.filter((addr: string) => {
				const match = addr?.match(/<([^>]+)>/);
				const extracted = match ? match[1] : addr;
				const normalizedAddr = extracted?.toLowerCase()?.trim();
				return !blocklistCheck.blockedAddresses.includes(normalizedAddr);
			});

			if (toAddresses.length === 0) {
				// All recipients are blocked
				console.error(
					`🚫 handleEmailForwardEndpoint - All forward recipients are blocked, cannot forward email ${emailId}`,
				);
				return await recordDeliveryResult(
					claim,
					{
						status: "failed",
						responseData: JSON.stringify({
							error: "ALL_RECIPIENTS_BLOCKED",
							message: `All forward recipients are on the blocklist (previous bounces): ${blocklistCheck.blockedAddresses.join(", ")}`,
							blockedAddresses: blocklistCheck.blockedAddresses,
						}),
					},
					"All forward recipients are blocked due to previous bounces",
				);
			} else {
				console.log(
					`⚠️ handleEmailForwardEndpoint - Skipping ${blocklistCheck.blockedAddresses.length} blocked recipient(s), forwarding to ${toAddresses.length} remaining: ${toAddresses.join(", ")}`,
				);
			}
		}

		// 🔄 LOOP DETECTION: Prevent forwarding to the same address that received the email
		// This prevents infinite forwarding loops where an endpoint forwards to itself
		const recipientAddress = emailData.recipient?.toLowerCase()?.trim();

		// Only check for loops if we have a valid recipient address
		const loopingAddresses = recipientAddress
			? toAddresses.filter((addr: string) => {
					const targetAddr = addr?.toLowerCase()?.trim();
					// Both must be valid non-empty strings for a match
					return targetAddr && targetAddr === recipientAddress;
				})
			: [];

		if (loopingAddresses.length > 0) {
			console.error(
				`🚫 LOOP DETECTED! Email ${emailId} would be forwarded to the same address it came from: ${loopingAddresses.join(", ")}`,
			);
			console.error(
				`   Recipient: ${recipientAddress}, Forward targets: ${toAddresses.join(", ")}`,
			);

			return await recordDeliveryResult(
				claim,
				{
					status: "failed",
					responseData: JSON.stringify({
						error: "FORWARDING_LOOP_DETECTED",
						message: `Cannot forward email to the same address it was received at: ${loopingAddresses.join(", ")}`,
						recipient: recipientAddress,
						forwardTargets: toAddresses,
					}),
				},
				"Cannot forward email back to its original recipient",
			);
		}

		console.log(
			`📤 handleEmailForwardEndpoint - Forwarding to ${toAddresses.length} recipients from ${fromAddress}`,
		);

		// Get tenant sending info (identity ARN, configuration set, and tenant name) for tenant-level tracking
		const fromDomain = fromAddress.split("@")[1];
		let sourceArn: string | null = null;
		let configurationSetName: string | null = null;
		let tenantName: string | null = null;
		if (fromDomain && emailData.userId) {
			const tenantInfo = await getTenantSendingInfoForDomainOrParent(
				emailData.userId,
				fromDomain,
			);
			sourceArn = tenantInfo.identityArn;
			configurationSetName = tenantInfo.configurationSetName;
			tenantName = tenantInfo.tenantName;
			if (sourceArn) {
				console.log(
					`✅ handleEmailForwardEndpoint - Got identity ARN for ${fromDomain}: ${sourceArn}`,
				);
			} else {
				console.warn(
					`⚠️ handleEmailForwardEndpoint - Could not get identity ARN for ${fromDomain}, email will be sent without tenant tracking`,
				);
			}
			if (configurationSetName) {
				console.log(
					`📋 handleEmailForwardEndpoint - Using configuration set: ${configurationSetName}`,
				);
			} else {
				console.warn(
					`⚠️ handleEmailForwardEndpoint - No configuration set available for ${fromDomain}`,
				);
			}
			if (tenantName) {
				console.log(
					`🏠 handleEmailForwardEndpoint - Using TenantName: ${tenantName}`,
				);
			} else {
				console.warn(
					`⚠️ handleEmailForwardEndpoint - No TenantName available - email will NOT appear in tenant dashboard!`,
				);
			}
		}

		// Forward the email
		await forwarder.forwardEmail(parsedEmailData, fromAddress, toAddresses, {
			subjectPrefix: config.subjectPrefix,
			includeAttachments: config.includeAttachments,
			recipientEmail: emailData.recipient || undefined,
			senderName: config.senderName, // Pass custom sender name if configured
			sourceArn: sourceArn || undefined,
			configurationSetName: configurationSetName || undefined,
			tenantName: tenantName || undefined,
		});

		return await recordDeliveryResult(
			claim,
			{
				status: "success",
				responseData: JSON.stringify({
					toAddresses,
					fromAddress,
					forwardedAt: new Date().toISOString(),
				}),
			},
			"Email forwarded successfully",
		);
	} catch (error) {
		let result: DeliveryResult = {
			success: false,
			message:
				"Delivery failed and its outcome could not be recorded. Check delivery status before retrying.",
			delivery_id: deliveryId,
		};
		try {
			result = await recordDeliveryResult(
				claim,
				{
					status: "failed",
					responseData: JSON.stringify({
						error: error instanceof Error ? error.message : "Unknown error",
						failedAt: new Date().toISOString(),
					}),
				},
				error instanceof Error ? error.message : "Email forwarding failed",
			);
		} catch (updateError) {
			console.error(
				"❌ handleEmailForwardEndpoint - Failed to update delivery record:",
				updateError,
			);
		}

		console.error(
			`❌ handleEmailForwardEndpoint - Error forwarding email:`,
			error,
		);
		if (retry) return result;
		throw error;
	}
}

/**
 * Reconstruct ParsedEmailData from structured email data
 */
function reconstructParsedEmailData(
	emailData: StructuredEmailWithData,
): ParsedEmailData {
	return {
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
		attachments: emailData.attachments ? JSON.parse(emailData.attachments) : [],
		headers: emailData.headers ? JSON.parse(emailData.headers) : {},
		priority:
			emailData.priority === "false" ? false : emailData.priority || undefined,
	};
}

/**
 * Get default from address using verified domain
 */
async function getDefaultFromAddress(recipient: string): Promise<string> {
	try {
		const domain = recipient.split("@")[1];
		if (!domain) {
			throw new Error("Invalid recipient email format");
		}

		// Look up verified domain
		const domainRecord = await db
			.select({ domain: emailDomains.domain })
			.from(emailDomains)
			.where(
				and(
					eq(emailDomains.domain, domain),
					eq(emailDomains.status, "verified"),
					eq(emailDomains.canReceiveEmails, true),
				),
			)
			.limit(1);

		if (domainRecord[0]) {
			return `noreply@${domainRecord[0].domain}`;
		}

		// Fallback to recipient domain if not found in our records
		return `noreply@${domain}`;
	} catch (error) {
		console.error(
			"❌ getDefaultFromAddress - Error getting default from address:",
			error,
		);
		// Ultimate fallback
		return "noreply@example.com";
	}
}

/**
 * Check if this is a DMARC email and whether it should be routed based on domain settings
 * Returns true if it's a DMARC email AND routing should be skipped (receiveDmarcEmails = false)
 */
async function checkIfDmarcEmail(
	recipient: string,
	userId: string,
): Promise<boolean> {
	try {
		// Check if the recipient is a DMARC email (dmarc@domain)
		if (!recipient.toLowerCase().startsWith("dmarc@")) {
			return false; // Not a DMARC email, proceed with normal routing
		}

		// Extract the domain from the recipient
		const domain = recipient.split("@")[1];
		if (!domain) {
			console.warn(`⚠️ checkIfDmarcEmail - Invalid email format: ${recipient}`);
			return false; // Invalid format, proceed with normal routing
		}

		console.log(
			`🔍 checkIfDmarcEmail - Checking DMARC settings for domain: ${domain}`,
		);

		// Look up the domain in the emailDomains table
		const domainRecord = await db
			.select({
				receiveDmarcEmails: emailDomains.receiveDmarcEmails,
			})
			.from(emailDomains)
			.where(
				and(eq(emailDomains.domain, domain), eq(emailDomains.userId, userId)),
			)
			.limit(1);

		if (!domainRecord[0]) {
			console.warn(
				`⚠️ checkIfDmarcEmail - Domain ${domain} not found in user's domains, proceeding with normal routing`,
			);
			return false; // Domain not found, proceed with normal routing
		}

		const shouldReceiveDmarcEmails =
			domainRecord[0].receiveDmarcEmails || false;

		if (!shouldReceiveDmarcEmails) {
			console.log(
				`🚫 checkIfDmarcEmail - DMARC emails disabled for domain ${domain}, skipping routing`,
			);
			return true; // Skip routing - email will be stored but not forwarded
		} else {
			console.log(
				`✅ checkIfDmarcEmail - DMARC emails enabled for domain ${domain}, proceeding with normal routing`,
			);
			return false; // Proceed with normal routing
		}
	} catch (error) {
		console.error(
			`❌ checkIfDmarcEmail - Error checking DMARC settings:`,
			error,
		);
		return false; // On error, proceed with normal routing to be safe
	}
}
