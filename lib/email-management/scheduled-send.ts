import {
	SESv2Client,
	SendEmailCommand,
	type SendEmailCommandOutput,
} from "@aws-sdk/client-sesv2";
import { waitUntil } from "@vercel/functions";
import {
	and,
	asc,
	eq,
	gt,
	gte,
	inArray,
	isNotNull,
	isNull,
	lt,
	lte,
	notInArray,
	or,
	sql,
	type InferSelectModel,
} from "drizzle-orm";
import { nanoid } from "nanoid";
import type { ProcessedAttachment } from "@/app/api/e2/helper/attachment-processor";
import { buildRawEmailMessage } from "@/app/api/e2/helper/email-builder";
import {
	findUnsafeCustomHeader,
	isReservedHeaderName,
} from "@/app/api/e2/helper/header-safety";
import { buildSentEmailTags } from "@/app/api/e2/helper/ses-email-tags";
import {
	getAgentIdentityArn,
	getTenantSendingInfoForDomainOrParent,
	type TenantSendingInfo,
} from "@/lib/aws-ses/identity-arn-helper";
import { db } from "@/lib/db";
import {
	SCHEDULED_EMAIL_STATUS,
	SENT_EMAIL_STATUS,
	scheduledEmails,
	sentEmails,
} from "@/lib/db/schema";
import { getRootDomain, isSubdomain } from "@/lib/domains-and-dns/domain-utils";
import {
	fromAddressMatchesSender,
	parseMailbox,
	resolveSender,
} from "@/lib/email-management/agent-email-helper";
import { evaluateSending } from "@/lib/email-management/email-evaluation";
import { enforceOutboundSendGuard } from "@/lib/email-management/outbound-send-guard";
import { checkSendingSpike } from "@/lib/email-management/sending-spike-detector";

export type ScheduledEmail = InferSelectModel<typeof scheduledEmails>;

export type ScheduledSendResult =
	| { outcome: "sent"; id: string; messageId: string | undefined }
	| { outcome: "blocked"; id: string; reason: string; error: string }
	| { outcome: "failed"; id: string; error: string }
	| { outcome: "retry"; id: string; error: string }
	| { outcome: "skipped"; id: string; reason: string };

export const STALE_PROCESSING_MS = 15 * 60 * 1000;
const STALE_PROCESSING_RETRY_WINDOW_MS = 60 * 60 * 1000;
export const MISSED_SEND_WINDOW_MS = 24 * 60 * 60 * 1000;
export const MIGRATION_MISSED_WINDOW_MS = 15 * 60 * 1000;
export const RETRY_BACKOFF_MS = 2 * 60 * 1000;
const DEFAULT_MAX_ATTEMPTS = 3;

const awsRegion = process.env.AWS_REGION || "us-east-2";
const awsAccessKeyId = process.env.AWS_ACCESS_KEY_ID;
const awsSecretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

let sesClient: SESv2Client | null = null;

if (awsAccessKeyId && awsSecretAccessKey) {
	sesClient = new SESv2Client({
		region: awsRegion,
		credentials: {
			accessKeyId: awsAccessKeyId,
			secretAccessKey: awsSecretAccessKey,
		},
		maxAttempts: 1,
		requestHandler: {
			connectionTimeout: 3000,
			requestTimeout: 10000,
		},
	});
} else {
	console.warn(
		"⚠️ AWS credentials not configured. Scheduled email processing will not work.",
	);
}

export function isThrottlingError(error: unknown): boolean {
	if (!error || typeof error !== "object") return false;
	const candidate = error as {
		name?: unknown;
		$metadata?: { httpStatusCode?: unknown };
		$retryable?: { throttling?: unknown };
	};
	return (
		candidate.name === "TooManyRequestsException" ||
		candidate.name === "Throttling" ||
		candidate.name === "ThrottlingException" ||
		candidate.$metadata?.httpStatusCode === 429 ||
		candidate.$retryable?.throttling === true
	);
}

