/**
 * QStash email monitoring dashboard API
 * Provides statistics and insights for QStash email operations
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateRequest } from '../../v2/helper/main';
import { qstashClient } from '@/lib/qstash/client';
import { emailRateLimiter } from '@/lib/qstash/rate-limiter';
import { db } from '@/lib/db';
import { scheduledEmails, SCHEDULED_EMAIL_STATUS } from '@/lib/db/schema';
import { eq, count, and, gte, lte, desc } from 'drizzle-orm';

interface MonitoringStats {
  user: {
    id: string;
    emailStats: Record<string, { sent: number; failed: number }>;
    rateLimits: {
      burst: { remaining: number; resetTime?: number };
      daily: { remaining: number; resetTime?: number };
    };
  };
  queue: {
    currentlyQueued: any[]; // Emails waiting to be sent (scheduled status + future time)
    processing: any[];      // Emails currently being processed
    recentActivity: any[];  // Last 10 scheduled/sent/failed
    queuedCount: number;    // Total emails in queue
  };
  qstash: {
    schedules: any[];
    dlqMessages: any[];
    recentLogs: any[];
  };
  database: {
    totalCount: number;
    statusBreakdown: Record<string, number>;
  };
}

export async function GET(request: NextRequest) {
  console.log('📊 GET /api/qstash/monitoring - QStash monitoring dashboard');

  try {
    // Validate authentication
    const { userId, error } = await validateRequest(request);
    if (!userId) {
      return NextResponse.json({ error }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const days = parseInt(searchParams.get('days') || '7');
    const includeQStash = searchParams.get('include_qstash') !== 'false';

    console.log('📊 Gathering monitoring data for user:', userId);

    // Gather user email statistics from Redis
    const userEmailStats = await emailRateLimiter.getEmailStats(userId, days);

    // Check current rate limiting status
    const burstCheck = await emailRateLimiter.checkTokenBucket({
      key: `user:${userId}:burst`,
      capacity: 10,
      refillRate: 10,
      window: 60,
    });

    const dailyCheck = await emailRateLimiter.checkSlidingWindow({
      key: `user:${userId}:daily`,
      limit: 1000,
      window: 86400,
    });

    const now = new Date();

    // 📧 CURRENT QUEUE - Emails waiting to be sent (scheduled + future time)
    const currentlyQueued = await db
      .select()
      .from(scheduledEmails)
      .where(and(
        eq(scheduledEmails.userId, userId),
        eq(scheduledEmails.status, SCHEDULED_EMAIL_STATUS.SCHEDULED),
        gte(scheduledEmails.scheduledAt, now)
      ))
      .orderBy(scheduledEmails.scheduledAt)
      .limit(20);

    // 🔄 PROCESSING - Emails currently being processed
    const processing = await db
      .select()
      .from(scheduledEmails)
      .where(and(
        eq(scheduledEmails.userId, userId),
        eq(scheduledEmails.status, SCHEDULED_EMAIL_STATUS.PROCESSING)
      ))
      .orderBy(desc(scheduledEmails.updatedAt))
      .limit(10);

    // 📊 RECENT ACTIVITY - Last 10 emails regardless of status
    const recentActivity = await db
      .select()
      .from(scheduledEmails)
      .where(eq(scheduledEmails.userId, userId))
      .orderBy(desc(scheduledEmails.updatedAt))
      .limit(10);

    // 📈 TOTAL COUNTS
    const totalCount = await db
      .select({ count: count() })
      .from(scheduledEmails)
      .where(eq(scheduledEmails.userId, userId));

    // 📊 STATUS BREAKDOWN
    const statusBreakdown: Record<string, number> = {};
    const statusCounts = await db
      .select({
        status: scheduledEmails.status,
        count: count(),
      })
      .from(scheduledEmails)
      .where(eq(scheduledEmails.userId, userId))
      .groupBy(scheduledEmails.status);

    statusCounts.forEach(({ status, count: statusCount }) => {
      statusBreakdown[status] = statusCount;
    });

    const stats: MonitoringStats = {
      user: {
        id: userId,
        emailStats: userEmailStats,
        rateLimits: {
          burst: {
            remaining: burstCheck.remaining,
            resetTime: burstCheck.resetTime,
          },
          daily: {
            remaining: dailyCheck.remaining,
            resetTime: dailyCheck.resetTime,
          },
        },
      },
      queue: {
        currentlyQueued: currentlyQueued.map(email => ({
          id: email.id,
          subject: email.subject,
          scheduledAt: email.scheduledAt?.toISOString(),
          from: email.fromAddress,
          to: JSON.parse(email.toAddresses),
          qstashScheduleId: email.qstashScheduleId,
          createdAt: email.createdAt?.toISOString(),
        })),
        processing: processing.map(email => ({
          id: email.id,
          subject: email.subject,
          attempts: email.attempts || 0,
          lastError: email.lastError,
          updatedAt: email.updatedAt?.toISOString(),
        })),
        recentActivity: recentActivity.map(email => ({
          id: email.id,
          subject: email.subject,
          status: email.status,
          scheduledAt: email.scheduledAt?.toISOString(),
          updatedAt: email.updatedAt?.toISOString(),
          attempts: email.attempts || 0,
        })),
        queuedCount: currentlyQueued.length,
      },
      qstash: {
        schedules: [],
        dlqMessages: [],
        recentLogs: [],
      },
      database: {
        totalCount: totalCount[0].count,
        statusBreakdown,
      },
    };

    // Optionally fetch QStash-specific data (can be expensive)
    if (includeQStash) {
      try {
        console.log('📊 Fetching QStash schedules and logs');
        
        // Get QStash schedules (note: these are account-wide, not user-specific)
        const schedules = await qstashClient.listSchedules();
        stats.qstash.schedules = schedules;

        // Get recent logs with email-related messages
        const logs = await qstashClient.qstash.logs({
          filter: { count: 50 },
        });
        stats.qstash.recentLogs = logs.logs || [];

        // Get DLQ messages for failed emails
        const dlqResponse = await qstashClient.qstash.dlq.listMessages({
          count: 20,
        });
        stats.qstash.dlqMessages = dlqResponse.messages || [];

      } catch (qstashError) {
        console.error('⚠️ Failed to fetch QStash data:', qstashError);
        // Continue without QStash data if there's an error
        stats.qstash = {
          schedules: [],
          dlqMessages: [],
          recentLogs: [],
        };
      }
    }

    return NextResponse.json({
      success: true,
      data: stats,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('❌ QStash monitoring error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch monitoring data' },
      { status: 500 }
    );
  }
}
