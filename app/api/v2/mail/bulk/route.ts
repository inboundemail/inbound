import { NextRequest, NextResponse } from 'next/server'
import { bulkUpdateEmails } from '@/functions/mail/primary'
import { validateRequest } from '../../helper/main'

/**
 * POST /api/v2/mail/bulk
 * Bulk update emails (archive, mark as read, etc.)
 * Supports both session-based auth and API key auth
 * Has tests? ❌
 * Has logging? ✅
 * Has types? ✅
 */

// POST /api/v2/mail/bulk types
export interface PostMailBulkRequest {
    emailIds: string[]
    updates: {
        isRead?: boolean
        isArchived?: boolean
    }
}

export interface PostMailBulkResponse {
    updatedCount: number
    emails: Array<{
        id: string
        isRead: boolean
        isArchived: boolean
    }>
}

export async function POST(request: NextRequest) {
    console.log('📦 POST /api/v2/mail/bulk - Starting bulk update request')
    
    try {
        console.log('🔐 Validating request authentication')
        const authResult = await validateRequest(request)
        if ('error' in authResult) {
            console.log('❌ Authentication/Rate limit failed:', authResult.error)
            const status = authResult.status || 401
            const headers: Record<string, string> = {}

            if (status === 429 && authResult.retryAfter) {
                headers['Retry-After'] = authResult.retryAfter.toString()
                headers['X-RateLimit-Limit'] = (authResult.limit || 0).toString()
                headers['X-RateLimit-Remaining'] = (authResult.remaining || 0).toString()
            }

            return NextResponse.json(
                { error: authResult.error },
                { status, headers }
            )
        }
        const { userId } = authResult
        console.log('✅ Authentication successful for userId:', userId)

        console.log('📝 Parsing request body')
        const body = await request.json()
        console.log('📋 Bulk update data received:', {
            emailCount: body.emailIds?.length || 0,
            updates: body.updates
        })

        // Validate request body
        if (!body.emailIds || !Array.isArray(body.emailIds)) {
            return NextResponse.json(
                { error: 'emailIds must be an array' },
                { status: 400 }
            )
        }

        if (body.emailIds.length === 0) {
            return NextResponse.json(
                { error: 'At least one email ID must be provided' },
                { status: 400 }
            )
        }

        if (body.emailIds.length > 100) {
            return NextResponse.json(
                { error: 'Cannot update more than 100 emails at once' },
                { status: 400 }
            )
        }

        if (!body.updates || typeof body.updates !== 'object') {
            return NextResponse.json(
                { error: 'updates object is required' },
                { status: 400 }
            )
        }

        // Validate update fields
        if (typeof body.updates.isRead !== 'undefined' && typeof body.updates.isRead !== 'boolean') {
            return NextResponse.json(
                { error: 'updates.isRead must be a boolean' },
                { status: 400 }
            )
        }

        if (typeof body.updates.isArchived !== 'undefined' && typeof body.updates.isArchived !== 'boolean') {
            return NextResponse.json(
                { error: 'updates.isArchived must be a boolean' },
                { status: 400 }
            )
        }

        if (!body.updates.isRead && !body.updates.isArchived && body.updates.isRead !== false && body.updates.isArchived !== false) {
            return NextResponse.json(
                { error: 'At least one update field (isRead or isArchived) must be provided' },
                { status: 400 }
            )
        }

        // Validate all email IDs are strings
        for (const emailId of body.emailIds) {
            if (typeof emailId !== 'string' || !emailId.trim()) {
                return NextResponse.json(
                    { error: 'All email IDs must be non-empty strings' },
                    { status: 400 }
                )
            }
        }

        // Call the bulk update function
        console.log('🔄 Calling bulkUpdateEmails function for userId:', userId, 'emailCount:', body.emailIds.length)
        const result = await bulkUpdateEmails(userId, body.emailIds, body.updates)

        if (result.error) {
            console.log('💥 bulkUpdateEmails returned error:', result.error)
            return NextResponse.json(
                { error: result.error },
                { status: 500 }
            )
        }

        console.log('✅ Successfully bulk updated', result.data?.updatedCount || 0, 'emails for user:', userId)
        return NextResponse.json(result.data)

    } catch (error) {
        console.error('💥 Unexpected error in POST /api/v2/mail/bulk:', error)
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        )
    }
} 