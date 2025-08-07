/**
 * Improved Email Threading Algorithm
 * 
 * Implements a more robust and performant email threading system that:
 * - Uses proper Message-ID based threading per RFC 2822
 * - Implements conversation clustering with confidence scoring
 * - Provides fallback mechanisms for emails without proper headers
 * - Optimizes database queries to reduce N+1 problems
 */

import { db } from '@/lib/db'
import { structuredEmails, sentEmails } from '@/lib/db/schema'
import { eq, and, or, inArray, like, sql } from 'drizzle-orm'

export interface ThreadingResult {
  messages: ThreadMessage[]
  threadId: string
  confidence: 'high' | 'medium' | 'low'
  threadingMethod: 'message-id' | 'references' | 'subject' | 'conversation-index'
}

export interface ThreadMessage {
  id: string
  messageId: string | null
  type: 'inbound' | 'outbound'
  subject: string | null
  from: string
  fromName: string | null
  to: string
  receivedAt: Date | null
  sentAt: Date | null
  content: {
    textBody: string | null
    htmlBody: string | null
    attachments: any[]
  }
  addresses: {
    from: any
    to: any
  }
  metadata: {
    inReplyTo: string | null
    references: string[]
    conversationIndex?: string
    parseSuccess: boolean | null
    parseError: string | null
  }
  isRead: boolean
  readAt: Date | null
  threadPosition: number // Position in thread (0 = first message)
}

/**
 * Clean and normalize message IDs
 */
function cleanMessageId(messageId: string): string {
  if (!messageId) return ''
  return messageId.replace(/^<|>$/g, '').trim()
}

/**
 * Parse References header with improved handling
 */
function parseReferences(referencesStr: string): string[] {
  if (!referencesStr) return []
  
  try {
    // Handle JSON array format
    if (referencesStr.startsWith('[')) {
      const parsed = JSON.parse(referencesStr)
      if (Array.isArray(parsed)) {
        return parsed.map(cleanMessageId).filter(Boolean)
      }
    }
    
    // Handle RFC 2822 format (space-separated message IDs)
    return referencesStr
      .replace(/\s+/g, ' ')
      .trim()
      .split(' ')
      .map(cleanMessageId)
      .filter(Boolean)
  } catch (e) {
    console.error('Failed to parse references:', e)
    return []
  }
}

/**
 * Normalize subject for comparison
 */
function normalizeSubject(subject: string): string {
  if (!subject) return ''
  
  let normalized = subject.trim().toLowerCase()
  
  // Remove common prefixes (more comprehensive)
  const prefixPattern = /^(re|r|fwd|fw|aw|wg|vs|sv|reply|forward):\s*/i
  while (prefixPattern.test(normalized)) {
    normalized = normalized.replace(prefixPattern, '').trim()
  }
  
  // Remove bracketed indicators like [EXTERNAL] [SPAM] etc.
  normalized = normalized.replace(/^\[[^\]]+\]\s*/g, '')
  
  return normalized
}

/**
 * Calculate threading confidence based on available data
 */
function calculateConfidence(
  hasMessageId: boolean,
  hasInReplyTo: boolean,
  hasReferences: boolean,
  hasConversationIndex: boolean,
  subjectMatch: boolean,
  participantOverlap: number
): 'high' | 'medium' | 'low' {
  let score = 0
  
  if (hasMessageId) score += 30
  if (hasInReplyTo) score += 25
  if (hasReferences) score += 20
  if (hasConversationIndex) score += 15
  if (subjectMatch) score += 10
  if (participantOverlap > 0.5) score += 15
  
  if (score >= 70) return 'high'
  if (score >= 40) return 'medium'
  return 'low'
}

/**
 * Extract participants from email addresses
 */
function extractParticipants(fromData: any, toData: any, ccData?: any): Set<string> {
  const participants = new Set<string>()
  
  try {
    if (fromData?.addresses) {
      fromData.addresses.forEach((addr: any) => {
        if (addr.address) participants.add(addr.address.toLowerCase())
      })
    }
    
    if (toData?.addresses) {
      toData.addresses.forEach((addr: any) => {
        if (addr.address) participants.add(addr.address.toLowerCase())
      })
    }
    
    if (ccData?.addresses) {
      ccData.addresses.forEach((addr: any) => {
        if (addr.address) participants.add(addr.address.toLowerCase())
      })
    }
  } catch (e) {
    console.error('Failed to extract participants:', e)
  }
  
  return participants
}

/**
 * Calculate participant overlap between two emails
 */
