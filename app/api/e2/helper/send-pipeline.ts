import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import { waitUntil } from "@vercel/functions";
import { Autumn as autumn } from "autumn-js";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import {
	checkIdempotencyKey,
	readIdempotencyKey,
} from "@/app/api/e2/helper/idempotency";
import { buildSentEmailTags } from "@/app/api/e2/helper/ses-email-tags";
import {
	isSendingPausedError,
	sesSendErrorResponse,
} from "@/app/api/e2/helper/ses-send-errors";
import {
	type ManagedSenderPolicy,
	senderPolicyAllowsAddress,
} from "@/app/api/e2/lib/send-auth";
import {
	getAgentIdentityArn,
	getTenantSendingInfoForDomainOrParent,
	type TenantSendingInfo,
} from "@/lib/aws-ses/identity-arn-helper";
import { db } from "@/lib/db";
import { SENT_EMAIL_STATUS, sentEmails, sesTenants } from "@/lib/db/schema";
import { getRootDomain, isSubdomain } from "@/lib/domains-and-dns/domain-utils";
import {
	fromAddressMatchesSender,
	parseMailbox,
	resolveSender,
} from "@/lib/email-management/agent-email-helper";
import { checkRecipientsAgainstBlocklist } from "@/lib/email-management/email-blocking";
import {
	type EmailEvaluationData,
	evaluateSending,
} from "@/lib/email-management/email-evaluation";
import {
	ensureMessageIdHeader,
	type SentCopyCredential,
	saveSentCopies,
} from "@/lib/email-management/mailbox-sent-copy";
import { enforceOutboundSendGuard } from "@/lib/email-management/outbound-send-guard";
import { checkSendingSpike } from "@/lib/email-management/sending-spike-detector";

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
	});
}

export type SendResponseBody =
	| { id: string; message_id?: string }
	| { error: string };

export interface SendResponse {
	status?: number;
	body: SendResponseBody;
}

function sendError(status: number, error: string): SendResponse {
	return { status, body: { error } };
}

function replayResponse(email: {
	id: string;
	messageId: string | null;
	sesMessageId: string | null;
}): SendResponse {
	const messageId = email.sesMessageId || email.messageId;
	return {
		body: { id: email.id, ...(messageId ? { message_id: messageId } : {}) },
	};
}

export async function resolveSendIdempotency(
	headers: Headers,
	userId: string,
): Promise<{ key: string | null } | { response: SendResponse }> {
	const idempotency = readIdempotencyKey(headers);
	if ("error" in idempotency) {
		return { response: sendError(400, idempotency.error) };
	}
	const idempotencyKey = idempotency.key;
	if (idempotencyKey) {
		const decision = await checkIdempotencyKey(userId, idempotencyKey);
		if (decision.kind === "replay") {
			return { response: replayResponse(decision.email) };
		}
		if (decision.kind === "in_progress") {
			return { response: { status: 409, body: decision.body } };
		}
	}
	return { key: idempotencyKey };
}

export interface AuthorizedSender {
	fromAddress: string;
	fromDomain: string;
	isAgentEmail: boolean;
	fromName: string | null;
	formattedFrom: string;
	recipients: { to: string[]; cc: string[]; bcc: string[] };
}

function parseRecipientList(
	values: string[],
): { addresses: string[] } | { invalid: string } {
	const addresses: string[] = [];
	for (const value of values) {
		const parsed = parseMailbox(value);
		if (!parsed.ok) return { invalid: value };
		addresses.push(parsed.mailbox.address);
	}
	return { addresses };
}

function invalidRecipient(value: string): { response: SendResponse } {
	console.log("⚠️ Invalid email format:", value);
	return { response: sendError(400, `Invalid email format: ${value}`) };
}

/**
 * Sender policy, outbound guard (ban, domain verification, tenant status, hourly
 * limit, managed-domain billing), recipient validation and bounce blocklist.
 */
