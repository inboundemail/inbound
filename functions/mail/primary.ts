"use server"

import { getAllEmails, getEmailsCount } from './queries'
import { db } from '@/lib/db'
import { structuredEmails, attachments, endpoints, emailAddresses, sesEvents } from '@/lib/db/schema'
import { eq, and, desc, or, like, sql, inArray, gte } from 'drizzle-orm'
import { sendEmail, formatEmailDate } from '@/lib/email-services/send-email'
import { sanitizeHtml } from '@/lib/email-management/email-parser'

// ============================================================================
// EMAIL FUNCTIONS
// ============================================================================

/**
 * Get all emails with search and pagination support
 */
export async function getAllEmails(userId: string, options?: {
    limit?: number
    offset?: number
    searchQuery?: string
    statusFilter?: 'all' | 'processed' | 'failed'
    domainFilter?: string
    timeRange?: '24h' | '7d' | '30d' | '90d'
    includeArchived?: boolean
}) {
    try {
        const {
            limit = 50,
            offset = 0,
            searchQuery = '',
            statusFilter = 'all',
            domainFilter = 'all',
            timeRange = '30d',
            includeArchived = false
        } = options || {}

        // Build where conditions
        let whereConditions = [eq(structuredEmails.userId, userId)]

        // Exclude archived emails by default
        if (!includeArchived) {
            whereConditions.push(eq(structuredEmails.isArchived, false))
        }

        // Add status filter
        if (statusFilter === 'failed') {
            whereConditions.push(eq(structuredEmails.parseSuccess, false))
        } else if (statusFilter === 'processed') {
            whereConditions.push(eq(structuredEmails.parseSuccess, true))
        }

        // Add time range filter
        if (timeRange !== '90d') {
            let timeThreshold: Date
            const now = new Date()
            switch (timeRange) {
                case '24h':
                    timeThreshold = new Date(now.getTime() - 24 * 60 * 60 * 1000)
                    break
                case '7d':
                    timeThreshold = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
                    break
                case '30d':
                    timeThreshold = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
                    break
                default:
                    timeThreshold = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
            }
            whereConditions.push(gte(structuredEmails.createdAt, timeThreshold))
        }

        // Add domain filter
        if (domainFilter !== 'all') {
            whereConditions.push(
                sql`${structuredEmails.toData}::jsonb->'addresses'->0->>'address' LIKE ${`%@${domainFilter}`}`
            )
        }

        // Add search query (search in subject, from, to)
        if (searchQuery.trim()) {
            const searchPattern = `%${searchQuery.trim()}%`
            whereConditions.push(
                sql`(${structuredEmails.subject} ILIKE ${searchPattern} OR ${structuredEmails.fromData}::text ILIKE ${searchPattern} OR ${structuredEmails.toData}::text ILIKE ${searchPattern})`
            )
        }

        // Get total count
        const [{ count }] = await db
            .select({ count: sql<number>`count(*)` })
            .from(structuredEmails)
            .where(and(...whereConditions))

        // Get emails with pagination
        const emails = await db
            .select({
                id: structuredEmails.id,
                emailId: structuredEmails.emailId,
                messageId: structuredEmails.messageId,
                subject: structuredEmails.subject,
                date: structuredEmails.date,
                fromData: structuredEmails.fromData,
                toData: structuredEmails.toData,
                textBody: structuredEmails.textBody,
                htmlBody: structuredEmails.htmlBody,
                attachments: structuredEmails.attachments,
                parseSuccess: structuredEmails.parseSuccess,
                parseError: structuredEmails.parseError,
                isRead: structuredEmails.isRead,
                readAt: structuredEmails.readAt,
                isArchived: structuredEmails.isArchived,
                archivedAt: structuredEmails.archivedAt,
                createdAt: structuredEmails.createdAt
            })
            .from(structuredEmails)
            .where(and(...whereConditions))
            .orderBy(desc(structuredEmails.createdAt))
            .limit(limit)
            .offset(offset)

        // Transform emails for response
        const transformedEmails = emails.map(email => {
            // Parse JSON fields
            let parsedFromData = null
            if (email.fromData) {
                try {
                    parsedFromData = JSON.parse(email.fromData)
                } catch (e) {
                    console.error('Failed to parse fromData:', e)
                }
            }

            let parsedToData = null
            if (email.toData) {
                try {
                    parsedToData = JSON.parse(email.toData)
                } catch (e) {
                    console.error('Failed to parse toData:', e)
                }
            }

            let parsedAttachments = []
            if (email.attachments) {
                try {
                    parsedAttachments = JSON.parse(email.attachments)
                } catch (e) {
                    console.error('Failed to parse attachments:', e)
                }
            }

            // Extract preview from text body or HTML body
            let preview = ''
            if (email.textBody) {
                preview = email.textBody.substring(0, 200)
            } else if (email.htmlBody) {
                // Strip HTML tags for preview
                preview = email.htmlBody.replace(/<[^>]*>/g, '').substring(0, 200)
            }

            return {
                id: email.id,
                emailId: email.emailId,
                messageId: email.messageId,
                subject: email.subject || 'No Subject',
                from: parsedFromData?.addresses?.[0]?.address || 'unknown',
                fromName: parsedFromData?.addresses?.[0]?.name || null,
                recipient: parsedToData?.addresses?.[0]?.address || 'unknown',
                preview,
                receivedAt: email.date || email.createdAt,
                isRead: email.isRead || false,
                readAt: email.readAt,
                isArchived: email.isArchived || false,
                archivedAt: email.archivedAt,
                hasAttachments: parsedAttachments.length > 0,
                attachmentCount: parsedAttachments.length,
                parseSuccess: email.parseSuccess,
                parseError: email.parseError,
                createdAt: email.createdAt
            }
        })

        // Get unique domains for filter
        const uniqueDomainsResult = await db
            .select({
                domain: sql<string>`DISTINCT SPLIT_PART((${structuredEmails.toData}::jsonb->'addresses'->0->>'address'), '@', 2)`
            })
            .from(structuredEmails)
            .where(
                and(
                    eq(structuredEmails.userId, userId),
                    sql`${structuredEmails.toData}::jsonb->'addresses'->0->>'address' IS NOT NULL`
                )
            )

        const uniqueDomains = uniqueDomainsResult
            .map(row => row.domain)
            .filter(domain => domain && domain.trim() !== '')

        return {
            success: true,
            data: {
                emails: transformedEmails,
                pagination: {
                    total: count,
                    limit,
                    offset,
                    hasMore: offset + limit < count
                },
                filters: {
                    uniqueDomains
                }
            }
        }

    } catch (error) {
        console.error('Error fetching emails:', error)
        return { error: 'Failed to fetch emails' }
    }
}

