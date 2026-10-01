// THIS IS THE PRIMARY WEBHOOK FOR PROCESSING EMAILS DO NOT DELETE THIS FILE

import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { Autumn as autumn } from "autumn-js";
import { timingSafeEqual } from "crypto";
import { and, asc, eq, sql } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import type { SESEvent, SESRecord } from "@/lib/aws-ses/aws-ses";
import { db } from "@/lib/db";
import { user } from "@/lib/db/auth-schema";
import { resolveInboundDomainOwner } from "@/lib/db/domains";
import { sesEvents, structuredEmails } from "@/lib/db/schema";
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
	envelopeRecipientsOf,
	buildInboundMessageRowId,
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

		// Look up the domain owner, falling back to a wildcard parent domain
		const domainRecord = await resolveInboundDomainOwner(domain);

		if (domainRecord?.userId) {
			const { userId, status, canReceiveEmails, viaWildcard } = domainRecord;

			// Log domain status for debugging
			console.log(
				`✅ Webhook - Found domain ${domainRecord.domain}${viaWildcard ? ` (wildcard parent of ${domain})` : ""}: status=${status}, canReceiveEmails=${canReceiveEmails}, userId=${userId}`,
			);

			// Check if domain is properly configured to receive emails
			if (!canReceiveEmails) {
				console.warn(
					`⚠️ Webhook - Domain ${domainRecord.domain} is not configured to receive emails, but processing anyway`,
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

	const errorWithCode = error as Error & { code?: string; cause?: unknown };
	const cause = errorWithCode.cause as { code?: string; message?: string } | undefined;
	return (
		errorWithCode.code === "23505" ||
		cause?.code === "23505" ||
		error.message.includes("duplicate key") ||
		!!cause?.message?.includes("duplicate key")
	);
}

type ExistingInboundEmail = {
	id: string;
	recipients: string[];
	guardBlocked: boolean;
};

/**
 * Finds the stored email for this message and user, whether it is a new
 * one-row-per-message email or legacy per-recipient rows.
 */
async function findExistingInboundEmail(
	userId: string,
	normalizedHeaderMessageId: string | null,
	sesMessageId: string,
): Promise<ExistingInboundEmail | null> {
	const columns = {
		id: structuredEmails.id,
		recipient: structuredEmails.recipient,
		envelopeRecipients: structuredEmails.envelopeRecipients,
		guardBlocked: structuredEmails.guardBlocked,
	};
	const rows = normalizedHeaderMessageId
		? await db
				.select(columns)
				.from(structuredEmails)
				.where(
					and(
						eq(structuredEmails.userId, userId),
						eq(structuredEmails.messageId, normalizedHeaderMessageId),
					),
				)
				.orderBy(asc(structuredEmails.createdAt))
		: await db
				.select(columns)
				.from(structuredEmails)
				.innerJoin(sesEvents, eq(sesEvents.id, structuredEmails.sesEventId))
				.where(
					and(
						eq(structuredEmails.userId, userId),
						eq(sesEvents.messageId, sesMessageId),
					),
				)
				.orderBy(asc(structuredEmails.createdAt));

	if (rows.length === 0) return null;
	const canonical = rows.find((row) => row.envelopeRecipients) ?? rows[0];
	const recipients = [
		...new Set(
			rows.flatMap((row) =>
				envelopeRecipientsOf(row).map(normalizeRecipientForDedupe),
			),
		),
	];
	return {
		id: canonical.id,
		recipients,
		guardBlocked: !!canonical.guardBlocked,
	};
}

/**
 * Adds envelope recipients to an existing email and returns the ones that were new.
 */
async function mergeEnvelopeRecipients(
	existing: ExistingInboundEmail,
	incoming: string[],
): Promise<string[]> {
	const added = incoming.filter(
		(recipient) => !existing.recipients.includes(recipient),
	);
	const recipientArray = sql`array[${sql.join(
		[...existing.recipients, ...added].map((recipient) => sql`${recipient}`),
		sql`, `,
	)}]::text[]`;
	await db
		.update(structuredEmails)
		.set({
			envelopeRecipients: sql`(select array_agg(distinct r) from unnest(coalesce(${structuredEmails.envelopeRecipients}, array[]::text[]) || ${recipientArray}) as r)`,
			updatedAt: new Date(),
		})
		.where(eq(structuredEmails.id, existing.id));
	return added;
}

/**
 * Create a structured email record from ParsedEmailData that matches the type exactly
 */
async function createStructuredEmailRecord(
	sesEventId: string,
	parsedEmailData: ParsedEmailData,
	userId: string,
	envelopeRecipients: string[],
	normalizedHeaderMessageId: string | null,
): Promise<{ id: string; created: boolean }> {
	const recipient = envelopeRecipients[0];
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
		const structuredEmailId = buildInboundMessageRowId(
			"inbnd",
			sesEventId,
			userId,
			effectiveMessageId,
		);
		const structuredEmailRecord = {
			id: structuredEmailId,
			emailId: structuredEmailId, // Self-referencing for backward compatibility
			sesEventId: sesEventId,
			recipient: normalizedRecipient,
			envelopeRecipients,

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
					`⏭️  Webhook - DEDUPE decision=merge scope=insert source=db_unique_constraint fingerprint=${fingerprint} existing=${structuredEmailId}`,
				);
				return { id: structuredEmailId, created: false };
			}

			// Re-throw if it's a different error
			throw insertError;
		}

		return { id: structuredEmailId, created: true };
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
			const failedStructuredId = buildInboundMessageRowId(
				"inbnd_failed",
				sesEventId,
				userId,
				normalizedHeaderMessageId,
			);
			const failedStructuredRecord = {
				id: failedStructuredId,
				emailId: failedStructuredId, // Self-referencing
				sesEventId: sesEventId,
				recipient: normalizedRecipient,
				envelopeRecipients,
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
						`⏭️  Webhook - DEDUPE decision=merge scope=failed_insert source=db_unique_constraint fingerprint=${failedFingerprint} existing=${failedStructuredId} error=${error instanceof Error ? error.message : "Unknown"}`,
					);
					return { id: failedStructuredId, created: false };
				}

				throw failedInsertError;
			}
			return { id: failedStructuredId, created: true };
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

				// One structured email per message per user. All of a user's envelope
				// recipients (including BCC) are kept on that single row.
				const recipientsByUser = new Map<string, string[]>();
				for (const { recipient, userId } of recipientEntries) {
					const userRecipients = recipientsByUser.get(userId) ?? [];
					if (!userRecipients.includes(recipient)) userRecipients.push(recipient);
					recipientsByUser.set(userId, userRecipients);
				}

				const senderBlocked = await isEmailBlocked(mail.source);
				if (senderBlocked) {
					console.warn(
						`🚫 Webhook - Email from blocked sender ${mail.source} to ${normalizedRecipients.join(", ")}`,
					);
				}

				let contentLoaded = false;
				let emailContent: string | null | undefined = record.emailContent;
				let parsedEmailData: ParsedEmailData | null = null;
				const loadContent = async () => {
					if (contentLoaded) return;
					contentLoaded = true;
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
							const response = await s3Client.send(
								new GetObjectCommand({
									Bucket: record.s3Location.bucket,
									Key: record.s3Location.key,
								}),
							);
							if (response.Body) {
								const chunks: Uint8Array[] = [];
								const reader = response.Body.transformToWebStream().getReader();
								while (true) {
									const { done, value } = await reader.read();
									if (done) break;
									chunks.push(value);
								}
								emailContent = Buffer.concat(chunks).toString("utf-8");
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
					}

					if (emailContent) {
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
				};

				const mergeIntoExisting = async (
					existing: ExistingInboundEmail,
					userRecipients: string[],
				) => {
					const added = await mergeEnvelopeRecipients(existing, userRecipients);
					if (added.length === 0) {
						console.log(
							`⏭️  Webhook - DEDUPE decision=duplicate_skip scope=message existing=${existing.id} recipients=${userRecipients.join(",")}`,
						);
						return;
					}
					console.log(
						`🔗 Webhook - DEDUPE decision=merge scope=message existing=${existing.id} added=${added.join(",")}`,
					);
					let webhookDelivery: { success: boolean; error?: string } | null =
						null;
					if (senderBlocked || existing.guardBlocked) {
						webhookDelivery = {
							success: false,
							error: senderBlocked
								? "Email blocked - sender is on the blocklist"
								: "Email is blocked by Guard",
						};
					} else {
						try {
							await routeEmail(existing.id, {
								recipients: added,
								skipThreading: true,
							});
							webhookDelivery = { success: true };
						} catch (routingError) {
							webhookDelivery = {
								success: false,
								error:
									routingError instanceof Error
										? routingError.message
										: "Unknown routing error",
							};
						}
					}
					processedEmails.push({
						emailId: existing.id,
						sesEventId,
						messageId: mail.messageId,
						recipient: added.join(", "),
						subject: mail.commonHeaders.subject,
						webhookDelivery,
					});
				};

				for (const [userId, userRecipients] of recipientsByUser) {
					const primaryRecipient = userRecipients[0];
					const existing = await findExistingInboundEmail(
						userId,
						normalizedEmailMessageId,
						mail.messageId,
					);
					if (existing) {
						await mergeIntoExisting(existing, userRecipients);
						continue;
					}

					console.log(
						`✅ Webhook - DEDUPE decision=accepted scope=message fingerprint=${buildInboundDedupeFingerprint(userId, primaryRecipient, normalizedEmailMessageId)} recipients=${userRecipients.join(",")}`,
					);

					// Inbound usage is counted once per message, not per recipient
					const triggerResult = await checkAndTrackInboundTrigger(
						userId,
						primaryRecipient,
					);

					if (!triggerResult.allowed) {
						console.warn(
							`⚠️ Webhook - Rejected email for ${userRecipients.join(", ")} due to inbound trigger limits: ${triggerResult.error}`,
						);
						rejectedEmails.push({
							messageId: mail.messageId,
							recipient: userRecipients.join(", "),
							userId: userId,
							reason: triggerResult.error || "Inbound trigger limit reached",
							subject: mail.commonHeaders.subject,
						});

						const domain = extractDomain(primaryRecipient);
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
											rejectedRecipient: primaryRecipient,
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

						continue;
					}

					await loadContent();

					let structuredEmailId: string;
					let created: boolean;
					if (parsedEmailData) {
						({ id: structuredEmailId, created } =
							await createStructuredEmailRecord(
								sesEventId,
								parsedEmailData,
								userId,
								userRecipients,
								normalizedEmailMessageId,
							));
					} else {
						console.warn(
							`⚠️ Webhook - No parsed data for ${mail.messageId}, creating minimal record`,
						);
						structuredEmailId = buildInboundMessageRowId(
							"inbnd_minimal",
							sesEventId,
							userId,
							normalizedEmailMessageId,
						);
						created = true;
						try {
							await db.insert(structuredEmails).values({
								id: structuredEmailId,
								emailId: structuredEmailId,
								sesEventId: sesEventId,
								recipient: primaryRecipient,
								envelopeRecipients: userRecipients,
								messageId: normalizedEmailMessageId,
								subject: mail.commonHeaders.subject || "No Subject",
								parseSuccess: false,
								parseError: "Failed to parse email content",
								userId: userId,
								createdAt: new Date(),
								updatedAt: new Date(),
							});
						} catch (minimalInsertError) {
							if (!isDuplicateKeyError(minimalInsertError)) {
								throw minimalInsertError;
							}
							created = false;
						}
					}

					if (!created) {
						// Another invocation stored this message first; merge our recipients into it
						const raced = await findExistingInboundEmail(
							userId,
							normalizedEmailMessageId,
							mail.messageId,
						);
						if (raced) await mergeIntoExisting(raced, userRecipients);
						continue;
					}

					const emailProcessingRecord = {
						emailId: structuredEmailId,
						sesEventId: sesEventId,
						messageId: mail.messageId,
						recipient: userRecipients.join(", "),
						subject: mail.commonHeaders.subject,
						webhookDelivery: null as {
							success: boolean;
							deliveryId?: string;
							error?: string;
						} | null,
					};

					console.log(
						`✅ Webhook - Stored email ${mail.messageId} for ${userRecipients.join(", ")} with ID ${structuredEmailId}`,
					);

					// ========== DSN DETECTION AND BOUNCE TRACKING ==========
					// DSN emails are recorded for bounce tracking but not delivered to users
					let isDsnEmail = false;
					if (emailContent && isDsn(emailContent)) {
						isDsnEmail = true;
						console.log(
							`📬 Webhook - DSN detected for ${primaryRecipient}, recording delivery event...`,
						);

						try {
							const dsnResult = await recordDeliveryEventFromDsn({
								rawDsnContent: emailContent,
								dsnEmailId: structuredEmailId,
								autoBlocklist: true,
								storeRawContent: false,
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
							} else {
								console.warn(
									`⚠️ Webhook - Failed to record DSN: ${dsnResult.error}`,
								);
							}
						} catch (dsnError) {
							console.error(`❌ Webhook - Error processing DSN:`, dsnError);
						}
					}
					// ========== END DSN DETECTION ==========

					if (isDsnEmail) {
						emailProcessingRecord.webhookDelivery = {
							success: true,
							error:
								"DSN processed - bounce notification not forwarded to user",
						};
					} else if (senderBlocked) {
						emailProcessingRecord.webhookDelivery = {
							success: false,
							error: "Email blocked - sender is on the blocklist",
						};
					} else {
						try {
							await routeEmail(structuredEmailId, {
								recipients: userRecipients,
							});
							console.log(
								`✅ Webhook - Successfully routed email ${structuredEmailId}`,
							);
							emailProcessingRecord.webhookDelivery = {
								success: true,
								deliveryId: undefined,
							};
						} catch (routingError) {
							console.error(
								`❌ Webhook - Failed to route email ${structuredEmailId}:`,
								routingError,
							);
							emailProcessingRecord.webhookDelivery = {
								success: false,
								error:
									routingError instanceof Error
										? routingError.message
										: "Unknown routing error",
							};
						}
					}

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