export async function authorizeOutboundSend(input: {
	userId: string;
	senderPolicy: ManagedSenderPolicy | null;
	from: string;
	to: string[];
	cc: string[];
	bcc: string[];
}): Promise<AuthorizedSender | { response: SendResponse }> {
	const { userId, senderPolicy, from } = input;
	const resolved = resolveSender(from);
	if (!resolved.ok) {
		console.log("⚠️ Invalid from address:", resolved.error);
		return { response: sendError(400, `Invalid from address: ${resolved.error}`) };
	}
	const {
		address: fromAddress,
		domain: fromDomain,
		isAgentEmail,
		name: fromName,
		formatted: formattedFrom,
	} = resolved.sender;
	if (senderPolicy && !senderPolicyAllowsAddress(senderPolicy, fromAddress)) {
		return {
			response: sendError(403, "This credential cannot send from that address"),
		};
	}

	console.log("📧 Sender details:", {
		from,
		address: fromAddress,
		domain: fromDomain,
	});

	const allRecipients = [...input.to, ...input.cc, ...input.bcc];
	if (allRecipients.length === 0) {
		return {
			response: sendError(
				400,
				"At least one recipient is required in to, cc, or bcc",
			),
		};
	}

	const to = parseRecipientList(input.to);
	if ("invalid" in to) return invalidRecipient(to.invalid);
	const cc = parseRecipientList(input.cc);
	if ("invalid" in cc) return invalidRecipient(cc.invalid);
	const bcc = parseRecipientList(input.bcc);
	if ("invalid" in bcc) return invalidRecipient(bcc.invalid);
	const recipients = {
		to: to.addresses,
		cc: cc.addresses,
		bcc: bcc.addresses,
	};
	const recipientAddresses = [
		...recipients.to,
		...recipients.cc,
		...recipients.bcc,
	];

	if (isAgentEmail) {
		console.log("✅ Using agent@inbnd.dev - allowed for all users");
	} else {
		console.log("🔍 Running outbound security guard for:", fromDomain);
	}

	const outboundGuard = await enforceOutboundSendGuard({
		userId,
		fromAddress,
		fromDomain,
		isAgentEmail,
		recipients: recipientAddresses,
	});
	if (!outboundGuard.allowed) {
		console.log("🚫 Outbound send blocked:", {
			userId,
			fromAddress,
			fromDomain,
			reasonCode: outboundGuard.reasonCode,
		});
		return {
			response: sendError(
				outboundGuard.statusCode,
				outboundGuard.error || "Email send blocked",
			),
		};
	}

	console.log("🔍 Checking recipients against blocklist");
	const blocklistCheck =
		await checkRecipientsAgainstBlocklist(recipientAddresses);
	if (blocklistCheck.hasBlockedRecipients) {
		console.log(
			`🚫 Blocked recipients found: ${blocklistCheck.blockedAddresses.join(", ")}`,
		);
		return {
			response: sendError(
				400,
				`Cannot send to blocked recipient(s): ${blocklistCheck.blockedAddresses.join(", ")}. These addresses previously bounced.`,
			),
		};
	}

	return {
		fromAddress,
		fromDomain,
		isAgentEmail,
		fromName,
		formattedFrom,
		recipients,
	};
}

export async function checkEmailSendAllowance(
	userId: string,
): Promise<{ unlimited: boolean } | { response: SendResponse }> {
	console.log("🔍 Checking email sending limits with Autumn");
	const { data: emailCheck, error: emailCheckError } = await autumn.check({
		customer_id: userId,
		feature_id: "emails_sent",
	});

	if (emailCheckError) {
		console.error("❌ Autumn email check error:", emailCheckError);
		return { response: sendError(500, "Failed to check email sending limits") };
	}

	if (!emailCheck.allowed) {
		console.log("❌ Email sending limit reached for user:", userId);
		return {
			response: sendError(
				429,
				"Email sending limit reached. Please upgrade your plan to send more emails.",
			),
		};
	}

	return { unlimited: Boolean(emailCheck.unlimited) };
}

