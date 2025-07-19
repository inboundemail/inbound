import { NextRequest, NextResponse } from 'next/server'
import { validateRequest } from '../../../helper/main'
import { SESClient, SendRawEmailCommand } from '@aws-sdk/client-ses'
import { db } from '@/lib/db'
import { sentEmails, emailDomains, structuredEmails, SENT_EMAIL_STATUS } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { Autumn as autumn } from 'autumn-js'
import { nanoid } from 'nanoid'

/**
 * POST /api/v2/emails/[id]/reply
 * Reply to an inbound email
 * Supports both session-based auth and API key auth
 * Has tests? ❌
 * Has logging? ✅
 * Has types? ✅
 */

// POST /api/v2/emails/[id]/reply types
export interface PostEmailReplyRequest {
    from: string
    to?: string | string[]  // Optional - will use original sender if not provided
    subject?: string        // Optional - will add "Re: " to original subject if not provided
    cc?: string | string[]
    bcc?: string | string[]
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
    include_original?: boolean  // Whether to include quoted original message (default: true)
}

export interface PostEmailReplyResponse {
    id: string
}

// Helper functions
function extractEmailAddress(email: string): string {
    const match = email.match(/<(.+)>/)
    return match ? match[1] : email.trim()
}

function extractDomain(email: string): string {
    const address = extractEmailAddress(email)
    const parts = address.split('@')
    return parts.length === 2 ? parts[1] : ''
}

function toArray(value: string | string[] | undefined): string[] {
    if (!value) return []
    return Array.isArray(value) ? value : [value]
}

// Format date for email headers
function formatEmailDate(date: Date): string {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    
    const day = days[date.getUTCDay()]
    const dayNum = date.getUTCDate()
    const month = months[date.getUTCMonth()]
    const year = date.getUTCFullYear()
    const hours = date.getUTCHours().toString().padStart(2, '0')
    const minutes = date.getUTCMinutes().toString().padStart(2, '0')
    const seconds = date.getUTCSeconds().toString().padStart(2, '0')
    
    return `${day}, ${dayNum} ${month} ${year} ${hours}:${minutes}:${seconds} +0000`
}

// Quote the original message for reply
function quoteMessage(originalEmail: any, includeOriginal: boolean = true): string {
    if (!includeOriginal) return ''
    
    // Parse the from data
    let fromData = null
    if (originalEmail.fromData) {
        try {
            fromData = JSON.parse(originalEmail.fromData)
        } catch (e) {
            console.error('Failed to parse fromData:', e)
        }
    }
    
    const fromText = fromData?.text || 'Unknown Sender'
    const dateStr = originalEmail.date ? formatEmailDate(new Date(originalEmail.date)) : 'Unknown Date'
    
    // Create the quote header
    const quoteHeader = `\n\nOn ${dateStr}, ${fromText} wrote:\n\n`
    
    // Quote the original message with > prefix
    const originalText = originalEmail.textBody || ''
    const quotedLines = originalText.split('\n').map((line: string) => `> ${line}`).join('\n')
    
    return quoteHeader + quotedLines
}

