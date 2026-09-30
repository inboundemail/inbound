import { Elysia, t } from "elysia"
import { validateAndRateLimit } from "../lib/auth"
import { db } from "@/lib/db"
import { structuredEmails, sesEvents } from "@/lib/db/schema"
import { eq, and } from "drizzle-orm"
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3"
import { simpleParser } from "mailparser"
import { resolveStructuredEmailId } from "@/lib/email-management/email-aliases"

// Error Response schema for OpenAPI
const ErrorResponse = t.Object({
  error: t.String(),
  details: t.Optional(t.String()),
})

export const getAttachment = new Elysia().get(
  "/attachments/:id/:filename",
  async ({ request, params, set }) => {
    console.log("📥 GET /api/e2/attachments/:id/:filename - Request started")
    console.log(`   Email ID: ${params.id}`)
    console.log(`   Filename (raw): ${params.filename}`)
    console.log(`   Filename (decoded): ${decodeURIComponent(params.filename)}`)

    // Auth & rate limit validation - throws on error
    const userId = await validateAndRateLimit(request, set)
    console.log(`🔐 Attachment download - Authenticated userId: ${userId}`)

    const { filename: attachmentFilename } = params
    const emailId = await resolveStructuredEmailId(params.id, userId)

    if (!emailId || !attachmentFilename) {
      set.status = 400
      return { error: "Email ID and attachment filename are required" }
    }

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
      set.status = 404
      return { error: "Email not found or access denied" }
    }

    console.log(`✅ Attachment download - Found structured email: ${emailId}`)

    const sesEventId = structuredEmail[0].sesEventId
    if (!sesEventId) {
      console.error(`❌ Attachment download - No SES event ID for email: ${emailId}`)
      set.status = 404
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
      set.status = 404
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
      set.status = 404
      return { error: "Email content not available" }
    }

    console.log(`✅ Attachment download - Email content ready (${rawEmailContent.length} bytes)`)

    // Parse the email to find the attachment
    const parsed = await simpleParser(rawEmailContent)

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

    // Encode filename for Content-Disposition header (RFC 5987)
    // This handles non-ASCII characters properly
    const safeFilename = attachment.filename || "download"
    const asciiFilename = safeFilename.replace(/[^\x00-\x7F]/g, "_") // ASCII fallback
    const encodedFilename = encodeURIComponent(safeFilename) // UTF-8 encoded

    // Use both filename (ASCII fallback) and filename* (UTF-8 encoded) per RFC 5987
    const contentDisposition = `attachment; filename="${asciiFilename}"; filename*=UTF-8''${encodedFilename}`

    // Return the attachment as a Response with binary data
    return new Response(new Uint8Array(attachment.content), {
      status: 200,
      headers: {
        "Content-Type": attachment.contentType || "application/octet-stream",
        "Content-Disposition": contentDisposition,
        "Content-Length": attachment.size?.toString() || "0",
        "Cache-Control": "private, max-age=3600",
      },
    })
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
)

