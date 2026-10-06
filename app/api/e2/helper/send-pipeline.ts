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
	type ManagedSenderPolicy,
	senderPolicyAllowsAddress,
} from "@/app/api/e2/lib/send-auth";
import {
	getAgentIdentityArn,
	getTenantSendingInfoForDomainOrParent,
	type TenantSendingInfo,
} from "@/lib/aws-ses/identity-arn-helper";
import { db } from "@/lib/db";
import { SENT_EMAIL_STATUS, sentEmails } from "@/lib/db/schema";
import { getRootDomain, isSubdomain } from "@/lib/domains-and-dns/domain-utils";
import {
	canUserSendFromEmail,
	extractDomain,
	extractEmailAddress,
} from "@/lib/email-management/agent-email-helper";
import { checkRecipientsAgainstBlocklist } from "@/lib/email-management/email-blocking";
import {
	type EmailEvaluationData,
	evaluateSending,
} from "@/lib/email-management/email-evaluation";
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
	const fromAddress = extractEmailAddress(from);
	const fromDomain = extractDomain(from);
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

	const { isAgentEmail } = canUserSendFromEmail(from);

	if (isAgentEmail) {
		console.log("✅ Using agent@inbnd.dev - allowed for all users");
	} else {
		console.log("🔍 Running outbound security guard for:", fromDomain);
	}

	const allRecipients = [...input.to, ...input.cc, ...input.bcc];
	const outboundGuard = await enforceOutboundSendGuard({
		userId,
		fromAddress,
		fromDomain,
		isAgentEmail,
		recipients: allRecipients,
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

	const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

	if (allRecipients.length === 0) {
		return {
			response: sendError(
				400,
				"At least one recipient is required in to, cc, or bcc",
			),
		};
	}

	for (const email of allRecipients) {
		const address = extractEmailAddress(email);
		if (!emailRegex.test(address)) {
			console.log("⚠️ Invalid email format:", email);
			return { response: sendError(400, `Invalid email format: ${email}`) };
		}
	}

	console.log("🔍 Checking recipients against blocklist");
	const blocklistCheck = await checkRecipientsAgainstBlocklist(allRecipients);
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

	return { fromAddress, fromDomain, isAgentEmail };
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
}): Promise<SendResponse> {
	const { userId, idempotencyKey, sender } = input;
	const emailId = nanoid();
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

		const rawMessage = input.buildRawMessage();
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

		return sendError(500, "Failed to send email. Please try again later.");
	}
}
