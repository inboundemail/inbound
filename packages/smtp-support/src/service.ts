import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import { Autumn as autumn } from "autumn-js";
import { and, eq, isNotNull, or } from "drizzle-orm";
import type { HeaderLines, ParsedMail } from "mailparser";
import { simpleParser } from "mailparser";
import { nanoid } from "nanoid";
import { auth } from "@/lib/auth/auth";
import {
	getAgentIdentityArn,
	getTenantSendingInfoForDomainOrParent,
	type TenantSendingInfo,
} from "@/lib/aws-ses/identity-arn-helper";
import { db } from "@/lib/db";
import { apikey, user } from "@/lib/db/auth-schema";
import {
	SENT_EMAIL_STATUS,
	emailThreads,
	structuredEmails,
	sentEmails,
} from "@/lib/db/schema";
import { getRootDomain, isSubdomain } from "@/lib/domains-and-dns/domain-utils";
import {
	attachmentsToStorageFormat,
	type ProcessedAttachment,
} from "@/app/api/e2/helper/attachment-processor";
import {
	canUserSendFromEmail,
	extractDomain,
	extractEmailAddress,
} from "@/lib/email-management/agent-email-helper";
import { checkRecipientsAgainstBlocklist } from "@/lib/email-management/email-blocking";
import { evaluateSending } from "@/lib/email-management/email-evaluation";
import { enforceOutboundSendGuard } from "@/lib/email-management/outbound-send-guard";
import { checkSendingSpike } from "@/lib/email-management/sending-spike-detector";
import type { AuthenticatedSmtpUser, RelayEnvelope } from "./relay-server";
import { SmtpRelayError } from "./relay-server";

const awsRegion = process.env.AWS_REGION || "us-east-2";
const awsAccessKeyId = process.env.AWS_ACCESS_KEY_ID;
const awsSecretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
const MAX_IDEMPOTENCY_KEY_LENGTH = 256;

const sesClient =
	awsAccessKeyId && awsSecretAccessKey
		? new SESv2Client({
				region: awsRegion,
				credentials: {
					accessKeyId: awsAccessKeyId,
					secretAccessKey: awsSecretAccessKey,
				},
			})
		: null;

type VerifyApiKeyResult = {
	valid: boolean;
	error?: { message?: string } | null;
	key?: {
		id?: string | null;
		userId?: string | null;
		referenceId?: string | null;
	} | null;
};

interface RelayParsedMessage {
	from: string;
	fromAddress: string;
	fromDomain: string;
	subject: string;
	messageId: string;
	idempotencyKey: string | null;
	toAddresses: string[];
	ccAddresses: string[];
	bccAddresses: string[];
	replyToAddresses: string[];
	textBody: string | null;
	htmlBody: string | null;
	headers: Record<string, string> | null;
	attachments: ReturnType<typeof attachmentsToStorageFormat> | null;
	rawMessage: Buffer;
}

const STORED_HEADER_BLACKLIST = new Set([
	"from",
	"to",
	"cc",
	"bcc",
	"subject",
	"date",
	"message-id",
	"mime-version",
	"content-type",
	"content-transfer-encoding",
	"content-disposition",
	"received",
	"return-path",
	"sender",
]);

const TITLE_CASE_HEADER_OVERRIDES: Record<string, string> = {
	"in-reply-to": "In-Reply-To",
	"message-id": "Message-ID",
	"reply-to": "Reply-To",
	"resend-idempotency-key": "Resend-Idempotency-Key",
};

function formatEmailDate(date: Date): string {
	const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
	const months = [
		"Jan",
		"Feb",
		"Mar",
		"Apr",
		"May",
		"Jun",
		"Jul",
		"Aug",
		"Sep",
		"Oct",
		"Nov",
		"Dec",
	];

	return `${days[date.getUTCDay()]}, ${date.getUTCDate()} ${months[date.getUTCMonth()]} ${date.getUTCFullYear()} ${date.getUTCHours().toString().padStart(2, "0")}:${date.getUTCMinutes().toString().padStart(2, "0")}:${date.getUTCSeconds().toString().padStart(2, "0")} +0000`;
}