function calculateParticipantOverlap(participants1: Set<string>, participants2: Set<string>): number {
  if (participants1.size === 0 || participants2.size === 0) return 0
  
  const intersection = new Set([...participants1].filter(x => participants2.has(x)))
  const union = new Set([...participants1, ...participants2])
  
  return intersection.size / union.size
}

/**
 * Build thread using Message-ID and References (RFC 2822 compliant)
 */
async function buildMessageIdThread(userId: string, emailId: string): Promise<{
  messageIds: string[]
  method: 'message-id' | 'references'
  confidence: 'high' | 'medium'
}> {
  // Get the original email
  const [originalEmail] = await db
    .select({
      id: structuredEmails.id,
      messageId: structuredEmails.messageId,
      inReplyTo: structuredEmails.inReplyTo,
      references: structuredEmails.references,
      subject: structuredEmails.subject,
      fromData: structuredEmails.fromData,
      toData: structuredEmails.toData,
      ccData: structuredEmails.ccData,
    })
    .from(structuredEmails)
    .where(and(
      eq(structuredEmails.id, emailId),
      eq(structuredEmails.userId, userId)
    ))
    .limit(1)

  if (!originalEmail) return { messageIds: [], method: 'message-id', confidence: 'high' }

  const threadMessageIds = new Set<string>()
  
  // Add current message ID
  if (originalEmail.messageId) {
    threadMessageIds.add(cleanMessageId(originalEmail.messageId))
  }
  
  // Add In-Reply-To
  if (originalEmail.inReplyTo) {
    threadMessageIds.add(cleanMessageId(originalEmail.inReplyTo))
  }
  
  // Add References
  if (originalEmail.references) {
    const refs = parseReferences(originalEmail.references)
    refs.forEach(ref => threadMessageIds.add(ref))
  }

  // Recursively find all related messages in a single query
  const allRelatedMessageIds = Array.from(threadMessageIds)
  
  if (allRelatedMessageIds.length === 0) {
    return { messageIds: [], method: 'message-id', confidence: 'high' }
  }

  // Single query to find all related emails
  const relatedEmails = await db
    .select({
      messageId: structuredEmails.messageId,
      inReplyTo: structuredEmails.inReplyTo,
      references: structuredEmails.references,
    })
    .from(structuredEmails)
    .where(and(
      eq(structuredEmails.userId, userId),
      or(
        inArray(structuredEmails.messageId, allRelatedMessageIds),
        inArray(structuredEmails.inReplyTo, allRelatedMessageIds.map(id => `<${id}>`)),
        ...allRelatedMessageIds.map(id => 
          like(structuredEmails.references, `%${id}%`)
        )
      )
    ))

  // Also check sent emails
  const relatedSentEmails = await db
    .select({
      messageId: sentEmails.messageId,
      headers: sentEmails.headers,
    })
    .from(sentEmails)
    .where(and(
      eq(sentEmails.userId, userId),
      or(
        inArray(sentEmails.messageId, allRelatedMessageIds),
        ...allRelatedMessageIds.map(id => 
          like(sentEmails.headers, `%${id}%`)
        )
      )
    ))

  // Process all found emails to build complete thread
  for (const email of relatedEmails) {
    if (email.messageId) {
      threadMessageIds.add(cleanMessageId(email.messageId))
    }
    if (email.inReplyTo) {
      threadMessageIds.add(cleanMessageId(email.inReplyTo))
    }
    if (email.references) {
      const refs = parseReferences(email.references)
      refs.forEach(ref => threadMessageIds.add(ref))
    }
  }

  // Process sent emails
  for (const email of relatedSentEmails) {
    if (email.messageId) {
      threadMessageIds.add(cleanMessageId(email.messageId))
    }
    if (email.headers) {
      try {
        const headers = JSON.parse(email.headers)
        if (headers['In-Reply-To']) {
          threadMessageIds.add(cleanMessageId(headers['In-Reply-To']))
        }
        if (headers['References']) {
          const refs = parseReferences(headers['References'])
          refs.forEach(ref => threadMessageIds.add(ref))
        }
      } catch (e) {
        // Ignore parsing errors
      }
    }
  }

  return {
    messageIds: Array.from(threadMessageIds).filter(Boolean),
    method: originalEmail.inReplyTo || originalEmail.references ? 'references' : 'message-id',
    confidence: 'high'
  }
}

/**
 * Build thread using subject-based clustering (fallback method)
 */
