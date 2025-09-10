import { NextRequest, NextResponse } from 'next/server'
import { validateRequest } from '../../../helper/main'
import { db } from '@/lib/db'
import { scheduledEmails, SCHEDULED_EMAIL_STATUS } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { formatScheduledDate } from '@/lib/utils/date-parser'
import { emailScheduler } from '@/lib/qstash'

/**
 * GET /api/v2/emails/schedule/[id]
 * Get details of a specific scheduled email (QStash-aware)
 * 
 * DELETE /api/v2/emails/schedule/[id] 
 * Cancel a scheduled email via QStash (only if status is 'scheduled')
 * 
 * Has tests? ❌ (TODO)
 * Has logging? ✅
 * Has types? ✅
 */

// GET /api/v2/emails/schedule/[id] types
export interface GetScheduledEmailResponse {
    id: string
    from: string
    to: string[]
    cc?: string[]
    bcc?: string[]
    replyTo?: string[]
    subject: string
    text?: string
    html?: string
    headers?: Record<string, string>
    attachments?: any[]
    tags?: Array<{ name: string; value: string }>
    scheduled_at: string
    timezone: string
    status: string
    attempts: number
    max_attempts: number
    next_retry_at?: string
    last_error?: string
    created_at: string
    updated_at: string
    sent_at?: string
    sent_email_id?: string
}

// DELETE /api/v2/emails/schedule/[id] types
export interface DeleteScheduledEmailResponse {
    id: string
    status: 'cancelled'
    cancelled_at: string
}

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    console.log('🔍 GET /api/v2/emails/schedule/[id] - Starting request')
    
    try {
        const { id } = await params
        console.log('📧 Getting scheduled email:', id)

        console.log('🔐 Validating request authentication')
        const { userId, error } = await validateRequest(request)
        if (!userId) {
            console.log('❌ Authentication failed:', error)
            return NextResponse.json({ error }, { status: 401 })
        }
        console.log('✅ Authentication successful for userId:', userId)

        // Get the scheduled email via QStash scheduler
        const scheduledEmail = await emailScheduler.getScheduledEmail(id)

        if (!scheduledEmail || scheduledEmail.userId !== userId) {
            console.log('❌ Scheduled email not found or unauthorized:', id)
            return NextResponse.json(
                { error: 'Scheduled email not found' },
                { status: 404 }
            )
        }

        console.log('✅ Found scheduled email:', id, 'status:', scheduledEmail.status)

        // Format response
        const response: GetScheduledEmailResponse = {
            id: scheduledEmail.id,
            from: scheduledEmail.fromAddress,
            to: JSON.parse(scheduledEmail.toAddresses),
            cc: scheduledEmail.ccAddresses ? JSON.parse(scheduledEmail.ccAddresses) : undefined,
            bcc: scheduledEmail.bccAddresses ? JSON.parse(scheduledEmail.bccAddresses) : undefined,
            replyTo: scheduledEmail.replyToAddresses ? JSON.parse(scheduledEmail.replyToAddresses) : undefined,
            subject: scheduledEmail.subject,
            text: scheduledEmail.textBody || undefined,
            html: scheduledEmail.htmlBody || undefined,
            headers: scheduledEmail.headers ? JSON.parse(scheduledEmail.headers) : undefined,
            attachments: scheduledEmail.attachments ? JSON.parse(scheduledEmail.attachments) : undefined,
            tags: scheduledEmail.tags ? JSON.parse(scheduledEmail.tags) : undefined,
            scheduled_at: formatScheduledDate(scheduledEmail.scheduledAt),
            timezone: scheduledEmail.timezone || 'UTC',
            status: scheduledEmail.status,
            attempts: scheduledEmail.attempts || 0,
            max_attempts: scheduledEmail.maxAttempts || 3,
            next_retry_at: scheduledEmail.nextRetryAt ? formatScheduledDate(scheduledEmail.nextRetryAt) : undefined,
            last_error: scheduledEmail.lastError || undefined,
            created_at: scheduledEmail.createdAt?.toISOString() || new Date().toISOString(),
            updated_at: scheduledEmail.updatedAt?.toISOString() || new Date().toISOString(),
            sent_at: scheduledEmail.sentAt ? scheduledEmail.sentAt.toISOString() : undefined,
            sent_email_id: scheduledEmail.sentEmailId || undefined
        }

        return NextResponse.json(response)

    } catch (err) {
        console.error('❌ GET /api/v2/emails/schedule/[id] - Error:', err)
        return NextResponse.json(
            { 
                error: 'Failed to get scheduled email', 
                details: err instanceof Error ? err.message : 'Unknown error' 
            },
            { status: 500 }
        )
    }
}

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    console.log('🗑️ DELETE /api/v2/emails/schedule/[id] - Starting request')
    
    try {
        const { id } = await params
        console.log('📧 Cancelling scheduled email:', id)

        console.log('🔐 Validating request authentication')
        const { userId, error } = await validateRequest(request)
        if (!userId) {
            console.log('❌ Authentication failed:', error)
            return NextResponse.json({ error }, { status: 401 })
        }
        console.log('✅ Authentication successful for userId:', userId)

        // Get the scheduled email via QStash scheduler
        const scheduledEmail = await emailScheduler.getScheduledEmail(id)

        if (!scheduledEmail || scheduledEmail.userId !== userId) {
            console.log('❌ Scheduled email not found or unauthorized:', id)
            return NextResponse.json(
                { error: 'Scheduled email not found' },
                { status: 404 }
            )
        }

        console.log('📧 Found scheduled email:', id, 'status:', scheduledEmail.status)

        // Check if email can be cancelled
        if (scheduledEmail.status !== SCHEDULED_EMAIL_STATUS.SCHEDULED) {
            console.log('❌ Cannot cancel email with status:', scheduledEmail.status)
            return NextResponse.json(
                { error: `Cannot cancel email with status: ${scheduledEmail.status}. Only scheduled emails can be cancelled.` },
                { status: 400 }
            )
        }

        // Cancel via QStash-aware scheduler
        console.log('🚫 Cancelling scheduled email via QStash:', id)
        await emailScheduler.cancelScheduledEmail(id)

        console.log('✅ Scheduled email cancelled successfully:', id)

        const response: DeleteScheduledEmailResponse = {
            id,
            status: 'cancelled',
            cancelled_at: new Date().toISOString()
        }

        return NextResponse.json(response)

    } catch (err) {
        console.error('❌ DELETE /api/v2/emails/schedule/[id] - Error:', err)
        return NextResponse.json(
            { 
                error: 'Failed to cancel scheduled email', 
                details: err instanceof Error ? err.message : 'Unknown error' 
            },
            { status: 500 }
        )
    }
}
