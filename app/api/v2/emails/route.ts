import { defineRoute } from "@omer-x/next-openapi-route-handler"
import { z } from "zod"
import { NextRequest, NextResponse } from 'next/server'
import { validateRequest } from '../helper/main'
import { processAttachments, attachmentsToStorageFormat, type AttachmentInput } from '../helper/attachment-processor'
import { buildRawEmailMessage } from '../helper/email-builder'
import { SESClient, SendRawEmailCommand } from '@aws-sdk/client-ses'
import { db } from '@/lib/db'
import { sentEmails, emailDomains, SENT_EMAIL_STATUS } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { Autumn as autumn } from 'autumn-js'
import { nanoid } from 'nanoid'
import { canUserSendFromEmail, extractEmailAddress, extractDomain } from '@/lib/email-management/agent-email-helper'
import { ApiErrorSchema, buildApiError, ERROR_CODES } from '../schemas/errors'

/**
 * POST /api/v2/emails
 * Send an email through the API (Resend-compatible)
 * Supports both session-based auth and API key auth
 * Has tests? ❌
 * Has logging? ✅
 * Has types? ✅
 * Has OpenAPI? ✅
 */

// Define Zod schemas for validation and OpenAPI generation
const PostEmailsRequestSchema = z.object({
    from: z.string().email("From address must be a valid email"),
    to: z.union([
        z.string().email("To address must be a valid email"),
        z.array(z.string().email("Each to address must be a valid email"))
    ]),
    subject: z.string().min(1, "Subject is required"),
    bcc: z.union([z.string(), z.array(z.string())]).optional(),
    cc: z.union([z.string(), z.array(z.string())]).optional(),
    reply_to: z.union([z.string(), z.array(z.string())]).optional(), // snake_case (legacy)
    replyTo: z.union([z.string(), z.array(z.string())]).optional(),  // camelCase (Resend-compatible)
    html: z.string().optional(),
    text: z.string().optional(),
    headers: z.record(z.string(), z.string()).optional(),
    attachments: z.any().array().optional(), // Type comes from AttachmentInput
    tags: z.array(z.object({  // Resend-compatible tags
        name: z.string(),
        value: z.string()
    })).optional(),
}).refine(
    (data) => data.html || data.text,
    { message: "Either html or text content must be provided" }
)

const PostEmailsResponseSchema = z.object({
    id: z.string(),
    messageId: z.string(),  // AWS SES Message ID
})

// Export schemas for testing
export { PostEmailsRequestSchema, PostEmailsResponseSchema }

// Legacy type exports for backward compatibility
export type PostEmailsRequest = z.infer<typeof PostEmailsRequestSchema>
export type PostEmailsResponse = z.infer<typeof PostEmailsResponseSchema>

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

// buildRawEmailMessage function moved to ../helper/email-builder.ts

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

