import { NextRequest, NextResponse } from 'next/server'
import { validateRequest } from '../../helper/main'
import { db } from '@/lib/db'
import { emailThreads, structuredEmails, sentEmails } from '@/lib/db/schema'
import { eq, and, asc } from 'drizzle-orm'

/**
 * GET /api/v2/threads/[id]
 * Get all messages in a specific thread
 * Supports both session-based auth and API key auth
 * Has tests? ❌
 * Has logging? ✅
 * Has types? ✅
 */

export interface ThreadMessage {
  id: string
  messageId: string | null
  type: 'inbound' | 'outbound'
  threadPosition: number
  
  // Message content
  subject: string | null
  textBody: string | null
  htmlBody: string | null
  
  // Sender/recipient info
  from: string
  fromName: string | null
  fromAddress: string | null
  to: string[]
  cc: string[]
  bcc: string[]
  
  // Timestamps
  date: Date | null
  receivedAt: Date | null
  sentAt: Date | null
  
  // Message metadata
  isRead: boolean
  readAt: Date | null
  hasAttachments: boolean
  attachments: Array<{
    filename?: string
    contentType?: string
    size?: number
    contentId?: string
    contentDisposition?: string
  }>
  
  // Threading metadata
  inReplyTo: string | null
  references: string[]
  
  // Headers and tags
  headers: Record<string, any>
  tags: Array<{ name: string; value: string }>
  
  // Status (for sent emails)
  status?: 'pending' | 'sent' | 'failed'
  failureReason?: string | null
}

export interface ThreadDetails {
  id: string
  rootMessageId: string
  normalizedSubject: string | null
  participantEmails: string[]
  messageCount: number
  lastMessageAt: Date
  createdAt: Date
  updatedAt: Date
}

export interface GetThreadResponse {
  thread: ThreadDetails
  messages: ThreadMessage[]
  totalCount: number
}

/**
 * Helper to parse JSON safely
 */
function parseJsonSafely<T>(json: string | null, fallback: T): T {
  if (!json) return fallback
  try {
    return JSON.parse(json) as T
  } catch (e) {
    return fallback
  }
}

/**
 * Helper to extract email addresses from parsed email data
 */
