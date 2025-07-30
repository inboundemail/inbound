import { SESClient, SendRawEmailCommand } from '@aws-sdk/client-ses'
import { db } from '@/lib/db'
import { sentEmails, emailDomains, SENT_EMAIL_STATUS } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { Autumn as autumn } from 'autumn-js'
import { nanoid } from 'nanoid'

// Helper functions
export function extractEmailAddress(email: string): string {
    const match = email.match(/<(.+)>/)
    return match ? match[1] : email.trim()
}

export function extractDomain(email: string): string {
    const address = extractEmailAddress(email)
    const parts = address.split('@')
    return parts.length === 2 ? parts[1] : ''
}

export function toArray(value: string | string[] | undefined): string[] {
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

// Format date for email headers
export function formatEmailDate(date: Date): string {
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

// Build raw email message
export function buildRawEmailMessage(params: {
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
    
    // Check if Message-ID is provided in custom headers
    const hasCustomMessageId = params.customHeaders && 
        Object.keys(params.customHeaders).some(key => key.toLowerCase() === 'message-id')
    
    // Build headers
    let headers = [
        `From: ${params.from}`,
        `To: ${params.to.join(', ')}`,
        params.cc && params.cc.length > 0 ? `Cc: ${params.cc.join(', ')}` : null,
        params.replyTo && params.replyTo.length > 0 ? `Reply-To: ${params.replyTo.join(', ')}` : null,
        `Subject: ${params.subject}`,
        // Only add Message-ID if not provided in custom headers
        !hasCustomMessageId ? `Message-ID: <${params.messageId}@${extractDomain(params.from)}>` : null,
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

export interface SendEmailParams {
    userId: string
    from: string
    to: string | string[]
    subject: string
    cc?: string | string[]
    bcc?: string | string[]
    replyTo?: string | string[]
    textBody?: string
    htmlBody?: string
    headers?: Record<string, string>
    attachments?: Array<{
        content: string // Base64 encoded
        filename: string
        path?: string
        contentType?: string
    }>
    inReplyTo?: string
    references?: string[]
    idempotencyKey?: string
}

export interface SendEmailResult {
    success: boolean
    data?: {
        id: string
        messageId?: string
    }
    error?: string
}

export async function sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
    try {
        // Convert recipients to arrays
        const toAddresses = toArray(params.to)
        const ccAddresses = toArray(params.cc)
        const bccAddresses = toArray(params.bcc)
        const replyToAddresses = toArray(params.replyTo)

        // Extract sender information
        const fromAddress = extractEmailAddress(params.from)
        const fromDomain = extractDomain(params.from)

        // Validate required fields
        if (!params.from || toAddresses.length === 0 || !params.subject) {
            return { success: false, error: 'Missing required fields: from, to, and subject are required' }
        }

        // Validate email content
        if (!params.htmlBody && !params.textBody) {
            return { success: false, error: 'Either html or text content must be provided' }
        }

        // Verify sender domain ownership
        const userDomain = await db
            .select()
            .from(emailDomains)
            .where(
                and(
                    eq(emailDomains.userId, params.userId),
                    eq(emailDomains.domain, fromDomain),
                    eq(emailDomains.status, 'verified')
                )
            )
            .limit(1)

        if (userDomain.length === 0) {
            return { success: false, error: `You don't have permission to send from domain: ${fromDomain}` }
        }

        // Validate email addresses
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        const allRecipients = [...toAddresses, ...ccAddresses, ...bccAddresses]
        
        for (const email of allRecipients) {
            const address = extractEmailAddress(email)
            if (!emailRegex.test(address)) {
                return { success: false, error: `Invalid email format: ${email}` }
            }
        }

        // Check Autumn for email sending limits
        const { data: emailCheck, error: emailCheckError } = await autumn.check({
            customer_id: params.userId,
            feature_id: "emails_sent"
        })

        if (emailCheckError) {
            return { success: false, error: 'Failed to check email sending limits' }
        }

        if (!emailCheck.allowed) {
            return { success: false, error: 'Email sending limit reached. Please upgrade your plan to send more emails.' }
        }

        // Check if SES is configured
        if (!sesClient) {
            return { success: false, error: 'Email service not configured. Please contact support.' }
        }

        // Check for idempotency
        if (params.idempotencyKey) {
            const existingEmail = await db
                .select()
                .from(sentEmails)
                .where(
                    and(
                        eq(sentEmails.userId, params.userId),
                        eq(sentEmails.idempotencyKey, params.idempotencyKey)
                    )
                )
                .limit(1)
            
            if (existingEmail.length > 0) {
                return { 
                    success: true, 
                    data: { 
                        id: existingEmail[0].id,
                        messageId: existingEmail[0].messageId || undefined
                    }
                }
            }
        }

        // Create email record
        const emailId = nanoid()
        
        // Handle custom Message-ID
        let messageId = `${emailId}@${fromDomain}`
        if (params.headers) {
            const messageIdKey = Object.keys(params.headers).find(
                key => key.toLowerCase() === 'message-id'
            )
            if (messageIdKey && params.headers[messageIdKey]) {
                messageId = params.headers[messageIdKey].replace(/^<|>$/g, '')
            }
        }
        
        const sentEmailRecord = await db.insert(sentEmails).values({
            id: emailId,
            from: params.from,
            fromAddress,
            fromDomain,
            to: JSON.stringify(toAddresses),
            cc: ccAddresses.length > 0 ? JSON.stringify(ccAddresses) : null,
            bcc: bccAddresses.length > 0 ? JSON.stringify(bccAddresses) : null,
            replyTo: replyToAddresses.length > 0 ? JSON.stringify(replyToAddresses) : null,
            subject: params.subject,
            textBody: params.textBody,
            htmlBody: params.htmlBody,
            headers: JSON.stringify({
                ...(params.headers || {}),
                ...(params.inReplyTo && { 'In-Reply-To': params.inReplyTo }),
                ...(params.references && params.references.length > 0 && { 'References': params.references.join(' ') })
            }),
            attachments: params.attachments ? JSON.stringify(params.attachments) : null,
            status: SENT_EMAIL_STATUS.PENDING,
            messageId,
            userId: params.userId,
            idempotencyKey: params.idempotencyKey,
            createdAt: new Date(),
            updatedAt: new Date()
        }).returning()

        // Build and send email
        const rawMessage = buildRawEmailMessage({
            from: params.from,
            to: toAddresses,
            cc: ccAddresses,
            bcc: bccAddresses,
            replyTo: replyToAddresses,
            subject: params.subject,
            textBody: params.textBody,
            htmlBody: params.htmlBody,
            messageId,
            inReplyTo: params.inReplyTo,
            references: params.references,
            date: new Date(),
            customHeaders: params.headers
        })
        
        const sesCommand = new SendRawEmailCommand({
            RawMessage: {
                Data: Buffer.from(rawMessage)
            },
            Source: fromAddress,
            Destinations: [...toAddresses, ...ccAddresses, ...bccAddresses].map(extractEmailAddress)
        })

        const sesResponse = await sesClient.send(sesCommand)
        const sesMessageId = sesResponse.MessageId

        // Update email record with success
        await db
            .update(sentEmails)
            .set({
                status: SENT_EMAIL_STATUS.SENT,
                providerResponse: JSON.stringify(sesResponse),
                sentAt: new Date(),
                updatedAt: new Date()
            })
            .where(eq(sentEmails.id, emailId))

        // Track usage with Autumn (only if not unlimited)
        if (!emailCheck.unlimited) {
            const { error: trackError } = await autumn.track({
                customer_id: params.userId,
                feature_id: "emails_sent",
                value: 1,
            })

            if (trackError) {
                console.error('Failed to track email usage:', trackError)
                // Don't fail the request if tracking fails
            }
        }

        return { 
            success: true, 
            data: { 
                id: emailId,
                messageId: sesMessageId || undefined
            }
        }

    } catch (error) {
        console.error('Error sending email:', error)
        return { success: false, error: 'Failed to send email' }
    }
}