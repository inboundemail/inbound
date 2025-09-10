/**
 * QStash webhook endpoint for sending scheduled emails
 * Replaces the cron-based polling system
 */

import { NextRequest, NextResponse } from 'next/server';
import { qstashClient } from '@/lib/qstash/client';
import { emailRateLimiter } from '@/lib/qstash/rate-limiter';
import { db } from '@/lib/db';
import { scheduledEmails, sentEmails, SCHEDULED_EMAIL_STATUS, SENT_EMAIL_STATUS } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { SESClient, SendRawEmailCommand } from '@aws-sdk/client-ses';
import { buildRawEmailMessage } from '../../v2/helper/email-builder';
import { extractEmailAddress } from '@/lib/email-management/agent-email-helper';
import { nanoid } from 'nanoid';

/**
 * Get content type from file extension
 */
function getContentTypeFromExtension(extension: string): string {
  const contentTypeMap: Record<string, string> = {
    // Images
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg', 
    'png': 'image/png',
    'gif': 'image/gif',
    'webp': 'image/webp',
    'svg': 'image/svg+xml',
    
    // Documents
    'pdf': 'application/pdf',
    'doc': 'application/msword',
    'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'xls': 'application/vnd.ms-excel',
    'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'ppt': 'application/vnd.ms-powerpoint',
    'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    
    // Text
    'txt': 'text/plain',
    'html': 'text/html',
    'css': 'text/css',
    'js': 'text/javascript',
    'json': 'application/json',
    'csv': 'text/csv',
    
    // Archives
    'zip': 'application/zip',
    'rar': 'application/x-rar-compressed',
    '7z': 'application/x-7z-compressed',
  };

  return contentTypeMap[extension.toLowerCase()] || 'application/octet-stream';
}

// Initialize SES client
const awsRegion = process.env.AWS_REGION || 'us-east-2';
const awsAccessKeyId = process.env.AWS_ACCESS_KEY_ID;
const awsSecretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

let sesClient: SESClient | null = null;

if (awsAccessKeyId && awsSecretAccessKey) {
  sesClient = new SESClient({
    region: awsRegion,
    credentials: {
      accessKeyId: awsAccessKeyId,
      secretAccessKey: awsSecretAccessKey,
    },
  });
}

interface QStashEmailWebhookPayload {
  scheduledEmailId: string;
  userId: string;
}

