import { NextRequest, NextResponse } from 'next/server'
import { validateRequest } from '../../helper/main'
import { processAttachments, attachmentsToStorageFormat, type AttachmentInput } from '../../helper/attachment-processor'
import { db } from '@/lib/db'
import { scheduledEmails, emailDomains, SCHEDULED_EMAIL_STATUS } from '@/lib/db/schema'
import { eq, and, desc, count, lte } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { canUserSendFromEmail, extractEmailAddress, extractDomain } from '@/lib/email-management/agent-email-helper'
import { parseScheduledAt, validateScheduledDate, formatScheduledDate } from '@/lib/utils/date-parser'

/**
 * POST /api/v2/emails/schedule
 * Schedule an email to be sent at a future time (Resend-compatible)
 * Supports both session-based auth and API key auth
 * Has tests? ❌ (TODO)
 * Has logging? ✅
 * Has types? ✅
 */

// POST /api/v2/emails/schedule types
export interface PostScheduleEmailRequest {
    from: string // Supports both "email@domain.com" and "Display Name <email@domain.com>" formats
    to: string | string[]
    subject: string
    bcc?: string | string[]
    cc?: string | string[]
    reply_to?: string | string[] // snake_case (legacy)
    replyTo?: string | string[]  // camelCase (Resend-compatible)
    html?: string
    text?: string
    headers?: Record<string, string>
    attachments?: AttachmentInput[]
    tags?: Array<{  // Resend-compatible tags
        name: string
        value: string
    }>
    scheduled_at: string // ISO 8601 or natural language ("in 1 hour", "tomorrow at 9am")
    timezone?: string    // User's timezone for natural language parsing (defaults to UTC)
}

export interface PostScheduleEmailResponse {
    id: string
    scheduled_at: string // Normalized ISO 8601 timestamp
    status: 'scheduled'
    timezone: string
}

// GET /api/v2/emails/schedule types
export interface GetScheduledEmailsRequest {
    limit?: number
    offset?: number
    status?: string // Filter by status
}

export interface ScheduledEmailItem {
    id: string
    from: string
    to: string[]
    subject: string
    scheduled_at: string
    status: string
    timezone: string
    created_at: string
    attempts: number
    last_error?: string
}

export interface GetScheduledEmailsResponse {
    data: ScheduledEmailItem[]
    pagination: { limit: number; offset: number; total: number; hasMore: boolean }
}

// Helper functions
function toArray(value: string | string[] | undefined): string[] {
    if (!value) return []
    return Array.isArray(value) ? value : [value]
}

