import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/auth'
import { headers } from 'next/headers'
import { db } from '@/lib/db'
import { structuredEmails, endpoints, endpointDeliveries, sesEvents } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { EmailForwarder } from '@/lib/email-management/email-forwarder'
import { sanitizeHtml, type ParsedEmailData } from '@/lib/email-management/email-parser'

// Maximum webhook payload size - increased to 5MB with better optimization
const MAX_WEBHOOK_PAYLOAD_SIZE = 5_000_000 // 5MB
const SAFE_WEBHOOK_PAYLOAD_SIZE = 1_000_000 // 1MB - preferred size after optimization

// Force rebuild
/**
 * POST /api/v2/emails/{id}/resend
 * Resends an email to a specific endpoint
 * Requires endpoint ID in the request body
 */

export interface PostResendEmailRequest {
  endpointId: string
}

export interface PostResendEmailResponse {
  success: boolean
  message: string
  deliveryId?: string
  error?: string
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: emailId } = await params
  console.log(`📤 POST /api/v2/emails/${emailId}/resend - Starting resend process`)

  try {
    // Authenticate user
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user?.id) {
      console.warn(`❌ Resend email - Unauthorized request for email ${emailId}`)
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const userId = session.user.id

    // Parse request body
    const requestData: PostResendEmailRequest = await request.json()

    if (!requestData.endpointId) {
      return NextResponse.json(
        { success: false, error: 'endpointId is required' },
        { status: 400 }
      )
    }

    // Verify the email belongs to the user and get the email details
    const emailRecord = await db
      .select({
        id: structuredEmails.id,
        emailId: structuredEmails.emailId,
        subject: structuredEmails.subject,
        fromData: structuredEmails.fromData,
        toData: structuredEmails.toData,
        textBody: structuredEmails.textBody,
        htmlBody: structuredEmails.htmlBody,
        rawContent: structuredEmails.rawContent,
        attachments: structuredEmails.attachments,
        headers: structuredEmails.headers,
      })
      .from(structuredEmails)
      .where(and(
        eq(structuredEmails.id, emailId),
        eq(structuredEmails.userId, userId)
      ))
      .limit(1)

    if (!emailRecord[0]) {
      console.warn(`❌ Resend email - Email ${emailId} not found or unauthorized`)
      return NextResponse.json(
        { success: false, error: 'Email not found or access denied' },
        { status: 404 }
      )
    }

    const email = emailRecord[0]
    console.log(`📤 Resend email - Found email: ${email.subject} (emailId: ${email.emailId})`)

    // Verify the endpoint exists, is active, and belongs to the user
    const endpointRecord = await db
      .select({
        id: endpoints.id,
        name: endpoints.name,
        type: endpoints.type,
        config: endpoints.config,
        isActive: endpoints.isActive,
      })
      .from(endpoints)
      .where(and(
        eq(endpoints.id, requestData.endpointId),
        eq(endpoints.userId, userId),
        eq(endpoints.isActive, true)
      ))
      .limit(1)

    if (!endpointRecord[0]) {
      console.warn(`❌ Resend email - Endpoint ${requestData.endpointId} not found, inactive, or unauthorized`)
      return NextResponse.json(
        { success: false, error: 'Endpoint not found, inactive, or access denied' },
        { status: 404 }
      )
    }

    const endpoint = endpointRecord[0]
    console.log(`📤 Resend email - Target endpoint: ${endpoint.name} (${endpoint.type})`)

    // Create a new delivery record
    const deliveryId = nanoid()
    const now = new Date()

    await db.insert(endpointDeliveries).values({
      id: deliveryId,
      emailId: email.emailId, // Use the actual emailId for consistency
      endpointId: endpoint.id,
      deliveryType: endpoint.type,
      status: 'pending',
      attempts: 1,
      lastAttemptAt: now,
      createdAt: now,
      updatedAt: now,
    })

    console.log(`📤 Resend email - Created delivery record ${deliveryId}`)

    try {
      // Use a targeted delivery approach similar to the email router
      // but deliver only to the specified endpoint
      await deliverToSpecificEndpoint(email.emailId, endpoint, deliveryId)

      // Check the actual delivery status from the database
      const deliveryResult = await db
        .select({ status: endpointDeliveries.status })
        .from(endpointDeliveries)
        .where(eq(endpointDeliveries.id, deliveryId))
        .limit(1)

      const finalStatus = deliveryResult[0]?.status || 'unknown'
      
      if (finalStatus === 'success') {
        console.log(`✅ Resend email - Successfully delivered to endpoint ${endpoint.name}`)
        return NextResponse.json({
          success: true,
          message: `Email resent to ${endpoint.name} successfully`,
          deliveryId
        })
      } else {
        console.log(`❌ Resend email - Delivery failed with status: ${finalStatus}`)
        return NextResponse.json({
          success: false,
          message: `Delivery failed to ${endpoint.name}`,
          error: `Webhook returned error status`,
          deliveryId
        })
      }

    } catch (deliveryError) {
      console.error(`❌ Resend email - Delivery failed:`, deliveryError)
      
      // Update delivery record to reflect failure
      await db
        .update(endpointDeliveries)
        .set({
          status: 'failed',
          lastAttemptAt: new Date(),
          responseData: JSON.stringify({
            error: deliveryError instanceof Error ? deliveryError.message : 'Unknown delivery error',
            resendAttempt: true,
            failedAt: new Date().toISOString()
          }),
          updatedAt: new Date()
        })
        .where(eq(endpointDeliveries.id, deliveryId))

      return NextResponse.json({
        success: false,
        message: 'Email resend failed',
        error: deliveryError instanceof Error ? deliveryError.message : 'Unknown error',
        deliveryId
      })
    }

  } catch (error) {
    console.error(`💥 Resend email - Unexpected error:`, error)
    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
        message: 'Failed to resend email'
      },
      { status: 500 }
    )
  }
}

