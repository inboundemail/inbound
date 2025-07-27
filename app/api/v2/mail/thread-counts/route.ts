import { NextRequest, NextResponse } from 'next/server'
import { validateRequest } from '../../helper/main'
import { db } from '@/lib/db'
import { structuredEmails, sentEmails } from '@/lib/db/schema'
import { eq, and, or, inArray, like, sql } from 'drizzle-orm'

/**
 * POST /api/v2/mail/thread-counts
 * Gets thread counts for multiple emails in batch
 * Efficiently calculates conversation thread sizes for inbox listing
 * Supports both session-based auth and API key auth
 * Has tests? ❌
 * Has logging? ✅
 * Has types? ✅
 */

interface ThreadCountsRequest {
    emailIds: string[]
}

interface ThreadCountResult {
    emailId: string
    threadCount: number
    hasThread: boolean // true if thread count > 1
}

interface ThreadCountsResponse {
    success: boolean
    data: ThreadCountResult[]
    error?: string
}

/**
 * Helper function to parse and clean message IDs
 */
function cleanMessageId(messageId: string): string {
    return messageId.replace(/[<>]/g, '').trim()
}

/**
 * Helper function to parse References header
 */
function parseReferences(referencesHeader: string): string[] {
    if (!referencesHeader) return []
    
    // Split by whitespace and newlines, then clean each ID
    return referencesHeader
        .split(/\s+/)
        .map(ref => cleanMessageId(ref))
        .filter(ref => ref.length > 0)
}

/**
 * Get all related message IDs for threading
 */
function getAllThreadMessageIds(email: any): Set<string> {
    const messageIds = new Set<string>()
    
    // Add this email's message ID
    if (email.messageId) {
        messageIds.add(cleanMessageId(email.messageId))
    }
    
    // Add In-Reply-To if available
    try {
        const headers = email.headers ? JSON.parse(email.headers) : {}
        if (headers['In-Reply-To']) {
            messageIds.add(cleanMessageId(headers['In-Reply-To']))
        }
        
        // Add all References
        if (headers['References']) {
            const refs = parseReferences(headers['References'])
            refs.forEach(ref => messageIds.add(ref))
        }
    } catch (e) {
        // Ignore parsing errors
    }
    
    // Add from direct fields
    if (email.inReplyTo) {
        messageIds.add(cleanMessageId(email.inReplyTo))
    }
    
    if (email.references) {
        try {
            const refs = parseReferences(email.references)
            refs.forEach(ref => messageIds.add(ref))
        } catch (e) {
            // Ignore parsing errors
        }
    }
    
    return messageIds
}

export async function POST(request: NextRequest) {
    try {
        const { userId, error } = await validateRequest(request)
        
        if (error) {
            return NextResponse.json(
                { success: false, error },
                { status: 401 }
            )
        }

        const body: ThreadCountsRequest = await request.json()
        
        if (!body.emailIds || !Array.isArray(body.emailIds)) {
            return NextResponse.json(
                { success: false, error: 'emailIds array is required' },
                { status: 400 }
            )
        }

        // Batch fetch all requested emails
        const emails = await db
            .select({
                id: structuredEmails.id,
                messageId: structuredEmails.messageId,
                inReplyTo: structuredEmails.inReplyTo,
                references: structuredEmails.references,
                headers: structuredEmails.headers,
                subject: structuredEmails.subject
            })
            .from(structuredEmails)
            .where(
                and(
                    eq(structuredEmails.userId, userId!),
                    inArray(structuredEmails.id, body.emailIds)
                )
            )

        const results: ThreadCountResult[] = []

        // Process each email to find its thread count
        for (const email of emails) {
            try {
                // Get all potential message IDs for this thread
                const threadMessageIds = getAllThreadMessageIds(email)
                
                if (threadMessageIds.size === 0) {
                    // No threading info, it's a single message
                    results.push({
                        emailId: email.id,
                        threadCount: 1,
                        hasThread: false
                    })
                    continue
                }

                // Convert Set to Array for database query
                const messageIdArray = Array.from(threadMessageIds)

                // Count related emails in structuredEmails
                const [inboundCountResult] = await db
                    .select({ count: sql<number>`count(*)` })
                    .from(structuredEmails)
                    .where(
                        and(
                            eq(structuredEmails.userId, userId!),
                            or(
                                inArray(structuredEmails.messageId, messageIdArray),
                                inArray(structuredEmails.inReplyTo, messageIdArray),
                                ...messageIdArray.map(id => 
                                    like(structuredEmails.references, `%${id}%`)
                                )
                            )
                        )
                    )

                // Count related emails in sentEmails  
                const [outboundCountResult] = await db
                    .select({ count: sql<number>`count(*)` })
                    .from(sentEmails)
                    .where(
                        and(
                            eq(sentEmails.userId, userId!),
                            or(
                                ...messageIdArray.map(id => 
                                    like(sentEmails.headers, `%${id}%`)
                                )
                            )
                        )
                    )

                // Also try subject-based fallback for better threading
                let subjectCountResult = { count: 0 }
                if (email.subject) {
                    // Clean subject (remove Re:, Fwd:, etc.)
                    const cleanSubject = email.subject
                        .replace(/^(re|fwd?|fw):\s*/gi, '')
                        .trim()
                    
                    if (cleanSubject.length > 3) {
                        const [subjectResult] = await db
                            .select({ count: sql<number>`count(*)` })
                            .from(structuredEmails)
                            .where(
                                and(
                                    eq(structuredEmails.userId, userId!),
                                    like(structuredEmails.subject, `%${cleanSubject}%`)
                                )
                            )
                        subjectCountResult = subjectResult
                    }
                }

                // Use the highest count (header-based or subject-based)
                const headerBasedCount = (inboundCountResult?.count || 0) + (outboundCountResult?.count || 0)
                const finalCount = Math.max(headerBasedCount, subjectCountResult.count, 1)

                results.push({
                    emailId: email.id,
                    threadCount: finalCount,
                    hasThread: finalCount > 1
                })

            } catch (error) {
                console.error(`Error calculating thread count for email ${email.id}:`, error)
                // Default to single message on error
                results.push({
                    emailId: email.id,
                    threadCount: 1,
                    hasThread: false
                })
            }
        }

        // Add results for any emails that weren't found (shouldn't happen, but be safe)
        const foundEmailIds = new Set(results.map(r => r.emailId))
        for (const emailId of body.emailIds) {
            if (!foundEmailIds.has(emailId)) {
                results.push({
                    emailId,
                    threadCount: 1,
                    hasThread: false
                })
            }
        }

        console.log(`📧 Thread counts calculated for ${results.length} emails for user ${userId}`)

        return NextResponse.json(
            { 
                success: true, 
                data: results 
            }
        )

    } catch (error) {
        console.error('Thread counts API error:', error)
        return NextResponse.json(
            { 
                success: false, 
                error: 'Internal server error' 
            },
            { status: 500 }
        )
    }
} 