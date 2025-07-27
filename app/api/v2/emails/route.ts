import { NextRequest, NextResponse } from 'next/server'
import { validateRequest } from '../helper/main'
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses'
import { db } from '@/lib/db'
import { sentEmails, emailDomains, user, SENT_EMAIL_STATUS } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { Autumn as autumn } from 'autumn-js'
import { nanoid } from 'nanoid'

/**
 * POST /api/v2/emails
 * Send an email through the API (Resend-compatible)
 * Supports both session-based auth and API key auth
 * Has tests? ❌
 * Has logging? ✅
 * Has types? ✅
 */

// POST /api/v2/emails types
export interface PostEmailsRequest {
    from: string
    to: string | string[]
    subject: string
    bcc?: string | string[]
    cc?: string | string[]
    reply_to?: string | string[]
    html?: string
    text?: string
    headers?: Record<string, string>
    attachments?: Array<{
        content: string // Base64 encoded
        filename: string
        path?: string
        content_type?: string
    }>
    sender_name?: string // Optional custom sender name - if not provided, defaults to user's name
}

export interface PostEmailsResponse {
    id: string
}

// Helper function to extract email address from "Name <email@domain.com>" format
function extractEmailAddress(email: string): string {
    const match = email.match(/<(.+)>/)
    return match ? match[1] : email.trim()
}

// Helper function to extract domain from email address
function extractDomain(email: string): string {
    const address = extractEmailAddress(email)
    const parts = address.split('@')
    return parts.length === 2 ? parts[1] : ''
}

