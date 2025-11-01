import { NextRequest, NextResponse } from 'next/server'
import { validateRequest } from '../../helper/main'
import { db } from '@/lib/db'
import { emailThreads, structuredEmails, sentEmails } from '@/lib/db/schema'
import { eq, and, sql, desc, gte } from 'drizzle-orm'

/**
 * GET /api/v2/threads/stats
 * Get threading statistics for user's account
 * Supports both session-based auth and API key auth
 * Has tests? ❌
 * Has logging? ✅
 * Has types? ✅
 */

export interface ThreadStatsResponse {
  totalThreads: number
  totalMessages: number
  averageMessagesPerThread: number
  
  mostActiveThread: {
    threadId: string
    messageCount: number
    subject: string | null
    lastMessageAt: Date
  } | null
  
  recentActivity: {
    threadsToday: number
    messagesToday: number
    threadsThisWeek: number
    messagesThisWeek: number
  }
  
  distribution: {
    singleMessageThreads: number
    shortThreads: number // 2-5 messages
    mediumThreads: number // 6-15 messages
    longThreads: number // 16+ messages
  }
  
  unreadStats: {
    unreadThreads: number
    unreadMessages: number
  }
}

export async function GET(request: NextRequest) {
  console.log('📊 GET /api/v2/threads/stats - Starting request')

  try {
    console.log('🔐 Validating request authentication')
    const result = await validateRequest(request)
        if ('error' in result) {
            console.log('❌ Authentication/Rate limit failed:', result.error)
            const status = result.status || 401
            const headers: Record<string, string> = {}

            if (status === 429 && result.retryAfter) {
                headers['Retry-After'] = result.retryAfter.toString()
                headers['X-RateLimit-Limit'] = (result.limit || 0).toString()
                headers['X-RateLimit-Remaining'] = (result.remaining || 0).toString()
            }

            return NextResponse.json(
                { error: result.error },
                { status, headers }
            )
        }
        const { userId } = result
    console.log('✅ Authentication successful for userId:', userId)

    // Calculate date thresholds
    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const weekStart = new Date(todayStart.getTime() - 7 * 24 * 60 * 60 * 1000)

    console.log('📊 Calculating thread statistics...')

    // Get basic thread counts
    const [totalThreadsResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(emailThreads)
      .where(eq(emailThreads.userId, userId))

    const totalThreads = totalThreadsResult?.count || 0

    // Get total message count (inbound + outbound)
    const [inboundCountResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(structuredEmails)
      .where(eq(structuredEmails.userId, userId))

    const [outboundCountResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(sentEmails)
      .where(eq(sentEmails.userId, userId))

    const totalMessages = (inboundCountResult?.count || 0) + (outboundCountResult?.count || 0)
    const averageMessagesPerThread = totalThreads > 0 ? Math.round(totalMessages / totalThreads * 100) / 100 : 0

    // Get most active thread
    const mostActiveThreadResult = await db
      .select({
        id: emailThreads.id,
        messageCount: emailThreads.messageCount,
        normalizedSubject: emailThreads.normalizedSubject,
        lastMessageAt: emailThreads.lastMessageAt
      })
      .from(emailThreads)
      .where(eq(emailThreads.userId, userId))
      .orderBy(desc(emailThreads.messageCount))
      .limit(1)

    const mostActiveThread = mostActiveThreadResult[0] ? {
      threadId: mostActiveThreadResult[0].id,
      messageCount: mostActiveThreadResult[0].messageCount || 0,
      subject: mostActiveThreadResult[0].normalizedSubject,
      lastMessageAt: mostActiveThreadResult[0].lastMessageAt
    } : null

    // Get recent activity stats
    const [threadsToday] = await db
      .select({ count: sql<number>`count(*)` })
      .from(emailThreads)
      .where(
        and(
          eq(emailThreads.userId, userId),
          gte(emailThreads.lastMessageAt, todayStart)
        )
      )

    const [threadsThisWeek] = await db
      .select({ count: sql<number>`count(*)` })
      .from(emailThreads)
      .where(
        and(
          eq(emailThreads.userId, userId),
          gte(emailThreads.lastMessageAt, weekStart)
        )
      )

    const [messagesToday] = await db
      .select({ count: sql<number>`count(*)` })
      .from(structuredEmails)
      .where(
        and(
          eq(structuredEmails.userId, userId),
          gte(structuredEmails.createdAt, todayStart)
        )
      )

    const [messagesThisWeek] = await db
      .select({ count: sql<number>`count(*)` })
      .from(structuredEmails)
      .where(
        and(
          eq(structuredEmails.userId, userId),
          gte(structuredEmails.createdAt, weekStart)
        )
      )

    // Get thread distribution by message count
    const threadDistribution = await db
      .select({
        messageCount: emailThreads.messageCount,
        count: sql<number>`count(*)`
      })
      .from(emailThreads)
      .where(eq(emailThreads.userId, userId))
      .groupBy(emailThreads.messageCount)

    let singleMessageThreads = 0
    let shortThreads = 0 // 2-5 messages
    let mediumThreads = 0 // 6-15 messages
    let longThreads = 0 // 16+ messages

    for (const dist of threadDistribution) {
      const messageCount = dist.messageCount || 0
      const threadCount = dist.count || 0

      if (messageCount === 1) {
        singleMessageThreads += threadCount
      } else if (messageCount <= 5) {
        shortThreads += threadCount
      } else if (messageCount <= 15) {
        mediumThreads += threadCount
      } else {
        longThreads += threadCount
      }
    }

    // Get unread statistics
    const [unreadThreadsResult] = await db
      .select({ count: sql<number>`count(distinct ${structuredEmails.threadId})` })
      .from(structuredEmails)
      .where(
        and(
          eq(structuredEmails.userId, userId),
          eq(structuredEmails.isRead, false)
        )
      )

    const [unreadMessagesResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(structuredEmails)
      .where(
        and(
          eq(structuredEmails.userId, userId),
          eq(structuredEmails.isRead, false)
        )
      )

    // Build response
    const response: ThreadStatsResponse = {
      totalThreads,
      totalMessages,
      averageMessagesPerThread,
      mostActiveThread,
      recentActivity: {
        threadsToday: threadsToday?.count || 0,
        messagesToday: messagesToday?.count || 0,
        threadsThisWeek: threadsThisWeek?.count || 0,
        messagesThisWeek: messagesThisWeek?.count || 0
      },
      distribution: {
        singleMessageThreads,
        shortThreads,
        mediumThreads,
        longThreads
      },
      unreadStats: {
        unreadThreads: unreadThreadsResult?.count || 0,
        unreadMessages: unreadMessagesResult?.count || 0
      }
    }

    console.log('📊 Thread statistics calculated:', {
      totalThreads: response.totalThreads,
      totalMessages: response.totalMessages,
      unreadThreads: response.unreadStats.unreadThreads
    })

    return NextResponse.json(response)

  } catch (error) {
    console.error('💥 Unexpected error in GET /api/v2/threads/stats:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
