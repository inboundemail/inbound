import { NextRequest, NextResponse } from 'next/server'
import { validateRequest } from '../../helper/main'
import { db } from '@/lib/db'
import { sentEmails, structuredEmails } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'

/**
 * GET /api/v2/emails/{id}
 * Retrieve a single email by ID (supports both inbound and outbound emails)
 * - Inbound emails (ID starts with 'inbnd_') are fetched from structuredEmails table
 * - Outbound emails are fetched from sentEmails table
 * Supports both session-based auth and API key auth
 * Has tests? ❌
 * Has logging? ✅
 * Has types? ✅
 */

// Parsed email address structure
interface ParsedEmailAddress {
    text: string
    addresses: Array<{
        name: string | null
        address: string | null
    }>
}

// Base response properties shared by both types
interface BaseEmailResponse {
    object: "email"
    id: string
    created_at: string
    direction: "inbound" | "outbound"
}

// Outbound email response (sent emails)
export interface OutboundEmailResponse extends BaseEmailResponse {
    direction: "outbound"
    to: string[]
    from: string
    subject: string
    html: string | null
    text: string | null
    bcc: string[]
    cc: string[]
    reply_to: string[]
    last_event: string
    status: string
    sent_at: string | null
}

// Inbound email response (received emails)
export interface InboundEmailResponse extends BaseEmailResponse {
    direction: "inbound"
    messageId: string | null
    from: ParsedEmailAddress | null
    to: ParsedEmailAddress | null
    cc: ParsedEmailAddress | null
    bcc: ParsedEmailAddress | null
    reply_to: ParsedEmailAddress | null
    subject: string | null
    body: {
        text: string | null
        html: string | null
    }
    attachments: Array<{
        filename?: string
        contentType?: string
        size?: number
        contentId?: string
        contentDisposition?: string
    }>
    headers: Record<string, any> | null
    date: string | null
    in_reply_to: string | null
    references: string[] | null
    recipient: string
    is_read: boolean
    read_at: string | null
}

// Union type for the response
export type GetEmailByIdResponse = OutboundEmailResponse | InboundEmailResponse

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    console.log('📧 GET /api/v2/emails/[id] - Starting request')
    
    try {
        // Await params as required by Next.js 15
        const { id } = await params
        console.log('📧 Retrieving email with ID:', id)

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

        // Determine email direction based on ID prefix
        const isInbound = id.startsWith('inbnd_')
        console.log(`📬 Email direction: ${isInbound ? 'inbound' : 'outbound'}`)

        if (isInbound) {
            // Fetch inbound email from structuredEmails table
            console.log('🔍 Fetching inbound email from structuredEmails table')
            const email = await db
                .select()
                .from(structuredEmails)
                .where(
                    and(
                        eq(structuredEmails.id, id),
                        eq(structuredEmails.userId, userId)
                    )
                )
                .limit(1)

            if (email.length === 0) {
                console.log('❌ Inbound email not found:', id)
                return NextResponse.json(
                    { error: 'Email not found' },
                    { status: 404 }
                )
            }

            const emailData = email[0]
            console.log('✅ Inbound email found:', {
                id: emailData.id,
                messageId: emailData.messageId,
                subject: emailData.subject,
                recipient: emailData.recipient
            })

            // Safe JSON parser with fallback
            const safeParse = <T,>(s: string | null, fallback: T): T => {
                try { 
                    return s ? (JSON.parse(s) as T) : fallback 
                } catch (error) { 
                    console.warn('JSON parse error:', error)
                    return fallback 
                }
            }

            // Parse JSON fields safely
            const fromData = safeParse<ParsedEmailAddress | null>(emailData.fromData, null)
            const toData = safeParse<ParsedEmailAddress | null>(emailData.toData, null)
            const ccData = safeParse<ParsedEmailAddress | null>(emailData.ccData, null)
            const bccData = safeParse<ParsedEmailAddress | null>(emailData.bccData, null)
            const replyToData = safeParse<ParsedEmailAddress | null>(emailData.replyToData, null)
            const attachments = safeParse<any[]>(emailData.attachments, [])
            const headers = safeParse<Record<string, any> | null>(emailData.headers, null)
            const references = safeParse<string[] | null>(emailData.references, null)

            // Build inbound email response
            const response: InboundEmailResponse = {
                object: "email",
                id: emailData.id,
                direction: "inbound",
                created_at: emailData.createdAt ? emailData.createdAt.toISOString() : new Date().toISOString(),
                messageId: emailData.messageId || null,
                from: fromData,
                to: toData,
                cc: ccData,
                bcc: bccData,
                reply_to: replyToData,
                subject: emailData.subject || null,
                body: {
                    text: emailData.textBody || null,
                    html: emailData.htmlBody || null
                },
                attachments: attachments,
                headers: headers,
                date: emailData.date ? emailData.date.toISOString() : null,
                in_reply_to: emailData.inReplyTo || null,
                references: references,
                recipient: emailData.recipient || '',
                is_read: emailData.isRead || false,
                read_at: emailData.readAt ? emailData.readAt.toISOString() : null
            }

            console.log('✅ Successfully retrieved inbound email')
            return NextResponse.json(response)

        } else {
            // Fetch outbound email from sentEmails table
            console.log('🔍 Fetching outbound email from sentEmails table')
            const email = await db
                .select()
                .from(sentEmails)
                .where(
                    and(
                        eq(sentEmails.id, id),
                        eq(sentEmails.userId, userId)
                    )
                )
                .limit(1)

            if (email.length === 0) {
                console.log('❌ Outbound email not found:', id)
                return NextResponse.json(
                    { error: 'Email not found' },
                    { status: 404 }
                )
            }

            const emailData = email[0]
            console.log('✅ Outbound email found:', {
                id: emailData.id,
                from: emailData.from,
                subject: emailData.subject,
                status: emailData.status
            })

            // Safe JSON parser with fallback
            const safeParse = <T,>(s: string | null, fallback: T): T => {
                try { 
                    return s ? (JSON.parse(s) as T) : fallback 
                } catch (error) { 
                    console.warn('JSON parse error:', error)
                    return fallback 
                }
            }

            // Parse JSON fields safely
            const toAddresses = safeParse<string[]>(emailData.to, [])
            const ccAddresses = safeParse<string[]>(emailData.cc, [])
            const bccAddresses = safeParse<string[]>(emailData.bcc, [])
            const replyToAddresses = safeParse<string[]>(emailData.replyTo, [])

            // Map status to last_event
            let lastEvent = 'created'
            switch (emailData.status) {
                case 'sent':
                    lastEvent = 'delivered'
                    break
                case 'failed':
                    lastEvent = 'failed'
                    break
                case 'pending':
                    lastEvent = 'pending'
                    break
            }

            // Build outbound email response
            const response: OutboundEmailResponse = {
                object: "email",
                id: emailData.id,
                direction: "outbound",
                created_at: emailData.createdAt ? emailData.createdAt.toISOString() : new Date().toISOString(),
                to: toAddresses,
                from: emailData.from,
                subject: emailData.subject,
                html: emailData.htmlBody,
                text: emailData.textBody,
                bcc: bccAddresses,
                cc: ccAddresses,
                reply_to: replyToAddresses,
                last_event: lastEvent,
                status: emailData.status,
                sent_at: emailData.sentAt ? emailData.sentAt.toISOString() : null
            }

            console.log('✅ Successfully retrieved outbound email')
            return NextResponse.json(response)
        }

    } catch (error) {
        console.error('💥 Unexpected error in GET /api/v2/emails/[id]:', error)
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        )
    }
} 