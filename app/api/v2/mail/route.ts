import { NextRequest, NextResponse } from 'next/server'
import { getAllEmails, replyToEmail } from '@/functions/mail/primary'
import { validateRequest } from '../helper/main'

/**
 * GET /api/v2/mail
 * Gets all emails for the user (can filter by status, date, domain)
 * Supports both session-based auth and API key auth
 */
export async function GET(request: NextRequest) {
    try {
        const { userId, error } = await validateRequest(request)
        if (!userId) {
            return NextResponse.json(
                { error: error },
                { status: 401 }
            )
        }

        const { searchParams } = new URL(request.url)

        // Extract query parameters
        const limit = parseInt(searchParams.get('limit') || '50')
        const offset = parseInt(searchParams.get('offset') || '0')
        const searchQuery = searchParams.get('search') || ''
        const statusFilter = searchParams.get('status') as 'all' | 'processed' | 'failed' || 'all'
        const domainFilter = searchParams.get('domain') || 'all'
        const timeRange = searchParams.get('timeRange') as '24h' | '7d' | '30d' | '90d' || '30d'

        // Validate parameters
        if (limit < 1 || limit > 100) {
            return NextResponse.json(
                { error: 'Limit must be between 1 and 100' },
                { status: 400 }
            )
        }

        if (offset < 0) {
            return NextResponse.json(
                { error: 'Offset must be non-negative' },
                { status: 400 }
            )
        }

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
            return NextResponse.json(
                { error: result.error },
                { status: 500 }
            )
        }

        return NextResponse.json(result.data)

    } catch (error) {
        console.error('Error in GET /api/v2/mail:', error)
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
 */
export async function POST(request: NextRequest) {
    try {
        const { userId, error } = await validateRequest(request)
        if (!userId) {
            return NextResponse.json(
                { error: error },
                { status: 401 }
            )
        }
        const body = await request.json()

        // Validate required fields
        if (!body.emailId) {
            return NextResponse.json(
                { error: 'emailId is required' },
                { status: 400 }
            )
        }

        if (!body.to || !body.subject) {
            return NextResponse.json(
                { error: 'to and subject are required' },
                { status: 400 }
            )
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        if (!emailRegex.test(body.to)) {
            return NextResponse.json(
                { error: 'Invalid email format for to field' },
                { status: 400 }
            )
        }

        // Validate at least one body content
        if (!body.textBody && !body.htmlBody) {
            return NextResponse.json(
                { error: 'Either textBody or htmlBody must be provided' },
                { status: 400 }
            )
        }

        // Call the reply function with userId
        const result = await replyToEmail(userId, body.emailId, {
            to: body.to,
            subject: body.subject,
            textBody: body.textBody,
            htmlBody: body.htmlBody,
            attachments: body.attachments
        })

        if (result.error) {
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

        return NextResponse.json(result.data, { status: 201 })

    } catch (error) {
        console.error('Error in POST /api/v2/mail:', error)
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        )
    }
}