function parseEmailWithName(emailString: string): { email: string; name?: string } {
    const match = emailString.match(/^(.+?)\s*<([^>]+)>$/)
    if (match) {
        return {
            name: match[1].replace(/^["']|["']$/g, '').trim(),
            email: match[2].trim()
        }
    }
    return { email: emailString.trim() }
}

export async function POST(request: NextRequest) {
    console.log('⏰ POST /api/v2/emails/schedule - Starting request')
    
    try {
        console.log('🔐 Validating request authentication')
        const { userId, error } = await validateRequest(request)
        if (!userId) {
            console.log('❌ Authentication failed:', error)
            return NextResponse.json({ error }, { status: 401 })
        }
        console.log('✅ Authentication successful for userId:', userId)

        // Parse request body
        const body: PostScheduleEmailRequest = await request.json()
        console.log('📧 Scheduling email request:', {
            from: body.from,
            to: Array.isArray(body.to) ? body.to.length + ' recipients' : '1 recipient',
            subject: body.subject,
            scheduled_at: body.scheduled_at,
            timezone: body.timezone || 'UTC',
            hasAttachments: body.attachments && body.attachments.length > 0
        })

        // Validate required fields
        if (!body.from || !body.to || !body.subject || !body.scheduled_at) {
            return NextResponse.json(
                { error: 'Missing required fields: from, to, subject, scheduled_at' },
                { status: 400 }
            )
        }

        // Parse and validate scheduled_at
        console.log('🕐 Parsing scheduled_at:', body.scheduled_at)
        const parsedDate = parseScheduledAt(body.scheduled_at, body.timezone || 'UTC')
        if (!parsedDate.isValid) {
            console.log('❌ Invalid scheduled_at:', parsedDate.error)
            return NextResponse.json(
                { error: parsedDate.error },
                { status: 400 }
            )
        }

        // Validate that the date is in the future
        const dateValidation = validateScheduledDate(parsedDate.date)
        if (!dateValidation.isValid) {
            console.log('❌ Invalid schedule time:', dateValidation.error)
            return NextResponse.json(
                { error: dateValidation.error },
                { status: 400 }
            )
        }

        console.log('✅ Parsed scheduled_at:', formatScheduledDate(parsedDate.date))

        // Parse from address and validate domain ownership
        const fromParsed = parseEmailWithName(body.from)
        const fromAddress = fromParsed.email
        const fromDomain = extractDomain(body.from)

        console.log('📧 Sender details:', { from: body.from, address: fromAddress, domain: fromDomain })

        // Check if this is the special agent@inbnd.dev email (allowed for all users)
        const { isAgentEmail } = canUserSendFromEmail(body.from)
        
        if (isAgentEmail) {
            console.log('✅ Using agent@inbnd.dev - allowed for all users')
        } else {
            // Verify sender domain ownership for non-agent emails
            console.log('🔍 Verifying domain ownership for:', fromDomain)
            const userDomain = await db
                .select()
                .from(emailDomains)
                .where(
                    and(
                        eq(emailDomains.userId, userId),
                        eq(emailDomains.domain, fromDomain),
                        eq(emailDomains.status, 'verified')
                    )
                )
                .limit(1)

            if (userDomain.length === 0) {
                console.log('❌ User does not own the sender domain:', fromDomain)
                return NextResponse.json(
                    { error: `You don't have permission to send from domain: ${fromDomain}` },
                    { status: 403 }
                )
            }

            console.log('✅ Domain ownership verified')
        }

        // Process email addresses
        const toAddresses = toArray(body.to)
        const ccAddresses = toArray(body.cc || body.reply_to)
        const bccAddresses = toArray(body.bcc)
        const replyToAddresses = toArray(body.replyTo || body.reply_to)

        // Validate email addresses
        const allAddresses = [...toAddresses, ...ccAddresses, ...bccAddresses, ...replyToAddresses]
        for (const email of allAddresses) {
            const cleanEmail = extractEmailAddress(email)
            if (!cleanEmail || !cleanEmail.includes('@')) {
                return NextResponse.json(
                    { error: `Invalid email address: ${email}` },
                    { status: 400 }
                )
            }
        }

        // Process attachments if present
        let processedAttachments: any[] = []
        if (body.attachments && body.attachments.length > 0) {
            console.log('📎 Processing attachments for scheduled email')
            try {
                processedAttachments = await processAttachments(body.attachments)
                console.log('✅ Processed attachments:', processedAttachments.length)
            } catch (attachmentError) {
                console.log('❌ Attachment processing failed:', attachmentError)
                return NextResponse.json(
                    { error: `Attachment processing failed: ${attachmentError instanceof Error ? attachmentError.message : 'Unknown error'}` },
                    { status: 400 }
                )
            }
        }

        // Check for idempotency key
        const idempotencyKey = request.headers.get('Idempotency-Key')
        if (idempotencyKey) {
            console.log('🔑 Checking idempotency key:', idempotencyKey)
            const existingScheduled = await db
                .select()
                .from(scheduledEmails)
                .where(and(
                    eq(scheduledEmails.userId, userId),
                    eq(scheduledEmails.idempotencyKey, idempotencyKey)
                ))
                .limit(1)

            if (existingScheduled.length > 0) {
                const existing = existingScheduled[0]
                console.log('✅ Returning existing scheduled email for idempotency key')
                return NextResponse.json({
                    id: existing.id,
                    scheduled_at: formatScheduledDate(existing.scheduledAt),
                    status: existing.status,
                    timezone: existing.timezone || 'UTC'
                })
            }
        }

        // Create scheduled email record
        const scheduledEmailId = nanoid()
        console.log('💾 Creating scheduled email record:', scheduledEmailId)

        const scheduledEmailData = {
            id: scheduledEmailId,
            userId,
            scheduledAt: parsedDate.date,
            timezone: parsedDate.timezone,
            status: SCHEDULED_EMAIL_STATUS.SCHEDULED,
            fromAddress: body.from,
            fromDomain,
            toAddresses: JSON.stringify(toAddresses),
            ccAddresses: ccAddresses.length > 0 ? JSON.stringify(ccAddresses) : null,
            bccAddresses: bccAddresses.length > 0 ? JSON.stringify(bccAddresses) : null,
            replyToAddresses: replyToAddresses.length > 0 ? JSON.stringify(replyToAddresses) : null,
            subject: body.subject,
            textBody: body.text || null,
            htmlBody: body.html || null,
            headers: body.headers ? JSON.stringify(body.headers) : null,
            attachments: processedAttachments.length > 0 ? JSON.stringify(attachmentsToStorageFormat(processedAttachments)) : null,
            tags: body.tags ? JSON.stringify(body.tags) : null,
            idempotencyKey,
            createdAt: new Date(),
            updatedAt: new Date()
        }

        const [createdScheduledEmail] = await db
            .insert(scheduledEmails)
            .values(scheduledEmailData)
            .returning()

        console.log('✅ Scheduled email created successfully:', scheduledEmailId)

        const response: PostScheduleEmailResponse = {
            id: createdScheduledEmail.id,
            scheduled_at: formatScheduledDate(createdScheduledEmail.scheduledAt),
            status: 'scheduled',
            timezone: createdScheduledEmail.timezone || 'UTC'
        }

        return NextResponse.json(response, { status: 201 })

    } catch (err) {
        console.error('❌ POST /api/v2/emails/schedule - Error:', err)
        return NextResponse.json(
            { 
                error: 'Failed to schedule email', 
                details: err instanceof Error ? err.message : 'Unknown error' 
            },
            { status: 500 }
        )
    }
}

export async function GET(request: NextRequest) {
    console.log('📋 GET /api/v2/emails/schedule - Starting request')
    
    try {
        console.log('🔐 Validating request authentication')
        const { userId, error } = await validateRequest(request)
        if (!userId) {
            console.log('❌ Authentication failed:', error)
            return NextResponse.json({ error }, { status: 401 })
        }
        console.log('✅ Authentication successful for userId:', userId)

        // Parse query parameters
        const { searchParams } = new URL(request.url)
        const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100)
        const offset = parseInt(searchParams.get('offset') || '0')
        const statusFilter = searchParams.get('status')

        // Validate parameters
        if (limit < 1 || limit > 100) {
            return NextResponse.json({ error: 'Limit must be between 1 and 100' }, { status: 400 })
        }
        if (offset < 0) {
            return NextResponse.json({ error: 'Offset must be non-negative' }, { status: 400 })
        }

        console.log('🔍 Querying scheduled emails:', { limit, offset, statusFilter })

        // Build query conditions
        const conditions = [eq(scheduledEmails.userId, userId)]
        if (statusFilter) {
            conditions.push(eq(scheduledEmails.status, statusFilter))
        }

        // Get scheduled emails
        const scheduledEmailsList = await db
            .select()
            .from(scheduledEmails)
            .where(and(...conditions))
            .orderBy(desc(scheduledEmails.scheduledAt))
            .limit(limit)
            .offset(offset)

        // Get total count
        const totalResult = await db
            .select({ count: count() })
            .from(scheduledEmails)
            .where(and(...conditions))

        const total = totalResult[0]?.count || 0
        const hasMore = offset + limit < total

        console.log('📊 Found scheduled emails:', scheduledEmailsList.length, 'of', total)

        // Format response
        const data: ScheduledEmailItem[] = scheduledEmailsList.map(email => ({
            id: email.id,
            from: email.fromAddress,
            to: JSON.parse(email.toAddresses),
            subject: email.subject,
            scheduled_at: formatScheduledDate(email.scheduledAt),
            status: email.status,
            timezone: email.timezone || 'UTC',
            created_at: email.createdAt?.toISOString() || new Date().toISOString(),
            attempts: email.attempts || 0,
            last_error: email.lastError || undefined
        }))

        const response: GetScheduledEmailsResponse = {
            data,
            pagination: { limit, offset, total, hasMore }
        }

        console.log('✅ Successfully retrieved scheduled emails')
        return NextResponse.json(response)

    } catch (err) {
        console.error('❌ GET /api/v2/emails/schedule - Error:', err)
        return NextResponse.json(
            { 
                error: 'Failed to fetch scheduled emails', 
                details: err instanceof Error ? err.message : 'Unknown error' 
            },
            { status: 500 }
        )
    }
}