/**
 * Get a complete email object by ID
 */
export async function getEmail(userId: string, emailId: string) {
    try {
        if (!emailId) {
            return { error: 'Email ID is required' }
        }

        // Fetch email details with SES event data
        const emailDetails = await db
            .select({
                // Structured email details
                id: structuredEmails.id,
                emailId: structuredEmails.emailId,
                messageId: structuredEmails.messageId,
                subject: structuredEmails.subject,
                date: structuredEmails.date,
                fromData: structuredEmails.fromData,
                toData: structuredEmails.toData,
                ccData: structuredEmails.ccData,
                bccData: structuredEmails.bccData,
                replyToData: structuredEmails.replyToData,
                inReplyTo: structuredEmails.inReplyTo,
                references: structuredEmails.references,
                textBody: structuredEmails.textBody,
                htmlBody: structuredEmails.htmlBody,
                rawContent: structuredEmails.rawContent,
                attachments: structuredEmails.attachments,
                headers: structuredEmails.headers,
                priority: structuredEmails.priority,
                parseSuccess: structuredEmails.parseSuccess,
                parseError: structuredEmails.parseError,
                isRead: structuredEmails.isRead,
                readAt: structuredEmails.readAt,
                userId: structuredEmails.userId,
                sesEventId: structuredEmails.sesEventId,
                createdAt: structuredEmails.createdAt,
                updatedAt: structuredEmails.updatedAt,
                
                // SES event details
                emailContent: sesEvents.emailContent,
                spamVerdict: sesEvents.spamVerdict,
                virusVerdict: sesEvents.virusVerdict,
                spfVerdict: sesEvents.spfVerdict,
                dkimVerdict: sesEvents.dkimVerdict,
                dmarcVerdict: sesEvents.dmarcVerdict,
                actionType: sesEvents.actionType,
                s3BucketName: sesEvents.s3BucketName,
                s3ObjectKey: sesEvents.s3ObjectKey,
                s3ContentFetched: sesEvents.s3ContentFetched,
                s3ContentSize: sesEvents.s3ContentSize,
                s3Error: sesEvents.s3Error,
                commonHeaders: sesEvents.commonHeaders,
                processingTimeMillis: sesEvents.processingTimeMillis,
                timestamp: sesEvents.timestamp,
                receiptTimestamp: sesEvents.receiptTimestamp,
            })
            .from(structuredEmails)
            .leftJoin(sesEvents, eq(structuredEmails.sesEventId, sesEvents.id))
            .where(
                and(
                    eq(structuredEmails.id, emailId),
                    eq(structuredEmails.userId, userId)
                )
            )
            .limit(1)

        if (emailDetails.length === 0) {
            return { error: 'Email not found' }
        }

        const email = emailDetails[0]

        // Parse JSON fields
        const parseJsonField = (field: string | null) => {
            if (!field) return null
            try {
                return JSON.parse(field)
            } catch (e) {
                console.error(`Failed to parse JSON field:`, e)
                return null
            }
        }

        const parsedFromData = parseJsonField(email.fromData)
        const parsedToData = parseJsonField(email.toData)
        const parsedCcData = parseJsonField(email.ccData)
        const parsedBccData = parseJsonField(email.bccData)
        const parsedReplyToData = parseJsonField(email.replyToData)
        const parsedAttachments = parseJsonField(email.attachments) || []
        const parsedHeaders = parseJsonField(email.headers) || {}
        const parsedReferences = parseJsonField(email.references) || []
        const parsedCommonHeaders = parseJsonField(email.commonHeaders)

        // Sanitize HTML content
        const sanitizedHtmlBody = email.htmlBody ? sanitizeHtml(email.htmlBody) : null

        // Extract addresses for backward compatibility
        const recipient = parsedToData?.addresses?.[0]?.address || 'unknown'
        const fromAddress = parsedFromData?.addresses?.[0]?.address || 'unknown'

        // Mark email as read if not already read
        if (!email.isRead) {
            await db
                .update(structuredEmails)
                .set({
                    isRead: true,
                    readAt: new Date(),
                    updatedAt: new Date()
                })
                .where(eq(structuredEmails.id, emailId))
        }

        // Format the complete email response
        const response = {
            id: email.id,
            emailId: email.emailId,
            messageId: email.messageId,
            subject: email.subject,
            from: fromAddress,
            fromName: parsedFromData?.addresses?.[0]?.name || null,
            to: parsedToData?.text || '',
            cc: parsedCcData?.text || null,
            bcc: parsedBccData?.text || null,
            replyTo: parsedReplyToData?.text || null,
            recipient,
            receivedAt: email.date,
            isRead: true, // Mark as read since we're viewing it
            readAt: email.readAt || new Date(),
            
            // Email content
            content: {
                textBody: email.textBody,
                htmlBody: sanitizedHtmlBody,
                rawContent: email.rawContent,
                attachments: parsedAttachments,
                headers: parsedHeaders
            },
            
            // Parsed data
            addresses: {
                from: parsedFromData,
                to: parsedToData,
                cc: parsedCcData,
                bcc: parsedBccData,
                replyTo: parsedReplyToData
            },
            
            // Email metadata
            metadata: {
                inReplyTo: email.inReplyTo,
                references: parsedReferences,
                priority: email.priority,
                parseSuccess: email.parseSuccess,
                parseError: email.parseError,
                hasAttachments: parsedAttachments.length > 0,
                attachmentCount: parsedAttachments.length,
                hasTextBody: !!email.textBody,
                hasHtmlBody: !!email.htmlBody
            },
            
            // Security and delivery info
            security: {
                spf: email.spfVerdict || 'UNKNOWN',
                dkim: email.dkimVerdict || 'UNKNOWN',
                dmarc: email.dmarcVerdict || 'UNKNOWN',
                spam: email.spamVerdict || 'UNKNOWN',
                virus: email.virusVerdict || 'UNKNOWN'
            },
            
            // Processing info
            processing: {
                processingTimeMs: email.processingTimeMillis,
                timestamp: email.timestamp,
                receiptTimestamp: email.receiptTimestamp,
                actionType: email.actionType,
                s3Info: {
                    bucketName: email.s3BucketName,
                    objectKey: email.s3ObjectKey,
                    contentFetched: email.s3ContentFetched,
                    contentSize: email.s3ContentSize,
                    error: email.s3Error
                },
                commonHeaders: parsedCommonHeaders
            },
            
            // Timestamps
            createdAt: email.createdAt,
            updatedAt: email.updatedAt
        }

        return { success: true, data: response }

    } catch (error) {
        console.error('Error fetching email:', error)
        return { error: 'Failed to fetch email' }
    }
}