function canonicalizeHeaderName(key: string): string {
	if (TITLE_CASE_HEADER_OVERRIDES[key]) {
		return TITLE_CASE_HEADER_OVERRIDES[key];
	}

	return key
		.split("-")
		.map((part) => {
			if (part.length === 0) {
				return part;
			}

			return `${part[0].toUpperCase()}${part.slice(1)}`;
		})
		.join("-");
}

function stripAngleBrackets(value: string): string {
	return value.replace(/^<|>$/g, "").trim();
}

function normalizeLookupMessageIds(value: string | null | undefined): string[] {
	if (!value) {
		return [];
	}

	const trimmed = value.trim();
	const stripped = stripAngleBrackets(trimmed);
	const values = new Set<string>();

	if (trimmed) {
		values.add(trimmed);
	}

	if (stripped) {
		values.add(stripped);
		values.add(`<${stripped}>`);
	}

	return Array.from(values);
}

function normalizeEmail(value: string): string {
	return extractEmailAddress(value).trim().toLowerCase();
}

function uniqueEmails(values: string[]): string[] {
	const seen = new Set<string>();
	const unique: string[] = [];

	for (const value of values) {
		const normalized = normalizeEmail(value);
		if (!normalized || seen.has(normalized)) {
			continue;
		}

		seen.add(normalized);
		unique.push(normalized);
	}

	return unique;
}

function extractAddressList(
	addresses: ParsedMail["to"] | ParsedMail["cc"] | ParsedMail["bcc"] | ParsedMail["replyTo"],
): string[] {
	if (!addresses) {
		return [];
	}

	const groups = Array.isArray(addresses) ? addresses : [addresses];
	const extracted: string[] = [];

	for (const group of groups) {
		for (const address of group.value) {
			if (address.address) {
				extracted.push(address.address);
			}
		}
	}

	return uniqueEmails(extracted);
}

function extractStoredHeaders(headerLines: HeaderLines): Record<string, string> | null {
	const headers: Record<string, string> = {};

	for (const header of headerLines) {
		if (STORED_HEADER_BLACKLIST.has(header.key)) {
			continue;
		}

		const separatorIndex = header.line.indexOf(":");
		if (separatorIndex === -1) {
			continue;
		}

		const value = header.line.slice(separatorIndex + 1).trim();
		if (!value) {
			continue;
		}

		const canonicalName = canonicalizeHeaderName(header.key);
		headers[canonicalName] = headers[canonicalName]
			? `${headers[canonicalName]}, ${value}`
			: value;
	}

	return Object.keys(headers).length > 0 ? headers : null;
}

function extractIdempotencyKey(headers: Record<string, string> | null): string | null {
	const key =
		headers?.["Resend-Idempotency-Key"] || headers?.["X-Idempotency-Key"] || null;

	if (!key) {
		return null;
	}

	const trimmed = key.trim();
	if (!trimmed) {
		return null;
	}

	return trimmed.slice(0, MAX_IDEMPOTENCY_KEY_LENGTH);
}

function ensureRelayHeaders(
	rawMessage: Buffer,
	params: {
		fromHeader?: string;
		messageId?: string;
		addDate: boolean;
		hasExistingHeaders: boolean;
	},
): Buffer {
	const prefixLines: string[] = [];

	if (params.fromHeader) {
		prefixLines.push(`From: ${params.fromHeader}`);
	}

	if (params.messageId) {
		prefixLines.push(`Message-ID: <${params.messageId}>`);
	}

	if (params.addDate) {
		prefixLines.push(`Date: ${formatEmailDate(new Date())}`);
	}

	if (prefixLines.length === 0) {
		return rawMessage;
	}

	const separator = params.hasExistingHeaders ? "\r\n" : "\r\n\r\n";

	return Buffer.concat([
		Buffer.from(`${prefixLines.join("\r\n")}${separator}`, "utf-8"),
		rawMessage,
	]);
}

