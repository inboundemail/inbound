// THIS IS THE PRIMARY WEBHOOK FOR PROCESSING EMAILS DO NOT DELETE THIS FILE

import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { Autumn as autumn } from "autumn-js";
import { timingSafeEqual } from "crypto";
import { and, eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import type { SESEvent, SESRecord } from "@/lib/aws-ses/aws-ses";
import { db } from "@/lib/db";
import { user } from "@/lib/db/auth-schema";
import { emailDomains, sesEvents, structuredEmails } from "@/lib/db/schema";
import { recordDeliveryEventFromDsn } from "@/lib/email-management/delivery-event-tracker";
import { isDsn } from "@/lib/email-management/dsn-parser";
import { isEmailBlocked } from "@/lib/email-management/email-blocking";
import { sendLimitReachedNotification } from "@/lib/email-management/email-notifications";
import {
	type ParsedEmailData,
	parseEmail,
} from "@/lib/email-management/email-parser";
import { routeEmail } from "@/lib/email-management/email-router";
import {
	buildInboundDedupeFingerprint,
	buildInboundDeterministicId,
	normalizeMessageIdForDedupe,
	normalizeRecipientForDedupe,
} from "@/lib/email-management/inbound-dedupe";

interface ProcessedSESRecord extends SESRecord {
	emailContent?: string | null;
	s3Location?: {
		bucket: string;
		key: string;
		contentFetched: boolean;
		contentSize: number;
	};
	s3Error?: string;
}

interface WebhookPayload {
	type: "ses_event_with_content";
	timestamp: string;
	originalEvent: SESEvent;
	processedRecords: ProcessedSESRecord[];
	context: {
		functionName: string;
		functionVersion: string;
		requestId: string;
	};
}

/**
 * Extract domain from email address
 */
function extractDomain(email: string): string {
	return email.split("@")[1]?.toLowerCase() || "";
}

/**
 * Map recipient email to user ID by looking up domain owner
 * This function handles the mapping of email recipients to user IDs by:
 * 1. Extracting the domain from the recipient email
 * 2. Looking up the domain owner in the emailDomains table
 * 3. Returning the userId or 'system' as fallback
 */
async function mapRecipientToUserId(recipient: string): Promise<string> {
	try {
		// Validate email format first
		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
		if (!emailRegex.test(recipient)) {
			console.warn(`⚠️ Webhook - Invalid email format: ${recipient}`);
			return "system";
		}

		const domain = extractDomain(recipient);

		if (!domain) {
			console.warn(
				`⚠️ Webhook - Could not extract domain from recipient: ${recipient}`,
			);
			return "system";
		}

		console.log(`🔍 Webhook - Looking up domain owner for: ${domain}`);

		// Look up the domain in the emailDomains table to find the owner
		const domainRecord = await db
			.select({
				userId: emailDomains.userId,
				status: emailDomains.status,
				canReceiveEmails: emailDomains.canReceiveEmails,
			})
			.from(emailDomains)
			.where(eq(emailDomains.domain, domain))
			.limit(1);

		if (domainRecord[0]?.userId) {
			const { userId, status, canReceiveEmails } = domainRecord[0];

			// Log domain status for debugging
			console.log(
				`✅ Webhook - Found domain ${domain}: status=${status}, canReceiveEmails=${canReceiveEmails}, userId=${userId}`,
			);

			// Check if domain is properly configured to receive emails
			if (!canReceiveEmails) {
				console.warn(
					`⚠️ Webhook - Domain ${domain} is not configured to receive emails, but processing anyway`,
				);
			}

			return userId;
		} else {
			console.warn(
				`⚠️ Webhook - No domain owner found for ${domain} (recipient: ${recipient}), using system`,
			);
			return "system";
		}
	} catch (error) {
		console.error(
			`❌ Webhook - Error mapping recipient ${recipient} to user:`,
			error,
		);
		return "system";
	}
}

/**
 * Check and track inbound trigger usage for a user
 */
async function checkAndTrackInboundTrigger(
	userId: string,
	recipient: string,
): Promise<{ allowed: boolean; error?: string }> {
	// Skip tracking for system emails
	if (userId === "system") {
		console.log(
			`📧 Webhook - Skipping inbound trigger check for system email: ${recipient}`,
		);
		return { allowed: true };
	}

	if (process.env.INBOUND_E2E_TEST_MODE === "true") {
		return { allowed: true };
	}

	try {
		// Check if user can use inbound triggers
		const { data: triggerCheck, error: triggerCheckError } = await autumn.check(
			{
				customer_id: userId,
				feature_id: "inbound_triggers",
			},
		);

		if (triggerCheckError) {
			console.error(
				`❌ Webhook - Autumn inbound trigger check error for user ${userId}:`,
				triggerCheckError,
			);
			return {
				allowed: false,
				error: `Failed to check inbound trigger limits: ${triggerCheckError}`,
			};
		}

		if (!triggerCheck?.allowed) {
			console.warn(
				`⚠️ Webhook - User ${userId} not allowed to use inbound triggers for email: ${recipient}`,
			);
			return {
				allowed: false,
				error:
					"Inbound trigger limit reached. Please upgrade your plan to process more emails.",
			};
		}

		// Track the inbound trigger usage if allowed and not unlimited
		if (!triggerCheck.unlimited) {
			const { error: trackError } = await autumn.track({
				customer_id: userId,
				feature_id: "inbound_triggers",
				value: 1,
			});

			if (trackError) {
				console.error(
					`❌ Webhook - Failed to track inbound trigger usage for user ${userId}:`,
					trackError,
				);
				return {
					allowed: false,
					error: `Failed to track inbound trigger usage: ${trackError}`,
				};
			}

			console.log(
				`📊 Webhook - Tracked inbound trigger usage for user ${userId}, email: ${recipient}`,
			);
		} else {
			console.log(
				`♾️ Webhook - User ${userId} has unlimited inbound triggers, no tracking needed for: ${recipient}`,
			);
		}

		return { allowed: true };
	} catch (error) {
		console.error(
			`❌ Webhook - Error checking/tracking inbound trigger for user ${userId}:`,
			error,
		);
		return {
			allowed: false,
			error: `Inbound trigger check failed: ${error instanceof Error ? error.message : "Unknown error"}`,
		};
	}
}

function isDuplicateKeyError(error: unknown): boolean {
	if (!(error instanceof Error)) {
		return false;
	}

	const errorWithCode = error as Error & { code?: string };
	return (
		errorWithCode.code === "23505" || error.message.includes("duplicate key")
	);
}

/**
 * Create a structured email record from ParsedEmailData that matches the type exactly
 */
async function createStructuredEmailRecord(
	sesEventId: string,
	parsedEmailData: ParsedEmailData,
	userId: string,
	recipient: string,
	normalizedHeaderMessageId: string | null,
): Promise<string> {
	try {
		const normalizedRecipient = normalizeRecipientForDedupe(recipient);
		const normalizedParsedMessageId = normalizeMessageIdForDedupe(
			parsedEmailData.messageId,
		);
		const effectiveMessageId =
			normalizedParsedMessageId || normalizedHeaderMessageId;
		console.log(
			`📝 Webhook - Creating structured email record for recipient ${normalizedRecipient}`,
		);

		// Use hash-based deterministic ID to prevent race condition duplicates AND ID collisions
		// Primary seed is normalized Message-ID + recipient, fallback is SES event + recipient
		const structuredEmailId = buildInboundDeterministicId(
			"inbnd",
			sesEventId,
			normalizedRecipient,
			effectiveMessageId,
		);
		const structuredEmailRecord = {
			id: structuredEmailId,
			emailId: structuredEmailId, // Self-referencing for backward compatibility
			sesEventId: sesEventId,
			recipient: normalizedRecipient,

			// Core email fields matching ParsedEmailData exactly
			messageId: effectiveMessageId || null,
			date: parsedEmailData.date || null,
			subject: parsedEmailData.subject || null,

			// Address fields - stored as JSON matching ParsedEmailAddress structure
			fromData: parsedEmailData.from
				? JSON.stringify(parsedEmailData.from)
				: null,
			toData: parsedEmailData.to ? JSON.stringify(parsedEmailData.to) : null,
			ccData: parsedEmailData.cc ? JSON.stringify(parsedEmailData.cc) : null,
			bccData: parsedEmailData.bcc ? JSON.stringify(parsedEmailData.bcc) : null,
			replyToData: parsedEmailData.replyTo
				? JSON.stringify(parsedEmailData.replyTo)
				: null,

			// Threading fields
			inReplyTo: parsedEmailData.inReplyTo || null,
			references: parsedEmailData.references
				? JSON.stringify(parsedEmailData.references)
				: null,

			// Content fields
			textBody: parsedEmailData.textBody || null,
			htmlBody: parsedEmailData.htmlBody || null,
			rawContent: parsedEmailData.raw || null,

			// Attachments - stored as JSON array matching ParsedEmailData structure
			attachments: parsedEmailData.attachments
				? JSON.stringify(parsedEmailData.attachments)
				: null,

			// Headers - stored as JSON object matching enhanced headers structure
			headers: parsedEmailData.headers
				? JSON.stringify(parsedEmailData.headers)
				: null,

			// Priority field
			priority:
				typeof parsedEmailData.priority === "string"
					? parsedEmailData.priority
					: parsedEmailData.priority === false
						? "false"
						: null,

			// Processing metadata
			parseSuccess: true,
			parseError: null,

			// User and timestamps
			userId: userId,
			createdAt: new Date(),
			updatedAt: new Date(),
		};

		// Try to insert with duplicate handling
		try {
			await db.insert(structuredEmails).values(structuredEmailRecord);
			console.log(
				`✅ Webhook - Created structured email record ${structuredEmailId}`,
			);
		} catch (insertError) {
			// Check if this is a duplicate key error (race condition)
			if (isDuplicateKeyError(insertError)) {
				const fingerprint = buildInboundDedupeFingerprint(
					userId,
					normalizedRecipient,
					effectiveMessageId,
				);
				console.log(
					`⏭️  Webhook - DEDUPE decision=duplicate_skip scope=insert source=db_unique_constraint fingerprint=${fingerprint} existing=${structuredEmailId}`,
				);
				return structuredEmailId;
			}

			// Re-throw if it's a different error
			throw insertError;
		}

		return structuredEmailId;
	} catch (error) {
		console.error(
			`❌ Webhook - Error creating structured email record for recipient ${recipient}:`,
			error,
		);

		// Create a minimal record indicating parse failure
		// Note: We use hash-based ID so repeated failures for the same email will hit duplicate key
		// This is intentional - we log the error above and return the existing ID
		try {
			const normalizedRecipient = normalizeRecipientForDedupe(recipient);
			const failedStructuredId = buildInboundDeterministicId(
				"inbnd_failed",
				sesEventId,
				normalizedRecipient,
				normalizedHeaderMessageId,
			);
			const failedStructuredRecord = {
				id: failedStructuredId,
				emailId: failedStructuredId, // Self-referencing
				sesEventId: sesEventId,
				recipient: normalizedRecipient,
				messageId: normalizedHeaderMessageId,
				parseSuccess: false,
				parseError:
					error instanceof Error ? error.message : "Unknown parsing error",
				userId: userId,
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			try {
				await db.insert(structuredEmails).values(failedStructuredRecord);
				console.log(
					`⚠️ Webhook - Created failed structured parse record ${failedStructuredId}`,
				);
			} catch (failedInsertError) {
				if (isDuplicateKeyError(failedInsertError)) {
					const failedFingerprint = buildInboundDedupeFingerprint(
						userId,
						normalizedRecipient,
						normalizedHeaderMessageId,
					);
					console.warn(
						`⏭️  Webhook - DEDUPE decision=duplicate_skip scope=failed_insert source=db_unique_constraint fingerprint=${failedFingerprint} existing=${failedStructuredId} error=${error instanceof Error ? error.message : "Unknown"}`,
					);
					return failedStructuredId;
				}

				throw failedInsertError;
			}
			return failedStructuredId;
		} catch (insertError) {
			console.error(
				`❌ Webhook - Failed to create failed structured parse record for recipient ${recipient}:`,
				insertError,
			);
			throw insertError;
		}
	}
}

export async function POST(request: NextRequest) {
	try {
		console.log("===============================================");
		console.log("📧 Webhook - Received email event from Lambda");
		console.log("===============================================");

		// Verify the request is from our Lambda function
		const authHeader = request.headers.get("authorization");
		const expectedApiKey = process.env.SERVICE_API_KEY;

		if (!authHeader || !expectedApiKey) {
			console.error("❌ Webhook - Missing authentication");
			return NextResponse.json(
				{ error: "Missing authentication" },
				{ status: 401 },
			);
		}

		const providedKey = authHeader.replace("Bearer ", "");
		const isValidKey =
			providedKey.length === expectedApiKey.length &&
			timingSafeEqual(Buffer.from(providedKey), Buffer.from(expectedApiKey));

		if (!isValidKey) {
			console.error("❌ Webhook - Invalid authentication");
			return NextResponse.json(
				{ error: "Invalid authentication" },
				{ status: 401 },
			);
		}

		const payload: WebhookPayload = await request.json();
		console.log("🔍 Webhook - Payload type:", payload.type);

		// Validate payload structure
		if (
			payload.type !== "ses_event_with_content" ||
			!payload.processedRecords
		) {
			console.error("❌ Webhook - Invalid payload structure");
			return NextResponse.json(
				{ error: "Invalid payload structure" },
				{ status: 400 },
			);
		}

		const processedEmails: Array<{
			emailId: string;
			sesEventId: string;
			messageId: string;
			recipient: string;
			subject: string;
			webhookDelivery: {
				success: boolean;
				deliveryId?: string;
				error?: string;
			} | null;
		}> = [];

		const rejectedEmails: Array<{
			messageId: string;
			recipient: string;
			userId: string;
			reason: string;
			subject: string;
		}> = [];

		// Process each enhanced SES record
		for (const record of payload.processedRecords) {
			try {
				const sesData = record.ses;
				const mail = sesData.mail;
				const receipt = sesData.receipt;

				console.log(`📨 Webhook - Processing email: ${mail.messageId}`);
				console.log(
					`👥 Webhook - Recipients: ${receipt.recipients.join(", ")}`,
				);
				console.log(
					`📧 Webhook - Subject: "${mail.commonHeaders.subject || "(no subject)"}"`,
				);
				const normalizedEmailMessageId = normalizeMessageIdForDedupe(
					mail.commonHeaders.messageId,
				);
				const recipientEntries: Array<{ recipient: string; userId: string }> =
					[];
				for (const rawRecipient of receipt.recipients) {
					const recipient = normalizeRecipientForDedupe(rawRecipient);
					if (!recipient) {
						continue;
					}
					const userId = await mapRecipientToUserId(recipient);
					recipientEntries.push({ recipient, userId });
				}
				const normalizedRecipients = recipientEntries.map(
					(entry) => entry.recipient,
				);

				// EARLY IDEMPOTENCY CHECK 1: Check using email's Message-ID header
				// This catches duplicates when SES triggers Lambda multiple times for the same email
				// (e.g., when both catch-all and specific address rules match the same incoming email)
				if (normalizedEmailMessageId) {
					const existingByEmailMessageId = await db
						.select({
							id: structuredEmails.id,
							recipient: structuredEmails.recipient,
							userId: structuredEmails.userId,
						})
						.from(structuredEmails)
						.where(eq(structuredEmails.messageId, normalizedEmailMessageId));

					if (existingByEmailMessageId.length > 0) {
						const existingRecipientOwners = existingByEmailMessageId
							.map((e) => {
								if (!e.recipient || !e.userId) return null;
								return {
									recipient: normalizeRecipientForDedupe(e.recipient),
									userId: e.userId,
								};
							})
							.filter(
								(value): value is { recipient: string; userId: string } =>
									!!value,
							);
						const hasOverlap = recipientEntries.some((entry) =>
							existingRecipientOwners.some(
								(existing) =>
									existing.recipient === entry.recipient &&
									existing.userId === entry.userId,
							),
						);

						if (hasOverlap) {
							console.log(
								`⏭️  Webhook - DEDUPE decision=duplicate_skip scope=record reason=message_id_overlap_same_owner messageId=${normalizedEmailMessageId} recipients=${normalizedRecipients.join(",")}`,
							);
							continue; // Skip this entire record
						} else {
							const existingRecipients = existingRecipientOwners.map(
								(existing) => existing.recipient,
							);
							console.log(
								`🔍 Webhook - Same Email Message-ID but different recipient-owner pairs. Existing recipients: ${existingRecipients.join(", ")}, Current recipients: ${normalizedRecipients.join(", ")}`,
							);
						}
					}
				}

				// EARLY IDEMPOTENCY CHECK 2: Check using SES message ID
				// This prevents processing the exact same Lambda invocation twice
				const existingSesEvent = await db
					.select({
						recipient: structuredEmails.recipient,
						userId: structuredEmails.userId,
					})
					.from(structuredEmails)
					.innerJoin(sesEvents, eq(sesEvents.id, structuredEmails.sesEventId))
					.where(eq(sesEvents.messageId, mail.messageId));

				if (existingSesEvent.length > 0) {
					const existingRecipientOwners = existingSesEvent
						.map((e) => {
							if (!e.recipient || !e.userId) return null;
							return {
								recipient: normalizeRecipientForDedupe(e.recipient),
								userId: e.userId,
							};
						})
						.filter(
							(value): value is { recipient: string; userId: string } =>
								!!value,
						);

					// Check if ANY current recipient-owner pair was already processed
					const hasOverlap = recipientEntries.some((entry) =>
						existingRecipientOwners.some(
							(existing) =>
								existing.recipient === entry.recipient &&
								existing.userId === entry.userId,
						),
					);

					if (hasOverlap) {
						console.log(
							`⏭️  Webhook - DEDUPE decision=duplicate_skip scope=record reason=ses_message_id_overlap_same_owner sesMessageId=${mail.messageId} recipients=${normalizedRecipients.join(",")}`,
						);
						continue; // Skip this entire record
					} else {
						const existingRecipients = existingRecipientOwners.map(
							(existing) => existing.recipient,
						);
						console.log(
							`🔍 Webhook - Same SES messageId but different recipients. Existing: ${existingRecipients.join(", ")}, Current: ${normalizedRecipients.join(", ")}`,
						);
					}
				}

				// First, store the SES event with race-condition handling
				// Use a deterministic ID based on messageId to prevent duplicates
				const sesEventId = `ses_${mail.messageId}`;
				const sesEventRecord = {
					id: sesEventId,
					eventSource: record.eventSource,
					eventVersion: record.eventVersion,
					messageId: mail.messageId,
					source: mail.source,
					destination: JSON.stringify(mail.destination),
					subject: mail.commonHeaders.subject || null,
					timestamp: new Date(mail.timestamp),
					receiptTimestamp: new Date(receipt.timestamp),
					processingTimeMillis: receipt.processingTimeMillis,
					recipients: JSON.stringify(normalizedRecipients),
					spamVerdict: receipt.spamVerdict.status,
					virusVerdict: receipt.virusVerdict.status,
					spfVerdict: receipt.spfVerdict.status,
					dkimVerdict: receipt.dkimVerdict.status,
					dmarcVerdict: receipt.dmarcVerdict.status,
					actionType: receipt.action.type,
					s3BucketName: record.s3Location?.bucket || receipt.action.bucketName,
					s3ObjectKey: record.s3Location?.key || receipt.action.objectKey,
					emailContent: record.emailContent || null,
					s3ContentFetched: record.s3Location?.contentFetched || false,
					s3ContentSize: record.s3Location?.contentSize || null,
					s3Error: record.s3Error || null,
					commonHeaders: JSON.stringify(mail.commonHeaders),
					rawSesEvent: JSON.stringify(record.ses),
					lambdaContext: JSON.stringify(payload.context),
					webhookPayload: JSON.stringify(payload),
					updatedAt: new Date(),
				};

				// Try to insert, but if it already exists (race condition), just use the existing one
				try {
					await db.insert(sesEvents).values(sesEventRecord);
					console.log(
						`✅ Webhook - Stored SES event ${sesEventId} for message ${mail.messageId}`,
					);
				} catch (insertError) {
					// Check if this is a unique constraint violation (duplicate key)
					if (isDuplicateKeyError(insertError)) {
						console.log(
							`⏭️  Webhook - SES event ${sesEventId} already exists (race condition), using existing record`,
						);
					} else {
						// Re-throw if it's a different error
						throw insertError;
					}
				}

				// Then, create a receivedEmail record for each recipient
				for (const { recipient, userId } of recipientEntries) {
					// IDEMPOTENCY CHECK: Skip if we've already processed this email for this recipient
					// Use the email's Message-ID header (from commonHeaders) for deduplication
					// This catches duplicates when SES triggers Lambda multiple times for the same email
					// (e.g., when both catch-all and specific address rules match)
					if (normalizedEmailMessageId) {
						const existingEmail = await db
							.select({ id: structuredEmails.id })
							.from(structuredEmails)
							.where(
								and(
									eq(structuredEmails.messageId, normalizedEmailMessageId), // Normalized Message-ID header
									eq(structuredEmails.recipient, recipient),
									eq(structuredEmails.userId, userId),
								),
							)
							.limit(1);

						if (existingEmail[0]) {
							const fingerprint = buildInboundDedupeFingerprint(
								userId,
								recipient,
								normalizedEmailMessageId,
							);
							console.log(
								`⏭️  Webhook - DEDUPE decision=duplicate_skip scope=recipient reason=message_id_match fingerprint=${fingerprint} existing=${existingEmail[0].id}`,
							);
							continue; // Skip this duplicate
						}
					} else {
						// Fallback: If no Message-ID header, use SES messageId (less reliable for duplicates)
						const existingEmail = await db
							.select({ id: structuredEmails.id })
							.from(structuredEmails)
							.innerJoin(
								sesEvents,
								eq(sesEvents.id, structuredEmails.sesEventId),
							)
							.where(
								and(
									eq(sesEvents.messageId, mail.messageId), // AWS SES messageId
									eq(structuredEmails.recipient, recipient),
									eq(structuredEmails.userId, userId),
								),
							)
							.limit(1);

						if (existingEmail[0]) {
							const fingerprint = buildInboundDedupeFingerprint(
								userId,
								recipient,
								null,
							);
							console.log(
								`⏭️  Webhook - DEDUPE decision=duplicate_skip scope=recipient reason=ses_message_id_fallback fingerprint=${fingerprint} existing=${existingEmail[0].id}`,
							);
							continue; // Skip this duplicate
						}
					}

					const fingerprint = buildInboundDedupeFingerprint(
						userId,
						recipient,
						normalizedEmailMessageId,
					);
					console.log(
						`✅ Webhook - DEDUPE decision=accepted scope=recipient fingerprint=${fingerprint}`,
					);

					// Check and track inbound trigger usage
					const triggerResult = await checkAndTrackInboundTrigger(
						userId,
						recipient,
					);

					if (!triggerResult.allowed) {
						console.warn(
							`⚠️ Webhook - Rejected email for ${recipient} due to inbound trigger limits: ${triggerResult.error}`,
						);
						rejectedEmails.push({
							messageId: mail.messageId,
							recipient: recipient,
							userId: userId,
							reason: triggerResult.error || "Inbound trigger limit reached",
							subject: mail.commonHeaders.subject,
						});

						// Send limit reached notification to user (async, don't wait)
						// Look up user details first
						const domain = extractDomain(recipient);
						db.select({ email: user.email, name: user.name })
							.from(user)
							.where(eq(user.id, userId))
							.limit(1)
							.then(async (userResult) => {
								if (userResult[0]?.email) {
									try {
										await sendLimitReachedNotification({
											userEmail: userResult[0].email,
											userName: userResult[0].name,
											userId: userId,
											limitType: "inbound_triggers",
											rejectedEmailCount: 1,
											rejectedRecipient: recipient,
											domain: domain,
											triggeredAt: new Date(),
										});
									} catch (notificationError) {
										console.error(
											`❌ Webhook - Failed to send limit reached notification to ${userResult[0].email}:`,
											notificationError,
										);
									}
								}
							})
							.catch((err) => {
								console.error(
									`❌ Webhook - Failed to look up user ${userId} for limit notification:`,
									err,
								);
							});

						continue; // Skip processing this recipient
					}

					// Check if the sender email is blocked
					const senderBlocked = await isEmailBlocked(mail.source);
					let emailStatus: "received" | "blocked" = "received";

					if (senderBlocked) {
						console.warn(
							`🚫 Webhook - Email from blocked sender ${mail.source} to ${recipient}`,
						);
						emailStatus = "blocked";
					}

					// Fetch email content from S3 if not included in payload (for large emails)
					let emailContent = record.emailContent;
					if (
						!emailContent &&
						record.s3Location?.bucket &&
						record.s3Location?.key
					) {
						console.log(
							`📥 Webhook - Content not in payload, fetching from S3 (${record.s3Location.bucket}/${record.s3Location.key})`,
						);
						try {
							const s3Client = new S3Client({
								region: process.env.AWS_REGION || "us-east-1",
							});

							const command = new GetObjectCommand({
								Bucket: record.s3Location.bucket,
								Key: record.s3Location.key,
							});

							const response = await s3Client.send(command);

							if (response.Body) {
								// Convert stream to string
								const chunks: Uint8Array[] = [];
								const reader = response.Body.transformToWebStream().getReader();

								while (true) {
									const { done, value } = await reader.read();
									if (done) break;
									chunks.push(value);
								}

								const buffer = Buffer.concat(chunks);
								emailContent = buffer.toString("utf-8");
								console.log(
									`✅ Webhook - S3 fetch successful (${emailContent.length} bytes)`,
								);
							} else {
								console.error(`❌ Webhook - S3 fetch failed: no response body`);
							}
						} catch (s3Error) {
							console.error(
								`❌ Webhook - S3 fetch error: ${s3Error instanceof Error ? s3Error.message : "Unknown error"}`,
							);
						}
					} else if (emailContent) {
						console.log(
							`✅ Webhook - Content in payload (${emailContent.length} bytes)`,
						);
					}

					// Parse the email content using the new parseEmail function
					let parsedEmailData: ParsedEmailData | null = null;
					if (emailContent) {
						console.log(`📧 Webhook - Parsing email...`);
						try {
							parsedEmailData = await parseEmail(emailContent);
							console.log(`✅ Webhook - Parse successful`);
						} catch (parseError) {
							console.error(
								`❌ Webhook - Parse failed: ${parseError instanceof Error ? parseError.message : "Unknown error"}`,
							);
						}
					} else {
						console.warn(`⚠️ Webhook - No content available for parsing`);
					}

					// Create structured email record - this is now the PRIMARY and ONLY record
					let structuredEmailId: string;
					if (parsedEmailData) {
						structuredEmailId = await createStructuredEmailRecord(
							sesEventId,
							parsedEmailData,
							userId,
							recipient,
							normalizedEmailMessageId,
						);
					} else {
						// Create minimal record for unparseable emails with hash-based deterministic ID
						console.warn(
							`⚠️ Webhook - No parsed data for ${mail.messageId}, creating minimal record`,
						);
						structuredEmailId = buildInboundDeterministicId(
							"inbnd_minimal",
							sesEventId,
							recipient,
							normalizedEmailMessageId,
						);
						const minimalRecord = {
							id: structuredEmailId,
							emailId: structuredEmailId,
							sesEventId: sesEventId,
							recipient: recipient,
							messageId: normalizedEmailMessageId,
							subject: mail.commonHeaders.subject || "No Subject",
							parseSuccess: false,
							parseError: "Failed to parse email content",
							userId: userId,
							createdAt: new Date(),
							updatedAt: new Date(),
						};

						try {
							await db.insert(structuredEmails).values(minimalRecord);
						} catch (minimalInsertError) {
							if (isDuplicateKeyError(minimalInsertError)) {
								const minimalFingerprint = buildInboundDedupeFingerprint(
									userId,
									recipient,
									normalizedEmailMessageId,
								);
								console.log(
									`⏭️  Webhook - DEDUPE decision=duplicate_skip scope=insert source=db_unique_constraint fingerprint=${minimalFingerprint} existing=${structuredEmailId}`,
								);
							} else {
								throw minimalInsertError;
							}
						}
					}

					// Initialize email processing record
					const emailProcessingRecord = {
						emailId: structuredEmailId,
						sesEventId: sesEventId,
						messageId: mail.messageId,
						recipient: recipient,
						subject: mail.commonHeaders.subject,
						webhookDelivery: null as {
							success: boolean;
							deliveryId?: string;
							error?: string;
						} | null,
					};

					console.log(
						`✅ Webhook - Stored email ${mail.messageId} for ${recipient} with ID ${structuredEmailId}`,
					);

					// ========== DSN DETECTION AND BOUNCE TRACKING ==========
					// Check if this is a Delivery Status Notification (bounce/failure notification)
					// These come from MAILER-DAEMON and contain bounce information
					// DSN emails should be processed for bounce tracking but NOT forwarded/delivered to users
					let isDsnEmail = false;
					if (emailContent && isDsn(emailContent)) {
						isDsnEmail = true;
						console.log(
							`📬 Webhook - DSN detected for ${recipient}, recording delivery event...`,
						);

						try {
							const dsnResult = await recordDeliveryEventFromDsn({
								rawDsnContent: emailContent,
								dsnEmailId: structuredEmailId,
								autoBlocklist: true, // Auto-add hard bounces to blocklist
								storeRawContent: false, // Don't store raw content to save space
							});

							if (dsnResult.success) {
								console.log(
									`✅ Webhook - DSN recorded: eventId=${dsnResult.eventId}, type=${dsnResult.bounceType}/${dsnResult.bounceSubType}, recipient=${dsnResult.failedRecipient}`,
								);
								if (dsnResult.addedToBlocklist) {
									console.log(
										`🚫 Webhook - Hard bounce auto-added to blocklist: ${dsnResult.failedRecipient}`,
									);
								}
								if (dsnResult.sourceFound) {
									console.log(
										`🔗 Webhook - DSN source found: user=${dsnResult.userId}, domain=${dsnResult.domainName}, tenant=${dsnResult.tenantName}`,
									);
								} else {
									console.log(
										`⚠️ Webhook - DSN source not found (original email not in sent_emails)`,
									);
								}
							} else {
								console.warn(
									`⚠️ Webhook - Failed to record DSN: ${dsnResult.error}`,
								);
							}
						} catch (dsnError) {
							console.error(`❌ Webhook - Error processing DSN:`, dsnError);
							// Don't fail the whole webhook for DSN processing errors
						}
					} else {
						console.log(`📬 Webhook - No DSN detected for ${mail.messageId}`);
					}
					// ========== END DSN DETECTION ==========

					// Route email using the new unified routing system
					// Skip routing for:
					// 1. Blocked emails (sender is on blocklist)
					// 2. DSN emails (bounce notifications should be recorded but not delivered to users)
					if (isDsnEmail) {
						console.log(
							`📬 Webhook - Skipping routing for DSN email ${structuredEmailId} - bounce already recorded`,
						);

						// Update processing record to indicate DSN was processed
						emailProcessingRecord.webhookDelivery = {
							success: true,
							error:
								"DSN processed - bounce notification not forwarded to user",
						};
					} else if (emailStatus === "blocked") {
						console.log(
							`🚫 Webhook - Skipping routing for blocked email ${structuredEmailId} from ${mail.source}`,
						);

						// Update processing record to indicate blocked
						emailProcessingRecord.webhookDelivery = {
							success: false,
							error: "Email blocked - sender is on the blocklist",
						};
					} else {
						try {
							await routeEmail(structuredEmailId);
							console.log(
								`✅ Webhook - Successfully routed email ${structuredEmailId}`,
							);

							// Update processing record with success
							emailProcessingRecord.webhookDelivery = {
								success: true,
								deliveryId: undefined, // Will be tracked in endpointDeliveries table
							};
						} catch (routingError) {
							console.error(
								`❌ Webhook - Failed to route email ${structuredEmailId}:`,
								routingError,
							);

							// Update processing record with failure
							emailProcessingRecord.webhookDelivery = {
								success: false,
								error:
									routingError instanceof Error
										? routingError.message
										: "Unknown routing error",
							};
						}
					}

					// Processing record already updated above in the try/catch block

					processedEmails.push(emailProcessingRecord);
				}
			} catch (recordError) {
				console.error("❌ Webhook - Error processing SES record:", recordError);
				// Continue processing other records
			}
		}

		const response = {
			success: true,
			processedEmails: processedEmails.length,
			rejectedEmails: rejectedEmails.length,
			emails: processedEmails,
			rejected: rejectedEmails,
			timestamp: new Date(),
			lambdaContext: payload.context,
		};

		console.log(
			`✅ Webhook - Successfully processed ${processedEmails.length} emails, rejected ${rejectedEmails.length} emails`,
		);

		return NextResponse.json(response);
	} catch (error) {
		console.error("💥 Webhook - Processing error:", error);

		// Return success even on error to prevent Lambda retries
		return NextResponse.json(
			{
				success: false,
				error: "Failed to process email webhook",
				details: error instanceof Error ? error.message : "Unknown error",
				timestamp: new Date(),
			},
			{ status: 200 }, // Return 200 to prevent retries
		);
	}
}
