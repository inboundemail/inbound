import { createHash } from "node:crypto"
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3"
import { eq, and } from "drizzle-orm"
import { Elysia, t } from "elysia"
import { simpleParser, type Attachment } from "mailparser"
import { validateAndRateLimit } from "@/app/api/e2/lib/auth"
import { db } from "@/lib/db"
import { structuredEmails, sesEvents } from "@/lib/db/schema"

// Error Response schema for OpenAPI
const ErrorResponse = t.Object({
  error: t.String(),
  details: t.Optional(t.String()),
})

async function readAttachments(emailId: string, userId: string): Promise<
  { attachments: Attachment[] } | { error: string }
> {
    // Get the structured email to verify ownership and find SES event
    console.log(`🔎 Attachment download - Querying for structured email with: emailId=${emailId}, userId=${userId}`)
    const structuredEmail = await db
      .select({
        sesEventId: structuredEmails.sesEventId,
        userId: structuredEmails.userId,
      })
      .from(structuredEmails)
      .where(and(eq(structuredEmails.id, emailId), eq(structuredEmails.userId, userId)))
      .limit(1)

    if (!structuredEmail.length) {
      console.error(`❌ Attachment download - Structured email not found: emailId=${emailId}, userId=${userId}`)
      return { error: "Email not found or access denied" }
    }

    console.log(`✅ Attachment download - Found structured email: ${emailId}`)

    const sesEventId = structuredEmail[0].sesEventId
    if (!sesEventId) {
      console.error(`❌ Attachment download - No SES event ID for email: ${emailId}`)
      return { error: "Email event information not found" }
    }

    // Get the SES event to find email content
    const sesEvent = await db
      .select({
        s3BucketName: sesEvents.s3BucketName,
        s3ObjectKey: sesEvents.s3ObjectKey,
        emailContent: sesEvents.emailContent,
      })
      .from(sesEvents)
      .where(eq(sesEvents.id, sesEventId))
      .limit(1)

    if (!sesEvent.length) {
      return { error: "Email content not found" }
    }

    console.log(`✅ Attachment download - Found SES event: ${sesEventId}`)

    const { s3BucketName, s3ObjectKey, emailContent } = sesEvent[0]

    console.log(`📦 Attachment download - SES event data: s3Bucket=${s3BucketName}, s3Key=${s3ObjectKey ? "yes" : "no"}, hasEmailContent=${!!emailContent}`)

    // Parse email to extract attachments
    let rawEmailContent: string | null = null

    // Try S3 first, then fallback to direct email content
    if (s3BucketName && s3ObjectKey) {
      try {
        console.log(`📦 Attachment download - Fetching email from S3: ${s3BucketName}/${s3ObjectKey}`)

        const s3Client = new S3Client({
          region: process.env.AWS_REGION || "us-east-1",
        })

        const command = new GetObjectCommand({
          Bucket: s3BucketName,
          Key: s3ObjectKey,
        })

        const response = await s3Client.send(command)

        if (response.Body) {
          // Convert stream to string
          const chunks: Uint8Array[] = []
          const reader = response.Body.transformToWebStream().getReader()

          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            chunks.push(value)
          }

          const buffer = Buffer.concat(chunks)
          rawEmailContent = buffer.toString("utf-8")
          console.log(`✅ Attachment download - S3 fetch successful. Content size: ${rawEmailContent.length} bytes.`)
        } else {
          throw new Error("No email content in S3")
        }
      } catch (s3Error) {
        console.error(`Failed to fetch from S3:`, s3Error)
        // Fallback to direct content
        rawEmailContent = emailContent
        console.log(`🔄 Attachment download - S3 fetch failed, falling back to direct content (${rawEmailContent?.length || 0} bytes)`)
      }
    } else {
      rawEmailContent = emailContent
      console.log(`📄 Attachment download - No S3 info, using direct email content (${rawEmailContent?.length || 0} bytes)`)
    }

    if (!rawEmailContent) {
      console.error(`❌ Attachment download - No email content available: s3BucketName=${s3BucketName}, s3ObjectKey=${s3ObjectKey}, emailContent=${emailContent ? "present" : "null"}`)
      return { error: "Email content not available" }
    }

    console.log(`✅ Attachment download - Email content ready (${rawEmailContent.length} bytes)`)

    // Parse the email to find the attachment
    const parsed = await simpleParser(rawEmailContent)
    return { attachments: parsed.attachments }
}

function attachmentId(attachment: Attachment, index: number): string {
  const digest = createHash("sha256")
    .update(JSON.stringify([index, attachment.filename ?? null, attachment.contentType,
      attachment.contentId ?? null, attachment.contentDisposition]))
    .update("\0")
    .update(attachment.content)
    .digest("hex")
  return `part_v1_${index}_${digest}`
}

