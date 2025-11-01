import { NextRequest, NextResponse } from 'next/server'
import { validateRequest } from '../helper/main'
import { db } from '@/lib/db'
import { emailThreads, structuredEmails, sentEmails } from '@/lib/db/schema'
import { eq, desc, and, or, like, sql } from 'drizzle-orm'

/**
 * GET /api/v2/threads
 * List all email threads for user with pagination and search
 * Supports both session-based auth and API key auth
 * Has tests? ❌
 * Has logging? ✅
 * Has types? ✅
 */

export interface ThreadListItem {
  id: string
  rootMessageId: string
  normalizedSubject: string | null
  participantEmails: string[]
  messageCount: number
  lastMessageAt: Date
  createdAt: Date
  
  // Latest message preview
  latestMessage: {
    id: string
    type: 'inbound' | 'outbound'
    subject: string | null
    fromText: string
    textPreview: string | null
    isRead: boolean
    hasAttachments: boolean
    date: Date | null
  } | null
  
  // Thread status
  hasUnread: boolean
  isArchived: boolean
}

export interface ThreadsListResponse {
  threads: ThreadListItem[]
  pagination: {
    page: number
    limit: number
    total: number
    hasMore: boolean
  }
  filters: {
    search?: string
    unreadOnly?: boolean
    archivedOnly?: boolean
    domain?: string
    address?: string
  }
}

/**
 * Helper to get latest message for a thread
 */
async function getLatestMessageForThread(threadId: string, userId: string) {
  // Get latest inbound message
  const latestInbound = await db
    .select({
      id: structuredEmails.id,
      subject: structuredEmails.subject,
      fromData: structuredEmails.fromData,
      textBody: structuredEmails.textBody,
      isRead: structuredEmails.isRead,
      attachments: structuredEmails.attachments,
      date: structuredEmails.date,
      threadPosition: structuredEmails.threadPosition
    })
    .from(structuredEmails)
    .where(
      and(
        eq(structuredEmails.threadId, threadId),
        eq(structuredEmails.userId, userId)
      )
    )
    .orderBy(desc(structuredEmails.threadPosition))
    .limit(1)

  // Get latest outbound message
  const latestOutbound = await db
    .select({
      id: sentEmails.id,
      subject: sentEmails.subject,
      from: sentEmails.from,
      textBody: sentEmails.textBody,
      attachments: sentEmails.attachments,
      sentAt: sentEmails.sentAt,
      threadPosition: sentEmails.threadPosition
    })
    .from(sentEmails)
    .where(
      and(
        eq(sentEmails.threadId, threadId),
        eq(sentEmails.userId, userId)
      )
    )
    .orderBy(desc(sentEmails.threadPosition))
    .limit(1)

  // Determine which is the latest message
  const inbound = latestInbound[0]
  const outbound = latestOutbound[0]

  if (!inbound && !outbound) return null

  // Compare thread positions to find the latest
  const inboundPosition = inbound?.threadPosition || 0
  const outboundPosition = outbound?.threadPosition || 0

  if (outboundPosition > inboundPosition && outbound) {
    // Latest is outbound
    return {
      id: outbound.id,
      type: 'outbound' as const,
      subject: outbound.subject,
      fromText: outbound.from,
      textPreview: outbound.textBody ? outbound.textBody.substring(0, 200) : null,
      isRead: true, // Sent emails are always "read"
      hasAttachments: outbound.attachments ? JSON.parse(outbound.attachments).length > 0 : false,
      date: outbound.sentAt
    }
  } else if (inbound) {
    // Latest is inbound
    let fromText = 'Unknown Sender'
    try {
      if (inbound.fromData) {
        const fromParsed = JSON.parse(inbound.fromData)
        fromText = fromParsed.text || fromParsed.addresses?.[0]?.address || 'Unknown Sender'
      }
    } catch (e) {
      // Ignore parsing errors
    }

    return {
      id: inbound.id,
      type: 'inbound' as const,
      subject: inbound.subject,
      fromText,
      textPreview: inbound.textBody ? inbound.textBody.substring(0, 200) : null,
      isRead: inbound.isRead || false,
      hasAttachments: inbound.attachments ? JSON.parse(inbound.attachments).length > 0 : false,
      date: inbound.date
    }
  }

  return null
}

/**
 * Check if thread has unread messages
 */
