import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { receivedEmails, sesEvents } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { parseEmailContent, sanitizeHtml } from '@/lib/email-parser'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth.api.getSession({
      headers: request.headers
    })

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: emailId } = await params

    // Fetch email details with SES event data
    const emailDetails = await db
      .select({
        // Email details
        id: receivedEmails.id,
        messageId: receivedEmails.messageId,
        from: receivedEmails.from,
        to: receivedEmails.to,
        recipient: receivedEmails.recipient,
        subject: receivedEmails.subject,
        receivedAt: receivedEmails.receivedAt,
        processedAt: receivedEmails.processedAt,
        status: receivedEmails.status,
        metadata: receivedEmails.metadata,
        userId: receivedEmails.userId,
        sesEventId: receivedEmails.sesEventId,
        createdAt: receivedEmails.createdAt,
        updatedAt: receivedEmails.updatedAt,
        
        // SES event details
        emailContent: sesEvents.emailContent,
        spamVerdict: sesEvents.spamVerdict,
        virusVerdict: sesEvents.virusVerdict,
        spfVerdict: sesEvents.spfVerdict,
        dkimVerdict: sesEvents.dkimVerdict,
        dmarcVerdict: sesEvents.dmarcVerdict,
        actionType: sesEvents.actionType,
        s3BucketName: sesEvents.s3BucketName,
        s3ObjectKey: sesEvents.s3ObjectKey,
        s3ContentFetched: sesEvents.s3ContentFetched,
        s3ContentSize: sesEvents.s3ContentSize,
        s3Error: sesEvents.s3Error,
        commonHeaders: sesEvents.commonHeaders,
        processingTimeMillis: sesEvents.processingTimeMillis,
        timestamp: sesEvents.timestamp,
        receiptTimestamp: sesEvents.receiptTimestamp,
      })
      .from(receivedEmails)
      .leftJoin(sesEvents, eq(receivedEmails.sesEventId, sesEvents.id))
      .where(
        and(
          eq(receivedEmails.id, emailId),
          eq(receivedEmails.userId, session.user.id)
        )
      )
      .limit(1)

    if (emailDetails.length === 0) {
      return NextResponse.json({ error: 'Email not found' }, { status: 404 })
    }

    const email = emailDetails[0]

    // Parse common headers if available
    let parsedHeaders = null
    if (email.commonHeaders) {
      try {
        parsedHeaders = JSON.parse(email.commonHeaders)
      } catch (e) {
        console.error('Failed to parse common headers:', e)
      }
    }

    // Parse metadata if available
    let parsedMetadata = null
    if (email.metadata) {
      try {
        parsedMetadata = JSON.parse(email.metadata)
      } catch (e) {
        console.error('Failed to parse metadata:', e)
      }
    }

    // Parse email content
    const parsedEmail = await parseEmailContent(email.emailContent || '')

    // Format the response
    const response = {
      id: email.id,
      messageId: email.messageId,
      from: email.from,
      to: email.to,
      recipient: email.recipient,
      subject: email.subject,
      receivedAt: email.receivedAt,
      processedAt: email.processedAt,
      status: email.status,
      emailContent: {
        htmlBody: parsedEmail.htmlBody ? sanitizeHtml(parsedEmail.htmlBody) : null,
        textBody: parsedEmail.textBody,
        attachments: parsedEmail.attachments,
        headers: parsedEmail.headers,
        rawContent: email.emailContent, // Include raw content for debugging
      },
      authResults: {
        spf: email.spfVerdict || 'UNKNOWN',
        dkim: email.dkimVerdict || 'UNKNOWN',
        dmarc: email.dmarcVerdict || 'UNKNOWN',
        spam: email.spamVerdict || 'UNKNOWN',
        virus: email.virusVerdict || 'UNKNOWN',
      },
      metadata: {
        processingTime: email.processingTimeMillis,
        timestamp: email.timestamp,
        receiptTimestamp: email.receiptTimestamp,
        actionType: email.actionType,
        s3Info: {
          bucketName: email.s3BucketName,
          objectKey: email.s3ObjectKey,
          contentFetched: email.s3ContentFetched,
          contentSize: email.s3ContentSize,
          error: email.s3Error,
        },
        commonHeaders: parsedHeaders,
        emailMetadata: parsedMetadata,
      },
      createdAt: email.createdAt,
      updatedAt: email.updatedAt,
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('Error fetching email details:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
} 