export async function POST(request: NextRequest) {
  console.log('🎯 POST /api/qstash/send-scheduled-email - QStash webhook triggered');

  try {
    // Verify QStash signature
    const signature = request.headers.get('Upstash-Signature');
    if (!signature) {
      console.error('❌ Missing QStash signature');
      return NextResponse.json({ error: 'Missing signature' }, { status: 401 });
    }

    const body = await request.text();
    const isValid = await qstashClient.verifySignature({
      signature,
      body,
      url: `${process.env.NEXT_PUBLIC_BETTER_AUTH_URL}/api/qstash/send-scheduled-email`,
    });

    if (!isValid) {
      console.error('❌ Invalid QStash signature');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    // Parse the webhook payload
    const payload: QStashEmailWebhookPayload = JSON.parse(body);
    const { scheduledEmailId, userId } = payload;

    console.log('📧 Processing scheduled email:', { scheduledEmailId, userId });

    // Get the scheduled email from database
    const scheduledEmail = await db
      .select()
      .from(scheduledEmails)
      .where(eq(scheduledEmails.id, scheduledEmailId))
      .limit(1);

    if (scheduledEmail.length === 0) {
      console.error('❌ Scheduled email not found:', scheduledEmailId);
      return NextResponse.json({ error: 'Scheduled email not found' }, { status: 404 });
    }

    const email = scheduledEmail[0];

    // Check if email was already processed or cancelled
    if (email.status !== SCHEDULED_EMAIL_STATUS.SCHEDULED) {
      console.log(`⚠️ Email ${scheduledEmailId} status is ${email.status}, skipping processing`);
      return NextResponse.json({ 
        message: `Email already ${email.status}`,
        scheduledEmailId,
        status: email.status,
      });
    }

    // Check SES configuration
    if (!sesClient) {
      console.error('❌ AWS SES not configured');
      
      await db
        .update(scheduledEmails)
        .set({
          status: SCHEDULED_EMAIL_STATUS.FAILED,
          lastError: 'AWS SES not configured',
          updatedAt: new Date(),
        })
        .where(eq(scheduledEmails.id, scheduledEmailId));

      return NextResponse.json({ error: 'AWS SES not configured' }, { status: 500 });
    }

    // Mark as processing
    await db
      .update(scheduledEmails)
      .set({
        status: SCHEDULED_EMAIL_STATUS.PROCESSING,
        attempts: (email.attempts || 0) + 1,
        updatedAt: new Date(),
      })
      .where(eq(scheduledEmails.id, scheduledEmailId));

    try {
      // Parse email data
      const toAddresses = JSON.parse(email.toAddresses);
      const ccAddresses = email.ccAddresses ? JSON.parse(email.ccAddresses) : [];
      const bccAddresses = email.bccAddresses ? JSON.parse(email.bccAddresses) : [];
      const replyToAddresses = email.replyToAddresses ? JSON.parse(email.replyToAddresses) : [];
      const headers = email.headers ? JSON.parse(email.headers) : {};
      const rawAttachments = email.attachments ? JSON.parse(email.attachments) : [];

      // Validate and fix attachment data to prevent content type errors
      const attachments = rawAttachments.map((attachment: any, index: number) => {
        // Ensure contentType is set - fallback to common defaults
        let contentType = attachment.contentType || attachment.content_type;
        
        if (!contentType && attachment.filename) {
          // Determine content type from file extension
          const ext = attachment.filename.toLowerCase().split('.').pop();
          contentType = getContentTypeFromExtension(ext || '');
          console.log(`🔧 Inferred content type for ${attachment.filename}: ${contentType}`);
        }
        
        if (!contentType) {
          contentType = 'application/octet-stream'; // Safe fallback
          console.log(`⚠️ Using fallback content type for attachment ${index + 1}`);
        }

        // Validate required fields
        if (!attachment.filename) {
          throw new Error(`Attachment ${index + 1}: filename is required`);
        }
        
        if (!attachment.content) {
          throw new Error(`Attachment ${index + 1}: content is required`);
        }

        console.log(`📎 Validated attachment ${index + 1}:`, {
          filename: attachment.filename,
          contentType,
          contentLength: attachment.content?.length || 0,
          size: attachment.size || 0,
          hasContentId: !!attachment.content_id
        });

        return {
          content: attachment.content,
          filename: attachment.filename,
          contentType,
          size: attachment.size || 0,
          content_id: attachment.content_id,
        };
      });

      // Apply rate limiting before sending
      const rateLimitResult = await emailRateLimiter.checkEmailSendingLimits(userId, {
        burst: { limit: 10, window: 60 }, // 10 emails per minute burst
        daily: { limit: 1000 }, // 1000 emails per day
      });

      if (!rateLimitResult.allowed) {
        console.log(`🚫 Rate limit exceeded for user ${userId}:`, rateLimitResult.limitType);
        
        // Record failure and reschedule
        await emailRateLimiter.recordEmailFailure(
          scheduledEmailId,
          `Rate limit exceeded: ${rateLimitResult.limitType}`
        );

        await db
          .update(scheduledEmails)
          .set({
            status: SCHEDULED_EMAIL_STATUS.FAILED,
            lastError: `Rate limit exceeded: ${rateLimitResult.limitType}`,
            updatedAt: new Date(),
          })
          .where(eq(scheduledEmails.id, scheduledEmailId));

        return NextResponse.json(
          { error: 'Rate limit exceeded', limitType: rateLimitResult.limitType },
          { 
            status: 429,
            headers: {
              'Retry-After': (rateLimitResult.details[rateLimitResult.limitType!]?.retryAfter || 60).toString(),
            },
          }
        );
      }

      // Build and send email
      const rawMessage = buildRawEmailMessage({
        from: email.fromAddress,
        to: toAddresses,
        cc: ccAddresses.length > 0 ? ccAddresses : undefined,
        bcc: bccAddresses.length > 0 ? bccAddresses : undefined,
        replyTo: replyToAddresses.length > 0 ? replyToAddresses : undefined,
        subject: email.subject,
        textBody: email.textBody || undefined,
        htmlBody: email.htmlBody || undefined,
        customHeaders: headers,
        attachments: attachments,
        date: new Date(),
      });

      const rawCommand = new SendRawEmailCommand({
        RawMessage: {
          Data: Buffer.from(rawMessage),
        },
        Source: extractEmailAddress(email.fromAddress),
        Destinations: [...toAddresses, ...ccAddresses, ...bccAddresses].map(extractEmailAddress),
      });

      const sesResponse = await sesClient.send(rawCommand);
      const messageId = sesResponse.MessageId;

      console.log('✅ Scheduled email sent successfully via SES:', messageId);

      // Create sent email record
      const sentEmailId = nanoid();
      await db.insert(sentEmails).values({
        id: sentEmailId,
        userId: email.userId,
        from: email.fromAddress,
        fromAddress: extractEmailAddress(email.fromAddress),
        fromDomain: email.fromDomain,
        to: email.toAddresses,
        cc: email.ccAddresses,
        bcc: email.bccAddresses,
        replyTo: email.replyToAddresses,
        subject: email.subject,
        textBody: email.textBody,
        htmlBody: email.htmlBody,
        headers: email.headers,
        attachments: email.attachments,
        status: SENT_EMAIL_STATUS.SENT,
        messageId: messageId,
        provider: 'ses',
        providerResponse: JSON.stringify(sesResponse),
        sentAt: new Date(),
        idempotencyKey: email.idempotencyKey,
      });

      // Update scheduled email status
      await db
        .update(scheduledEmails)
        .set({
          status: SCHEDULED_EMAIL_STATUS.SENT,
          sentAt: new Date(),
          sentEmailId,
          updatedAt: new Date(),
        })
        .where(eq(scheduledEmails.id, scheduledEmailId));

      // Update email stats
      await emailRateLimiter.updateEmailStats(userId, 'sent');

      console.log('📊 Email successfully processed and sent:', {
        scheduledEmailId,
        sentEmailId,
        sesMessageId: messageId,
      });

      return NextResponse.json({
        success: true,
        scheduledEmailId,
        sentEmailId,
        messageId,
      });

    } catch (error) {
      console.error(`❌ Failed to send scheduled email ${scheduledEmailId}:`, error);

      // Record failure
      await emailRateLimiter.recordEmailFailure(
        scheduledEmailId,
        error instanceof Error ? error.message : 'Unknown error'
      );

      // Update database
      await db
        .update(scheduledEmails)
        .set({
          status: SCHEDULED_EMAIL_STATUS.FAILED,
          lastError: error instanceof Error ? error.message : 'Unknown error',
          updatedAt: new Date(),
        })
        .where(eq(scheduledEmails.id, scheduledEmailId));

      // Update email stats
      await emailRateLimiter.updateEmailStats(userId, 'failed');

      return NextResponse.json(
        { 
          error: 'Failed to send email',
          scheduledEmailId,
          details: error instanceof Error ? error.message : 'Unknown error',
        },
        { status: 500 }
      );
    }

  } catch (error) {
    console.error('❌ QStash webhook processing error:', error);
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    );
  }
}