function hasHeaderSection(rawMessage: Buffer): boolean {
	const preview = rawMessage.subarray(0, Math.min(rawMessage.length, 16 * 1024));
	const previewText = preview.toString("latin1");

	return previewText.includes("\r\n\r\n") || previewText.includes("\n\n");
}

function toProcessedAttachments(parsed: ParsedMail): ProcessedAttachment[] {
	return parsed.attachments.map((attachment) => ({
		content: attachment.content.toString("base64"),
		filename: attachment.filename || attachment.contentId || "attachment",
		contentType: attachment.contentType,
		size: attachment.size,
		content_id: attachment.cid,
	}));
}

function smtpResponseCodeForStatusCode(statusCode: number): number {
	if (statusCode === 429) {
		return 451;
	}

	if (statusCode >= 400 && statusCode < 500) {
		return 550;
	}

	if (statusCode >= 500) {
		return 451;
	}

	return 550;
}

async function resolveUserIdFromApiKey(result: VerifyApiKeyResult): Promise<string | null> {
	const resolved = result.key?.userId ?? result.key?.referenceId ?? null;
	if (resolved) {
		return resolved;
	}

	if (!result.key?.id) {
		return null;
	}

	const [apiKeyRecord] = await db
		.select({
			referenceId: apikey.referenceId,
			userId: apikey.userId,
		})
		.from(apikey)
		.where(eq(apikey.id, result.key.id))
		.limit(1);

	return apiKeyRecord?.referenceId ?? apiKeyRecord?.userId ?? null;
}

export async function authenticateSmtpUser(params: {
	username?: string;
	password?: string;
}): Promise<AuthenticatedSmtpUser> {
	const username = params.username?.trim() || "";
	const password = params.password?.trim() || "";

	if (!username) {
		throw new SmtpRelayError("SMTP username is required", 535);
	}

	if (!password) {
		throw new SmtpRelayError("SMTP password must be a valid API key", 535);
	}

	const authApi = auth.api as {
		verifyApiKey?: (input: { body: { key: string } }) => Promise<VerifyApiKeyResult>;
	};

	if (!authApi.verifyApiKey) {
		throw new SmtpRelayError("API key verification is unavailable", 454);
	}

	const verification = await authApi.verifyApiKey({
		body: {
			key: password,
		},
	});

	if (!verification.valid || verification.error) {
		throw new SmtpRelayError(
			verification.error?.message || "Invalid SMTP credentials",
			535,
		);
	}

	const userId = await resolveUserIdFromApiKey(verification);
	if (!userId) {
		throw new SmtpRelayError("Invalid SMTP credentials", 535);
	}

	const [userRecord] = await db
		.select({
			email: user.email,
			banned: user.banned,
			banReason: user.banReason,
			banExpires: user.banExpires,
		})
		.from(user)
		.where(eq(user.id, userId))
		.limit(1);

	if (!userRecord) {
		throw new SmtpRelayError("Invalid SMTP credentials", 535);
	}

	if (userRecord.banned) {
		const banExpiresAt = userRecord.banExpires
			? new Date(userRecord.banExpires)
			: null;
		const banStillActive = banExpiresAt
			? banExpiresAt.getTime() >= Date.now()
			: true;

		if (banStillActive) {
			throw new SmtpRelayError(
				userRecord.banReason || "Account suspended",
				535,
			);
		}
	}

	return {
		userId,
		smtpUsername: username,
		apiKeyId: verification.key?.id ?? null,
		userEmail: userRecord.email,
	};
}