async function threadHasUnread(threadId: string, userId: string): Promise<boolean> {
  const unreadCount = await db
    .select({ count: sql<number>`count(*)` })
    .from(structuredEmails)
    .where(
      and(
        eq(structuredEmails.threadId, threadId),
        eq(structuredEmails.userId, userId),
        eq(structuredEmails.isRead, false)
      )
    )

  return (unreadCount[0]?.count || 0) > 0
}

export async function GET(request: NextRequest) {
  console.log('🧵 GET /api/v2/threads - Starting request')

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

    // Parse query parameters
    const { searchParams } = new URL(request.url)
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '25')))
    const search = searchParams.get('search')?.trim()
    const unreadOnly = searchParams.get('unread') === 'true'
    const archivedOnly = searchParams.get('archived') === 'true'
    const domain = searchParams.get('domain')?.trim()
    const address = searchParams.get('address')?.trim()?.toLowerCase()
    const offset = (page - 1) * limit

    console.log(`📋 Query params: page=${page}, limit=${limit}, search="${search}", unreadOnly=${unreadOnly}, archivedOnly=${archivedOnly}, domain="${domain}", address="${address}"`)

    // Build the base query conditions
    const baseCondition = eq(emailThreads.userId, userId)
    const conditions: any[] = [baseCondition]

    // Add search condition
    if (search) {
      conditions.push(or(
        like(emailThreads.normalizedSubject, `%${search.toLowerCase()}%`),
        like(emailThreads.participantEmails, `%${search.toLowerCase()}%`)
      ))
    }

    // Add domain filter - check if any participant email contains @domain
    if (domain) {
      conditions.push(like(emailThreads.participantEmails, `%@${domain}%`))
    }

    // Add address filter - check if specific address is in participants
    if (address) {
      conditions.push(like(emailThreads.participantEmails, `%${address}%`))
    }

    const whereCondition = conditions.length > 1 ? and(...conditions) : baseCondition

    const [{ count: totalCount }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(emailThreads)
      .where(whereCondition)

    // Apply pagination and ordering
    const threads = await db
      .select({
        id: emailThreads.id,
        rootMessageId: emailThreads.rootMessageId,
        normalizedSubject: emailThreads.normalizedSubject,
        participantEmails: emailThreads.participantEmails,
        messageCount: emailThreads.messageCount,
        lastMessageAt: emailThreads.lastMessageAt,
        createdAt: emailThreads.createdAt
      })
      .from(emailThreads)
      .where(whereCondition)
      .orderBy(desc(emailThreads.lastMessageAt))
      .limit(limit)
      .offset(offset)

    console.log(`📊 Found ${threads.length} threads (${totalCount} total)`)

    // Build response with latest message previews
    const threadItems: ThreadListItem[] = []

    for (const thread of threads) {
      const latestMessage = await getLatestMessageForThread(thread.id, userId)
      const hasUnread = await threadHasUnread(thread.id, userId)

      // Parse participant emails
      let participantEmails: string[] = []
      try {
        participantEmails = thread.participantEmails ? JSON.parse(thread.participantEmails) : []
      } catch (e) {
        console.error('Failed to parse participant emails:', e)
      }

      // Apply unread filter
      if (unreadOnly && !hasUnread) {
        continue
      }

      threadItems.push({
        id: thread.id,
        rootMessageId: thread.rootMessageId,
        normalizedSubject: thread.normalizedSubject,
        participantEmails,
        messageCount: thread.messageCount || 0,
        lastMessageAt: thread.lastMessageAt || new Date(),
        createdAt: thread.createdAt || new Date(),
        latestMessage,
        hasUnread,
        isArchived: false // TODO: Implement archiving
      })
    }

    const response: ThreadsListResponse = {
      threads: threadItems,
      pagination: {
        page,
        limit,
        total: totalCount,
        hasMore: offset + limit < totalCount
      },
      filters: {
        search: search || undefined,
        unreadOnly: unreadOnly || undefined,
        archivedOnly: archivedOnly || undefined,
        domain: domain || undefined,
        address: address || undefined
      }
    }

    console.log(`✅ Successfully retrieved ${threadItems.length} threads`)
    return NextResponse.json(response)

  } catch (error) {
    console.error('💥 Unexpected error in GET /api/v2/threads:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