async function buildSubjectThread(userId: string, emailId: string): Promise<{
  messageIds: string[]
  method: 'subject'
  confidence: 'medium' | 'low'
}> {
  // Get the original email
  const [originalEmail] = await db
    .select({
      subject: structuredEmails.subject,
      fromData: structuredEmails.fromData,
      toData: structuredEmails.toData,
      ccData: structuredEmails.ccData,
      date: structuredEmails.date,
    })
    .from(structuredEmails)
    .where(and(
      eq(structuredEmails.id, emailId),
      eq(structuredEmails.userId, userId)
    ))
    .limit(1)

  if (!originalEmail || !originalEmail.subject) {
    return { messageIds: [], method: 'subject', confidence: 'low' }
  }

  const normalizedSubject = normalizeSubject(originalEmail.subject)
  if (!normalizedSubject) {
    return { messageIds: [], method: 'subject', confidence: 'low' }
  }

  const originalParticipants = extractParticipants(
    originalEmail.fromData, 
    originalEmail.toData, 
    originalEmail.ccData
  )

  // Find emails with similar subjects within a reasonable time window
  const timeWindow = 30 // days
  const dateThreshold = new Date(originalEmail.date)
  dateThreshold.setDate(dateThreshold.getDate() - timeWindow)

  const candidateEmails = await db
    .select({
      id: structuredEmails.id,
      messageId: structuredEmails.messageId,
      subject: structuredEmails.subject,
      fromData: structuredEmails.fromData,
      toData: structuredEmails.toData,
      ccData: structuredEmails.ccData,
      date: structuredEmails.date,
    })
    .from(structuredEmails)
    .where(and(
      eq(structuredEmails.userId, userId),
      like(structuredEmails.subject, `%${normalizedSubject}%`),
      sql`${structuredEmails.date} >= ${dateThreshold}`
    ))

  // Filter and score candidates
  const scoredCandidates = candidateEmails
    .map(email => {
      const emailNormalizedSubject = normalizeSubject(email.subject || '')
      const subjectMatch = emailNormalizedSubject === normalizedSubject
      
      const emailParticipants = extractParticipants(
        email.fromData,
        email.toData,
        email.ccData
      )
      
      const participantOverlap = calculateParticipantOverlap(
        originalParticipants,
        emailParticipants
      )
      
      return {
        email,
        score: (subjectMatch ? 50 : 0) + (participantOverlap * 50),
        subjectMatch,
        participantOverlap
      }
    })
    .filter(candidate => candidate.score >= 25) // Minimum threshold
    .sort((a, b) => b.score - a.score)

  const messageIds = scoredCandidates
    .map(candidate => candidate.email.messageId)
    .filter(Boolean)
    .map(cleanMessageId)

  // Determine confidence based on results
  const highScoreCandidates = scoredCandidates.filter(c => c.score >= 75)
  const confidence = highScoreCandidates.length > 0 ? 'medium' : 'low'

  return {
    messageIds,
    method: 'subject',
    confidence
  }
}

/**
 * Main threading function with improved algorithm
 */
export async function getImprovedEmailThread(userId: string, emailId: string): Promise<ThreadingResult> {
  console.log(`🧵 Building improved thread for email: ${emailId}`)
  
  try {
    // First, try Message-ID based threading (most reliable)
    const messageIdResult = await buildMessageIdThread(userId, emailId)
    
    if (messageIdResult.messageIds.length > 1) {
      const messages = await fetchAndSortMessages(userId, messageIdResult.messageIds, emailId)
      
      return {
        messages,
        threadId: messageIdResult.messageIds[0] || emailId,
        confidence: messageIdResult.confidence,
        threadingMethod: messageIdResult.method
      }
    }

    // Fallback to subject-based threading
    console.log('📝 Falling back to subject-based threading')
    const subjectResult = await buildSubjectThread(userId, emailId)
    
    const allMessageIds = [...new Set([
      ...messageIdResult.messageIds,
      ...subjectResult.messageIds
    ])]

    if (allMessageIds.length === 0) {
      // Single message thread
      const messages = await fetchAndSortMessages(userId, [], emailId)
      return {
        messages,
        threadId: emailId,
        confidence: 'low',
        threadingMethod: 'message-id'
      }
    }

    const messages = await fetchAndSortMessages(userId, allMessageIds, emailId)
    
    return {
      messages,
      threadId: allMessageIds[0] || emailId,
      confidence: subjectResult.confidence,
      threadingMethod: subjectResult.method
    }

  } catch (error) {
    console.error('💥 Error building thread:', error)
    
    // Fallback to single message
    const messages = await fetchAndSortMessages(userId, [], emailId)
    return {
      messages,
      threadId: emailId,
      confidence: 'low',
      threadingMethod: 'message-id'
    }
  }
}

