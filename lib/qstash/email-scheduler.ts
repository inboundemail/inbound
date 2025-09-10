/**
 * QStash-based email scheduling service
 * Replaces database polling with precise QStash scheduling
 */

import { qstashClient, type QStashEmailScheduleOptions } from './client';
import { db } from '@/lib/db';
import { scheduledEmails, SCHEDULED_EMAIL_STATUS } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { nanoid } from 'nanoid';

export class QStashEmailScheduler {
  private webhookBaseUrl: string;

  constructor(webhookBaseUrl: string) {
    this.webhookBaseUrl = webhookBaseUrl;
  }

  /**
   * Schedule an email to be sent via QStash
   * This replaces the database-only approach
   */
  async scheduleEmail(options: {
    userId: string;
    emailData: QStashEmailScheduleOptions['emailData'];
    scheduledAt: Date;
    timezone?: string;
    idempotencyKey?: string;
    tags?: Array<{ name: string; value: string }>;
  }) {
    const scheduledEmailId = nanoid();
    const qstashScheduleId = `email_${scheduledEmailId}`;
    
    console.log('📅 QStashEmailScheduler.scheduleEmail:', {
      scheduledEmailId,
      userId: options.userId,
      scheduledAt: options.scheduledAt.toISOString(),
      deduplicationId: options.idempotencyKey,
    });

    try {
      // Store in database for tracking (but don't rely on it for scheduling)
      const scheduledEmail = await db.insert(scheduledEmails).values({
        id: scheduledEmailId,
        userId: options.userId,
        scheduledAt: options.scheduledAt,
        timezone: options.timezone || 'UTC',
        status: SCHEDULED_EMAIL_STATUS.SCHEDULED,
        fromAddress: options.emailData.from,
        fromDomain: this.extractDomain(options.emailData.from),
        toAddresses: JSON.stringify(options.emailData.to),
        ccAddresses: options.emailData.cc ? JSON.stringify(options.emailData.cc) : null,
        bccAddresses: options.emailData.bcc ? JSON.stringify(options.emailData.bcc) : null,
        replyToAddresses: options.emailData.replyTo ? JSON.stringify(options.emailData.replyTo) : null,
        subject: options.emailData.subject,
        textBody: options.emailData.textBody,
        htmlBody: options.emailData.htmlBody,
        headers: options.emailData.headers ? JSON.stringify(options.emailData.headers) : null,
        attachments: options.emailData.attachments ? JSON.stringify(options.emailData.attachments) : null,
        tags: options.tags ? JSON.stringify(options.tags) : null,
        idempotencyKey: options.idempotencyKey,
        qstashScheduleId,
      }).returning();

      // Schedule via QStash for precise timing
      const webhookUrl = `${this.webhookBaseUrl}/api/qstash/send-scheduled-email`;
      
      const qstashResult = await qstashClient.scheduleOneTimeMessage({
        url: webhookUrl,
        scheduledAt: options.scheduledAt,
        body: {
          scheduledEmailId,
          userId: options.userId,
        },
        headers: {
          'Content-Type': 'application/json',
        },
        failureCallback: `${this.webhookBaseUrl}/api/qstash/email-failed-callback`,
        deduplicationId: options.idempotencyKey || qstashScheduleId,
      });

      console.log('✅ Email scheduled via QStash:', {
        scheduledEmailId,
        qstashResult,
      });

      // Handle different response types from QStash
      const messageId = Array.isArray(qstashResult) 
        ? qstashResult[0]?.messageId 
        : 'messageId' in qstashResult 
          ? qstashResult.messageId 
          : undefined;

      return {
        id: scheduledEmailId,
        qstashMessageId: messageId,
        scheduledAt: options.scheduledAt,
      };

    } catch (error) {
      console.error('❌ Failed to schedule email via QStash:', error);
      
      // Update database status if the record was created
      try {
        await db
          .update(scheduledEmails)
          .set({ 
            status: SCHEDULED_EMAIL_STATUS.FAILED,
            lastError: error instanceof Error ? error.message : 'Unknown error',
            updatedAt: new Date(),
          })
          .where(eq(scheduledEmails.id, scheduledEmailId));
      } catch (dbError) {
        console.error('❌ Failed to update database after QStash error:', dbError);
      }

      throw error;
    }
  }

  /**
   * Cancel a scheduled email
   * This will need to work with QStash's cancel API when the message ID is available
   */
  async cancelScheduledEmail(scheduledEmailId: string) {
    console.log('🚫 QStashEmailScheduler.cancelScheduledEmail:', scheduledEmailId);

    try {
      // Update database status
      const updated = await db
        .update(scheduledEmails)
        .set({ 
          status: SCHEDULED_EMAIL_STATUS.CANCELLED,
          updatedAt: new Date(),
        })
        .where(eq(scheduledEmails.id, scheduledEmailId))
        .returning();

      if (updated.length === 0) {
        throw new Error('Scheduled email not found');
      }

      // Note: QStash doesn't currently support cancelling one-time delayed messages
      // The database status change will prevent processing if the webhook is called
      
      console.log('✅ Scheduled email cancelled');
      return { success: true };

    } catch (error) {
      console.error('❌ Failed to cancel scheduled email:', error);
      throw error;
    }
  }

  /**
   * Get scheduled email status
   */
  async getScheduledEmail(scheduledEmailId: string) {
    const result = await db
      .select()
      .from(scheduledEmails)
      .where(eq(scheduledEmails.id, scheduledEmailId))
      .limit(1);

    return result[0] || null;
  }

  /**
   * List user's scheduled emails
   */
  async listScheduledEmails(userId: string, options?: {
    status?: string;
    limit?: number;
    offset?: number;
  }) {
    const whereConditions = [eq(scheduledEmails.userId, userId)];
    
    if (options?.status) {
      whereConditions.push(eq(scheduledEmails.status, options.status));
    }

    const baseQuery = db
      .select()
      .from(scheduledEmails)
      .where(whereConditions.length === 1 ? whereConditions[0] : and(...whereConditions))
      .orderBy(scheduledEmails.scheduledAt);

    // Apply limit and offset if provided
    if (options?.limit && options?.offset) {
      return await baseQuery.limit(options.limit).offset(options.offset);
    } else if (options?.limit) {
      return await baseQuery.limit(options.limit);
    } else if (options?.offset) {
      return await baseQuery.offset(options.offset);
    }

    return await baseQuery;
  }

  /**
   * Verify QStash webhook signature
   */
  async verifyWebhookSignature(signature: string, body: string, url?: string): Promise<boolean> {
    return await qstashClient.verifySignature({ signature, body, url });
  }

  private extractDomain(email: string): string {
    const match = email.match(/@([^>]+)/);
    return match ? match[1] : '';
  }
}

// Export singleton instance
export const emailScheduler = new QStashEmailScheduler(
  process.env.NEXT_PUBLIC_BETTER_AUTH_URL || 'http://localhost:3000'
);

// Export types
export type { QStashEmailScheduleOptions };
