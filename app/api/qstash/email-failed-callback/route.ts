/**
 * QStash failure callback endpoint for failed email sending
 * Handles failure callbacks from QStash when email processing fails
 */

import { NextRequest, NextResponse } from 'next/server';
import { qstashClient } from '@/lib/qstash/client';
import { emailRateLimiter } from '@/lib/qstash/rate-limiter';
import { db } from '@/lib/db';
import { scheduledEmails, SCHEDULED_EMAIL_STATUS } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

interface QStashFailureCallbackPayload {
  status: number;
  header: Record<string, string[]>;
  body: string; // base64 encoded response body
  retried: number;
  maxRetries: number;
  dlqId?: string; // Dead Letter Queue ID if message ends up there
  sourceMessageId: string;
  topicName?: string;
  endpointName?: string;
  url: string;
  method: string;
  sourceHeader: Record<string, string>;
  sourceBody: string; // base64 encoded original body
  notBefore?: string;
  createdAt: string;
  scheduleId?: string;
  callerIP?: string;
}

export async function POST(request: NextRequest) {
  console.log('❌ POST /api/qstash/email-failed-callback - QStash failure callback');

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
      url: `${process.env.NEXT_PUBLIC_BETTER_AUTH_URL}/api/qstash/email-failed-callback`,
    });

    if (!isValid) {
      console.error('❌ Invalid QStash signature');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    // Parse failure callback payload
    const payload: QStashFailureCallbackPayload = JSON.parse(body);
    
    console.log('📊 Email failure callback received:', {
      sourceMessageId: payload.sourceMessageId,
      status: payload.status,
      retried: payload.retried,
      maxRetries: payload.maxRetries,
      dlqId: payload.dlqId,
      url: payload.url,
    });

    // Decode the original request body to get scheduledEmailId
    let originalPayload;
    try {
      const decodedBody = Buffer.from(payload.sourceBody, 'base64').toString('utf-8');
      originalPayload = JSON.parse(decodedBody);
    } catch (error) {
      console.error('❌ Failed to decode original request body:', error);
      return NextResponse.json({ error: 'Invalid callback payload' }, { status: 400 });
    }

    const { scheduledEmailId, userId } = originalPayload;

    // Decode the error response for better debugging
    let errorDetails = 'Unknown error';
    try {
      const decodedResponse = Buffer.from(payload.body, 'base64').toString('utf-8');
      const errorResponse = JSON.parse(decodedResponse);
      errorDetails = errorResponse.error || errorResponse.message || decodedResponse;
    } catch (error) {
      // If we can't parse as JSON, use the raw decoded response
      try {
        errorDetails = Buffer.from(payload.body, 'base64').toString('utf-8');
      } catch {
        errorDetails = `HTTP ${payload.status} error`;
      }
    }

    console.error(`❌ Email ${scheduledEmailId} failed after ${payload.retried} retries:`, {
      status: payload.status,
      error: errorDetails,
      dlqId: payload.dlqId,
    });

    // Record failure in Redis for analytics
    await emailRateLimiter.recordEmailFailure(scheduledEmailId, errorDetails);
    await emailRateLimiter.updateEmailStats(userId, 'failed');

    // Update database with failure details
    await db
      .update(scheduledEmails)
      .set({
        status: SCHEDULED_EMAIL_STATUS.FAILED,
        lastError: `${errorDetails} (HTTP ${payload.status}, retried ${payload.retried}/${payload.maxRetries} times)`,
        qstashDlqId: payload.dlqId || null,
        updatedAt: new Date(),
      })
      .where(eq(scheduledEmails.id, scheduledEmailId));

    // Check if this is a retriable error that we might want to reschedule
    const isRetriableError = payload.status >= 500 || payload.status === 429; // Server errors or rate limits
    const shouldReschedule = isRetriableError && payload.retried < 3; // Custom retry logic

    if (shouldReschedule) {
      console.log(`🔄 Considering rescheduling email ${scheduledEmailId} due to retriable error`);
      
      // Calculate exponential backoff delay (5 minutes * 2^retries)
      const backoffMinutes = 5 * Math.pow(2, payload.retried);
      const rescheduleAt = new Date(Date.now() + backoffMinutes * 60 * 1000);

      try {
        // Reset status to scheduled for retry
        await db
          .update(scheduledEmails)
          .set({
            status: SCHEDULED_EMAIL_STATUS.SCHEDULED,
            scheduledAt: rescheduleAt,
            lastError: `Rescheduled due to ${errorDetails} (attempt ${payload.retried + 1})`,
            updatedAt: new Date(),
          })
          .where(eq(scheduledEmails.id, scheduledEmailId));

        // Schedule retry via QStash
        const retryResult = await qstashClient.scheduleOneTimeMessage({
          url: `${process.env.NEXT_PUBLIC_BETTER_AUTH_URL}/api/qstash/send-scheduled-email`,
          scheduledAt: rescheduleAt,
          body: { scheduledEmailId, userId },
          failureCallback: `${process.env.NEXT_PUBLIC_BETTER_AUTH_URL}/api/qstash/email-failed-callback`,
          deduplicationId: `retry_${scheduledEmailId}_${payload.retried + 1}`,
        });

        // Handle different response types from QStash
        const messageId = Array.isArray(retryResult) 
          ? retryResult[0]?.messageId 
          : 'messageId' in retryResult 
            ? retryResult.messageId 
            : undefined;

        console.log(`🔄 Email ${scheduledEmailId} rescheduled for ${rescheduleAt.toISOString()}`, {
          qstashMessageId: messageId,
        });

        return NextResponse.json({
          success: false,
          rescheduled: true,
          scheduledEmailId,
          nextAttempt: rescheduleAt.toISOString(),
          qstashMessageId: messageId,
        });

      } catch (rescheduleError) {
        console.error(`❌ Failed to reschedule email ${scheduledEmailId}:`, rescheduleError);
        
        // Mark as permanently failed if we can't reschedule
        await db
          .update(scheduledEmails)
          .set({
            status: SCHEDULED_EMAIL_STATUS.FAILED,
            lastError: `Failed to reschedule: ${rescheduleError instanceof Error ? rescheduleError.message : 'Unknown error'}`,
            updatedAt: new Date(),
          })
          .where(eq(scheduledEmails.id, scheduledEmailId));
      }
    }

    return NextResponse.json({
      success: false,
      scheduledEmailId,
      finalFailure: !shouldReschedule,
      status: payload.status,
      retried: payload.retried,
      maxRetries: payload.maxRetries,
      error: errorDetails,
      dlqId: payload.dlqId,
    });

  } catch (error) {
    console.error('❌ Email failure callback processing error:', error);
    return NextResponse.json(
      { error: 'Failure callback processing failed' },
      { status: 500 }
    );
  }
}
