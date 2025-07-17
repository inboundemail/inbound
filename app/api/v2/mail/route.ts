import { NextRequest, NextResponse } from 'next/server'
import { getAllEmails, replyToEmail } from '@/functions/mail/primary'
import { validateRequest } from '../helper/main'

/**
 * GET /api/v2/mail
 * Gets all emails for the user (can filter by status, date, domain)
 * Supports both session-based auth and API key auth
 * Has tests? ✅
 * Has logging? ✅
 * Has types? ✅
 */

// GET /api/v2/mail types
export interface GetMailRequest {
    limit?: number
    offset?: number
    search?: string
    status?: 'all' | 'processed' | 'failed'
    domain?: string
    timeRange?: '24h' | '7d' | '30d' | '90d'
}

export interface EmailItem {
    id: string
    emailId: string
    messageId: string | null
    subject: string
    from: string
    fromName: string | null
    recipient: string
    preview: string
    receivedAt: Date
    isRead: boolean
    readAt: Date | null
    hasAttachments: boolean
    attachmentCount: number
    parseSuccess: boolean | null
    parseError: string | null
    createdAt: Date
}

export interface GetMailResponse {
    emails: EmailItem[]
    pagination: {
        total: number
        limit: number
        offset: number
        hasMore: boolean
    }
    filters: {
        uniqueDomains: string[]
    }
}

export async function GET(request: NextRequest) {
    console.log('📧 GET /api/v2/mail - Starting request')
    
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

        const { searchParams } = new URL(request.url)

        // Extract query parameters
        const limit = parseInt(searchParams.get('limit') || '50')
        const offset = parseInt(searchParams.get('offset') || '0')
        const searchQuery = searchParams.get('search') || ''
        const statusFilter = searchParams.get('status') as 'all' | 'processed' | 'failed' || 'all'
        const domainFilter = searchParams.get('domain') || 'all'
        const timeRange = searchParams.get('timeRange') as '24h' | '7d' | '30d' | '90d' || '30d'

        console.log('📊 Query parameters:', {
            limit,
            offset,
            searchQuery,
            statusFilter,
            domainFilter,
            timeRange
        })

        // Validate parameters
        if (limit < 1 || limit > 100) {
            console.log('⚠️ Invalid limit parameter:', limit)
            return NextResponse.json(
                { error: 'Limit must be between 1 and 100' },
                { status: 400 }
            )
        }

        if (offset < 0) {
            console.log('⚠️ Invalid offset parameter:', offset)
            return NextResponse.json(
                { error: 'Offset must be non-negative' },
                { status: 400 }
            )
        }

        console.log('🔍 Calling getAllEmails function')
        // Call the function with userId
        const result = await getAllEmails(userId, {
            limit,
            offset,
            searchQuery,
            statusFilter,
            domainFilter,
            timeRange
        })

        if (result.error) {
            console.log('💥 getAllEmails returned error:', result.error)
            return NextResponse.json(
                { error: result.error },
                { status: 500 }
            )
        }

        console.log('✅ Successfully retrieved emails, count:', result.data?.emails?.length || 0)
        return NextResponse.json(result.data)

    } catch (error) {
        console.error('💥 Unexpected error in GET /api/v2/mail:', error)
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        )
    }
}

/**
 * POST /api/v2/mail
 * Creates a reply to an email
 * Supports both session-based auth and API key auth
 * Has logging? ✅
 * Has types? ✅
 * Has tests? ✅
 */

// POST /api/v2/mail types
export interface PostMailRequest {
    emailId: string
    to: string
    subject: string
    textBody?: string
    htmlBody?: string
    attachments?: Array<{
        filename: string
        contentType: string
        content: string // base64 encoded
    }>
}

export interface PostMailResponse {
    message: string
    originalEmailId: string
    replyData: {
        to: string
        subject: string
        hasTextBody: boolean
        hasHtmlBody: boolean
        attachmentCount: number
    }
    status: string
}

export async function POST(request: NextRequest) {
    console.log('📤 POST /api/v2/mail - Starting reply request')
    
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

        console.log('📝 Parsing request body')
        const body = await request.json()
        console.log('📋 Request body received:', {
            emailId: body.emailId,
            to: body.to,
            subject: body.subject,
            hasTextBody: !!body.textBody,
            hasHtmlBody: !!body.htmlBody,
            attachmentCount: body.attachments?.length || 0
        })

        // Validate required fields
        if (!body.emailId) {
            console.log('⚠️ Missing required field: emailId')
            return NextResponse.json(
                { error: 'emailId is required' },
                { status: 400 }
            )
        }

        if (!body.to || !body.subject) {
            console.log('⚠️ Missing required fields - to:', !!body.to, 'subject:', !!body.subject)
            return NextResponse.json(
                { error: 'to and subject are required' },
                { status: 400 }
            )
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        if (!emailRegex.test(body.to)) {
            console.log('⚠️ Invalid email format for to field:', body.to)
            return NextResponse.json(
                { error: 'Invalid email format for to field' },
                { status: 400 }
            )
        }

        // Validate at least one body content
        if (!body.textBody && !body.htmlBody) {
            console.log('⚠️ No body content provided')
            return NextResponse.json(
                { error: 'Either textBody or htmlBody must be provided' },
                { status: 400 }
            )
        }

        console.log('📧 Calling replyToEmail function')
        // Call the reply function with userId
        const result = await replyToEmail(userId, body.emailId, {
            to: body.to,
            subject: body.subject,
            textBody: body.textBody,
            htmlBody: body.htmlBody,
            attachments: body.attachments
        })

        if (result.error) {
            console.log('💥 replyToEmail returned error:', result.error)
            if (result.error === 'Original email not found') {
                return NextResponse.json(
                    { error: 'Original email not found' },
                    { status: 404 }
                )
            }
            return NextResponse.json(
                { error: result.error },
                { status: 500 }
            )
        }

        console.log('✅ Successfully sent reply email')
        return NextResponse.json(result.data, { status: 201 })

    } catch (error) {
        console.error('💥 Unexpected error in POST /api/v2/mail:', error)
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        )
    }
}