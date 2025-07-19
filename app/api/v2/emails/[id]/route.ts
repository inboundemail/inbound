import { NextRequest, NextResponse } from 'next/server'
import { validateRequest } from '../../helper/main'
import { db } from '@/lib/db'
import { sentEmails } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'

/**
 * GET /api/v2/emails/{id}
 * Retrieve a single sent email by ID
 * Supports both session-based auth and API key auth
 * Has tests? ❌
 * Has logging? ✅
 * Has types? ✅
 */

// GET /api/v2/emails/{id} types
export interface GetEmailByIdResponse {
    object: "email"
    id: string
    to: string[]
    from: string
    created_at: string
    subject: string
    html: string | null
    text: string | null
    bcc: (string | null)[]
    cc: (string | null)[]
    reply_to: (string | null)[]
    last_event: string
}

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

        // Fetch the email from database
        console.log('🔍 Fetching email from database')
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
            console.log('❌ Email not found:', id)
            return NextResponse.json(
                { error: 'Email not found' },
                { status: 404 }
            )
        }

        const emailData = email[0]
        console.log('✅ Email found:', {
            id: emailData.id,
            from: emailData.from,
            subject: emailData.subject,
            status: emailData.status
        })

        // Parse JSON fields
        const toAddresses = emailData.to ? JSON.parse(emailData.to) : []
        const ccAddresses = emailData.cc ? JSON.parse(emailData.cc) : []
        const bccAddresses = emailData.bcc ? JSON.parse(emailData.bcc) : []
        const replyToAddresses = emailData.replyTo ? JSON.parse(emailData.replyTo) : []

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

        // Build response matching Resend's format
        const response: GetEmailByIdResponse = {
            object: "email",
            id: emailData.id,
            to: toAddresses,
            from: emailData.from,
            created_at: emailData.createdAt ? emailData.createdAt.toISOString() : new Date().toISOString(),
            subject: emailData.subject,
            html: emailData.htmlBody,
            text: emailData.textBody,
            bcc: bccAddresses.length > 0 ? bccAddresses : [null],
            cc: ccAddresses.length > 0 ? ccAddresses : [null],
            reply_to: replyToAddresses.length > 0 ? replyToAddresses : [null],
            last_event: lastEvent
        }

        console.log('✅ Successfully retrieved email')
        return NextResponse.json(response)

    } catch (error) {
        console.error('💥 Unexpected error in GET /api/v2/emails/[id]:', error)
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        )
    }
} 