interface StoredAttachment {
	filename?: string;
	contentType?: string;
	content_type?: string;
	[key: string]: unknown;
}

function parseAddressList(values: unknown): string[] | null {
	if (!Array.isArray(values)) return null;
	const addresses: string[] = [];
	for (const value of values) {
		if (typeof value !== "string") return null;
		const parsed = parseMailbox(value);
		if (!parsed.ok) return null;
		addresses.push(parsed.mailbox.address);
	}
	return addresses;
}

function parseDestination(
	to: unknown,
	cc: unknown,
	bcc: unknown,
): { to: string[]; cc: string[]; bcc: string[] } | null {
	const toList = parseAddressList(to);
	const ccList = parseAddressList(cc);
	const bccList = parseAddressList(bcc);
	if (!toList || !ccList || !bccList) return null;
	if (toList.length + ccList.length + bccList.length === 0) return null;
	return { to: toList, cc: ccList, bcc: bccList };
}

function findUnsafeStoredContent(
	subject: unknown,
	replyTo: unknown,
	headers: unknown,
): string | null {
	if (typeof subject !== "string" || /[\r\n\u0000]/.test(subject)) {
		return "invalid subject";
	}
	if (!parseAddressList(replyTo)) return "invalid reply-to address";
	if (headers !== undefined && headers !== null) {
		if (typeof headers !== "object" || Array.isArray(headers)) {
			return "invalid custom headers";
		}
		for (const [name, value] of Object.entries(headers)) {
			if (isReservedHeaderName(name)) continue;
			if (typeof value !== "string" || findUnsafeCustomHeader(name, value)) {
				return `invalid custom header ${JSON.stringify(name)}`;
			}
		}
	}
	return null;
}

function contentTypeForFilename(filename: string): string {
	const ext = filename.toLowerCase().split(".").pop();
	switch (ext) {
		case "pdf":
			return "application/pdf";
		case "jpg":
		case "jpeg":
			return "image/jpeg";
		case "png":
			return "image/png";
		case "gif":
			return "image/gif";
		case "txt":
			return "text/plain";
		case "html":
			return "text/html";
		case "json":
			return "application/json";
		case "zip":
			return "application/zip";
		case "doc":
			return "application/msword";
		case "docx":
			return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
		case "xls":
			return "application/vnd.ms-excel";
		case "xlsx":
			return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
		default:
			return "application/octet-stream";
	}
}

function normalizeAttachments(
	rawAttachments: StoredAttachment[],
): ProcessedAttachment[] {
	const normalized = rawAttachments.map((att, index) => {
		if (!att.contentType && !att.content_type) {
			console.log(
				`⚠️ Attachment ${index + 1} missing contentType, using fallback`,
			);
			return {
				...att,
				contentType: contentTypeForFilename(att.filename || "unknown"),
			};
		}
		return {
			...att,
			contentType: att.contentType || att.content_type,
		};
	});
	return normalized as unknown as ProcessedAttachment[];
}

/**
 * Atomically claims up to `limit` due scheduled emails by flipping them from
 * scheduled to processing in a single statement. SKIP LOCKED lets overlapping
 * cron runs claim disjoint rows instead of waiting on each other. Rows waiting
 * out a retry backoff, rows in `excludeIds` and QStash-era rows that are past
 * the migration window are skipped.
 */