/**
 * Fetch and sort messages for the thread
 */
async function fetchAndSortMessages(
  userId: string, 
  messageIds: string[], 
  originalEmailId: string
): Promise<ThreadMessage[]> {
  const messages: ThreadMessage[] = []

  // Fetch inbound emails
  let inboundQuery = db
    .select()
    .from(structuredEmails)
    .where(eq(structuredEmails.userId, userId))

  if (messageIds.length > 0) {
    inboundQuery = inboundQuery.where(
      or(
        inArray(structuredEmails.messageId, messageIds),
        inArray(structuredEmails.inReplyTo, messageIds.map(id => `<${id}>`)),
        eq(structuredEmails.id, originalEmailId) // Always include original
      )
    )
  } else {
    inboundQuery = inboundQuery.where(eq(structuredEmails.id, originalEmailId))
  }

  const inboundEmails = await inboundQuery

  // Fetch outbound emails
  let outboundEmails: any[] = []
  if (messageIds.length > 0) {
    outboundEmails = await db
      .select()
      .from(sentEmails)
      .where(and(
        eq(sentEmails.userId, userId),
        inArray(sentEmails.messageId, messageIds)
      ))
  }

  // Process inbound emails
  for (const email of inboundEmails) {
    let fromData = null
    let toData = null
    let attachments = []

    try {
      fromData = email.fromData ? JSON.parse(email.fromData) : null
      toData = email.toData ? JSON.parse(email.toData) : null
      attachments = email.attachments ? JSON.parse(email.attachments) : []
    } catch (e) {
      console.error('Failed to parse email data:', e)
    }

    let references: string[] = []
    try {
      references = email.references ? parseReferences(email.references) : []
    } catch (e) {
      console.error('Failed to parse references:', e)
    }

    messages.push({
      id: email.id,
      messageId: email.messageId,
      type: 'inbound',
      subject: email.subject,
      from: fromData?.text || 'Unknown Sender',
      fromName: fromData?.addresses?.[0]?.name || null,
      to: toData?.text || toData?.addresses?.[0]?.address || 'Unknown Recipient',
      receivedAt: email.date,
      sentAt: null,
      content: {
        textBody: email.textBody,
        htmlBody: email.htmlBody,
        attachments: attachments
      },
      addresses: {
        from: fromData,
        to: toData
      },
      metadata: {
        inReplyTo: email.inReplyTo,
        references: references,
        parseSuccess: email.parseSuccess,
        parseError: email.parseError
      },
      isRead: email.isRead || false,
      readAt: email.readAt,
      threadPosition: 0 // Will be set during sorting
    })
  }

  // Process outbound emails
  for (const email of outboundEmails) {
    let toAddresses: string[] = []
    let headers: Record<string, any> = {}
    let attachments: any[] = []

    try {
      toAddresses = email.to ? JSON.parse(email.to) : []
      headers = email.headers ? JSON.parse(email.headers) : {}
      attachments = email.attachments ? JSON.parse(email.attachments) : []
    } catch (e) {
      console.error('Failed to parse sent email data:', e)
    }

    const references: string[] = headers['References'] ? parseReferences(headers['References']) : []

    messages.push({
      id: email.id,
      messageId: email.messageId,
      type: 'outbound',
      subject: email.subject,
      from: email.from,
      fromName: null,
      to: toAddresses.join(', '),
      receivedAt: null,
      sentAt: email.sentAt,
      content: {
        textBody: email.textBody,
        htmlBody: email.htmlBody,
        attachments: attachments
      },
      addresses: {
        from: {
          text: email.from,
          addresses: [{
            name: null,
            address: email.fromAddress
          }]
        },
        to: {
          text: toAddresses.join(', '),
          addresses: toAddresses.map((addr: string) => ({
            name: null,
            address: addr
          }))
        }
      },
      metadata: {
        inReplyTo: headers['In-Reply-To'] || null,
        references: references,
        parseSuccess: true,
        parseError: null
      },
      isRead: true, // Sent emails are always "read"
      readAt: email.sentAt,
      threadPosition: 0 // Will be set during sorting
    })
  }

  // Sort messages chronologically and assign thread positions
  messages.sort((a, b) => {
    const dateA = a.receivedAt || a.sentAt || new Date(0)
    const dateB = b.receivedAt || b.sentAt || new Date(0)
    return new Date(dateA).getTime() - new Date(dateB).getTime()
  })

  // Assign thread positions
  messages.forEach((message, index) => {
    message.threadPosition = index
  })

  return messages
}
