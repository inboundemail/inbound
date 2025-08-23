import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { scheduledEmails, sentEmails, SCHEDULED_EMAIL_STATUS, SENT_EMAIL_STATUS } from '@/lib/db/schema'
import { eq, and, lte, ne } from 'drizzle-orm'
import { SESClient, SendRawEmailCommand } from '@aws-sdk/client-ses'
import { buildRawEmailMessage } from '../../v2/helper/email-builder'
import { extractEmailAddress } from '@/lib/email-management/agent-email-helper'
import { getMailFromDomain } from '@/lib/domains-and-dns/mail-from-domain'
import { nanoid } from 'nanoid'

/**
 * GET /api/cron/process-scheduled-emails
 * Background job to process and send scheduled emails
 * 
 * This endpoint should be called by:
 * - Vercel Cron (recommended): Add to vercel.json
 * - External cron service (cron-job.org, etc.)
 * - Manual trigger for testing
 * 
 * Security: Should be protected by cron secret or API key
 * Frequency: Run every minute for best performance
 * 
 * Has tests? ❌ (TODO)
 * Has logging? ✅
 * Has types? ✅
 */

// Initialize SES client
const awsRegion = process.env.AWS_REGION || 'us-east-2'
const awsAccessKeyId = process.env.AWS_ACCESS_KEY_ID
const awsSecretAccessKey = process.env.AWS_SECRET_ACCESS_KEY

let sesClient: SESClient | null = null

if (awsAccessKeyId && awsSecretAccessKey) {
    sesClient = new SESClient({
        region: awsRegion,
        credentials: {
            accessKeyId: awsAccessKeyId,
            secretAccessKey: awsSecretAccessKey,
        }
    })
} else {
    console.warn('⚠️ AWS credentials not configured. Scheduled email processing will not work.')
}

interface ProcessingResult {
    processed: number
    sent: number
    failed: number
    errors: string[]
}