export async function claimDueScheduledEmails(
	limit: number,
	now: Date = new Date(),
	excludeIds: string[] = [],
): Promise<ScheduledEmail[]> {
	const migrationCutoff = new Date(now.getTime() - MIGRATION_MISSED_WINDOW_MS);
	const due = db
		.select({ id: scheduledEmails.id })
		.from(scheduledEmails)
		.where(
			and(
				eq(scheduledEmails.status, SCHEDULED_EMAIL_STATUS.SCHEDULED),
				lte(scheduledEmails.scheduledAt, now),
				or(
					isNull(scheduledEmails.nextRetryAt),
					lte(scheduledEmails.nextRetryAt, now),
				),
				or(
					isNull(scheduledEmails.qstashScheduleId),
					gte(scheduledEmails.scheduledAt, migrationCutoff),
				),
				excludeIds.length > 0
					? notInArray(scheduledEmails.id, excludeIds)
					: undefined,
			),
		)
		.orderBy(asc(scheduledEmails.scheduledAt))
		.limit(limit)
		.for("update", { skipLocked: true });

	return db
		.update(scheduledEmails)
		.set({
			status: SCHEDULED_EMAIL_STATUS.PROCESSING,
			attempts: sql`coalesce(${scheduledEmails.attempts}, 0) + 1`,
			updatedAt: now,
		})
		.where(
			and(
				inArray(scheduledEmails.id, due),
				eq(scheduledEmails.status, SCHEDULED_EMAIL_STATUS.SCHEDULED),
			),
		)
		.returning();
}

/**
 * Releases rows a crashed or timed-out run left in processing. A row whose
 * sentEmailId is set may already have reached SES, so it is failed rather than
 * retried; only rows that never reached SES go back to scheduled. Rows the
 * QStash handler left in processing (qstashScheduleId set, or no claim
 * recorded) are always failed: it set sentEmailId only after SES succeeded.
 */
export async function recoverStaleScheduledEmails(
	now: Date = new Date(),
): Promise<{ failed: number; rescheduled: number }> {
	const staleBefore = new Date(now.getTime() - STALE_PROCESSING_MS);
	const retryWindowStart = new Date(
		now.getTime() - STALE_PROCESSING_RETRY_WINDOW_MS,
	);
	const maxAttempts = sql`coalesce(${scheduledEmails.maxAttempts}, ${DEFAULT_MAX_ATTEMPTS})`;
	const attempts = sql`coalesce(${scheduledEmails.attempts}, 0)`;
	const stale = and(
		eq(scheduledEmails.status, SCHEDULED_EMAIL_STATUS.PROCESSING),
		lt(scheduledEmails.updatedAt, staleBefore),
	);

	const failed = await db
		.update(scheduledEmails)
		.set({
			status: SCHEDULED_EMAIL_STATUS.FAILED,
			lastError: sql`case when ${scheduledEmails.sentEmailId} is not null or ${scheduledEmails.qstashScheduleId} is not null or ${attempts} <= 0 then 'Send was interrupted after the request to SES may have been made; not retried to avoid a duplicate send' else 'Send was interrupted and the email was not retried' end`,
			updatedAt: now,
		})
		.where(
			and(
				stale,
				or(
					isNotNull(scheduledEmails.sentEmailId),
					isNotNull(scheduledEmails.qstashScheduleId),
					lte(attempts, 0),
					lt(scheduledEmails.updatedAt, retryWindowStart),
					gte(attempts, maxAttempts),
				),
			),
		)
		.returning({ id: scheduledEmails.id });

	const rescheduled = await db
		.update(scheduledEmails)
		.set({
			status: SCHEDULED_EMAIL_STATUS.SCHEDULED,
			lastError: "Send was interrupted before reaching SES; retrying",
			updatedAt: now,
		})
		.where(
			and(
				stale,
				isNull(scheduledEmails.sentEmailId),
				isNull(scheduledEmails.qstashScheduleId),
				gt(attempts, 0),
				gte(scheduledEmails.updatedAt, retryWindowStart),
				lt(attempts, maxAttempts),
			),
		)
		.returning({ id: scheduledEmails.id });

	return { failed: failed.length, rescheduled: rescheduled.length };
}

/**
 * Fails scheduled emails that are far past due instead of sending them late,
 * so an outage or a long-abandoned row never results in a surprise send.
 * QStash-era rows get a 15 minute window instead.
 */