async function parseRelayMessage(
	rawMessage: Buffer,
	envelope: RelayEnvelope,
): Promise<RelayParsedMessage> {
	const parsed = await simpleParser(rawMessage);
	const from = parsed.from?.text?.trim() || envelope.mailFrom;
	const fromAddress = extractEmailAddress(from).trim();

	if (!fromAddress) {
		throw new SmtpRelayError("Message is missing a valid From header", 553);
	}

	const fromDomain = extractDomain(fromAddress);
	if (!fromDomain) {
		throw new SmtpRelayError("Message sender domain is invalid", 553);
	}

	const toAddresses = extractAddressList(parsed.to);
	const ccAddresses = extractAddressList(parsed.cc);
	const declaredRecipients = new Set(
		[...toAddresses, ...ccAddresses, ...extractAddressList(parsed.bcc)].map(
			(email) => email.toLowerCase(),
		),
	);
	const bccAddresses = uniqueEmails(
		envelope.rcptTo.filter(
			(recipient) => !declaredRecipients.has(recipient.toLowerCase()),
		),
	);
	const replyToAddresses = extractAddressList(parsed.replyTo);
	const headers = extractStoredHeaders(parsed.headerLines);
	const idempotencyKey = extractIdempotencyKey(headers);
	const messageId = stripAngleBrackets(parsed.messageId || `${nanoid()}@${fromDomain}`);
	const attachments = toProcessedAttachments(parsed);
	const hasDateHeader = parsed.headerLines.some((header) => header.key === "date");
	const hasFromHeader = parsed.headerLines.some((header) => header.key === "from");
	const hasMessageIdHeader = parsed.headerLines.some(
		(header) => header.key === "message-id",
	);

	return {
		from,
		fromAddress,
		fromDomain,
		subject: parsed.subject || "",
		messageId,
		idempotencyKey,
		toAddresses,
		ccAddresses,
		bccAddresses,
		replyToAddresses,
		textBody: parsed.text?.trim() || null,
		htmlBody: typeof parsed.html === "string" ? parsed.html : null,
		headers,
		attachments:
			attachments.length > 0 ? attachmentsToStorageFormat(attachments) : null,
		rawMessage: ensureRelayHeaders(rawMessage, {
			fromHeader: hasFromHeader ? undefined : from,
			messageId: hasMessageIdHeader ? undefined : messageId,
			addDate: !hasDateHeader,
			hasExistingHeaders: hasHeaderSection(rawMessage),
		}),
	};
}

async function maybeAssignSentEmailThread(params: {
	sentEmailId: string;
	userId: string;
	headers: Record<string, string> | null;
}): Promise<void> {
	const rawReferences = params.headers?.References || "";
	const candidateValues = new Set<string>();

	for (const value of normalizeLookupMessageIds(params.headers?.["In-Reply-To"])) {
		candidateValues.add(value);
	}

	for (const reference of rawReferences.split(/\s+/)) {
		for (const value of normalizeLookupMessageIds(reference)) {
			candidateValues.add(value);
		}
	}

	const lookupValues = Array.from(candidateValues).filter(Boolean);
	if (lookupValues.length === 0) {
		return;
	}

	const [threadFromInbound] = await db
		.select({ threadId: structuredEmails.threadId })
		.from(structuredEmails)
		.where(
			and(
				eq(structuredEmails.userId, params.userId),
				or(...lookupValues.map((value) => eq(structuredEmails.messageId, value))),
				isNotNull(structuredEmails.threadId),
			),
		)
		.limit(1);

	const [threadFromSent] = threadFromInbound?.threadId
		? []
		: await db
				.select({ threadId: sentEmails.threadId })
				.from(sentEmails)
				.where(
					and(
						eq(sentEmails.userId, params.userId),
						or(
							...lookupValues.map((value) => eq(sentEmails.messageId, value)),
							...lookupValues.map((value) => eq(sentEmails.sesMessageId, value)),
						),
						isNotNull(sentEmails.threadId),
					),
				)
				.limit(1);

	const existingThreadId = threadFromInbound?.threadId || threadFromSent?.threadId;

	if (!existingThreadId) {
		return;
	}

	const [threadRecord] = await db
		.select({ messageCount: emailThreads.messageCount })
		.from(emailThreads)
		.where(eq(emailThreads.id, existingThreadId))
		.limit(1);

	const nextPosition = (threadRecord?.messageCount || 0) + 1;

	await db
		.update(sentEmails)
		.set({
			threadId: existingThreadId,
			threadPosition: nextPosition,
			updatedAt: new Date(),
		})
		.where(eq(sentEmails.id, params.sentEmailId));

	await db
		.update(emailThreads)
		.set({
			messageCount: nextPosition,
			lastMessageAt: new Date(),
			updatedAt: new Date(),
		})
		.where(eq(emailThreads.id, existingThreadId));
}