/**
 * Deliver email to a specific endpoint (similar to email-router functions)
 */
async function deliverToSpecificEndpoint(emailId: string, endpoint: any, deliveryId: string): Promise<void> {
  console.log(`🎯 deliverToSpecificEndpoint - Delivering email ${emailId} to ${endpoint.name} (${endpoint.type})`)

  // Get email with structured data (similar to email-router)
  const emailData = await getEmailWithStructuredData(emailId)
  if (!emailData) {
    throw new Error('Email not found or missing structured data')
  }

  // Route based on endpoint type
  switch (endpoint.type) {
    case 'webhook':
      await handleWebhookEndpoint(emailId, endpoint, emailData, deliveryId)
      break
    case 'email':
    case 'email_group':
      await handleEmailForwardEndpoint(emailId, endpoint, emailData, deliveryId)
      break
    default:
      throw new Error(`Unknown endpoint type: ${endpoint.type}`)
  }

  console.log(`✅ deliverToSpecificEndpoint - Successfully delivered email ${emailId} via ${endpoint.type} endpoint`)
}

/**
 * Reconstruct ParsedEmailData from structured email data (copied from email-router)
 */
function reconstructParsedEmailData(emailData: any): ParsedEmailData {
  return {
    messageId: emailData.messageId || undefined,
    date: emailData.date || undefined,
    subject: emailData.subject || undefined,
    from: emailData.fromData ? JSON.parse(emailData.fromData) : null,
    to: emailData.toData ? JSON.parse(emailData.toData) : null,
    cc: emailData.ccData ? JSON.parse(emailData.ccData) : null,
    bcc: emailData.bccData ? JSON.parse(emailData.bccData) : null,
    replyTo: emailData.replyToData ? JSON.parse(emailData.replyToData) : null,
    inReplyTo: emailData.inReplyTo || undefined,
    references: emailData.references ? JSON.parse(emailData.references) : undefined,
    textBody: emailData.textBody || undefined,
    htmlBody: emailData.htmlBody || undefined,
    raw: emailData.rawContent || undefined,
    attachments: emailData.attachments ? JSON.parse(emailData.attachments) : [],
    headers: emailData.headers ? JSON.parse(emailData.headers) : {},
    priority: emailData.priority === 'false' ? false : (emailData.priority || undefined)
  }
}

