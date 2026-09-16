import { Elysia, t } from "elysia";
import {
	createOutboundAttachmentUpload,
	MAX_OUTBOUND_ATTACHMENT_SIZE,
} from "@/app/api/e2/helper/outbound-attachment-storage";
import { validateAndRateLimit } from "@/app/api/e2/lib/auth";

const ErrorResponse = t.Object({ error: t.String() });

export const createAttachmentUpload = new Elysia().post(
	"/attachments/uploads",
	async ({ request, body, set }) => {
		const userId = await validateAndRateLimit(request, set);
		try {
			const upload = await createOutboundAttachmentUpload({
				userId,
				filename: body.filename,
				contentType: body.content_type,
				size: body.size,
			});
			set.status = 201;
			return {
				attachment_id: upload.attachmentId,
				upload_url: upload.uploadUrl,
				method: "PUT" as const,
				headers: upload.headers,
				upload_expires_at: upload.uploadExpiresAt.toISOString(),
				attachment_expires_at: upload.expiresAt.toISOString(),
			};
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Failed to create upload";
			set.status =
				message === "Attachment storage is not configured" ? 500 : 400;
			return { error: message };
		}
	},
	{
		body: t.Object({
			filename: t.String({ minLength: 1, maxLength: 255 }),
			content_type: t.String({ minLength: 1, maxLength: 255 }),
			size: t.Integer({ minimum: 1, maximum: MAX_OUTBOUND_ATTACHMENT_SIZE }),
		}),
		response: {
			201: t.Object({
				attachment_id: t.String(),
				upload_url: t.String({ format: "uri" }),
				method: t.Literal("PUT"),
				headers: t.Record(t.String(), t.String()),
				upload_expires_at: t.String({ format: "date-time" }),
				attachment_expires_at: t.String({ format: "date-time" }),
			}),
			400: ErrorResponse,
			401: ErrorResponse,
			403: ErrorResponse,
			429: ErrorResponse,
			500: ErrorResponse,
		},
		detail: {
			tags: ["Attachments"],
			summary: "Create an attachment upload",
			description:
				"Create a short-lived presigned PUT URL for an outbound attachment. Send the exact returned headers with the upload, then pass attachment_id when sending or replying to an email.",
		},
	},
);