export async function expireMissedScheduledEmails(
	now: Date = new Date(),
): Promise<number> {
	const migrationCutoff = new Date(now.getTime() - MIGRATION_MISSED_WINDOW_MS);
	const migrationExpired = await db
		.update(scheduledEmails)
		.set({
			status: SCHEDULED_EMAIL_STATUS.FAILED,
			lastError: "Missed during scheduler migration",
			updatedAt: now,
		})
		.where(
			and(
				eq(scheduledEmails.status, SCHEDULED_EMAIL_STATUS.SCHEDULED),
				isNotNull(scheduledEmails.qstashScheduleId),
				lt(scheduledEmails.scheduledAt, migrationCutoff),
			),
		)
		.returning({ id: scheduledEmails.id });

	const cutoff = new Date(now.getTime() - MISSED_SEND_WINDOW_MS);
	const expired = await db
		.update(scheduledEmails)
		.set({
			status: SCHEDULED_EMAIL_STATUS.FAILED,
			lastError: "Missed the scheduled send window (more than 24 hours overdue)",
			updatedAt: now,
		})
		.where(
			and(
				eq(scheduledEmails.status, SCHEDULED_EMAIL_STATUS.SCHEDULED),
				lt(scheduledEmails.scheduledAt, cutoff),
			),
		)
		.returning({ id: scheduledEmails.id });
	return migrationExpired.length + expired.length;
}

async function markScheduledFailed(id: string, lastError: string) {
	await db
		.update(scheduledEmails)
		.set({
			status: SCHEDULED_EMAIL_STATUS.FAILED,
			lastError,
			updatedAt: new Date(),
		})
		.where(
			and(
				eq(scheduledEmails.id, id),
				eq(scheduledEmails.status, SCHEDULED_EMAIL_STATUS.PROCESSING),
			),
		);
}

async function block(
	id: string,
	error: string,
	reason: string,
): Promise<ScheduledSendResult> {
	console.log(`🚫 Blocking scheduled email ${id}: ${error}`);
	await markScheduledFailed(id, `Email blocked: ${error}`);
	return { outcome: "blocked", id, reason, error };
}

/**
 * Sends one scheduled email that the caller has already claimed (status
 * processing). Validation, the outbound guard and sender checks match the
 * immediate send path. A row is marked sent or failed only after SES answers,
 * and is put back to scheduled (after a backoff) only when the failure happened
 * before SES was called or SES throttled the request, so an email is sent at
 * most once.
 */