export async function GET(request: NextRequest) {
    console.log('⏰ GET /api/cron/process-scheduled-emails - Starting cron job')

    try {
        // Security check - verify cron secret (skip in development)
        const isDevelopment = process.env.NODE_ENV === 'development'

        if (!isDevelopment) {
            const authHeader = request.headers.get('authorization');
            if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
                return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
            }
        } else {
            console.log('🔧 Development mode - skipping authentication check')
        }

        // Check if SES is configured
        if (!sesClient) {
            console.log('❌ AWS SES not configured, skipping scheduled email processing')
            return NextResponse.json({
                error: 'AWS SES not configured',
                processed: 0,
                sent: 0,
                failed: 0
            })
        }

        const now = new Date()
        console.log('🔍 Looking for scheduled emails to process at:', now.toISOString())

        // Find emails that are due to be sent
        const dueEmails = await db
            .select()
            .from(scheduledEmails)
            .where(and(
                eq(scheduledEmails.status, SCHEDULED_EMAIL_STATUS.SCHEDULED),
                lte(scheduledEmails.scheduledAt, now)
            ))
            .limit(50) // Process max 50 emails per run to avoid timeouts

        console.log('📧 Found scheduled emails to process:', dueEmails.length)

        if (dueEmails.length === 0) {
            console.log('✅ No scheduled emails to process')
            return NextResponse.json({
                message: 'No scheduled emails to process',
                processed: 0,
                sent: 0,
                failed: 0
            })
        }

        const result: ProcessingResult = {
            processed: 0,
            sent: 0,
            failed: 0,
            errors: []
        }

        // Process each scheduled email
        for (const scheduledEmail of dueEmails) {
            try {
                console.log('📤 Processing scheduled email:', scheduledEmail.id)
                result.processed++

                // Mark as processing to prevent duplicate processing
                await db
                    .update(scheduledEmails)
                    .set({
                        status: SCHEDULED_EMAIL_STATUS.PROCESSING,
                        attempts: (scheduledEmail.attempts || 0) + 1,
                        updatedAt: new Date()
                    })
                    .where(eq(scheduledEmails.id, scheduledEmail.id))

                // Parse email data
                const toAddresses = JSON.parse(scheduledEmail.toAddresses)
                const ccAddresses = scheduledEmail.ccAddresses ? JSON.parse(scheduledEmail.ccAddresses) : []
                const bccAddresses = scheduledEmail.bccAddresses ? JSON.parse(scheduledEmail.bccAddresses) : []
                const replyToAddresses = scheduledEmail.replyToAddresses ? JSON.parse(scheduledEmail.replyToAddresses) : []
                const headers = scheduledEmail.headers ? JSON.parse(scheduledEmail.headers) : undefined
                const rawAttachments = scheduledEmail.attachments ? JSON.parse(scheduledEmail.attachments) : []
                const tags = scheduledEmail.tags ? JSON.parse(scheduledEmail.tags) : []

                // Validate and fix attachment data - ensure contentType is set
                const attachments = rawAttachments.map((att: any, index: number) => {
                    if (!att.contentType && !att.content_type) {
                        console.log(`⚠️ Attachment ${index + 1} missing contentType, using fallback`)
                        // Try to detect from filename extension
                        const filename = att.filename || 'unknown'
                        const ext = filename.toLowerCase().split('.').pop()
                        let contentType = 'application/octet-stream' // Safe fallback

                        // Common file type mappings
                        switch (ext) {
                            case 'pdf': contentType = 'application/pdf'; break
                            case 'jpg': case 'jpeg': contentType = 'image/jpeg'; break
                            case 'png': contentType = 'image/png'; break
                            case 'gif': contentType = 'image/gif'; break
                            case 'txt': contentType = 'text/plain'; break
                            case 'html': contentType = 'text/html'; break
                            case 'json': contentType = 'application/json'; break
                            case 'zip': contentType = 'application/zip'; break
                            case 'doc': contentType = 'application/msword'; break
                            case 'docx': contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'; break
                            case 'xls': contentType = 'application/vnd.ms-excel'; break
                            case 'xlsx': contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'; break
                        }

                        return {
                            ...att,
                            contentType: contentType
                        }
                    }

                    // Use existing contentType or content_type (backward compatibility)
                    return {
                        ...att,
                        contentType: att.contentType || att.content_type
                    }
                })

                // Create sent email record first (for tracking)
                const sentEmailId = nanoid()
                const sentEmailData = {
                    id: sentEmailId,
                    from: scheduledEmail.fromAddress,
                    fromAddress: extractEmailAddress(scheduledEmail.fromAddress),
                    fromDomain: scheduledEmail.fromDomain,
                    to: JSON.stringify(toAddresses),
                    cc: ccAddresses.length > 0 ? JSON.stringify(ccAddresses) : null,
                    bcc: bccAddresses.length > 0 ? JSON.stringify(bccAddresses) : null,
                    replyTo: replyToAddresses.length > 0 ? JSON.stringify(replyToAddresses) : null,
                    subject: scheduledEmail.subject,
                    textBody: scheduledEmail.textBody,
                    htmlBody: scheduledEmail.htmlBody,
                    headers: scheduledEmail.headers,
                    attachments: scheduledEmail.attachments,
                    tags: scheduledEmail.tags,
                    status: SENT_EMAIL_STATUS.PENDING,
                    provider: 'ses',
                    userId: scheduledEmail.userId,
                    createdAt: new Date(),
                    updatedAt: new Date()
                }

                const [createdSentEmail] = await db
                    .insert(sentEmails)
                    .values(sentEmailData)
                    .returning()

                // Get the configured MAIL FROM domain to eliminate "via amazonses.com"
                const fromAddress = extractEmailAddress(scheduledEmail.fromAddress)
                const mailFromDomain = await getMailFromDomain(fromAddress, scheduledEmail.userId)
                const sourceForSes = mailFromDomain || fromAddress
                
                console.log(`📧 Using SES Source: ${sourceForSes}${mailFromDomain ? ' (custom MAIL FROM domain)' : ' (sender email)'}`)

                // Build raw email message
                console.log('📧 Building raw email message for scheduled email')
                const rawMessage = buildRawEmailMessage({
                    from: scheduledEmail.fromAddress,
                    to: toAddresses,
                    cc: ccAddresses.length > 0 ? ccAddresses : undefined,
                    bcc: bccAddresses.length > 0 ? bccAddresses : undefined,
                    replyTo: replyToAddresses.length > 0 ? replyToAddresses : undefined,
                    subject: scheduledEmail.subject,
                    textBody: scheduledEmail.textBody || undefined,
                    htmlBody: scheduledEmail.htmlBody || undefined,
                    customHeaders: headers,
                    attachments: attachments,
                    date: new Date()
                })

                // Send via AWS SES
                const rawCommand = new SendRawEmailCommand({
                    RawMessage: {
                        Data: Buffer.from(rawMessage)
                    },
                    Source: sourceForSes,
                    Destinations: [...toAddresses, ...ccAddresses, ...bccAddresses].map(extractEmailAddress)
                })

                const sesResponse = await sesClient.send(rawCommand)
                const messageId = sesResponse.MessageId

                console.log('✅ Scheduled email sent successfully via SES:', messageId)

                // Update both records with success
                await Promise.all([
                    // Update scheduled email
                    db.update(scheduledEmails)
                        .set({
                            status: SCHEDULED_EMAIL_STATUS.SENT,
                            sentAt: new Date(),
                            sentEmailId: createdSentEmail.id,
                            updatedAt: new Date()
                        })
                        .where(eq(scheduledEmails.id, scheduledEmail.id)),

                    // Update sent email
                    db.update(sentEmails)
                        .set({
                            status: SENT_EMAIL_STATUS.SENT,
                            messageId: messageId,
                            providerResponse: JSON.stringify(sesResponse),
                            sentAt: new Date(),
                            updatedAt: new Date()
                        })
                        .where(eq(sentEmails.id, createdSentEmail.id))
                ])

                result.sent++
                console.log('✅ Scheduled email processed successfully:', scheduledEmail.id)

            } catch (emailError) {
                console.error('❌ Failed to process scheduled email:', scheduledEmail.id, emailError)
                result.failed++

                const errorMessage = emailError instanceof Error ? emailError.message : 'Unknown error'
                result.errors.push(`Email ${scheduledEmail.id}: ${errorMessage}`)

                // Calculate retry logic
                const currentAttempts = (scheduledEmail.attempts || 0) + 1
                const maxAttempts = scheduledEmail.maxAttempts || 3
                const shouldRetry = currentAttempts < maxAttempts

                if (shouldRetry) {
                    // Exponential backoff: 5 min, 15 min, 45 min
                    const retryDelayMinutes = Math.pow(3, currentAttempts) * 5
                    const nextRetryAt = new Date(Date.now() + retryDelayMinutes * 60 * 1000)

                    console.log(`⏳ Scheduling retry ${currentAttempts}/${maxAttempts} in ${retryDelayMinutes} minutes`)

                    await db
                        .update(scheduledEmails)
                        .set({
                            status: SCHEDULED_EMAIL_STATUS.SCHEDULED, // Reset to scheduled for retry
                            attempts: currentAttempts,
                            nextRetryAt: nextRetryAt,
                            lastError: errorMessage,
                            updatedAt: new Date()
                        })
                        .where(eq(scheduledEmails.id, scheduledEmail.id))
                } else {
                    console.log(`❌ Max attempts reached for scheduled email: ${scheduledEmail.id}`)

                    await db
                        .update(scheduledEmails)
                        .set({
                            status: SCHEDULED_EMAIL_STATUS.FAILED,
                            attempts: currentAttempts,
                            lastError: errorMessage,
                            updatedAt: new Date()
                        })
                        .where(eq(scheduledEmails.id, scheduledEmail.id))
                }
            }
        }

        console.log('✅ Scheduled email processing completed:', result)

        return NextResponse.json({
            message: 'Scheduled email processing completed',
            timestamp: now.toISOString(),
            ...result
        })

    } catch (err) {
        console.error('❌ GET /api/cron/process-scheduled-emails - Error:', err)
        return NextResponse.json(
            {
                error: 'Failed to process scheduled emails',
                details: err instanceof Error ? err.message : 'Unknown error'
            },
            { status: 500 }
        )
    }
}
