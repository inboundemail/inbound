import { Elysia, t } from "elysia";
import { checkNewAccountWarmupLimits } from "@/app/api/e2/emails/send";
import {
	attachmentsToStorageFormat,
	MAX_TOTAL_EMAIL_SIZE,
	type ProcessedAttachment,
	processAttachments,
} from "@/app/api/e2/helper/attachment-processor";
import {
	type PreparedRawMessage,
	prepareRawRelayMessage,
	RawMessageError,
} from "@/app/api/e2/helper/raw-message";
import {
	authorizeOutboundSend,
	checkEmailSendAllowance,
	deliverSentEmail,
	resolveSendIdempotency,
} from "@/app/api/e2/helper/send-pipeline";
import { enforceMailboxGatewayAuthorization } from "@/app/api/e2/lib/auth";
import { authenticateEmailSend } from "@/app/api/e2/lib/send-auth";

const MAX_RAW_BASE64_LENGTH = Math.ceil(MAX_TOTAL_EMAIL_SIZE / 3) * 4;
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

const SendRawEmailBodySchema = t.Object({
	raw: t.String({
		minLength: 1,
		maxLength: MAX_RAW_BASE64_LENGTH,
		description: "Base64-encoded RFC 5322 message",
	}),
	recipients: t.Array(t.String({ minLength: 3, maxLength: 320 }), {
		minItems: 1,
		maxItems: 50,
		description: "Envelope recipients; the only addresses the message is delivered to",
	}),
});

const SendRawEmailSuccessResponse = t.Object({
	id: t.String(),
	message_id: t.Optional(t.String()),
});

const ErrorResponse = t.Object({
	error: t.String(),
});

export const sendRawEmail = new Elysia().post(
	"/emails/raw",
	async ({ request, body, set }) => {
		enforceMailboxGatewayAuthorization(request, set);
		const { userId, senderPolicy, credential } = await authenticateEmailSend(
			request,
			set,
		);
		if (!credential) {
			set.status = 403;
			return { error: "Raw relay requires a managed SMTP credential" };
		}

		const warmupCheck = await checkNewAccountWarmupLimits(userId);
		if (!warmupCheck.allowed) {
			set.status = 429;
			return { error: warmupCheck.error || "Warmup limit exceeded" };
		}

		const idempotency = await resolveSendIdempotency(request.headers, userId);
		if ("response" in idempotency) {
			if (idempotency.response.status) set.status = idempotency.response.status;
			return idempotency.response.body;
		}
		const idempotencyKey = idempotency.key;

		if (!BASE64.test(body.raw)) {
			set.status = 400;
			return { error: "raw must be standard base64" };
		}
		const raw = Buffer.from(body.raw, "base64");
		if (raw.byteLength > MAX_TOTAL_EMAIL_SIZE) {
			set.status = 413;
			return { error: "Message exceeds the 40MB size limit" };
		}

		let message: PreparedRawMessage;
		try {
			message = await prepareRawRelayMessage(raw, body.recipients);
		} catch (error) {
			if (!(error instanceof RawMessageError)) throw error;
			set.status = 400;
			return { error: error.message };
		}

		const sender = await authorizeOutboundSend({
			userId,
			senderPolicy,
			from: message.fromAddress,
			to: message.to,
			cc: message.cc,
			bcc: message.bcc,
		});
		if ("response" in sender) {
			if (sender.response.status) set.status = sender.response.status;
			return sender.response.body;
		}

		let processedAttachments: ProcessedAttachment[] = [];
		if (message.attachments.length > 0) {
			try {
				processedAttachments = await processAttachments(message.attachments);
			} catch (attachmentError) {
				set.status = 400;
				return {
					error:
						attachmentError instanceof Error
							? attachmentError.message
							: "Failed to process attachments",
				};
			}
		}

		const allowance = await checkEmailSendAllowance(userId);
		if ("response" in allowance) {
			if (allowance.response.status) set.status = allowance.response.status;
			return allowance.response.body;
		}

		const delivery = await deliverSentEmail({
			userId,
			idempotencyKey,
			unlimited: allowance.unlimited,
			sender,
			fromEmailAddress: message.fromAddress,
			destination: { to: message.to, cc: message.cc, bcc: message.bcc },
			record: {
				from: message.from,
				fromAddress: sender.fromAddress,
				fromDomain: sender.fromDomain,
				to: JSON.stringify(message.to),
				cc: message.cc.length > 0 ? JSON.stringify(message.cc) : null,
				bcc: message.bcc.length > 0 ? JSON.stringify(message.bcc) : null,
				replyTo:
					message.replyTo.length > 0 ? JSON.stringify(message.replyTo) : null,
				subject: message.subject,
				textBody: message.text,
				htmlBody: message.html,
				headers:
					Object.keys(message.headers).length > 0
						? JSON.stringify(message.headers)
						: null,
				attachments:
					processedAttachments.length > 0
						? JSON.stringify(attachmentsToStorageFormat(processedAttachments))
						: null,
				tags: null,
			},
			buildRawMessage: () => message.raw,
			evaluation: {
				from: message.from,
				to: [...message.to, ...message.cc, ...message.bcc],
				subject: message.subject,
				textBody: message.text,
				htmlBody: message.html,
			},
		});
		if (delivery.status) set.status = delivery.status;
		return delivery.body;
	},
	{
		body: SendRawEmailBodySchema,
		response: {
			200: SendRawEmailSuccessResponse,
			400: ErrorResponse,
			401: ErrorResponse,
			403: ErrorResponse,
			409: ErrorResponse,
			413: ErrorResponse,
			429: ErrorResponse,
			500: ErrorResponse,
		},
		detail: {
			hide: true,
			tags: ["Emails"],
			summary: "Relay a raw S/MIME-signed message (SMTP gateway)",
		},
	},
);