export async function sendClaimedScheduledEmail(
	scheduledEmail: ScheduledEmail,
): Promise<ScheduledSendResult> {
	const scheduledEmailId = scheduledEmail.id;
	console.log("📧 Processing scheduled email:", scheduledEmailId);

	let sesAttempted = false;
	let sentEmailId: string | null = null;
	let sentEmailInserted = false;

	try {
		if (!sesClient) {
			throw new Error("AWS SES not configured");
		}

		const resolvedScheduledSender = resolveSender(scheduledEmail.fromAddress);
		if (
			!resolvedScheduledSender.ok ||
			resolvedScheduledSender.sender.domain !==
				scheduledEmail.fromDomain.toLowerCase()
		) {
			const reason = resolvedScheduledSender.ok
				? "From address does not match the stored sender domain"
				: `Invalid from address: ${resolvedScheduledSender.error}`;
			return await block(scheduledEmailId, reason, "invalid_from_address");
		}
		const scheduledSender = resolvedScheduledSender.sender;
		const scheduledFromAddress = scheduledSender.address;
		const isAgentEmail = scheduledSender.isAgentEmail;
		const scheduledGuard = await enforceOutboundSendGuard({
			userId: scheduledEmail.userId,
			fromAddress: scheduledFromAddress,
			fromDomain: scheduledSender.domain,
			isAgentEmail,
		});
		if (!scheduledGuard.allowed) {
			console.log(
				`🚫 Blocking scheduled email for user ${scheduledEmail.userId}: ${scheduledGuard.reasonCode}`,
			);
			await markScheduledFailed(
				scheduledEmailId,
				`Email blocked: ${scheduledGuard.error || "Outbound security guard"}`,
			);
			return {
				outcome: "blocked",
				id: scheduledEmailId,
				reason: scheduledGuard.reasonCode || "outbound_guard",
				error: scheduledGuard.error || "Email blocked",
			};
		}

		const toAddresses = JSON.parse(scheduledEmail.toAddresses);
		const ccAddresses = scheduledEmail.ccAddresses
			? JSON.parse(scheduledEmail.ccAddresses)
			: [];
		const bccAddresses = scheduledEmail.bccAddresses
			? JSON.parse(scheduledEmail.bccAddresses)
			: [];
		const replyToAddresses = scheduledEmail.replyToAddresses
			? JSON.parse(scheduledEmail.replyToAddresses)
			: [];
		const scheduledDestination = parseDestination(
			toAddresses,
			ccAddresses,
			bccAddresses,
		);
		if (!scheduledDestination) {
			return await block(
				scheduledEmailId,
				"invalid recipient address",
				"invalid_recipient",
			);
		}
		const headers = scheduledEmail.headers
			? JSON.parse(scheduledEmail.headers)
			: undefined;
		const scheduledUnsafeContent = findUnsafeStoredContent(
			scheduledEmail.subject,
			replyToAddresses,
			headers,
		);
		if (scheduledUnsafeContent) {
			return await block(scheduledEmailId, scheduledUnsafeContent, "invalid_message");
		}
		const attachments = normalizeAttachments(
			scheduledEmail.attachments ? JSON.parse(scheduledEmail.attachments) : [],
		);

		sentEmailId = nanoid();
		const owned = await db
			.update(scheduledEmails)
			.set({ sentEmailId, updatedAt: new Date() })
			.where(
				and(
					eq(scheduledEmails.id, scheduledEmailId),
					eq(scheduledEmails.status, SCHEDULED_EMAIL_STATUS.PROCESSING),
				),
			)
			.returning({ id: scheduledEmails.id });
		if (owned.length === 0) {
			console.log(
				"⏭️ Scheduled email is no longer processing, skipping:",
				scheduledEmailId,
			);
			return {
				outcome: "skipped",
				id: scheduledEmailId,
				reason: "not_processing",
			};
		}

		const [createdSentEmail] = await db
			.insert(sentEmails)
			.values({
				id: sentEmailId,
				from: scheduledSender.formatted,
				fromAddress: scheduledFromAddress,
				fromDomain: scheduledSender.domain,
				to: JSON.stringify(toAddresses),
				cc: ccAddresses.length > 0 ? JSON.stringify(ccAddresses) : null,
				bcc: bccAddresses.length > 0 ? JSON.stringify(bccAddresses) : null,
				replyTo:
					replyToAddresses.length > 0
						? JSON.stringify(replyToAddresses)
						: null,
				subject: scheduledEmail.subject,
				textBody: scheduledEmail.textBody,
				htmlBody: scheduledEmail.htmlBody,
				headers: scheduledEmail.headers,
				attachments: scheduledEmail.attachments,
				tags: scheduledEmail.tags,
				status: SENT_EMAIL_STATUS.PENDING,
				provider: "ses",
				userId: scheduledEmail.userId,
				createdAt: new Date(),
				updatedAt: new Date(),
			})
			.returning();
		sentEmailInserted = true;

		console.log("📧 Building raw email message for scheduled email");
		const rawMessage = buildRawEmailMessage({
			from: scheduledSender.formatted,
			to: toAddresses,
			cc: ccAddresses.length > 0 ? ccAddresses : undefined,
			bcc: bccAddresses.length > 0 ? bccAddresses : undefined,
			replyTo: replyToAddresses.length > 0 ? replyToAddresses : undefined,
			subject: scheduledEmail.subject,
			textBody: scheduledEmail.textBody || undefined,
			htmlBody: scheduledEmail.htmlBody || undefined,
			customHeaders: headers,
			attachments: attachments,
			date: new Date(),
		});

		const fromDomain = scheduledSender.domain;

		let tenantSendingInfo: TenantSendingInfo = {
			identityArn: null,
			configurationSetName: null,
			tenantName: null,
		};
		if (isAgentEmail) {
			tenantSendingInfo = {
				identityArn: getAgentIdentityArn(),
				configurationSetName: null,
				tenantName: null,
			};
		} else {
			const parentDomain = isSubdomain(fromDomain)
				? getRootDomain(fromDomain)
				: undefined;
			tenantSendingInfo = await getTenantSendingInfoForDomainOrParent(
				scheduledEmail.userId,
				fromDomain,
				parentDomain || undefined,
			);
		}

		if (tenantSendingInfo.identityArn) {
			console.log(
				`🏢 Using SourceArn for scheduled email tenant tracking: ${tenantSendingInfo.identityArn}`,
			);
		} else {
			console.warn(
				"⚠️ No SourceArn available - scheduled email will not be tracked at tenant level",
			);
		}

		if (tenantSendingInfo.configurationSetName) {
			console.log(
				`📋 Using ConfigurationSet for scheduled email tenant tracking: ${tenantSendingInfo.configurationSetName}`,
			);
		} else {
			console.warn(
				"⚠️ No ConfigurationSet available - scheduled email metrics may not be tracked correctly",
			);
		}

		if (tenantSendingInfo.tenantName) {
			console.log(
				`🏠 Using TenantName for scheduled email AWS SES tracking: ${tenantSendingInfo.tenantName}`,
			);
		} else {
			console.warn(
				"⚠️ No TenantName available - scheduled email will NOT appear in tenant dashboard!",
			);
		}

		const scheduledFromEmailAddress = scheduledSender.formatted;
		if (
			!fromAddressMatchesSender(scheduledFromEmailAddress, {
				address: scheduledFromAddress,
				domain: fromDomain,
				isAgentEmail,
			})
		) {
			const reason = "From address does not match the authorized sender";
			console.error(`🚫 Blocking scheduled email ${scheduledEmailId}: ${reason}`);
			await db
				.update(sentEmails)
				.set({
					status: SENT_EMAIL_STATUS.FAILED,
					failureReason: reason,
					updatedAt: new Date(),
				})
				.where(eq(sentEmails.id, createdSentEmail.id));
			await markScheduledFailed(scheduledEmailId, `Email blocked: ${reason}`);
			return {
				outcome: "blocked",
				id: scheduledEmailId,
				reason: "invalid_from_address",
				error: reason,
			};
		}
		const rawCommand = new SendEmailCommand({
			FromEmailAddress: scheduledFromEmailAddress,
			...(tenantSendingInfo.identityArn && {
				FromEmailAddressIdentityArn: tenantSendingInfo.identityArn,
			}),
			Destination: {
				ToAddresses: scheduledDestination.to,
				CcAddresses:
					scheduledDestination.cc.length > 0
						? scheduledDestination.cc
						: undefined,
				BccAddresses:
					scheduledDestination.bcc.length > 0
						? scheduledDestination.bcc
						: undefined,
			},
			Content: {
				Raw: {
					Data: Buffer.from(rawMessage),
				},
			},
			...(tenantSendingInfo.configurationSetName && {
				ConfigurationSetName: tenantSendingInfo.configurationSetName,
			}),
			...(tenantSendingInfo.tenantName && {
				TenantName: tenantSendingInfo.tenantName,
			}),
			EmailTags: buildSentEmailTags(createdSentEmail.id),
		});

		sesAttempted = true;
		let sesResponse: SendEmailCommandOutput;
		try {
			sesResponse = await sesClient.send(rawCommand);
		} catch (sesError) {
			if (isThrottlingError(sesError)) {
				sesAttempted = false;
				throw sesError;
			}
			const errorMessage =
				sesError instanceof Error ? sesError.message : "Unknown SES error";
			console.error("❌ SES send error for scheduled email:", sesError);
			await Promise.allSettled([
				db
					.update(sentEmails)
					.set({
						status: SENT_EMAIL_STATUS.FAILED,
						failureReason: errorMessage,
						providerResponse: JSON.stringify(sesError),
						updatedAt: new Date(),
					})
					.where(eq(sentEmails.id, createdSentEmail.id)),
				markScheduledFailed(scheduledEmailId, errorMessage),
			]);
			return { outcome: "failed", id: scheduledEmailId, error: errorMessage };
		}
		const messageId = sesResponse.MessageId;

		console.log("✅ Scheduled email sent successfully via SES:", messageId);

		await db
			.update(scheduledEmails)
			.set({
				status: SCHEDULED_EMAIL_STATUS.SENT,
				sentAt: new Date(),
				sentEmailId: createdSentEmail.id,
				lastError: null,
				updatedAt: new Date(),
			})
			.where(eq(scheduledEmails.id, scheduledEmailId));

		await db
			.update(sentEmails)
			.set({
				status: SENT_EMAIL_STATUS.SENT,
				messageId: messageId,
				sesMessageId: messageId,
				providerResponse: JSON.stringify(sesResponse),
				sentAt: new Date(),
				updatedAt: new Date(),
			})
			.where(eq(sentEmails.id, createdSentEmail.id));

		waitUntil(
			evaluateSending(createdSentEmail.id, scheduledEmail.userId, {
				from: scheduledEmail.fromAddress,
				to: toAddresses,
				subject: scheduledEmail.subject,
				textBody: scheduledEmail.textBody || undefined,
				htmlBody: scheduledEmail.htmlBody || undefined,
			}),
		);

		waitUntil(checkSendingSpike(scheduledEmail.userId));

		console.log("✅ Scheduled email processed successfully:", scheduledEmailId);
		return { outcome: "sent", id: scheduledEmailId, messageId };
	} catch (error) {
		console.error("❌ Error processing scheduled email:", error);
		const errorMessage =
			error instanceof Error ? error.message : "Unknown error";

		if (sesAttempted) {
			return { outcome: "failed", id: scheduledEmailId, error: errorMessage };
		}

		try {
			if (sentEmailInserted && sentEmailId) {
				await db
					.update(sentEmails)
					.set({
						status: SENT_EMAIL_STATUS.FAILED,
						failureReason: errorMessage,
						updatedAt: new Date(),
					})
					.where(eq(sentEmails.id, sentEmailId));
			}
			const canRetry =
				(scheduledEmail.attempts ?? 0) <
				(scheduledEmail.maxAttempts ?? DEFAULT_MAX_ATTEMPTS);
			const failedAt = new Date();
			await db
				.update(scheduledEmails)
				.set({
					status: canRetry
						? SCHEDULED_EMAIL_STATUS.SCHEDULED
						: SCHEDULED_EMAIL_STATUS.FAILED,
					sentEmailId: null,
					nextRetryAt: canRetry
						? new Date(failedAt.getTime() + RETRY_BACKOFF_MS)
						: null,
					lastError: errorMessage,
					updatedAt: failedAt,
				})
				.where(
					and(
						eq(scheduledEmails.id, scheduledEmailId),
						eq(scheduledEmails.status, SCHEDULED_EMAIL_STATUS.PROCESSING),
					),
				);
			return canRetry
				? { outcome: "retry", id: scheduledEmailId, error: errorMessage }
				: { outcome: "failed", id: scheduledEmailId, error: errorMessage };
		} catch (updateError) {
			console.error("❌ Failed to update error in database:", updateError);
			return { outcome: "failed", id: scheduledEmailId, error: errorMessage };
		}
	}
}