// Build raw email message
function buildRawEmailMessage(params: {
    from: string
    to: string[]
    cc?: string[]
    bcc?: string[]
    replyTo?: string[]
    subject: string
    textBody?: string
    htmlBody?: string
    messageId: string
    inReplyTo?: string
    references?: string[]
    date: Date
    customHeaders?: Record<string, string>
}): string {
    const boundary = `----=_Part_${nanoid()}`
    
    // Build headers
    let headers = [
        `From: ${params.from}`,
        `To: ${params.to.join(', ')}`,
        params.cc && params.cc.length > 0 ? `Cc: ${params.cc.join(', ')}` : null,
        params.replyTo && params.replyTo.length > 0 ? `Reply-To: ${params.replyTo.join(', ')}` : null,
        `Subject: ${params.subject}`,
        `Message-ID: <${params.messageId}@${extractDomain(params.from)}>`,
        params.inReplyTo ? `In-Reply-To: ${params.inReplyTo}` : null,
        params.references && params.references.length > 0 ? `References: ${params.references.join(' ')}` : null,
        `Date: ${formatEmailDate(params.date)}`,
        'MIME-Version: 1.0',
    ].filter(Boolean)
    
    // Add custom headers
    if (params.customHeaders) {
        for (const [key, value] of Object.entries(params.customHeaders)) {
            headers.push(`${key}: ${value}`)
        }
    }
    
    // Build body based on content type
    let body = []
    
    if (params.textBody && params.htmlBody) {
        // Multipart alternative
        headers.push(`Content-Type: multipart/alternative; boundary="${boundary}"`)
        body.push('')  // Empty line between headers and body
        
        // Text part
        body.push(`--${boundary}`)
        body.push('Content-Type: text/plain; charset=UTF-8')
        body.push('Content-Transfer-Encoding: quoted-printable')
        body.push('')
        body.push(params.textBody)
        
        // HTML part
        body.push(`--${boundary}`)
        body.push('Content-Type: text/html; charset=UTF-8')
        body.push('Content-Transfer-Encoding: quoted-printable')
        body.push('')
        body.push(params.htmlBody)
        
        body.push(`--${boundary}--`)
    } else if (params.textBody) {
        // Plain text only
        headers.push('Content-Type: text/plain; charset=UTF-8')
        headers.push('Content-Transfer-Encoding: quoted-printable')
        body.push('')  // Empty line between headers and body
        body.push(params.textBody)
    } else if (params.htmlBody) {
        // HTML only
        headers.push('Content-Type: text/html; charset=UTF-8')
        headers.push('Content-Transfer-Encoding: quoted-printable')
        body.push('')  // Empty line between headers and body
        body.push(params.htmlBody)
    }
    
    return headers.join('\r\n') + '\r\n' + body.join('\r\n')
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

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    console.log('📧 POST /api/v2/emails/[id]/reply - Starting request')
    
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

        const { id: emailId } = await params
        console.log('📨 Replying to email ID:', emailId)

        // Validate email ID
        if (!emailId || typeof emailId !== 'string') {
            console.log('⚠️ Invalid email ID provided:', emailId)
            return NextResponse.json(
                { error: 'Valid email ID is required' },
                { status: 400 }
            )
        }

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

        // Get the original email
        console.log('🔍 Fetching original email')
        const originalEmail = await db
            .select()
            .from(structuredEmails)
            .where(
                and(
                    eq(structuredEmails.id, emailId),
                    eq(structuredEmails.userId, userId)
                )
            )
            .limit(1)

        if (originalEmail.length === 0) {
            console.log('📭 Original email not found')
            return NextResponse.json(
                { error: 'Email not found' },
                { status: 404 }
            )
        }

        const original = originalEmail[0]
        console.log('✅ Found original email:', original.subject)

        console.log('📝 Parsing request body')
        const body: PostEmailReplyRequest = await request.json()
        
        // Parse original email data
        let originalFromData = null
        if (original.fromData) {
            try {
                originalFromData = JSON.parse(original.fromData)
            } catch (e) {
                console.error('Failed to parse original fromData:', e)
            }
        }

        // Determine reply recipients
        const originalSenderAddress = originalFromData?.addresses?.[0]?.address
        if (!originalSenderAddress && !body.to) {
            console.log('⚠️ Cannot determine recipient for reply')
            return NextResponse.json(
                { error: 'Cannot determine recipient email address' },
                { status: 400 }
            )
        }

        // Set default values
        const toAddresses = body.to ? toArray(body.to) : [originalFromData?.text || originalSenderAddress]
        const subject = body.subject || `Re: ${original.subject || 'No Subject'}`
        const includeOriginal = body.include_original !== false  // Default to true

        // Validate required fields
        if (!body.from) {
            console.log('⚠️ Missing required field: from')
            return NextResponse.json(
                { error: 'From address is required' },
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
        
        console.log('📧 Reply details:', { 
            from: body.from, 
            to: toAddresses,
            subject,
            originalMessageId: original.messageId
        })

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

        // Convert recipients to arrays
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

        if (!emailCheck.allowed) {
            console.log('❌ Email sending limit reached for user:', userId)
            return NextResponse.json(
                { error: 'Email sending limit reached. Please upgrade your plan to send more emails.' },
                { status: 429 }
            )
        }

        // Build threading headers
        const inReplyTo = original.messageId ? `<${original.messageId}>` : undefined
        let references: string[] = []
        
        // Parse existing references
        if (original.references) {
            try {
                const parsedRefs = JSON.parse(original.references)
                if (Array.isArray(parsedRefs)) {
                    references = parsedRefs
                }
            } catch (e) {
                console.error('Failed to parse references:', e)
            }
        }
        
        // Add the original message ID to references
        if (original.messageId) {
            references.push(`<${original.messageId}>`)
        }

        // Add quoted original message to text body
        let finalTextBody = body.text || ''
        if (includeOriginal && body.text) {
            finalTextBody += quoteMessage(original, true)
        }

        // Add quoted original message to HTML body
        let finalHtmlBody = body.html || ''
        if (includeOriginal && body.html && original.htmlBody) {
            // Simple HTML quoting - wrap in blockquote
            const fromText = originalFromData?.text || 'Unknown Sender'
            const dateStr = original.date ? new Date(original.date).toLocaleString() : 'Unknown Date'
            
            finalHtmlBody += `
                <br><br>
                <div style="border-left: 2px solid #ccc; padding-left: 10px; margin-left: 10px; color: #666;">
                    <p>On ${dateStr}, ${fromText} wrote:</p>
                    ${original.htmlBody}
                </div>
            `
        }

        // Create sent email record
        const replyEmailId = nanoid()
        const messageId = `${replyEmailId}@${fromDomain}`
        
        console.log('💾 Creating sent email record:', replyEmailId)
        
        const sentEmailRecord = await db.insert(sentEmails).values({
            id: replyEmailId,
            from: body.from,
            fromAddress,
            fromDomain,
            to: JSON.stringify(toAddresses),
            cc: ccAddresses.length > 0 ? JSON.stringify(ccAddresses) : null,
            bcc: bccAddresses.length > 0 ? JSON.stringify(bccAddresses) : null,
            replyTo: replyToAddresses.length > 0 ? JSON.stringify(replyToAddresses) : null,
            subject,
            textBody: finalTextBody,
            htmlBody: finalHtmlBody,
            headers: JSON.stringify({
                ...(body.headers || {}),
                'In-Reply-To': inReplyTo,
                'References': references.join(' ')
            }),
            attachments: body.attachments ? JSON.stringify(body.attachments) : null,
            status: SENT_EMAIL_STATUS.PENDING,
            messageId,
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
                .where(eq(sentEmails.id, replyEmailId))
            
            return NextResponse.json(
                { error: 'Email service not configured. Please contact support.' },
                { status: 500 }
            )
        }

        try {
            console.log('📤 Sending reply email via AWS SES')
            
            // Build raw email message with proper headers
            const rawMessage = buildRawEmailMessage({
                from: body.from,
                to: toAddresses,
                cc: ccAddresses,
                bcc: bccAddresses,
                replyTo: replyToAddresses,
                subject,
                textBody: finalTextBody,
                htmlBody: finalHtmlBody,
                messageId,
                inReplyTo,
                references,
                date: new Date(),
                customHeaders: body.headers
            })
            
            // Send raw email to preserve headers
            const sesCommand = new SendRawEmailCommand({
                RawMessage: {
                    Data: Buffer.from(rawMessage)
                },
                Source: fromAddress,
                Destinations: [...toAddresses, ...ccAddresses, ...bccAddresses].map(extractEmailAddress)
            })

            const sesResponse = await sesClient.send(sesCommand)
            const sesMessageId = sesResponse.MessageId

            console.log('✅ Reply sent successfully via SES:', sesMessageId)

            // Update email record with success
            await db
                .update(sentEmails)
                .set({
                    status: SENT_EMAIL_STATUS.SENT,
                    providerResponse: JSON.stringify(sesResponse),
                    sentAt: new Date(),
                    updatedAt: new Date()
                })
                .where(eq(sentEmails.id, replyEmailId))

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

            console.log('✅ Reply processing complete')
            return NextResponse.json({ id: replyEmailId }, { status: 200 })

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
                .where(eq(sentEmails.id, replyEmailId))
            
            return NextResponse.json(
                { error: 'Failed to send reply. Please try again later.' },
                { status: 500 }
            )
        }

    } catch (error) {
        console.error('💥 Unexpected error in POST /api/v2/emails/[id]/reply:', error)
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        )
    }
} 