/**
 * Reply to an email
 */
export async function replyToEmail(userId: string, emailId: string, replyData: {
    from: string  // The sender address for the reply (must be a verified domain)
    to?: string   // Optional override for recipient (defaults to original sender)
    subject?: string  // Optional override for subject (defaults to "Re: original subject")
    textBody?: string
    htmlBody?: string
    attachments?: Array<{
        filename: string
        contentType: string
        content: string // base64 encoded
    }>
    includeOriginal?: boolean  // Whether to quote the original message (default: true)
}) {
    try {
        if (!emailId) {
            return { error: 'Email ID is required' }
        }

        // Verify the original email exists and belongs to the user
        const originalEmail = await db
            .select({
                id: structuredEmails.id,
                messageId: structuredEmails.messageId,
                subject: structuredEmails.subject,
                fromData: structuredEmails.fromData,
                toData: structuredEmails.toData,
                textBody: structuredEmails.textBody,
                htmlBody: structuredEmails.htmlBody,
                date: structuredEmails.date,
                references: structuredEmails.references
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
            return { error: 'Original email not found' }
        }

        const original = originalEmail[0]

        // Parse original from data to get sender address
        let originalFromData = null
        if (original.fromData) {
            try {
                originalFromData = JSON.parse(original.fromData)
            } catch (e) {
                console.error('Failed to parse original fromData:', e)
            }
        }

        // Determine reply recipient (use the original sender or override)
        const originalSenderAddress = originalFromData?.addresses?.[0]?.address
        if (!originalSenderAddress && !replyData.to) {
            return { error: 'Cannot determine original sender address and no recipient provided' }
        }

        const replyTo = replyData.to || originalSenderAddress
        const includeOriginal = replyData.includeOriginal !== false  // Default to true

        // Build subject (add "Re: " prefix if not present)
        let subject = replyData.subject
        if (!subject) {
            const originalSubject = original.subject || 'No Subject'
            subject = originalSubject.startsWith('Re: ') ? originalSubject : `Re: ${originalSubject}`
        } else if (!subject.startsWith('Re: ')) {
            subject = `Re: ${subject}`
        }

        // Build threading headers
        const inReplyTo = original.messageId ? `<${original.messageId}>` : undefined
        let references: string[] = []
        
        // Parse existing references
        if (original.references) {
            try {
                const parsedRefs = JSON.parse(original.references)
                if (Array.isArray(parsedRefs)) {
                    references = parsedRefs
                }
            } catch (e) {
                console.error('Failed to parse references:', e)
            }
        }
        
        // Add the original message ID to references
        if (original.messageId) {
            references.push(`<${original.messageId}>`)
        }

        // Build quoted content
        let finalTextBody = replyData.textBody || ''
        let finalHtmlBody = replyData.htmlBody || ''

        if (includeOriginal) {
            // Add quoted original message to text body
            if (original.textBody) {
                const fromText = originalFromData?.text || 'Unknown Sender'
                const dateStr = original.date ? formatEmailDate(new Date(original.date)) : 'Unknown Date'
                const quoteHeader = `\n\nOn ${dateStr}, ${fromText} wrote:\n`
                const quotedLines = original.textBody.split('\n').map((line: string) => {
                    return line.trim() === '' ? '' : `> ${line}`
                })
                finalTextBody += quoteHeader + quotedLines.join('\n')
            }

            // Add quoted original message to HTML body
            if (original.htmlBody && finalHtmlBody) {
                const fromText = originalFromData?.text || 'Unknown Sender'
                const dateStr = original.date ? formatEmailDate(new Date(original.date)) : 'Unknown Date'
                
                finalHtmlBody += `
                    <br><br>
                    <div style="border-left: 2px solid #ccc; padding-left: 10px; margin-left: 10px; color: #666; font-size: 13px;">
                        <p style="margin: 0 0 10px 0; font-weight: normal;">On ${dateStr}, ${fromText} wrote:</p>
                        <div style="margin: 0;">${original.htmlBody}</div>
                    </div>
                `
            }
        }

        // Send the email using the shared service
        const result = await sendEmail({
            userId,
            from: replyData.from,
            to: replyTo,
            subject,
            textBody: finalTextBody,
            htmlBody: finalHtmlBody,
            attachments: replyData.attachments,
            inReplyTo,
            references
        })

        if (!result.success) {
            return { error: result.error }
        }

        return {
            success: true,
            data: {
                id: result.data?.id,
                messageId: result.data?.messageId,
                originalEmailId: emailId,
                replyTo,
                subject,
                threading: {
                    inReplyTo,
                    references
                },
                includeOriginal
            }
        }

    } catch (error) {
        console.error('Error replying to email:', error)
        return { error: 'Failed to reply to email' }
    }
}

/**
 * Update email properties (read status, archive status, etc.)
 */
export async function updateEmail(userId: string, emailId: string, updates: {
    isRead?: boolean
    isArchived?: boolean
}) {
    try {
        console.log('📝 updateEmail - Updating email:', emailId, 'for user:', userId, 'with updates:', updates)

        // Prepare update data
        const updateData: any = {
            updatedAt: new Date()
        }

        if (updates.isRead !== undefined) {
            updateData.isRead = updates.isRead
            updateData.readAt = updates.isRead ? new Date() : null
        }

        if (updates.isArchived !== undefined) {
            updateData.isArchived = updates.isArchived
            updateData.archivedAt = updates.isArchived ? new Date() : null
        }

        // Update the email
        const [updatedEmail] = await db
            .update(structuredEmails)
            .set(updateData)
            .where(
                and(
                    eq(structuredEmails.id, emailId),
                    eq(structuredEmails.userId, userId)
                )
            )
            .returning({
                id: structuredEmails.id,
                isRead: structuredEmails.isRead,
                isArchived: structuredEmails.isArchived,
                readAt: structuredEmails.readAt,
                archivedAt: structuredEmails.archivedAt
            })

        if (!updatedEmail) {
            return { error: 'Email not found or access denied' }
        }

        console.log('✅ updateEmail - Successfully updated email:', emailId)
        return { 
            success: true, 
            data: updatedEmail
        }

    } catch (error) {
        console.error('❌ updateEmail - Error updating email:', error)
        return { error: 'Failed to update email' }
    }
}

/**
 * Bulk update emails (archive, mark as read, etc.)
 */
export async function bulkUpdateEmails(userId: string, emailIds: string[], updates: {
    isRead?: boolean
    isArchived?: boolean
}) {
    try {
        console.log('📝 bulkUpdateEmails - Updating', emailIds.length, 'emails for user:', userId, 'with updates:', updates)

        if (emailIds.length === 0) {
            return { error: 'No email IDs provided' }
        }

        if (emailIds.length > 100) {
            return { error: 'Cannot update more than 100 emails at once' }
        }

        // Prepare update data
        const updateData: any = {
            updatedAt: new Date()
        }

        if (updates.isRead !== undefined) {
            updateData.isRead = updates.isRead
            updateData.readAt = updates.isRead ? new Date() : null
        }

        if (updates.isArchived !== undefined) {
            updateData.isArchived = updates.isArchived
            updateData.archivedAt = updates.isArchived ? new Date() : null
        }

        // Update the emails using inArray for better type safety
        const updatedEmails = await db
            .update(structuredEmails)
            .set(updateData)
            .where(
                and(
                    eq(structuredEmails.userId, userId),
                    inArray(structuredEmails.id, emailIds)
                )
            )
            .returning({
                id: structuredEmails.id,
                isRead: structuredEmails.isRead,
                isArchived: structuredEmails.isArchived
            })

        console.log('✅ bulkUpdateEmails - Successfully updated', updatedEmails.length, 'emails')
        return { 
            success: true, 
            data: {
                updatedCount: updatedEmails.length,
                emails: updatedEmails
            }
        }

    } catch (error) {
        console.error('❌ bulkUpdateEmails - Error updating emails:', error)
        return { error: 'Failed to update emails' }
    }
}