/**
 * Get email data with structured information (copied from email-router)
 */
async function getEmailWithStructuredData(emailId: string) {
  // First get the email record to find the recipient
  const emailRecord = await db
    .select({
      id: structuredEmails.id,
      emailId: structuredEmails.emailId,
      messageId: structuredEmails.messageId,
      subject: structuredEmails.subject,
      fromData: structuredEmails.fromData,
      toData: structuredEmails.toData,
      ccData: structuredEmails.ccData,
      bccData: structuredEmails.bccData,
      replyToData: structuredEmails.replyToData,
      textBody: structuredEmails.textBody,
      htmlBody: structuredEmails.htmlBody,
      rawContent: structuredEmails.rawContent,
      attachments: structuredEmails.attachments,
      headers: structuredEmails.headers,
      priority: structuredEmails.priority,
      parseSuccess: structuredEmails.parseSuccess,
      parseError: structuredEmails.parseError,
      createdAt: structuredEmails.createdAt,
      updatedAt: structuredEmails.updatedAt,
      date: structuredEmails.date,
      userId: structuredEmails.userId,
      sesEventId: structuredEmails.sesEventId,
      
      // Threading fields
      threadId: structuredEmails.threadId,
      threadPosition: structuredEmails.threadPosition,
    })
    .from(structuredEmails)
    .where(eq(structuredEmails.emailId, emailId))
    .limit(1)

  if (emailRecord.length === 0) {
    return null
  }

  const email = emailRecord[0]

  // Parse recipient from toData
  let recipient = 'unknown'
  if (email.toData) {
    try {
      const toData = JSON.parse(email.toData)
      recipient = toData.addresses?.[0]?.address || 'unknown'
    } catch {
      // If parsing fails, keep 'unknown'
    }
  }

  return {
    ...email,
    recipient,
    structuredId: email.id, // Add structured ID for API compatibility
  }
}

/**
 * Handle webhook endpoint delivery (adapted from email-router)
 */
