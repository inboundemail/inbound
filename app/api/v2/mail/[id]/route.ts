import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth/auth'
import { getEmail, updateEmail } from '@/functions/mail/primary'
import { validateRequest } from '../../helper/main'


// GET /api/v2/mail/[id] types
export interface GetMailByIdParams {
    id: string
}

export interface ParsedEmailAddress {
    text: string
    addresses: Array<{
        name: string | null
        address: string | null
    }>
}

export interface EmailAttachment {
    filename: string | undefined
    contentType: string | undefined
    size: number | undefined
    contentId: string | undefined
    contentDisposition: string | undefined
}

export interface GetMailByIdResponse {
    id: string
    emailId: string
    messageId: string | null
    subject: string | null
    from: string
    fromName: string | null
    to: string
    cc: string | null
    bcc: string | null
    replyTo: string | null
    recipient: string
    receivedAt: Date | null
    isRead: boolean
    readAt: Date | null
    
    content: {
        textBody: string | null
        htmlBody: string | null
        rawContent: string | null
        attachments: EmailAttachment[]
        headers: Record<string, any>
    }
    
    addresses: {
        from: ParsedEmailAddress | null
        to: ParsedEmailAddress | null
        cc: ParsedEmailAddress | null
        bcc: ParsedEmailAddress | null
        replyTo: ParsedEmailAddress | null
    }
    
    metadata: {
        inReplyTo: string | null
        references: string[]
        priority: string | null
        parseSuccess: boolean | null
        parseError: string | null
        hasAttachments: boolean
        attachmentCount: number
        hasTextBody: boolean
        hasHtmlBody: boolean
    }
    
    security: {
        spf: string
        dkim: string
        dmarc: string
        spam: string
        virus: string
    }
    
    processing: {
        processingTimeMs: number | null
        timestamp: Date | null
        receiptTimestamp: Date | null
        actionType: string | null
        s3Info: {
            bucketName: string | null
            objectKey: string | null
            contentFetched: boolean | null
            contentSize: number | null
            error: string | null
        }
        commonHeaders: Record<string, any> | null
    }
    
    createdAt: Date | null
    updatedAt: Date | null
}

/**
 * GET /api/v2/mail/[id]
 * Gets a single email by id (returns the entire email object)
 * Supports both session-based auth and API key auth
 * Has tests? ✅
 * Has logging? ✅
 * Has types? ✅
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    console.log('📧 GET /api/v2/mail/[id] - Starting request')
    
    try {
        // Get session (handles both regular sessions and API key sessions)
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
        
        const { id } = await params
        console.log('📨 Requested email ID:', id)

        // Validate email ID
        if (!id || typeof id !== 'string') {
            console.log('⚠️ Invalid email ID provided:', id)
            return NextResponse.json(
                { error: 'Valid email ID is required' },
                { status: 400 }
            )
        }

        // Call the function with userId
        console.log('🔍 Calling getEmail function for userId:', userId, 'emailId:', id)
        const result = await getEmail(userId, id)

        if (result.error) {
            if (result.error === 'Email not found') {
                console.log('📭 Email not found for user:', userId, 'emailId:', id)
                return NextResponse.json(
                    { error: 'Email not found' },
                    { status: 404 }
                )
            }
            console.log('💥 getEmail returned error:', result.error)
            return NextResponse.json(
                { error: result.error },
                { status: 500 }
            )
        }

        console.log('✅ Successfully retrieved email for user:', userId, 'emailId:', id)
        return NextResponse.json(result.data)

    } catch (error) {
        console.error('💥 Unexpected error in GET /api/v2/mail/[id]:', error)
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        )
    }
}

/**
 * PATCH /api/v2/mail/[id]
 * Updates email properties (read status, archive status, etc.)
 * Supports both session-based auth and API key auth
 * Has tests? ❌
 * Has logging? ✅
 * Has types? ✅
 */

// PATCH /api/v2/mail/[id] types
export interface PatchMailRequest {
    isRead?: boolean
    isArchived?: boolean
}

export interface PatchMailResponse {
    id: string
    isRead: boolean
    isArchived: boolean
    readAt: Date | null
    archivedAt: Date | null
}

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    console.log('✏️ PATCH /api/v2/mail/[id] - Starting update request')
    
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
        
        const { id } = await params
        console.log('📨 Updating email ID:', id)

        // Validate email ID
        if (!id || typeof id !== 'string') {
            console.log('⚠️ Invalid email ID provided:', id)
            return NextResponse.json(
                { error: 'Valid email ID is required' },
                { status: 400 }
            )
        }

        console.log('📝 Parsing request body')
        const body = await request.json()
        console.log('📋 Update data received:', body)

        // Validate request body
        if (typeof body.isRead !== 'undefined' && typeof body.isRead !== 'boolean') {
            return NextResponse.json(
                { error: 'isRead must be a boolean' },
                { status: 400 }
            )
        }

        if (typeof body.isArchived !== 'undefined' && typeof body.isArchived !== 'boolean') {
            return NextResponse.json(
                { error: 'isArchived must be a boolean' },
                { status: 400 }
            )
        }

        if (!body.isRead && !body.isArchived && body.isRead !== false && body.isArchived !== false) {
            return NextResponse.json(
                { error: 'At least one field (isRead or isArchived) must be provided' },
                { status: 400 }
            )
        }

        // Call the update function
        console.log('🔄 Calling updateEmail function for userId:', userId, 'emailId:', id)
        const result = await updateEmail(userId, id, {
            isRead: body.isRead,
            isArchived: body.isArchived
        })

        if (result.error) {
            if (result.error === 'Email not found or access denied') {
                console.log('📭 Email not found for user:', userId, 'emailId:', id)
                return NextResponse.json(
                    { error: 'Email not found' },
                    { status: 404 }
                )
            }
            console.log('💥 updateEmail returned error:', result.error)
            return NextResponse.json(
                { error: result.error },
                { status: 500 }
            )
        }

        console.log('✅ Successfully updated email for user:', userId, 'emailId:', id)
        return NextResponse.json(result.data)

    } catch (error) {
        console.error('💥 Unexpected error in PATCH /api/v2/mail/[id]:', error)
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        )
    }
} 