async function resolveTenantSendingInfo(params: {
	userId: string;
	fromDomain: string;
	isAgentEmail: boolean;
}): Promise<TenantSendingInfo> {
	if (params.isAgentEmail) {
		return {
			identityArn: getAgentIdentityArn(),
			configurationSetName: null,
			tenantName: null,
		};
	}

	const parentDomain = isSubdomain(params.fromDomain)
		? getRootDomain(params.fromDomain)
		: undefined;

	return getTenantSendingInfoForDomainOrParent(
		params.userId,
		params.fromDomain,
		parentDomain || undefined,
	);
}

export async function relaySmtpMessage(params: {
	user: AuthenticatedSmtpUser;
	envelope: RelayEnvelope;
	raw: Buffer;
}): Promise<{ message: string }> {
	if (!sesClient) {
		throw new SmtpRelayError("AWS SES is not configured", 451);
	}

	const message = await parseRelayMessage(params.raw, params.envelope);
	const { isAgentEmail } = canUserSendFromEmail(message.from);

	const outboundGuard = await enforceOutboundSendGuard({
		userId: params.user.userId,
		fromAddress: message.fromAddress,
		fromDomain: message.fromDomain,
		isAgentEmail,
	});

	if (!outboundGuard.allowed) {
		throw new SmtpRelayError(
			outboundGuard.error || "Email send blocked",
			smtpResponseCodeForStatusCode(outboundGuard.statusCode),
		);
	}

	const rcptTo = uniqueEmails(params.envelope.rcptTo);
	if (rcptTo.length === 0) {
		throw new SmtpRelayError("Message must include at least one recipient", 554);
	}

	const blocklistCheck = await checkRecipientsAgainstBlocklist(rcptTo);
	if (blocklistCheck.hasBlockedRecipients) {
		throw new SmtpRelayError(
			`Blocked recipient(s): ${blocklistCheck.blockedAddresses.join(", ")}`,
			550,
		);
	}

	const { data: emailCheck, error: emailCheckError } = await autumn.check({
		customer_id: params.user.userId,
		feature_id: "emails_sent",
	});

	if (emailCheckError) {
		throw new SmtpRelayError("Failed to validate email sending limits", 451);
	}

	if (!emailCheck.allowed) {
		throw new SmtpRelayError(
			"Email sending limit reached. Please upgrade your plan to send more emails.",
			452,
		);
	}

	if (message.idempotencyKey) {
		const [existingEmail] = await db
			.select({ id: sentEmails.id, sesMessageId: sentEmails.sesMessageId })
			.from(sentEmails)
			.where(
				and(
					eq(sentEmails.userId, params.user.userId),
					eq(sentEmails.idempotencyKey, message.idempotencyKey),
				),
			)
			.limit(1);

		if (existingEmail) {
			const existingMessageId = existingEmail.sesMessageId || existingEmail.id;
			return {
				message: `Message queued as ${existingMessageId}`,
			};
		}
	}

	const sentEmailId = nanoid();
	await db.insert(sentEmails).values({
		id: sentEmailId,
		from: message.from,
		fromAddress: message.fromAddress,
		fromDomain: message.fromDomain,
		to: JSON.stringify(message.toAddresses),
		cc:
			message.ccAddresses.length > 0
				? JSON.stringify(message.ccAddresses)
				: null,
		bcc:
			message.bccAddresses.length > 0
				? JSON.stringify(message.bccAddresses)
				: null,
		replyTo:
			message.replyToAddresses.length > 0
				? JSON.stringify(message.replyToAddresses)
				: null,
		subject: message.subject,
		textBody: message.textBody,
		htmlBody: message.htmlBody,
		headers: message.headers ? JSON.stringify(message.headers) : null,
		attachments: message.attachments ? JSON.stringify(message.attachments) : null,
		status: SENT_EMAIL_STATUS.PENDING,
		messageId: message.messageId,
		provider: "ses",
		providerResponse: JSON.stringify({
			transport: "smtp-relay",
			envelope: params.envelope,
			smtpUsername: params.user.smtpUsername,
		}),
		userId: params.user.userId,
		idempotencyKey: message.idempotencyKey,
		createdAt: new Date(),
		updatedAt: new Date(),
	});

	try {
		const tenantSendingInfo = await resolveTenantSendingInfo({
			userId: params.user.userId,
			fromDomain: message.fromDomain,
			isAgentEmail,
		});

		const sesResponse = await sesClient.send(
			new SendEmailCommand({
				FromEmailAddress: message.from,
				...(tenantSendingInfo.identityArn && {
					FromEmailAddressIdentityArn: tenantSendingInfo.identityArn,
				}),
				Destination: {
					ToAddresses:
						message.toAddresses.length > 0 ? message.toAddresses : undefined,
					CcAddresses:
						message.ccAddresses.length > 0 ? message.ccAddresses : undefined,
					BccAddresses:
						message.bccAddresses.length > 0 ? message.bccAddresses : undefined,
				},
				Content: {
					Raw: {
						Data: message.rawMessage,
					},
				},
				...(tenantSendingInfo.configurationSetName && {
					ConfigurationSetName: tenantSendingInfo.configurationSetName,
				}),
				...(tenantSendingInfo.tenantName && {
					TenantName: tenantSendingInfo.tenantName,
				}),
			}),
		);

		const sesMessageId = sesResponse.MessageId || null;

		await db
			.update(sentEmails)
			.set({
				status: SENT_EMAIL_STATUS.SENT,
				sesMessageId,
				providerResponse: JSON.stringify({
					transport: "smtp-relay",
					sesResponse,
					envelope: params.envelope,
					smtpUsername: params.user.smtpUsername,
				}),
				sentAt: new Date(),
				updatedAt: new Date(),
			})
			.where(eq(sentEmails.id, sentEmailId));

		await maybeAssignSentEmailThread({
			sentEmailId,
			userId: params.user.userId,
			headers: message.headers,
		});

		if (!emailCheck.unlimited) {
			const trackResult = await autumn.track({
				customer_id: params.user.userId,
				feature_id: "emails_sent",
				value: 1,
			});

			if (trackResult.error) {
				console.error("Failed to track SMTP relay usage:", trackResult.error);
			}
		}

		void evaluateSending(sentEmailId, params.user.userId, {
			from: message.from,
			to: rcptTo,
			subject: message.subject,
			textBody: message.textBody || undefined,
			htmlBody: message.htmlBody || undefined,
		}).catch((error) => {
			console.error("SMTP relay evaluation failed:", error);
		});

		void checkSendingSpike(params.user.userId).catch((error) => {
			console.error("SMTP relay spike check failed:", error);
		});

		return {
			message: `Message queued as ${sesMessageId || sentEmailId}`,
		};
	} catch (error) {
		await db
			.update(sentEmails)
			.set({
				status: SENT_EMAIL_STATUS.FAILED,
				failureReason:
					error instanceof Error ? error.message : "SMTP relay send failed",
				providerResponse: JSON.stringify({
					transport: "smtp-relay",
					error:
						error instanceof Error
							? {
								name: error.name,
								message: error.message,
								stack: error.stack,
							}
							: String(error),
				}),
				updatedAt: new Date(),
			})
			.where(eq(sentEmails.id, sentEmailId));

		throw new SmtpRelayError(
			error instanceof Error ? error.message : "SMTP relay send failed",
			451,
		);
	}
}