async function handleWebhookEndpoint(emailId: string, endpoint: any, emailData: any, deliveryId: string): Promise<void> {
  try {
    console.log(`📡 handleWebhookEndpoint - Processing webhook endpoint: ${endpoint.name}`)

    // Parse endpoint configuration
    const config = JSON.parse(endpoint.config)
    const webhookUrl = config.url
    const timeout = config.timeout || 30
    const customHeaders = config.headers || {}

    if (!webhookUrl) {
      throw new Error('Webhook URL not configured')
    }

    console.log(`📤 handleWebhookEndpoint - Sending email ${emailData.messageId} to webhook: ${endpoint.name} (${webhookUrl})`)

    // Reconstruct ParsedEmailData from structured data
    const parsedEmailData = reconstructParsedEmailData(emailData)

    // Get the base URL for attachment downloads (from environment or construct from request)
    const baseUrl = process.env.NEXT_PUBLIC_BETTER_AUTH_URL || 'https://inbound.new'
    
    // Add download URLs to attachments
    const attachmentsWithUrls = parsedEmailData.attachments?.map(att => ({
      ...att,
      downloadUrl: `${baseUrl}/api/v2/attachments/${emailData.structuredId}/${encodeURIComponent(att.filename || 'attachment')}`
    })) || []

    // Create enhanced parsedData with download URLs
    const enhancedParsedData = {
      ...parsedEmailData,
      attachments: attachmentsWithUrls
    }

    // Create webhook payload with the exact structure expected
    const webhookPayload = {
      event: 'email.received',
      timestamp: new Date().toISOString(),
      email: {
        id: emailData.structuredId, // Use structured email ID for v2 API compatibility
        messageId: emailData.messageId,
        from: emailData.fromData ? JSON.parse(emailData.fromData) : null,
        to: emailData.toData ? JSON.parse(emailData.toData) : null,
        recipient: emailData.recipient,
        subject: emailData.subject,
        receivedAt: emailData.date,
        
        // Threading information
        threadId: emailData.threadId || null,
        threadPosition: emailData.threadPosition || null,
        
        // Full ParsedEmailData structure with download URLs
        parsedData: enhancedParsedData,
        
        // Cleaned content for backward compatibility
        cleanedContent: {
          html: parsedEmailData.htmlBody ? sanitizeHtml(parsedEmailData.htmlBody) : null,
          text: parsedEmailData.textBody || null,
          hasHtml: !!parsedEmailData.htmlBody,
          hasText: !!parsedEmailData.textBody,
          attachments: attachmentsWithUrls, // Include download URLs in cleaned content too
          headers: parsedEmailData.headers || {}
        }
      },
      endpoint: {
        id: endpoint.id,
        name: endpoint.name,
        type: endpoint.type
      }
    }

    const payloadString = JSON.stringify(webhookPayload)

    // Prepare headers
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      'User-Agent': 'InboundEmail-Webhook/1.0',
      'X-Webhook-Event': 'email.received',
      'X-Endpoint-ID': endpoint.id,
      'X-Webhook-Timestamp': webhookPayload.timestamp,
      'X-Email-ID': emailData.structuredId,
      'X-Message-ID': emailData.messageId || '',
      ...customHeaders
    }

    // Check payload size and strip fields if necessary
    let finalPayload = webhookPayload
    let finalPayloadString = payloadString
    const strippedFields: string[] = []

    if (payloadString.length > MAX_WEBHOOK_PAYLOAD_SIZE) {
      console.warn(`⚠️ handleWebhookEndpoint - Webhook payload too large (${payloadString.length} bytes), stripping attachment bodies from raw field`)
      
        // Try stripping attachment bodies from raw field first
        if (enhancedParsedData.raw) {
          // Remove base64-encoded attachment bodies while preserving MIME structure and headers
          // This regex finds ALL base64 content from header until next MIME boundary
          const cleanedRaw = enhancedParsedData.raw.replace(
            /Content-Transfer-Encoding:\s*base64\s*[\r\n]+[\r\n]+([\s\S]+?)(?=\r?\n--|\r?\n\r?\nContent-|$)/gi,
            'Content-Transfer-Encoding: base64\r\n\r\n[binary attachment data removed - use Attachments API]\r\n'
          )
        
        const payloadWithCleanedRaw = {
          ...webhookPayload,
          email: {
            ...webhookPayload.email,
            parsedData: {
              ...enhancedParsedData,
              raw: cleanedRaw
            }
          }
        }
        const payloadStringWithCleanedRaw = JSON.stringify(payloadWithCleanedRaw)
        
        if (payloadStringWithCleanedRaw.length <= MAX_WEBHOOK_PAYLOAD_SIZE) {
          finalPayload = payloadWithCleanedRaw
          finalPayloadString = payloadStringWithCleanedRaw
          strippedFields.push('raw (attachment bodies removed)')
          console.log(`✅ handleWebhookEndpoint - Removed attachment bodies from raw field, new size: ${payloadStringWithCleanedRaw.length} bytes`)
        } else {
          // Still too large, also strip headers
          const payloadWithCleanedRawAndNoHeaders = {
            ...payloadWithCleanedRaw,
            email: {
              ...payloadWithCleanedRaw.email,
              parsedData: {
                ...enhancedParsedData,
                raw: cleanedRaw,
                headers: {}
              }
            }
          }
          const payloadStringWithCleanedRawAndNoHeaders = JSON.stringify(payloadWithCleanedRawAndNoHeaders)
          
          if (payloadStringWithCleanedRawAndNoHeaders.length <= MAX_WEBHOOK_PAYLOAD_SIZE) {
            finalPayload = payloadWithCleanedRawAndNoHeaders
            finalPayloadString = payloadStringWithCleanedRawAndNoHeaders
            strippedFields.push('raw (attachment bodies removed)', 'headers')
            console.warn(`⚠️ handleWebhookEndpoint - Also removed headers, final size: ${payloadStringWithCleanedRawAndNoHeaders.length} bytes`)
          } else {
            // Still too large after all optimizations - create minimal payload
            const minimalPayload = {
              email: {
                id: webhookPayload.email.id,
                messageId: webhookPayload.email.messageId,
                subject: webhookPayload.email.subject,
                from: webhookPayload.email.from,
                to: webhookPayload.email.to,
                cc: webhookPayload.email.cc,
                bcc: webhookPayload.email.bcc,
                date: webhookPayload.email.date,
                parsedData: {
                  subject: enhancedParsedData.subject,
                  from: enhancedParsedData.from,
                  to: enhancedParsedData.to,
                  textBody: enhancedParsedData.textBody?.substring(0, 1000) + (enhancedParsedData.textBody?.length > 1000 ? '...[truncated]' : ''),
                  htmlBody: enhancedParsedData.htmlBody?.substring(0, 1000) + (enhancedParsedData.htmlBody?.length > 1000 ? '...[truncated]' : ''),
                  date: enhancedParsedData.date,
                  messageId: enhancedParsedData.messageId,
                  attachments: (enhancedParsedData.attachments || []).map(att => ({
                    filename: att.filename,
                    contentType: att.contentType,
                    size: att.size || att.content?.length || 0,
                    contentId: att.contentId,
                    // Note: Content removed due to size limits - use Attachments API
                  }))
                }
              },
              timestamp: webhookPayload.timestamp,
              _meta: {
                payloadOptimized: true,
                originalSize: payloadString.length,
                optimizedSize: 'calculated below',
                note: 'Payload was too large and has been heavily optimized. Use the email ID to fetch full content via API if needed.'
              }
            }
            
            const minimalPayloadString = JSON.stringify(minimalPayload)
            finalPayload = minimalPayload
            finalPayloadString = minimalPayloadString
            strippedFields.push('raw (attachment bodies removed)', 'headers', 'content (heavily truncated)', 'attachment content (kept metadata only)')
            
            // Update the meta size info
            finalPayload._meta.optimizedSize = finalPayloadString.length
            finalPayloadString = JSON.stringify(finalPayload)
            
            console.warn(`⚠️ handleWebhookEndpoint - Payload still too large after all optimizations. Created minimal payload: ${finalPayloadString.length} bytes (was ${payloadString.length} bytes)`)
          }
        }
      }
      
      // Final size validation
      if (finalPayloadString.length > MAX_WEBHOOK_PAYLOAD_SIZE) {
        const errorMessage = `Webhook payload too large even after optimization: ${finalPayloadString.length} bytes (max: ${MAX_WEBHOOK_PAYLOAD_SIZE} bytes). Email ID: ${emailId}`
        console.error(`❌ handleWebhookEndpoint - ${errorMessage}`)
        
        return NextResponse.json(
          {
            success: false,
            message: 'Email resend failed',
            error: 'Webhook payload too large even after optimization. This email contains too much data to deliver via webhook. Please use the Email API to fetch the full content instead.',
            details: {
              originalSize: payloadString.length,
              finalSize: finalPayloadString.length,
              maxSize: MAX_WEBHOOK_PAYLOAD_SIZE,
              emailId: emailId,
              suggestion: `Use GET /api/v2/emails/${emailId} to fetch the full email content`
            }
          },
          { status: 413 } // 413 Request Entity Too Large
        )
      }
      
      if (strippedFields.length > 0) {
        console.log(`📋 handleWebhookEndpoint - Optimized payload for ${endpoint.name}: ${strippedFields.join(', ')} - Final size: ${finalPayloadString.length} bytes`)
      }
    }

    // Send the webhook
    const startTime = Date.now()
    let deliverySuccess = false
    let responseCode = 0
    let responseBody = ''
    let errorMessage = ''
    let deliveryTime = 0

    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers,
        body: finalPayloadString, // Use finalPayloadString which might be smaller
        signal: AbortSignal.timeout(timeout * 1000)
      })

      deliveryTime = Date.now() - startTime
      responseCode = response.status
      responseBody = await response.text().catch(() => 'Unable to read response body')
      deliverySuccess = response.ok

      console.log(`${deliverySuccess ? '✅' : '❌'} handleWebhookEndpoint - Delivery ${deliverySuccess ? 'succeeded' : 'failed'} for ${emailData.recipient}: ${responseCode} in ${deliveryTime}ms`)

    } catch (error) {
      deliveryTime = Date.now() - startTime
      deliverySuccess = false
      
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          errorMessage = `Request timeout after ${timeout}s`
        } else {
          errorMessage = error.message
        }
      } else {
        errorMessage = 'Unknown error'
      }

      console.error(`❌ handleWebhookEndpoint - Delivery failed for ${emailData.recipient}:`, errorMessage)
    }

    // Track delivery using the provided deliveryId
    await db
      .update(endpointDeliveries)
      .set({
        status: deliverySuccess ? 'success' : 'failed',
        lastAttemptAt: new Date(),
        responseData: JSON.stringify({
          responseCode,
          responseBody: responseBody ? responseBody.substring(0, 2000) : null,
          deliveryTime,
          error: errorMessage || null,
          url: webhookUrl,
          deliveredAt: new Date().toISOString()
        }),
        updatedAt: new Date()
      })
      .where(eq(endpointDeliveries.id, deliveryId))

    if (!deliverySuccess) {
      // Don't throw here - let the caller handle the failure
      console.log(`❌ handleWebhookEndpoint - Webhook delivery failed but continuing gracefully`)
      return // Return without throwing to allow proper error handling
    }

    console.log(`✅ handleWebhookEndpoint - Successfully delivered email ${emailId} to webhook ${endpoint.name}`)

  } catch (error) {
    console.error(`❌ handleWebhookEndpoint - Error delivering to webhook:`, error)
    throw error
  }
}