export const { POST } = defineRoute({
    operationId: "sendEmail",
    method: "POST",
    summary: "Send an email",
    description: "Sends an email using AWS SES with support for attachments, HTML/text content, and Resend-compatible API. Tracks usage limits via Autumn.",
    tags: ["Emails"],
    requestBody: PostEmailsRequestSchema,
    responses: {
        200: { 
            description: "Email sent successfully", 
            content: PostEmailsResponseSchema 
        },
        400: { 
            description: "Invalid request body or validation error", 
            content: ApiErrorSchema 
        },
        401: { 
            description: "Authentication required - missing or invalid API key", 
            content: ApiErrorSchema 
        },
        403: { 
            description: "Forbidden - sender domain not owned or not verified", 
            content: ApiErrorSchema 
        },
        429: { 
            description: "Rate limit exceeded - email sending limit reached", 
            content: ApiErrorSchema 
        },
        500: { 
            description: "Internal server error or AWS SES failure", 
            content: ApiErrorSchema 
        },
    },
    action: async (params, req) => {
        const requestId = `req_${nanoid()}`
        console.log(`📧 [${requestId}] POST /api/v2/emails - Starting request`)
        
        // Extract validated requestBody from params
        // Type assertion is safe here because Zod validation ensures correct shape
        const requestBody = params.body as PostEmailsRequest
        
        // Cast to NextRequest for validateRequest compatibility
        // The library provides standard Request, but our auth helper expects NextRequest
        const request = req as unknown as NextRequest
        
        try {
            console.log(`🔐 [${requestId}] Validating request authentication`)
            const { userId, error } = await validateRequest(request)
            if (!userId) {
                console.log(`❌ [${requestId}] Authentication failed:`, error)
                const apiError = buildApiError({
                    status: 401,
                    code: ERROR_CODES.AUTHENTICATION_REQUIRED,
                    title: 'Authentication Required',
                    detail: error || 'Valid API key required to send emails',
                    instance: '/api/v2/emails',
                    category: 'authentication_error',
                    suggestion: 'Include Authorization: Bearer <api_key> header in your request',
                    requestId,
                })
                return NextResponse.json(apiError, { status: 401 })
            }
            console.log(`✅ [${requestId}] Authentication successful for userId:`, userId)

            // Check for idempotency key
            const idempotencyKey = request.headers.get('Idempotency-Key')
            if (idempotencyKey) {
                console.log(`🔑 [${requestId}] Idempotency key provided:`, idempotencyKey)
                
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
                    console.log(`♻️ [${requestId}] Idempotent request - returning existing email:`, existingEmail[0].id)
                    return NextResponse.json({ 
                        id: existingEmail[0].id,
                        messageId: existingEmail[0].messageId || ''
                    })
                }
            }

            // requestBody is already validated by Zod schema - no manual validation needed!
            console.log(`📝 [${requestId}] Request body validated by Zod`)
            
            // Extract sender information
            const fromAddress = extractEmailAddress(requestBody.from)
            const fromDomain = extractDomain(requestBody.from)
            
            console.log(`📧 [${requestId}] Sender details:`, { from: requestBody.from, address: fromAddress, domain: fromDomain })

            // Check if this is the special agent@inbnd.dev email (allowed for all users)
            const { isAgentEmail } = canUserSendFromEmail(requestBody.from)
            
            if (isAgentEmail) {
                console.log(`✅ [${requestId}] Using agent@inbnd.dev - allowed for all users`)
            } else {
                // Verify sender domain ownership for non-agent emails
                console.log(`🔍 [${requestId}] Verifying domain ownership for:`, fromDomain)
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
                    console.log(`❌ [${requestId}] User does not own the sender domain:`, fromDomain)
                    const apiError = buildApiError({
                        status: 403,
                        code: ERROR_CODES.DOMAIN_NOT_OWNED,
                        title: 'Domain Not Owned',
                        detail: `You don't have permission to send from domain: ${fromDomain}`,
                        instance: '/api/v2/emails',
                        category: 'authorization_error',
                        field: 'from',
                        suggestion: 'Verify the domain in your dashboard before sending emails from it',
                        requestId,
                    })
                    return NextResponse.json(apiError, { status: 403 })
                }

                console.log(`✅ [${requestId}] Domain ownership verified`)
            }

            // Convert recipients to arrays (support both snake_case and camelCase)
            const toAddresses = toArray(requestBody.to)
            const ccAddresses = toArray(requestBody.cc)
            const bccAddresses = toArray(requestBody.bcc)
            const replyToAddresses = toArray(requestBody.replyTo || requestBody.reply_to) // Support both formats
            
            console.log(`📨 [${requestId}] Recipients:`, {
                to: toAddresses.length,
                cc: ccAddresses.length,
                bcc: bccAddresses.length,
                replyTo: replyToAddresses.length
            })

            // Email format validation already handled by Zod schema
            // No manual validation needed

            // Process attachments if provided
            console.log(`📎 [${requestId}] Processing attachments`)
            let processedAttachments: any[] = []
            if (requestBody.attachments && requestBody.attachments.length > 0) {
                try {
                    processedAttachments = await processAttachments(requestBody.attachments)
                    console.log(`✅ [${requestId}] Attachments processed successfully:`, processedAttachments.length)
                } catch (attachmentError) {
                    console.error(`❌ [${requestId}] Attachment processing error:`, attachmentError)
                    const apiError = buildApiError({
                        status: 400,
                        code: ERROR_CODES.VALIDATION_ERROR,
                        title: 'Attachment Processing Failed',
                        detail: attachmentError instanceof Error ? attachmentError.message : 'Failed to process attachments',
                        instance: '/api/v2/emails',
                        category: 'validation_error',
                        field: 'attachments',
                        suggestion: 'Check that attachments are properly formatted and within size limits',
                        requestId,
                    })
                    return NextResponse.json(apiError, { status: 400 })
                }
            }

            // Check Autumn for email sending limits
            console.log(`🔍 [${requestId}] Checking email sending limits with Autumn`)
            const { data: emailCheck, error: emailCheckError } = await autumn.check({
                customer_id: userId,
                feature_id: "emails_sent"
            })

            if (emailCheckError) {
                console.error(`❌ [${requestId}] Autumn email check error:`, emailCheckError)
                const apiError = buildApiError({
                    status: 500,
                    code: ERROR_CODES.INTERNAL_SERVER_ERROR,
                    title: 'Rate Limit Check Failed',
                    detail: 'Failed to verify email sending limits',
                    instance: '/api/v2/emails',
                    category: 'server_error',
                    suggestion: 'Please try again or contact support if the issue persists',
                    requestId,
                })
                return NextResponse.json(apiError, { status: 500 })
            }

            console.log(`🔍 [${requestId}] Email check:`, emailCheck)

            if (!emailCheck.allowed) {
                console.log(`❌ [${requestId}] Email sending limit reached for user:`, userId)
                const apiError = buildApiError({
                    status: 429,
                    code: ERROR_CODES.EMAIL_LIMIT_REACHED,
                    title: 'Email Limit Reached',
                    detail: 'You have reached your email sending limit for this period',
                    instance: '/api/v2/emails',
                    category: 'rate_limit_error',
                    suggestion: 'Upgrade your plan to send more emails or wait for the limit to reset',
                    requestId,
                })
                return NextResponse.json(apiError, { status: 429 })
            }

            // Create sent email record
            const emailId = nanoid()
            console.log(`💾 [${requestId}] Creating sent email record:`, emailId)
            
            const sentEmailRecord = await db.insert(sentEmails).values({
                id: emailId,
                from: requestBody.from,
                fromAddress,
                fromDomain,
                to: JSON.stringify(toAddresses),
                cc: ccAddresses.length > 0 ? JSON.stringify(ccAddresses) : null,
                bcc: bccAddresses.length > 0 ? JSON.stringify(bccAddresses) : null,
                replyTo: replyToAddresses.length > 0 ? JSON.stringify(replyToAddresses) : null,
                subject: requestBody.subject,
                textBody: requestBody.text,
                htmlBody: requestBody.html,
                headers: requestBody.headers ? JSON.stringify(requestBody.headers) : null,
                attachments: processedAttachments.length > 0 ? JSON.stringify(
                    attachmentsToStorageFormat(processedAttachments)
                ) : null,
                tags: requestBody.tags ? JSON.stringify(requestBody.tags) : null, // Store tags
                status: SENT_EMAIL_STATUS.PENDING,
                userId,
                idempotencyKey,
                createdAt: new Date(),
                updatedAt: new Date()
            }).returning()

            // Check if SES is configured
            if (!sesClient) {
                console.log(`❌ [${requestId}] AWS SES not configured`)
                
                // Update email status to failed
                await db
                    .update(sentEmails)
                    .set({
                        status: SENT_EMAIL_STATUS.FAILED,
                        failureReason: 'AWS SES not configured',
                        updatedAt: new Date()
                    })
                    .where(eq(sentEmails.id, emailId))
                
                const apiError = buildApiError({
                    status: 500,
                    code: ERROR_CODES.CONFIGURATION_ERROR,
                    title: 'Email Service Not Configured',
                    detail: 'AWS SES is not configured on the server',
                    instance: '/api/v2/emails',
                    category: 'server_error',
                    suggestion: 'Contact support to resolve this configuration issue',
                    requestId,
                })
                return NextResponse.json(apiError, { status: 500 })
            }

            try {
                console.log(`📤 [${requestId}] Sending email via AWS SES`)
                
                // Parse the from address to support display names
                const fromParsed = parseEmailWithName(requestBody.from)
                const sourceEmail = fromParsed.email
                const formattedFromAddress = formatEmailWithName(sourceEmail, fromParsed.name)
                
                // Always use SendRawEmailCommand for full MIME support (attachments, display names, etc.)
                console.log(`📧 [${requestId}] Building raw email message with full MIME support`)
                
                const rawMessage = buildRawEmailMessage({
                    from: formattedFromAddress,
                    to: toAddresses,
                    cc: ccAddresses.length > 0 ? ccAddresses : undefined,
                    bcc: bccAddresses.length > 0 ? bccAddresses : undefined,
                    replyTo: replyToAddresses.length > 0 ? replyToAddresses : undefined,
                    subject: requestBody.subject,
                    textBody: requestBody.text,
                    htmlBody: requestBody.html,
                    customHeaders: requestBody.headers as Record<string, string> | undefined,
                    attachments: processedAttachments,
                    date: new Date()
                })
                
                const rawCommand = new SendRawEmailCommand({
                    RawMessage: {
                        Data: Buffer.from(rawMessage)
                    },
                    Source: sourceEmail,
                    Destinations: [...toAddresses, ...ccAddresses, ...bccAddresses].map(extractEmailAddress)
                })
                
                const sesResponse = await sesClient.send(rawCommand)
                const messageId = sesResponse.MessageId

                console.log(`✅ [${requestId}] Email sent successfully via SES:`, messageId)

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
                    console.log(`📊 [${requestId}] Tracking email usage with Autumn`)
                    const { error: trackError } = await autumn.track({
                        customer_id: userId,
                        feature_id: "emails_sent",
                        value: 1,
                    })

                    if (trackError) {
                        console.error(`❌ [${requestId}] Failed to track email usage:`, trackError)
                        // Don't fail the request if tracking fails
                    }
                }

                console.log(`✅ [${requestId}] Email processing complete`)
                const response: PostEmailsResponse = {
                    id: emailId,
                    messageId: messageId || ''
                }
                return NextResponse.json(response, { status: 200 })

            } catch (sesError) {
                console.error(`❌ [${requestId}] SES send error:`, sesError)
                
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
                
                const apiError = buildApiError({
                    status: 500,
                    code: ERROR_CODES.AWS_SES_ERROR,
                    title: 'Email Sending Failed',
                    detail: sesError instanceof Error ? sesError.message : 'Failed to send email via AWS SES',
                    instance: '/api/v2/emails',
                    category: 'server_error',
                    suggestion: 'Please try again later or contact support if the issue persists',
                    requestId,
                })
                return NextResponse.json(apiError, { status: 500 })
            }

        } catch (error) {
            console.error(`💥 [${requestId}] Unexpected error in POST /api/v2/emails:`, error)
            const apiError = buildApiError({
                status: 500,
                code: ERROR_CODES.INTERNAL_SERVER_ERROR,
                title: 'Internal Server Error',
                detail: 'An unexpected error occurred while processing your email',
                instance: '/api/v2/emails',
                category: 'server_error',
                suggestion: 'Please try again later or contact support if the issue persists',
                requestId: `req_${nanoid()}`, // Fallback request ID
            })
            return NextResponse.json(apiError, { status: 500 })
        }
    }
}) 