function attachmentResponse(attachment: Attachment): Response {
  const filename = attachment.filename || "download"
  const asciiFilename = filename.replace(/[^\x20-\x7e]|["\\]/g, "_")
  return new Response(new Uint8Array(attachment.content), {
    status: 200,
    headers: {
      "Content-Type": attachment.contentType || "application/octet-stream",
      "Content-Disposition": `attachment; filename="${asciiFilename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Content-Length": String(attachment.content.length),
      "Cache-Control": "private, max-age=3600",
    },
  })
}

export const getAttachment = new Elysia().get(
  "/attachments/:id/:filename",
  async ({ request, params, set }) => {
    const userId = await validateAndRateLimit(request, set)
    const { id: emailId, filename: attachmentFilename } = params
    if (!emailId || !attachmentFilename) {
      set.status = 400
      return { error: "Email ID and attachment filename are required" }
    }
    const parsed = await readAttachments(emailId, userId)
    if ("error" in parsed) {
      set.status = 404
      return parsed
    }

    if (!parsed.attachments || parsed.attachments.length === 0) {
      console.warn(`⚠️ Attachment download - No attachments found in email ${emailId}`)
      set.status = 404
      return { error: "No attachments found in this email" }
    }

    const decodedFilename = decodeURIComponent(attachmentFilename)
    console.log(`🔍 Attachment download - Looking for: "${decodedFilename}"`)
    console.log(`📋 Attachment download - Available attachments (${parsed.attachments.length}): ${parsed.attachments.map((a) => a.filename).join(", ")}`)

    // Find the specific attachment by filename
    const attachment = parsed.attachments.find((att) => att.filename === decodedFilename)

    if (!attachment) {
      console.error(`❌ Attachment download - Attachment not found`)
      console.error(`   Looking for: "${decodedFilename}"`)
      console.error(`   Available: ${parsed.attachments.map((a) => `"${a.filename}"`).join(", ")}`)
      set.status = 404
      return { error: "Attachment not found" }
    }

    console.log(`✅ Attachment download - Found: ${attachment.filename} (${attachment.size} bytes)`)

    return attachmentResponse(attachment)
  },
  {
    params: t.Object({
      id: t.String(),
      filename: t.String(),
    }),
    response: {
      // Note: 200 response is binary data (handled via Response object)
      // Only error responses are JSON
      400: ErrorResponse,
      401: ErrorResponse,
      404: ErrorResponse,
      500: ErrorResponse,
    },
    detail: {
      tags: ["Attachments"],
      summary: "Download email attachment",
      description:
        "Download an email attachment by email ID and filename. Returns the binary file content with appropriate Content-Type and Content-Disposition headers.",
    },
  }
).get(
  "/attachments/:id",
  async ({ request, params, query, set }) => {
    const userId = await validateAndRateLimit(request, set)
    const parsed = await readAttachments(params.id, userId)
    if ("error" in parsed) {
      set.status = 404
      return parsed
    }
    const limit = query.limit ?? 50
    const offset = query.offset ?? 0
    return {
      data: parsed.attachments.slice(offset, offset + limit).map((attachment, index) => ({
        id: attachmentId(attachment, offset + index),
        filename: attachment.filename ?? null,
        content_type: attachment.contentType,
        size: attachment.content.length,
        content_id: attachment.contentId ?? null,
        inline: attachment.related || attachment.contentDisposition === "inline",
      })),
      pagination: { limit, offset, total: parsed.attachments.length, hasMore: offset + limit < parsed.attachments.length },
    }
  },
  {
    params: t.Object({ id: t.String() }),
    query: t.Object({
      limit: t.Optional(t.Integer({ minimum: 1, maximum: 100, default: 50 })),
      offset: t.Optional(t.Integer({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER - 100, default: 0 })),
    }),
    response: {
      200: t.Object({
        data: t.Array(t.Object({
          id: t.String({ description: "Message-scoped MIME part handle bound to its position, metadata and SHA-256 content digest" }),
          filename: t.Nullable(t.String()),
          content_type: t.String(),
          size: t.Integer({ minimum: 0 }),
          content_id: t.Nullable(t.String()),
          inline: t.Boolean(),
        })),
        pagination: t.Object({ limit: t.Integer(), offset: t.Integer(), total: t.Integer(), hasMore: t.Boolean() }),
      }),
      400: ErrorResponse,
      401: ErrorResponse,
      404: ErrorResponse,
      500: ErrorResponse,
    },
    detail: {
      tags: ["Attachments"],
      summary: "List received email attachments",
      description: "Enumerate attachments from the stored MIME message, including unnamed parts and duplicate filenames. Use each stable id with /attachments/{id}/parts/{attachmentId}. Does not mark the email as read.",
    },
  },
).get(
  "/attachments/:id/parts/:attachmentId",
  async ({ request, params, set }) => {
    const userId = await validateAndRateLimit(request, set)
    const parsed = await readAttachments(params.id, userId)
    if ("error" in parsed) {
      set.status = 404
      return parsed
    }
    const index = Number(params.attachmentId.split("_")[2])
    const attachment = Number.isSafeInteger(index) ? parsed.attachments[index] : undefined
    if (!attachment || attachmentId(attachment, index) !== params.attachmentId) {
      set.status = 404
      return { error: "Attachment not found" }
    }
    return attachmentResponse(attachment)
  },
  {
    params: t.Object({
      id: t.String(),
      attachmentId: t.String({ pattern: "^part_v1_(0|[1-9][0-9]*)_[a-f0-9]{64}$", maxLength: 96 }),
    }),
    response: {
      400: ErrorResponse,
      401: ErrorResponse,
      404: ErrorResponse,
      500: ErrorResponse,
    },
    detail: {
      tags: ["Attachments"],
      summary: "Download received email attachment by part ID",
      description: "Download the exact MIME attachment returned by the attachment listing, without relying on a filename. A stale or mismatched part handle returns 404.",
    },
  },
)