/**
 * Handle email forwarding endpoints (adapted from email-router)
 */
async function handleEmailForwardEndpoint(
  emailId: string, 
  endpoint: any, 
  emailData: any,
  deliveryId: string
): Promise<void> {
  try {
    console.log(`📨 handleEmailForwardEndpoint - Processing ${endpoint.type} endpoint: ${endpoint.name}`)

    const config = JSON.parse(endpoint.config)
    const forwarder = new EmailForwarder()
    
    // Reconstruct ParsedEmailData from structured data
    const parsedEmailData = reconstructParsedEmailData(emailData)
    
    // Determine recipient addresses based on endpoint type
    const toAddresses = endpoint.type === 'email_group' 
      ? config.emails 
      : [config.forwardTo]
    
    // Use the original recipient as the from address (e.g., ryan@inbound.new)
    const fromAddress = config.fromAddress || emailData.recipient
    
    console.log(`📤 handleEmailForwardEndpoint - Forwarding to ${toAddresses.length} recipients from ${fromAddress}`)

    // Forward the email
    await forwarder.forwardEmail(
      parsedEmailData,
      fromAddress,
      toAddresses,
      {
        subjectPrefix: config.subjectPrefix,
        includeAttachments: config.includeAttachments,
        recipientEmail: emailData.recipient,
        senderName: config.senderName
      }
    )
    
    // Track successful delivery using the provided deliveryId
    await db
      .update(endpointDeliveries)
      .set({
        status: 'success',
        lastAttemptAt: new Date(),
        responseData: JSON.stringify({
          toAddresses, 
          fromAddress,
          forwardedAt: new Date().toISOString()
        }),
        updatedAt: new Date()
      })
      .where(eq(endpointDeliveries.id, deliveryId))

    console.log(`✅ handleEmailForwardEndpoint - Successfully forwarded email to ${toAddresses.length} recipients`)

  } catch (error) {
    console.error(`❌ handleEmailForwardEndpoint - Error forwarding email:`, error)
    
    // Track failed delivery using the provided deliveryId
    await db
      .update(endpointDeliveries)
      .set({
        status: 'failed',
        lastAttemptAt: new Date(),
        responseData: JSON.stringify({
          error: error instanceof Error ? error.message : 'Unknown error',
          failedAt: new Date().toISOString()
        }),
        updatedAt: new Date()
      })
      .where(eq(endpointDeliveries.id, deliveryId))
    
    throw error
  }
}
