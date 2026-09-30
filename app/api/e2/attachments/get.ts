import { Elysia, t } from "elysia"
import { validateAndRateLimit } from "../lib/auth"
import type { Attachment } from "mailparser"
import { attachmentDownloadUrl } from "@/lib/email-management/attachment-url"
import { loadStoredAttachments as loadAttachments } from "@/lib/email-management/stored-attachments"

// Error Response schema for OpenAPI
const ErrorResponse = t.Object({
  error: t.String(),
  details: t.Optional(t.String()),
})

function attachmentResponse(attachment: Attachment, fallbackName: string): Response {
  // RFC 5987: ASCII fallback plus UTF-8 encoded filename
  const filename = attachment.filename || fallbackName
  const asciiFilename = filename.replace(/[^\x20-\x7E]|["\\]/g, "_")
  const contentDisposition = `attachment; filename="${asciiFilename}"; filename*=UTF-8''${encodeURIComponent(filename)}`

  return new Response(new Uint8Array(attachment.content), {
    status: 200,
    headers: {
      "Content-Type": attachment.contentType || "application/octet-stream",
      "Content-Disposition": contentDisposition,
      "Content-Length": attachment.content.length.toString(),
      "Cache-Control": "private, max-age=3600",
    },
  })
}

const AttachmentPartSchema = t.Object({
  index: t.Number({ description: "Position of the attachment in the email, starting at 0" }),
  filename: t.Union([t.String(), t.Null()], {
    description: "Filename from the email; null when the sender didn't provide one",
  }),
  contentType: t.String(),
  size: t.Number(),
  contentId: t.Union([t.String(), t.Null()]),
  inline: t.Boolean({ description: "True for inline parts such as embedded images" }),
  downloadUrl: t.String(),
})

export const listAttachments = new Elysia().get(
  "/attachments/:id",
  async ({ request, params, set }) => {
    const userId = await validateAndRateLimit(request, set)
    const loaded = await loadAttachments(params.id, userId)
    if (!loaded.ok) {
      set.status = loaded.status
      return { error: loaded.error }
    }

    return {
      emailId: loaded.emailId,
      attachments: loaded.attachments.map((attachment, index) => ({
        index,
        filename: attachment.filename || null,
        contentType: attachment.contentType || "application/octet-stream",
        size: attachment.content.length,
        contentId: attachment.contentId || null,
        inline: attachment.contentDisposition === "inline" || attachment.related === true,
        downloadUrl: attachmentDownloadUrl(loaded.emailId, index),
      })),
    }
  },
  {
    params: t.Object({ id: t.String() }),
    response: {
      200: t.Object({ emailId: t.String(), attachments: t.Array(AttachmentPartSchema) }),
      401: ErrorResponse,
      404: ErrorResponse,
    },
    detail: {
      tags: ["Attachments"],
      summary: "List email attachments",
      description:
        "List every attachment in a received email, including ones without a filename, with a download URL for each.",
    },
  }
)

export const getAttachmentPart = new Elysia().get(
  "/attachments/:id/parts/:index",
  async ({ request, params, set }) => {
    const userId = await validateAndRateLimit(request, set)
    const index = Number(params.index)
    if (!/^\d+$/.test(params.index) || !Number.isSafeInteger(index)) {
      set.status = 400
      return { error: "Attachment index must be a non-negative integer" }
    }

    const loaded = await loadAttachments(params.id, userId)
    if (!loaded.ok) {
      set.status = loaded.status
      return { error: loaded.error }
    }

    const attachment = loaded.attachments[index]
    if (!attachment) {
      set.status = 404
      return { error: "Attachment not found" }
    }
    return attachmentResponse(attachment, `attachment-${index + 1}`)
  },
  {
    params: t.Object({ id: t.String(), index: t.String() }),
    response: {
      // 200 is the binary file (returned as a Response)
      400: ErrorResponse,
      401: ErrorResponse,
      404: ErrorResponse,
    },
    detail: {
      tags: ["Attachments"],
      summary: "Download attachment by position",
      description:
        "Download an attachment by its position in the email (the `index` from List email attachments; webhook `downloadUrl`s use this form). Works for attachments without a filename and for several attachments sharing one name.",
    },
  }
)

export const getAttachment = new Elysia().get(
  "/attachments/:id/:filename",
  async ({ request, params, set }) => {
    const userId = await validateAndRateLimit(request, set)
    const loaded = await loadAttachments(params.id, userId)
    if (!loaded.ok) {
      set.status = loaded.status
      return { error: loaded.error }
    }

    // Filenames aren't unique; this returns the first match. Prefer /parts/:index.
    const filename = decodeURIComponent(params.filename)
    const attachment = loaded.attachments.find((att) => att.filename === filename)
    if (!attachment) {
      set.status = 404
      return { error: "Attachment not found" }
    }
    return attachmentResponse(attachment, "download")
  },
  {
    params: t.Object({
      id: t.String(),
      filename: t.String(),
    }),
    response: {
      // 200 is the binary file (returned as a Response)
      400: ErrorResponse,
      401: ErrorResponse,
      404: ErrorResponse,
      500: ErrorResponse,
    },
    detail: {
      tags: ["Attachments"],
      summary: "Download email attachment",
      description:
        "Download an attachment by filename. If several attachments share the name, the first is returned; use Download attachment by position to get a specific one.",
    },
  }
)
