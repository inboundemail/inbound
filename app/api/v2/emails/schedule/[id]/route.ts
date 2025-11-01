import { NextRequest, NextResponse } from 'next/server'
import { validateRequest } from '../../../helper/main'
import { db } from '@/lib/db'
import { scheduledEmails, SCHEDULED_EMAIL_STATUS } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { formatScheduledDate } from '@/lib/utils/date-parser'
import { Client as QStashClient } from '@upstash/qstash'

/**
 * GET /api/v2/emails/schedule/[id]
 * Retrieve a scheduled email by ID
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    console.log('📋 GET /api/v2/emails/schedule/[id] - Starting request')
    
    try {
        const result = await validateRequest(request)
        if ('error' in result) {
            console.log('❌ Authentication/Rate limit failed:', result.error)
            const status = result.status || 401
            const headers: Record<string, string> = {}

            if (status === 429 && result.retryAfter) {
                headers['Retry-After'] = result.retryAfter.toString()
                headers['X-RateLimit-Limit'] = (result.limit || 0).toString()
                headers['X-RateLimit-Remaining'] = (result.remaining || 0).toString()
            }

            return NextResponse.json(
                { error: result.error },
                { status, headers }
            )
        }
        const { userId } = result

        const { id } = await params
        console.log('🔍 Fetching scheduled email:', id)

        const [scheduledEmail] = await db
            .select()
            .from(scheduledEmails)
            .where(and(
                eq(scheduledEmails.id, id),
                eq(scheduledEmails.userId, userId)
            ))
            .limit(1)

        if (!scheduledEmail) {
            console.log('❌ Scheduled email not found:', id)
            return NextResponse.json({ error: 'Scheduled email not found' }, { status: 404 })
        }

        const response = {
            id: scheduledEmail.id,
            from: scheduledEmail.fromAddress,
            to: JSON.parse(scheduledEmail.toAddresses),
            cc: scheduledEmail.ccAddresses ? JSON.parse(scheduledEmail.ccAddresses) : undefined,
            bcc: scheduledEmail.bccAddresses ? JSON.parse(scheduledEmail.bccAddresses) : undefined,
            reply_to: scheduledEmail.replyToAddresses ? JSON.parse(scheduledEmail.replyToAddresses) : undefined,
            subject: scheduledEmail.subject,
            text: scheduledEmail.textBody || undefined,
            html: scheduledEmail.htmlBody || undefined,
            scheduled_at: formatScheduledDate(scheduledEmail.scheduledAt),
            timezone: scheduledEmail.timezone || 'UTC',
            status: scheduledEmail.status,
            attempts: scheduledEmail.attempts || 0,
            last_error: scheduledEmail.lastError || undefined,
            sent_at: scheduledEmail.sentAt ? scheduledEmail.sentAt.toISOString() : undefined,
            sent_email_id: scheduledEmail.sentEmailId || undefined,
            created_at: scheduledEmail.createdAt?.toISOString(),
            updated_at: scheduledEmail.updatedAt?.toISOString()
        }

        return NextResponse.json(response)

    } catch (err) {
        console.error('❌ GET /api/v2/emails/schedule/[id] - Error:', err)
        return NextResponse.json(
            { 
                error: 'Failed to fetch scheduled email', 
                details: err instanceof Error ? err.message : 'Unknown error' 
            },
            { status: 500 }
        )
    }
}

/**
 * DELETE /api/v2/emails/schedule/[id]
 * Cancel a scheduled email
 */
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    console.log('🗑️ DELETE /api/v2/emails/schedule/[id] - Starting request')
    
    try {
        const result = await validateRequest(request)
        if ('error' in result) {
            console.log('❌ Authentication/Rate limit failed:', result.error)
            const status = result.status || 401
            const headers: Record<string, string> = {}

            if (status === 429 && result.retryAfter) {
                headers['Retry-After'] = result.retryAfter.toString()
                headers['X-RateLimit-Limit'] = (result.limit || 0).toString()
                headers['X-RateLimit-Remaining'] = (result.remaining || 0).toString()
            }

            return NextResponse.json(
                { error: result.error },
                { status, headers }
            )
        }
        const { userId } = result

        const { id } = await params
        console.log('🗑️ Cancelling scheduled email:', id)

        // Fetch the scheduled email
        const [scheduledEmail] = await db
            .select()
            .from(scheduledEmails)
            .where(and(
                eq(scheduledEmails.id, id),
                eq(scheduledEmails.userId, userId)
            ))
            .limit(1)

        if (!scheduledEmail) {
            console.log('❌ Scheduled email not found:', id)
            return NextResponse.json({ error: 'Scheduled email not found' }, { status: 404 })
        }

        // Check if already sent or cancelled
        if (scheduledEmail.status === SCHEDULED_EMAIL_STATUS.SENT) {
            console.log('⚠️ Email already sent, cannot cancel:', id)
            return NextResponse.json({ error: 'Cannot cancel an email that has already been sent' }, { status: 400 })
        }

        if (scheduledEmail.status === SCHEDULED_EMAIL_STATUS.CANCELLED) {
            console.log('✅ Email already cancelled:', id)
            return NextResponse.json({ message: 'Email already cancelled' }, { status: 200 })
        }

        // Cancel in QStash if we have a schedule ID
        if (scheduledEmail.qstashScheduleId) {
            try {
                const qstashClient = new QStashClient({ 
                    token: process.env.QSTASH_TOKEN! 
                })

                console.log('🗑️ Deleting from QStash, messageId:', scheduledEmail.qstashScheduleId)
                
                // QStash uses messages.delete for scheduled messages
                await qstashClient.messages.delete(scheduledEmail.qstashScheduleId)
                
                console.log('✅ Deleted from QStash successfully')
            } catch (qstashError) {
                console.error('⚠️ Failed to delete from QStash (continuing anyway):', qstashError)
                // Continue with database cancellation even if QStash deletion fails
                // The webhook will handle the case where the email is already cancelled
            }
        }

        // Update database record to cancelled
        await db
            .update(scheduledEmails)
            .set({
                status: SCHEDULED_EMAIL_STATUS.CANCELLED,
                updatedAt: new Date()
            })
            .where(eq(scheduledEmails.id, id))

        console.log('✅ Scheduled email cancelled successfully:', id)

        return NextResponse.json({
            success: true,
            message: 'Scheduled email cancelled successfully',
            id: id
        }, { status: 200 })

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

/**
 * PATCH /api/v2/emails/schedule/[id]
 * Update a scheduled email (cancels old, creates new)
 */
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    console.log('✏️ PATCH /api/v2/emails/schedule/[id] - Starting request')
    
    try {
        const result = await validateRequest(request)
        if ('error' in result) {
            console.log('❌ Authentication/Rate limit failed:', result.error)
            const status = result.status || 401
            const headers: Record<string, string> = {}

            if (status === 429 && result.retryAfter) {
                headers['Retry-After'] = result.retryAfter.toString()
                headers['X-RateLimit-Limit'] = (result.limit || 0).toString()
                headers['X-RateLimit-Remaining'] = (result.remaining || 0).toString()
            }

            return NextResponse.json(
                { error: result.error },
                { status, headers }
            )
        }
        const { userId } = result

        const { id } = await params
        console.log('✏️ Updating scheduled email:', id)

        // For now, updating is implemented as cancel + recreate
        // This is the safest approach with QStash
        return NextResponse.json({
            error: 'Updating scheduled emails is not yet implemented. Please cancel and create a new scheduled email instead.',
            suggestion: 'Use DELETE /api/v2/emails/schedule/:id to cancel, then POST /api/v2/emails/schedule to create a new one'
        }, { status: 501 })

    } catch (err) {
        console.error('❌ PATCH /api/v2/emails/schedule/[id] - Error:', err)
        return NextResponse.json(
            { 
                error: 'Failed to update scheduled email', 
                details: err instanceof Error ? err.message : 'Unknown error' 
            },
            { status: 500 }
        )
    }
}