function extractEmailAddresses(emailData: string | null): string[] {
  if (!emailData) return []
  
  try {
    const parsed = JSON.parse(emailData)
    if (parsed?.addresses && Array.isArray(parsed.addresses)) {
      return parsed.addresses
        .map((addr: any) => addr.address)
        .filter((email: string) => email && typeof email === 'string')
    }
  } catch (e) {
    // Ignore parsing errors
  }
  
  return []
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  console.log('🧵 GET /api/v2/threads/[id] - Starting request')

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

    const { id: threadId } = await params
    console.log('🧵 Requested thread ID:', threadId)

    // Validate thread ID
    if (!threadId || typeof threadId !== 'string') {
      console.log('⚠️ Invalid thread ID provided:', threadId)
      return NextResponse.json(
        { error: 'Valid thread ID is required' },
        { status: 400 }
      )
    }

    // Get thread info
    console.log('🔍 Fetching thread details')
    const thread = await db
      .select()
      .from(emailThreads)
      .where(
        and(
          eq(emailThreads.id, threadId),
          eq(emailThreads.userId, userId)
        )
      )
      .limit(1)

    if (thread.length === 0) {
      console.log('📭 Thread not found')
      return NextResponse.json({ error: 'Thread not found' }, { status: 404 })
    }

    const threadDetails = thread[0]
    console.log(`📊 Thread found: ${threadDetails.messageCount} messages`)

    // Get all inbound messages in the thread
    console.log('📥 Fetching inbound messages')
    const inboundMessages = await db
      .select()
      .from(structuredEmails)
      .where(
        and(
          eq(structuredEmails.threadId, threadId),
          eq(structuredEmails.userId, userId)
        )
      )
      .orderBy(asc(structuredEmails.threadPosition))

    // Get all outbound messages in the thread
    console.log('📤 Fetching outbound messages')
    const outboundMessages = await db
      .select()
      .from(sentEmails)
      .where(
        and(
          eq(sentEmails.threadId, threadId),
          eq(sentEmails.userId, userId)
        )
      )
      .orderBy(asc(sentEmails.threadPosition))

    console.log(`📊 Found ${inboundMessages.length} inbound and ${outboundMessages.length} outbound messages`)

    // Convert to unified message format
    const messages: ThreadMessage[] = []

    // Process inbound messages
    for (const email of inboundMessages) {
      let fromData = null
      let toData = null
      let ccData = null
      let bccData = null
      let attachments: any[] = []
      let references: string[] = []
      let headers: Record<string, any> = {}

      try {
        fromData = email.fromData ? JSON.parse(email.fromData) : null
        toData = email.toData ? JSON.parse(email.toData) : null
        ccData = email.ccData ? JSON.parse(email.ccData) : null
        bccData = email.bccData ? JSON.parse(email.bccData) : null
        attachments = email.attachments ? JSON.parse(email.attachments) : []
        references = email.references ? JSON.parse(email.references) : []
        headers = email.headers ? JSON.parse(email.headers) : {}
      } catch (e) {
        console.error('Failed to parse inbound email data:', e)
      }

      messages.push({
        id: email.id,
        messageId: email.messageId,
        type: 'inbound',
        threadPosition: email.threadPosition || 0,
        
        // Content
        subject: email.subject,
        textBody: email.textBody,
        htmlBody: email.htmlBody,
        
        // Sender/recipient info
        from: fromData?.text || 'Unknown Sender',
        fromName: fromData?.addresses?.[0]?.name || null,
        fromAddress: fromData?.addresses?.[0]?.address || null,
        to: extractEmailAddresses(email.toData),
        cc: extractEmailAddresses(email.ccData),
        bcc: extractEmailAddresses(email.bccData),
        
        // Timestamps
        date: email.date,
        receivedAt: email.createdAt,
        sentAt: null,
        
        // Message metadata
        isRead: email.isRead || false,
        readAt: email.readAt,
        hasAttachments: attachments.length > 0,
        attachments: attachments,
        
        // Threading metadata
        inReplyTo: email.inReplyTo,
        references: references,
        
        // Headers and tags
        headers: headers,
        tags: [] // Inbound emails don't have tags
      })
    }

    // Process outbound messages
    for (const email of outboundMessages) {
      let toAddresses: string[] = []
      let ccAddresses: string[] = []
      let bccAddresses: string[] = []
      let headers: Record<string, any> = {}
      let attachments: any[] = []
      let tags: Array<{ name: string; value: string }> = []

      try {
        toAddresses = email.to ? JSON.parse(email.to) : []
        ccAddresses = email.cc ? JSON.parse(email.cc) : []
        bccAddresses = email.bcc ? JSON.parse(email.bcc) : []
        headers = email.headers ? JSON.parse(email.headers) : {}
        attachments = email.attachments ? JSON.parse(email.attachments) : []
        tags = email.tags ? JSON.parse(email.tags) : []
      } catch (e) {
        console.error('Failed to parse outbound email data:', e)
      }

      const references: string[] = headers['References'] 
        ? (typeof headers['References'] === 'string' 
            ? headers['References'].split(/\s+/).filter(Boolean)
            : [])
        : []

      messages.push({
        id: email.id,
        messageId: email.messageId,
        type: 'outbound',
        threadPosition: email.threadPosition || 0,
        
        // Content
        subject: email.subject,
        textBody: email.textBody,
        htmlBody: email.htmlBody,
        
        // Sender/recipient info
        from: email.from,
        fromName: null, // TODO: Parse from display name
        fromAddress: email.fromAddress,
        to: toAddresses,
        cc: ccAddresses,
        bcc: bccAddresses,
        
        // Timestamps
        date: email.sentAt,
        receivedAt: null,
        sentAt: email.sentAt,
        
        // Message metadata
        isRead: true, // Sent emails are always "read"
        readAt: email.sentAt,
        hasAttachments: attachments.length > 0,
        attachments: attachments,
        
        // Threading metadata
        inReplyTo: headers['In-Reply-To'] || null,
        references: references,
        
        // Headers and tags
        headers: headers,
        tags: tags,
        
        // Status (for sent emails)
        status: email.status as 'pending' | 'sent' | 'failed',
        failureReason: email.failureReason
      })
    }

    // Sort messages by thread position
    messages.sort((a, b) => a.threadPosition - b.threadPosition)

    // Parse participant emails
    let participantEmails: string[] = []
    try {
      participantEmails = threadDetails.participantEmails ? JSON.parse(threadDetails.participantEmails) : []
    } catch (e) {
      console.error('Failed to parse participant emails:', e)
    }

    // Build response
    const response: GetThreadResponse = {
      thread: {
        id: threadDetails.id,
        rootMessageId: threadDetails.rootMessageId,
        normalizedSubject: threadDetails.normalizedSubject,
        participantEmails,
        messageCount: threadDetails.messageCount || 0,
        lastMessageAt: threadDetails.lastMessageAt || new Date(),
        createdAt: threadDetails.createdAt || new Date(),
        updatedAt: threadDetails.updatedAt || new Date()
      },
      messages,
      totalCount: messages.length
    }

    console.log(`✅ Successfully retrieved thread with ${messages.length} messages`)
    return NextResponse.json(response)

  } catch (error) {
    console.error('💥 Unexpected error in GET /api/v2/threads/[id]:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
