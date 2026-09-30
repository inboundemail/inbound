import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3"
import { and, eq } from "drizzle-orm"
import { type Attachment, simpleParser } from "mailparser"
import { db } from "@/lib/db"
import { sesEvents, structuredEmails } from "@/lib/db/schema"
import { resolveStructuredEmailId } from "@/lib/email-management/email-aliases"

export type StoredAttachments =
  | { ok: true; emailId: string; attachments: Attachment[] }
  | { ok: false; status: number; error: string }

/**
 * Loads and parses the stored raw message for an email the user owns (old
 * email IDs from merged duplicates resolve too). Attachments come back in the
 * same order ingestion stored them, so array positions match `index`.
 */
export async function loadStoredAttachments(rawEmailId: string, userId: string): Promise<StoredAttachments> {
  const emailId = await resolveStructuredEmailId(rawEmailId, userId)
  if (!emailId) return { ok: false, status: 404, error: "Email not found or access denied" }

  const [structuredEmail] = await db
    .select({ sesEventId: structuredEmails.sesEventId })
    .from(structuredEmails)
    .where(and(eq(structuredEmails.id, emailId), eq(structuredEmails.userId, userId)))
    .limit(1)
  if (!structuredEmail) return { ok: false, status: 404, error: "Email not found or access denied" }
  if (!structuredEmail.sesEventId) {
    return { ok: false, status: 404, error: "Email event information not found" }
  }

  const [sesEvent] = await db
    .select({
      s3BucketName: sesEvents.s3BucketName,
      s3ObjectKey: sesEvents.s3ObjectKey,
      emailContent: sesEvents.emailContent,
    })
    .from(sesEvents)
    .where(eq(sesEvents.id, structuredEmail.sesEventId))
    .limit(1)
  if (!sesEvent) return { ok: false, status: 404, error: "Email content not found" }

  // Try S3 first, then fall back to the content stored with the SES event
  let rawEmailContent: string | null = sesEvent.emailContent
  if (sesEvent.s3BucketName && sesEvent.s3ObjectKey) {
    try {
      const s3Client = new S3Client({ region: process.env.AWS_REGION || "us-east-1" })
      const response = await s3Client.send(
        new GetObjectCommand({ Bucket: sesEvent.s3BucketName, Key: sesEvent.s3ObjectKey })
      )
      if (!response.Body) throw new Error("No email content in S3")
      rawEmailContent = Buffer.from(await response.Body.transformToByteArray()).toString("utf-8")
    } catch (s3Error) {
      console.error(`Attachment download - S3 fetch failed for ${emailId}, using stored content:`, s3Error)
    }
  }
  if (!rawEmailContent) return { ok: false, status: 404, error: "Email content not available" }

  const parsed = await simpleParser(rawEmailContent)
  return { ok: true, emailId, attachments: parsed.attachments ?? [] }
}