// Helper function to format sender with proper quoted name
function formatSenderWithName(senderName: string, emailAddress: string): string {
    // If name contains special characters or spaces, wrap in quotes
    const needsQuotes = /[,@<>"\\]/.test(senderName) || senderName.includes(' ')
    
    if (needsQuotes) {
        // Escape any existing quotes in the name
        const escapedName = senderName.replace(/"/g, '\\"')
        return `"${escapedName}" <${emailAddress}>`
    } else {
        return `${senderName} <${emailAddress}>`
    }
}

// Helper function to convert string or array to array
function toArray(value: string | string[] | undefined): string[] {
    if (!value) return []
    return Array.isArray(value) ? value : [value]
}

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
    console.warn('⚠️ AWS credentials not configured. Email sending will not work.')
}

export async function POST(request: NextRequest) {
    console.log('📧 POST /api/v2/emails - Starting request')
    
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

        // Check for idempotency key
        const idempotencyKey = request.headers.get('Idempotency-Key')
        if (idempotencyKey) {
            console.log('🔑 Idempotency key provided:', idempotencyKey)
            
            // Check if we've already processed this request
            const existingEmail = await db
                .select()
                .from(sentEmails)
                .where(
                    and(
                        eq(sentEmails.userId, userId),
                        eq(sentEmails.idempotencyKey, idempotencyKey)
                    )
                )
                .limit(1)
            
            if (existingEmail.length > 0) {
                console.log('♻️ Idempotent request - returning existing email:', existingEmail[0].id)
                return NextResponse.json({ id: existingEmail[0].id })
            }
        }

        console.log('📝 Parsing request body')
        const body: PostEmailsRequest = await request.json()
        
        // Validate required fields
        if (!body.from || !body.to || !body.subject) {
            console.log('⚠️ Missing required fields')
            return NextResponse.json(
                { error: 'Missing required fields: from, to, and subject are required' },
                { status: 400 }
            )
        }

        // Validate email content
        if (!body.html && !body.text) {
            console.log('⚠️ No email content provided')
            return NextResponse.json(
                { error: 'Either html or text content must be provided' },
                { status: 400 }
            )
        }

        // Extract sender information
        const fromAddress = extractEmailAddress(body.from)
        const fromDomain = extractDomain(body.from)
        
        console.log('📧 Sender details:', { from: body.from, address: fromAddress, domain: fromDomain })

        // Verify sender domain ownership
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

        // Determine sender name - use provided sender_name or fetch user's name
        let senderName = body.sender_name
        if (!senderName) {
            console.log('📝 No sender name provided, fetching user name from database')
            const userData = await db
                .select({ name: user.name })
                .from(user)
                .where(eq(user.id, userId))
                .limit(1)
            
            if (userData.length > 0) {
                senderName = userData[0].name
                console.log('✅ Using user name as sender:', senderName)
            } else {
                console.log('⚠️ User not found, using email address only')
                senderName = undefined
            }
        } else {
            console.log('✅ Using provided sender name:', senderName)
        }

        // Format the sender with proper name and quotes
        const formattedSender = senderName 
            ? formatSenderWithName(senderName, fromAddress)
            : fromAddress
        
        console.log('📧 Formatted sender:', formattedSender)

        // Convert recipients to arrays
        const toAddresses = toArray(body.to)
        const ccAddresses = toArray(body.cc)
        const bccAddresses = toArray(body.bcc)
        const replyToAddresses = toArray(body.reply_to)

        // Validate email addresses
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        const allRecipients = [...toAddresses, ...ccAddresses, ...bccAddresses]
        
        for (const email of allRecipients) {
            const address = extractEmailAddress(email)
            if (!emailRegex.test(address)) {
                console.log('⚠️ Invalid email format:', email)
                return NextResponse.json(
                    { error: `Invalid email format: ${email}` },
                    { status: 400 }
                )
            }
        }

        // Check Autumn for email sending limits
        console.log('🔍 Checking email sending limits with Autumn')
        const { data: emailCheck, error: emailCheckError } = await autumn.check({
            customer_id: userId,
            feature_id: "emails_sent"
        })

        if (emailCheckError) {
            console.error('❌ Autumn email check error:', emailCheckError)
            return NextResponse.json(
                { error: 'Failed to check email sending limits' },
                { status: 500 }
            )
        }

        console.log('🔍 Email check:', emailCheck)

        if (!emailCheck.allowed) {
            console.log('❌ Email sending limit reached for user:', userId)
            return NextResponse.json(
                { error: 'Email sending limit reached. Please upgrade your plan to send more emails.' },
                { status: 429 }
            )
        }

        // Create sent email record
        const emailId = nanoid()
        console.log('💾 Creating sent email record:', emailId)
        
        const sentEmailRecord = await db.insert(sentEmails).values({
            id: emailId,
            from: formattedSender,
            fromAddress,
            fromDomain,
            to: JSON.stringify(toAddresses),
            cc: ccAddresses.length > 0 ? JSON.stringify(ccAddresses) : null,
            bcc: bccAddresses.length > 0 ? JSON.stringify(bccAddresses) : null,
            replyTo: replyToAddresses.length > 0 ? JSON.stringify(replyToAddresses) : null,
            subject: body.subject,
            textBody: body.text,
            htmlBody: body.html,
            headers: body.headers ? JSON.stringify(body.headers) : null,
            attachments: body.attachments ? JSON.stringify(body.attachments) : null,
            status: SENT_EMAIL_STATUS.PENDING,
            userId,
            idempotencyKey,
            createdAt: new Date(),
            updatedAt: new Date()
        }).returning()

        // Check if SES is configured
        if (!sesClient) {
            console.log('❌ AWS SES not configured')
            
            // Update email status to failed
            await db
                .update(sentEmails)
                .set({
                    status: SENT_EMAIL_STATUS.FAILED,
                    failureReason: 'AWS SES not configured',
                    updatedAt: new Date()
                })
                .where(eq(sentEmails.id, emailId))
            
            return NextResponse.json(
                { error: 'Email service not configured. Please contact support.' },
                { status: 500 }
            )
        }

        try {
            console.log('📤 Sending email via AWS SES')
            
            // Build SES email command
            const sesCommand = new SendEmailCommand({
                Source: formattedSender,
                Destination: {
                    ToAddresses: toAddresses.map(extractEmailAddress),
                    CcAddresses: ccAddresses.map(extractEmailAddress),
                    BccAddresses: bccAddresses.map(extractEmailAddress)
                },
                Message: {
                    Subject: {
                        Data: body.subject,
                        Charset: 'UTF-8'
                    },
                    Body: {
                        ...(body.text && {
                            Text: {
                                Data: body.text,
                                Charset: 'UTF-8'
                            }
                        }),
                        ...(body.html && {
                            Html: {
                                Data: body.html,
                                Charset: 'UTF-8'
                            }
                        })
                    }
                },
                ...(replyToAddresses.length > 0 && {
                    ReplyToAddresses: replyToAddresses.map(extractEmailAddress)
                })
            })

            const sesResponse = await sesClient.send(sesCommand)
            const messageId = sesResponse.MessageId

            console.log('✅ Email sent successfully via SES:', messageId)

            // Update email record with success
            await db
                .update(sentEmails)
                .set({
                    status: SENT_EMAIL_STATUS.SENT,
                    messageId,
                    providerResponse: JSON.stringify(sesResponse),
                    sentAt: new Date(),
                    updatedAt: new Date()
                })
                .where(eq(sentEmails.id, emailId))

            // Track email usage with Autumn (only if not unlimited)
            if (!emailCheck.unlimited) {
                console.log('📊 Tracking email usage with Autumn')
                const { error: trackError } = await autumn.track({
                    customer_id: userId,
                    feature_id: "emails_sent",
                    value: 1,
                })

                if (trackError) {
                    console.error('❌ Failed to track email usage:', trackError)
                    // Don't fail the request if tracking fails
                }
            }

            console.log('✅ Email processing complete')
            return NextResponse.json({ id: emailId }, { status: 200 })

        } catch (sesError) {
            console.error('❌ SES send error:', sesError)
            
            // Update email status to failed
            await db
                .update(sentEmails)
                .set({
                    status: SENT_EMAIL_STATUS.FAILED,
                    failureReason: sesError instanceof Error ? sesError.message : 'Unknown SES error',
                    providerResponse: JSON.stringify(sesError),
                    updatedAt: new Date()
                })
                .where(eq(sentEmails.id, emailId))
            
            return NextResponse.json(
                { error: 'Failed to send email. Please try again later.' },
                { status: 500 }
            )
        }

    } catch (error) {
        console.error('💥 Unexpected error in POST /api/v2/emails:', error)
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        )
    }
} 