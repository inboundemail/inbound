import { NextRequest, NextResponse } from 'next/server'
import { validateRequest } from '../helper/main'
import { SESClient, SendEmailCommand, SendRawEmailCommand } from '@aws-sdk/client-ses'
import { db } from '@/lib/db'
import { sentEmails, emailDomains, SENT_EMAIL_STATUS } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { Autumn as autumn } from 'autumn-js'
import { nanoid } from 'nanoid'
import { canUserSendFromEmail, extractEmailAddress, extractDomain } from '@/lib/email-management/agent-email-helper'

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
    from: string // Now supports both "email@domain.com" and "Display Name <email@domain.com>" formats
    to: string | string[]
    subject: string
    bcc?: string | string[]
    cc?: string | string[]
    reply_to?: string | string[] // snake_case (legacy)
    replyTo?: string | string[]  // camelCase (Resend-compatible)
    html?: string
    text?: string
    headers?: Record<string, string>
    attachments?: Array<{
        content: string // Base64 encoded
        filename: string
        path?: string
        content_type?: string  // snake_case (legacy)
        contentType?: string   // camelCase (Resend-compatible)
    }>
    tags?: Array<{  // Resend-compatible tags
        name: string
        value: string
    }>
}

export interface PostEmailsResponse {
    id: string
    messageId: string  // AWS SES Message ID
}

// Helper functions moved to @/lib/email-management/agent-email-helper

// Helper function to convert string or array to array
function toArray(value: string | string[] | undefined): string[] {
    if (!value) return []
    return Array.isArray(value) ? value : [value]
}

// Helper function to parse email with optional display name
function parseEmailWithName(emailString: string): { email: string; name?: string } {
    const match = emailString.match(/^(.+?)\s*<([^>]+)>$/)
    if (match) {
        return {
            name: match[1].replace(/^["']|["']$/g, '').trim(), // Remove quotes if present
            email: match[2].trim()
        }
    }
    return { email: emailString.trim() }
}

// Helper function to format email with display name
function formatEmailWithName(email: string, name?: string): string {
    if (name && name.trim()) {
        // Escape name if it contains special characters
        const escapedName = name.includes(',') || name.includes(';') || name.includes('<') || name.includes('>') 
            ? `"${name.replace(/"/g, '\\"')}"` 
            : name
        return `${escapedName} <${email}>`
    }
    return email
}

// Helper function to build raw email message for SES
function buildRawEmailMessage(params: {
    from: string
    to: string[]
    cc?: string[]
    bcc?: string[]
    replyTo?: string[]
    subject: string
    textBody?: string
    htmlBody?: string
    headers?: Record<string, string>
}): string {
    const boundary = `----=_NextPart_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    
    // Build RFC 2822 compliant email headers
    const headers = [
        `From: ${params.from}`,
        `To: ${params.to.join(', ')}`,
        ...(params.cc && params.cc.length > 0 ? [`Cc: ${params.cc.join(', ')}`] : []),
        ...(params.replyTo && params.replyTo.length > 0 ? [`Reply-To: ${params.replyTo.join(', ')}`] : []),
        `Subject: ${params.subject}`,
        `Date: ${new Date().toUTCString()}`,
        `MIME-Version: 1.0`
    ]

    // Add custom headers if provided
    if (params.headers) {
        for (const [key, value] of Object.entries(params.headers)) {
            headers.push(`${key}: ${value}`)
        }
    }

    const hasText = !!params.textBody
    const hasHtml = !!params.htmlBody

    if (!hasText && !hasHtml) {
        // No content
        headers.push('Content-Type: text/plain; charset=UTF-8')
        return [...headers, '', '[No content]'].join('\r\n')
    }

    if (hasText && hasHtml) {
        // Multipart alternative
        headers.push(`Content-Type: multipart/alternative; boundary="${boundary}"`)
        
        const messageParts = [
            ...headers,
            '',
            'This is a multi-part message in MIME format.',
            '',
            `--${boundary}`,
            'Content-Type: text/plain; charset=UTF-8',
            'Content-Transfer-Encoding: 8bit',
            '',
            params.textBody,
            '',
            `--${boundary}`,
            'Content-Type: text/html; charset=UTF-8',
            'Content-Transfer-Encoding: 8bit',
            '',
            params.htmlBody,
            '',
            `--${boundary}--`
        ]
        
        return messageParts.join('\r\n')
    } else if (hasHtml) {
        // HTML only
        headers.push('Content-Type: text/html; charset=UTF-8')
        headers.push('Content-Transfer-Encoding: 8bit')
        return [...headers, '', params.htmlBody].join('\r\n')
    } else {
        // Text only
        headers.push('Content-Type: text/plain; charset=UTF-8')
        headers.push('Content-Transfer-Encoding: 8bit')
        return [...headers, '', params.textBody].join('\r\n')
    }
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

        // Check if this is the special agent@inbnd.dev email (allowed for all users)
        const { isAgentEmail } = canUserSendFromEmail(body.from)
        
        if (isAgentEmail) {
            console.log('✅ Using agent@inbnd.dev - allowed for all users')
        } else {
            // Verify sender domain ownership for non-agent emails
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
        }

        // Convert recipients to arrays (support both snake_case and camelCase)
        const toAddresses = toArray(body.to)
        const ccAddresses = toArray(body.cc)
        const bccAddresses = toArray(body.bcc)
        const replyToAddresses = toArray(body.replyTo || body.reply_to) // Support both formats

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
            from: body.from,
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
            attachments: body.attachments ? JSON.stringify(
                // Normalize attachment fields to support both formats
                body.attachments.map(att => ({
                    content: att.content,
                    filename: att.filename,
                    path: att.path,
                    content_type: att.contentType || att.content_type  // Support both formats
                }))
            ) : null,
            tags: body.tags ? JSON.stringify(body.tags) : null, // Store tags
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
            
            // Parse the from address to support display names
            const fromParsed = parseEmailWithName(body.from)
            const sourceEmail = fromParsed.email
            
            let sesResponse: any
            
            // If we have a display name, use SendRawEmailCommand to preserve it
            if (fromParsed.name) {
                console.log(`📧 Using raw email format to preserve display name: "${fromParsed.name}"`)
                
                // Build raw email message with display name
                const rawMessage = buildRawEmailMessage({
                    from: formatEmailWithName(sourceEmail, fromParsed.name),
                    to: toAddresses,
                    cc: ccAddresses.length > 0 ? ccAddresses : undefined,
                    bcc: bccAddresses.length > 0 ? bccAddresses : undefined,
                    replyTo: replyToAddresses.length > 0 ? replyToAddresses : undefined,
                    subject: body.subject,
                    textBody: body.text,
                    htmlBody: body.html,
                    headers: body.headers
                })
                
                const rawCommand = new SendRawEmailCommand({
                    RawMessage: {
                        Data: Buffer.from(rawMessage)
                    },
                    Source: sourceEmail,
                    Destinations: [...toAddresses, ...ccAddresses, ...bccAddresses].map(extractEmailAddress)
                })
                
                sesResponse = await sesClient.send(rawCommand)
            } else {
                // Use regular SendEmailCommand for simple emails without display names
                const sesCommand = new SendEmailCommand({
                    Source: sourceEmail,
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
                
                sesResponse = await sesClient.send(sesCommand)
            }
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
            const response: PostEmailsResponse = {
                id: emailId,
                messageId: messageId || ''
            }
            return NextResponse.json(response, { status: 200 })

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