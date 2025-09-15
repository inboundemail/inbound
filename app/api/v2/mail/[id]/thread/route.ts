import { NextRequest, NextResponse } from 'next/server'
import { validateRequest } from '../../../helper/main'
import { db } from '@/lib/db'
import { structuredEmails, sentEmails } from '@/lib/db/schema'
import { eq, and, or, inArray, like } from 'drizzle-orm'

/**
 * GET /api/v2/mail/[id]/thread
 * Gets all emails in a conversation thread for a given email ID
 * Implements advanced threading based on RFC 2822 and modern email client practices
 * Supports both session-based auth and API key auth
 * Has tests? ❌
 * Has logging? ✅
 * Has types? ✅
 */

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
        attachments: Array<{
            filename?: string
            contentType?: string
            size?: number
            contentId?: string
            contentDisposition?: string
        }>
    }
    addresses: {
        from: {
            text: string
            addresses: Array<{
                name: string | null
                address: string | null
            }>
        } | null
        to: {
            text: string
            addresses: Array<{
                name: string | null
                address: string | null
            }>
        } | null
    }
    metadata: {
        inReplyTo: string | null
        references: string[]
        parseSuccess: boolean | null
        parseError: string | null
    }
    isRead: boolean
    readAt: Date | null
}

export interface GetThreadResponse {
    messages: ThreadMessage[]
    totalCount: number
    threadId: string // The root message ID of the thread
}

// Path parameter type for OpenAPI documentation
export interface EmailIdParam {
    id: string // The ID of the email to get the thread for
}

// Error response types for OpenAPI documentation
export interface NotFoundError {
    error: string
    code: 'NOT_FOUND'
    details?: string
}

/**
 * Clean and normalize a message ID by removing angle brackets and whitespace
 */
function cleanMessageId(messageId: string): string {
    if (!messageId) return ''
    return messageId.replace(/[<>]/g, '').trim()
}

/**
 * Normalize subject line for threading by removing common prefixes
 */
function normalizeSubject(subject: string): string {
    if (!subject) return ''
    
    // Remove common reply/forward prefixes (case insensitive)
    let normalized = subject.trim()
    
    // Remove RE:, Re:, R:, FWD:, Fwd:, etc.
    const prefixPattern = /^(re|r|fwd|fw|aw|wg|vs|sv):\s*/i
    while (prefixPattern.test(normalized)) {
        normalized = normalized.replace(prefixPattern, '').trim()
    }
    
    return normalized.toLowerCase()
}

/**
 * Parse references header which can be multi-line and contain multiple message IDs
 */
function parseReferences(referencesStr: string): string[] {
    if (!referencesStr) return []
    
    try {
        // Handle JSON stored references
        if (referencesStr.startsWith('[')) {
            const parsed = JSON.parse(referencesStr)
            if (Array.isArray(parsed)) {
                return parsed.map(cleanMessageId).filter(id => id)
            }
        }
        
        // Handle raw RFC 2822 references (space or newline separated)
        const messageIds = referencesStr
            .replace(/\s+/g, ' ') // Normalize whitespace
            .split(' ')
            .map(cleanMessageId)
            .filter(id => id)
        
        return messageIds
    } catch (e) {
        console.error('Failed to parse references:', e)
        return []
    }
}

/**
 * Get all message IDs that should be considered part of the same thread
 */