/**
 * Whether SES "sending paused" can be the account-wide pause rather than this
 * user's tenant: agent mail is sent outside any tenant, and the outbound
 * guard already stops inactive tenants before SES is called.
 */
async function tenantSendingActive(
	userId: string,
	isAgentEmail: boolean,
): Promise<boolean> {
	if (isAgentEmail) return true;
	try {
		const [tenant] = await db
			.select({ status: sesTenants.status })
			.from(sesTenants)
			.where(eq(sesTenants.userId, userId))
			.limit(1);
		return tenant?.status === "active";
	} catch (error) {
		console.error("❌ Failed to read tenant status after SES pause:", error);
		return true;
	}
}

export type SentEmailContent = Pick<
	typeof sentEmails.$inferInsert,
	| "from"
	| "fromAddress"
	| "fromDomain"
	| "to"
	| "cc"
	| "bcc"
	| "replyTo"
	| "subject"
	| "textBody"
	| "htmlBody"
	| "headers"
	| "attachments"
	| "tags"
>;

/**
 * Records the sent email (honouring the idempotency key), sends the raw MIME
 * through SES with the sender's tenant identity and configuration set, then
 * tracks usage and schedules content evaluation and spike detection.
 */
export async function deliverSentEmail(input: {
	userId: string;
	idempotencyKey: string | null;
	unlimited: boolean;
	sender: AuthorizedSender;
	fromEmailAddress: string;
	destination: { to: string[]; cc: string[]; bcc: string[] };
	record: SentEmailContent;
	buildRawMessage: () => string | Uint8Array;
	evaluation: EmailEvaluationData;
	credential?: SentCopyCredential | null;
}): Promise<SendResponse> {
	const { userId, idempotencyKey, sender } = input;
	if (
		!fromAddressMatchesSender(input.fromEmailAddress, {
			address: sender.fromAddress,
			domain: sender.fromDomain,
			isAgentEmail: sender.isAgentEmail,
		})
	) {
		console.error("🚫 FromEmailAddress does not match the authorized sender", {
			userId,
			fromDomain: sender.fromDomain,
		});
		return sendError(400, "From address does not match the authorized sender");
	}

	let rawMessage: string | Uint8Array;
	try {
		rawMessage = input.buildRawMessage();
	} catch (buildError) {
		console.log("⚠️ Could not build the message:", buildError);
		return sendError(
			400,
			buildError instanceof Error ? buildError.message : "Invalid message",
		);
	}

	const emailId = nanoid();
	rawMessage = ensureMessageIdHeader(
		rawMessage,
		`${emailId}@${sender.fromDomain}`,
	);
	console.log("💾 Creating sent email record:", emailId);

	const inserted = await db
		.insert(sentEmails)
		.values({
			id: emailId,
			...input.record,
			status: SENT_EMAIL_STATUS.PENDING,
			userId,
			idempotencyKey,
			createdAt: new Date(),
			updatedAt: new Date(),
		})
		.onConflictDoNothing(
			idempotencyKey
				? { target: [sentEmails.userId, sentEmails.idempotencyKey] }
				: undefined,
		)
		.returning({ id: sentEmails.id });

	if (inserted.length === 0 && idempotencyKey) {
		const decision = await checkIdempotencyKey(userId, idempotencyKey);
		if (decision.kind === "replay") {
			return replayResponse(decision.email);
		}
		return decision.kind === "in_progress"
			? { status: 409, body: decision.body }
			: sendError(
					409,
					"A request with this Idempotency-Key is still being processed. Retry shortly.",
				);
	}

	if (!sesClient) {
		console.log("❌ AWS SES not configured");

		await db
			.update(sentEmails)
			.set({
				status: SENT_EMAIL_STATUS.FAILED,
				failureReason: "AWS SES not configured",
				updatedAt: new Date(),
			})
			.where(eq(sentEmails.id, emailId));

		return sendError(500, "Email service not configured. Please contact support.");
	}

	try {
		console.log("📤 Sending email via AWS SES");

		let tenantSendingInfo: TenantSendingInfo = {
			identityArn: null,
			configurationSetName: null,
			tenantName: null,
		};
		if (sender.isAgentEmail) {
			tenantSendingInfo = {
				identityArn: getAgentIdentityArn(),
				configurationSetName: null,
				tenantName: null,
			};
		} else {
			const parentDomain = isSubdomain(sender.fromDomain)
				? getRootDomain(sender.fromDomain)
				: undefined;
			tenantSendingInfo = await getTenantSendingInfoForDomainOrParent(
				userId,
				sender.fromDomain,
				parentDomain || undefined,
			);
		}

		if (tenantSendingInfo.identityArn) {
			console.log(
				`🏢 Using SourceArn for tenant tracking: ${tenantSendingInfo.identityArn}`,
			);
		}

		const { to, cc, bcc } = input.destination;

		const rawCommand = new SendEmailCommand({
			FromEmailAddress: input.fromEmailAddress,
			...(tenantSendingInfo.identityArn && {
				FromEmailAddressIdentityArn: tenantSendingInfo.identityArn,
			}),
			Destination: {
				ToAddresses: to,
				CcAddresses: cc.length > 0 ? cc : undefined,
				BccAddresses: bcc.length > 0 ? bcc : undefined,
			},
			Content: {
				Raw: {
					Data:
						typeof rawMessage === "string"
							? Buffer.from(rawMessage)
							: rawMessage,
				},
			},
			...(tenantSendingInfo.configurationSetName && {
				ConfigurationSetName: tenantSendingInfo.configurationSetName,
			}),
			...(tenantSendingInfo.tenantName && {
				TenantName: tenantSendingInfo.tenantName,
			}),
			EmailTags: buildSentEmailTags(emailId),
		});

		const sesResponse = await sesClient.send(rawCommand);
		const messageId = sesResponse.MessageId;

		console.log("✅ Email sent successfully via SES:", messageId);

		await db
			.update(sentEmails)
			.set({
				status: SENT_EMAIL_STATUS.SENT,
				messageId,
				sesMessageId: messageId,
				providerResponse: JSON.stringify(sesResponse),
				sentAt: new Date(),
				updatedAt: new Date(),
			})
			.where(eq(sentEmails.id, emailId));

		waitUntil(
			saveSentCopies({
				userId,
				credential: input.credential,
				fromAddress: sender.fromAddress,
				raw: rawMessage,
				sentEmailId: emailId,
			}),
		);

		if (!input.unlimited) {
			console.log("📊 Tracking email usage with Autumn");
			const { error: trackError } = await autumn.track({
				customer_id: userId,
				feature_id: "emails_sent",
				value: 1,
			});

			if (trackError) {
				console.error("❌ Failed to track email usage:", trackError);
			}
		}

		waitUntil(evaluateSending(emailId, userId, input.evaluation));

		waitUntil(checkSendingSpike(userId));

		console.log("✅ Email processing complete");
		return {
			body: {
				id: emailId,
				message_id: messageId || undefined,
			},
		};
	} catch (sesError) {
		console.error("❌ SES send error:", sesError);

		await db
			.update(sentEmails)
			.set({
				status: SENT_EMAIL_STATUS.FAILED,
				failureReason:
					sesError instanceof Error ? sesError.message : "Unknown SES error",
				providerResponse: JSON.stringify(sesError),
				updatedAt: new Date(),
			})
			.where(eq(sentEmails.id, emailId));

		const failure = sesSendErrorResponse(sesError, {
			tenantSendingActive: isSendingPausedError(sesError)
				? await tenantSendingActive(userId, sender.isAgentEmail)
				: true,
		});
		return sendError(failure.status, failure.error);
	}
}