async function getThreadMessageIds(userId: string, emailId: string) {
    console.log('🔗 Getting thread message IDs for email:', emailId)
    
    // Get the original email to understand its threading info
    const originalEmail = await db
        .select({
            id: structuredEmails.id,
            messageId: structuredEmails.messageId,
            inReplyTo: structuredEmails.inReplyTo,
            references: structuredEmails.references,
            subject: structuredEmails.subject,
            userId: structuredEmails.userId
        })
        .from(structuredEmails)
        .where(
            and(
                eq(structuredEmails.id, emailId),
                eq(structuredEmails.userId, userId)
            )
        )
        .limit(1)

    if (originalEmail.length === 0) {
        return { messageIds: [], normalizedSubject: '' }
    }

    const original = originalEmail[0]
    const threadMessageIds = new Set<string>()
    
    // Add the current message ID
    if (original.messageId) {
        threadMessageIds.add(cleanMessageId(original.messageId))
    }
    
    // Add inReplyTo if it exists
    if (original.inReplyTo) {
        threadMessageIds.add(cleanMessageId(original.inReplyTo))
    }
    
    // Parse and add all references
    if (original.references) {
        const refs = parseReferences(original.references)
        refs.forEach(ref => threadMessageIds.add(ref))
    }
    
    // Now do recursive lookup to find all related messages
    const processedIds = new Set<string>()
    const toProcess = Array.from(threadMessageIds)
    
    while (toProcess.length > 0) {
        const currentId = toProcess.pop()!
        if (processedIds.has(currentId)) continue
        
        processedIds.add(currentId)
        
        // Find emails that reference this message ID in their references or inReplyTo
        const relatedEmails = await db
            .select({
                messageId: structuredEmails.messageId,
                inReplyTo: structuredEmails.inReplyTo,
                references: structuredEmails.references
            })
            .from(structuredEmails)
            .where(
                and(
                    eq(structuredEmails.userId, userId),
                    or(
                        eq(structuredEmails.messageId, currentId),
                        eq(structuredEmails.inReplyTo, `<${currentId}>`),
                        like(structuredEmails.references, `%${currentId}%`)
                    )
                )
            )
        
        // Find sent emails that reference this message ID
        const relatedSentEmails = await db
            .select({
                messageId: sentEmails.messageId,
                headers: sentEmails.headers
            })
            .from(sentEmails)
            .where(
                and(
                    eq(sentEmails.userId, userId),
                    or(
                        eq(sentEmails.messageId, currentId),
                        like(sentEmails.headers, `%${currentId}%`)
                    )
                )
            )
        
        // Process related emails
        for (const email of relatedEmails) {
            if (email.messageId) {
                const cleanId = cleanMessageId(email.messageId)
                if (!processedIds.has(cleanId)) {
                    threadMessageIds.add(cleanId)
                    toProcess.push(cleanId)
                }
            }
            
            if (email.inReplyTo) {
                const cleanId = cleanMessageId(email.inReplyTo)
                if (!processedIds.has(cleanId)) {
                    threadMessageIds.add(cleanId)
                    toProcess.push(cleanId)
                }
            }
            
            if (email.references) {
                const refs = parseReferences(email.references)
                refs.forEach(ref => {
                    if (!processedIds.has(ref)) {
                        threadMessageIds.add(ref)
                        toProcess.push(ref)
                    }
                })
            }
        }
        
        // Process related sent emails
        for (const email of relatedSentEmails) {
            if (email.messageId) {
                const cleanId = cleanMessageId(email.messageId)
                if (!processedIds.has(cleanId)) {
                    threadMessageIds.add(cleanId)
                    toProcess.push(cleanId)
                }
            }
            
            if (email.headers) {
                try {
                    const headers: Record<string, any> = JSON.parse(email.headers)
                    if (headers['In-Reply-To']) {
                        const cleanId = cleanMessageId(headers['In-Reply-To'])
                        if (!processedIds.has(cleanId)) {
                            threadMessageIds.add(cleanId)
                            toProcess.push(cleanId)
                        }
                    }
                    if (headers['References']) {
                        const refs = parseReferences(headers['References'])
                        refs.forEach(ref => {
                            if (!processedIds.has(ref)) {
                                threadMessageIds.add(ref)
                                toProcess.push(ref)
                            }
                        })
                    }
                } catch (e) {
                    console.error('Failed to parse sent email headers:', e)
                }
            }
        }
    }
    
    const normalizedSubject = normalizeSubject(original.subject || '')
    
    console.log(`🔗 Found ${threadMessageIds.size} message IDs in thread:`, Array.from(threadMessageIds))
    
    return { 
        messageIds: Array.from(threadMessageIds).filter(id => id), 
        normalizedSubject 
    }
}

/**
 * Get email conversation thread
 * @description Retrieve all emails in a conversation thread for a given email ID. Uses RFC 2822 threading with subject-based fallback.
 * @pathParams EmailIdParam
 * @response GetThreadResponse:Complete conversation thread with all messages
 * @add 404:NotFoundError:Email not found or doesn't belong to the user
 * @responseSet auth
 * @auth apikey
 * @tag Mail
 * @openapi
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    console.log('🧵 GET /api/v2/mail/[id]/thread - Starting request')
    
    try {
        console.log('🔐 Validating request authentication')
        const { userId, error } = await validateRequest(request)
        if (!userId) {
            console.log('❌ Authentication failed:', error)
            return NextResponse.json(
                { error: error },
                { status: 401 }
            )
        }
        console.log('✅ Authentication successful for userId:', userId)
        
        const { id } = await params
        console.log('📨 Requested thread for email ID:', id)

        // Validate email ID
        if (!id || typeof id !== 'string') {
            console.log('⚠️ Invalid email ID provided:', id)
            return NextResponse.json(
                { error: 'Valid email ID is required' },
                { status: 400 }
            )
        }

        // Get all message IDs in the thread
        const { messageIds: threadMessageIds, normalizedSubject } = await getThreadMessageIds(userId, id)
        
        if (threadMessageIds.length === 0) {
            console.log('📭 No threading information found, treating as single email')
            threadMessageIds.push(id) // Fallback to just the requested email
        }

        // Fetch all inbound emails in the thread
        console.log('📥 Fetching inbound emails in thread')
        let inboundEmails = await db
            .select()
            .from(structuredEmails)
            .where(
                and(
                    eq(structuredEmails.userId, userId),
                    or(
                        inArray(structuredEmails.messageId, threadMessageIds),
                        inArray(structuredEmails.inReplyTo, threadMessageIds.map(id => `<${id}>`)),
                        eq(structuredEmails.id, id) // Always include the requested email
                    )
                )
            )

        // Fetch all outbound emails in the thread
        console.log('📤 Fetching outbound emails in thread')
        let outboundEmails = await db
            .select()
            .from(sentEmails)
            .where(
                and(
                    eq(sentEmails.userId, userId),
                    or(
                        inArray(sentEmails.messageId, threadMessageIds)
                    )
                )
            )

        // Subject-based fallback threading if we didn't find enough messages
        if (inboundEmails.length + outboundEmails.length <= 1 && normalizedSubject) {
            console.log('🔄 Attempting subject-based threading fallback')
            
            // Find emails with similar subjects
            const subjectInboundEmails = await db
                .select()
                .from(structuredEmails)
                .where(
                    and(
                        eq(structuredEmails.userId, userId),
                        like(structuredEmails.subject, `%${normalizedSubject}%`)
                    )
                )
            
            const subjectOutboundEmails = await db
                .select()
                .from(sentEmails)
                .where(
                    and(
                        eq(sentEmails.userId, userId),
                        like(sentEmails.subject, `%${normalizedSubject}%`)
                    )
                )
            
            // Filter to only include emails with matching normalized subjects
            const filteredInbound = subjectInboundEmails.filter(email => 
                normalizeSubject(email.subject || '') === normalizedSubject
            )
            
            const filteredOutbound = subjectOutboundEmails.filter(email => 
                normalizeSubject(email.subject || '') === normalizedSubject
            )
            
            if (filteredInbound.length > inboundEmails.length) {
                console.log(`📧 Subject threading found ${filteredInbound.length} additional inbound emails`)
                inboundEmails = filteredInbound
            }
            
            if (filteredOutbound.length > outboundEmails.length) {
                console.log(`📤 Subject threading found ${filteredOutbound.length} additional outbound emails`)
                outboundEmails = filteredOutbound
            }
        }

        console.log(`📊 Found ${inboundEmails.length} inbound and ${outboundEmails.length} outbound emails`)

        // Convert to thread messages format
        const messages: ThreadMessage[] = []

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
                readAt: email.readAt
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
                readAt: email.sentAt
            })
        }

        // Sort messages by date (oldest first)
        messages.sort((a, b) => {
            const dateA = a.receivedAt || a.sentAt || new Date(0)
            const dateB = b.receivedAt || b.sentAt || new Date(0)
            return new Date(dateA).getTime() - new Date(dateB).getTime()
        })

        // Determine thread ID (usually the first message's ID or the normalized subject)
        const threadId = messages.length > 0 
            ? (messages[0].messageId || messages[0].id) 
            : (normalizedSubject || id)

        console.log(`✅ Successfully retrieved thread with ${messages.length} messages`)
        return NextResponse.json({
            messages,
            totalCount: messages.length,
            threadId
        })

    } catch (error) {
        console.error('💥 Unexpected error in GET /api/v2/mail/[id]/thread:', error)
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        )
    }
} 