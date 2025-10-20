/**
 * Email Router - Core email routing system for inbound emails
 * Routes incoming emails to configured endpoints (webhooks, email forwarding, email groups) based on recipient configuration.
 * Handles both legacy webhook systems and new unified endpoint architecture with fallback logic.
 * Used by the webhook API route after email ingestion to deliver emails to their configured destinations.
 */

import { db } from '@/lib/db'
import { structuredEmails, emailAddresses, endpoints, endpointDeliveries, emailDomains } from '@/lib/db/schema'
import { eq, and, or } from 'drizzle-orm'
import { triggerEmailAction } from './webhook-trigger'
import { EmailForwarder } from './email-forwarder'
import { EmailThreader } from './email-threader'
import { nanoid } from 'nanoid'
import type { ParsedEmailData } from './email-parser'
import { sanitizeHtml } from './email-parser'
import type { Endpoint } from '@/features/endpoints/types'

// Maximum webhook payload size - increased to 5MB with better optimization
const MAX_WEBHOOK_PAYLOAD_SIZE = 5_000_000 // 5MB
const SAFE_WEBHOOK_PAYLOAD_SIZE = 1_000_000 // 1MB - preferred size after optimization

/**
 * Main email routing function - routes emails to appropriate endpoints
 */
export async function routeEmail(emailId: string): Promise<void> {
  console.log(`🎯 routeEmail - Processing email ID: ${emailId}`)

  try {
    // Get email with structured data
    const emailData = await getEmailWithStructuredData(emailId)
    if (!emailData) {
      throw new Error('Email not found or missing structured data')
    }

    // 🧵 NEW: Process threading before routing
    try {
      const threadingResult = await EmailThreader.processEmailForThreading(emailId, emailData.userId)
      console.log(`🧵 Email ${emailId} assigned to thread ${threadingResult.threadId} at position ${threadingResult.threadPosition}${threadingResult.isNewThread ? ' (new thread)' : ''}`)
    } catch (threadingError) {
      // Don't fail routing if threading fails - log error and continue
      console.error(`⚠️ Threading failed for email ${emailId}:`, threadingError)
    }

    // Find associated endpoint for this email
    if (!emailData.recipient) {
      throw new Error('Email recipient not found')
    }

    // Check if this is a DMARC email and handle according to domain settings
    const isDmarcEmail = await checkIfDmarcEmail(emailData.recipient, emailData.userId)
    if (isDmarcEmail) {
      console.log(`📊 routeEmail - DMARC email detected for ${emailData.recipient}, checking domain settings`)
      return // Email is stored but not routed based on domain configuration
    }
    
    // Pass userId to findEndpointForEmail to ensure proper filtering
    const endpoint = await findEndpointForEmail(emailData.recipient, emailData.userId)
    if (!endpoint) {
      console.warn(`⚠️ routeEmail - No endpoint configured for ${emailData.recipient}, falling back to legacy webhook lookup`)
      // Fallback to existing webhook logic for backward compatibility
      const result = await triggerEmailAction(emailId)
      if (!result.success) {
        // Log the error but don't throw - this allows the email to be processed even without a webhook
        console.warn(`⚠️ routeEmail - No webhook configured for ${emailData.recipient}: ${result.error || 'Legacy webhook processing failed'}`)
        console.log(`📧 routeEmail - Email ${emailId} processed but not routed (no webhook/endpoint configured)`)
        return
      }
      return
    }

    console.log(`📍 routeEmail - Found endpoint: ${endpoint.name} (type: ${endpoint.type}) for ${emailData.recipient}`)

    // Route based on endpoint type
    switch (endpoint.type) {
      case 'webhook':
        await handleWebhookEndpoint(emailId, endpoint)
        break
      case 'email':
      case 'email_group':
        await handleEmailForwardEndpoint(emailId, endpoint, emailData)
        break
      default:
        throw new Error(`Unknown endpoint type: ${endpoint.type}`)
    }

    console.log(`✅ routeEmail - Successfully routed email ${emailId} via ${endpoint.type} endpoint`)

  } catch (error) {
    console.error(`❌ routeEmail - Error processing email ${emailId}:`, error)
    throw error
  }
}

/**
 * Get email data with structured information
 */
async function getEmailWithStructuredData(emailId: string) {
  // Get the full structured email data in a single query
  const emailWithStructuredData = await db
    .select({
      // Email record fields
      emailId: structuredEmails.emailId,
      userId: structuredEmails.userId,
      
      // Structured email data (ParsedEmailData)
      structuredId: structuredEmails.id,
      messageId: structuredEmails.messageId,
      date: structuredEmails.date,
      subject: structuredEmails.subject,
      recipient: structuredEmails.recipient,
      fromData: structuredEmails.fromData,
      toData: structuredEmails.toData,
      ccData: structuredEmails.ccData,
      bccData: structuredEmails.bccData,
      replyToData: structuredEmails.replyToData,
      inReplyTo: structuredEmails.inReplyTo,
      references: structuredEmails.references,
      textBody: structuredEmails.textBody,
      htmlBody: structuredEmails.htmlBody,
      rawContent: structuredEmails.rawContent,
      attachments: structuredEmails.attachments,
      headers: structuredEmails.headers,
      priority: structuredEmails.priority,
      parseSuccess: structuredEmails.parseSuccess,
      parseError: structuredEmails.parseError,
      
      // Threading fields
      threadId: structuredEmails.threadId,
      threadPosition: structuredEmails.threadPosition,
    })
    .from(structuredEmails)
    .where(
      or(
        eq(structuredEmails.id, emailId),
        eq(structuredEmails.emailId, emailId)
      )
    )
    .limit(1)

  const result = emailWithStructuredData[0]
  if (!result) {
    return null
  }

  // Recipient is now stored directly in structuredEmails.recipient
  return result
}

/**
 * Find endpoint configuration for an email recipient
 * Priority: endpointId → webhookId → catch-all endpoint → catch-all webhook
 */
async function findEndpointForEmail(recipient: string, userId: string): Promise<Endpoint | null> {
  try {
    console.log(`🔍 findEndpointForEmail - Looking for endpoint for ${recipient} (userId: ${userId})`)
    
    // Step 1: Look up the email address to find the configured endpoint
    const emailAddressRecord = await db
      .select({
        endpointId: emailAddresses.endpointId,
        webhookId: emailAddresses.webhookId, // Keep for backward compatibility
        address: emailAddresses.address,
        isActive: emailAddresses.isActive,
        domainId: emailAddresses.domainId,
      })
      .from(emailAddresses)
      .where(and(
        eq(emailAddresses.address, recipient),
        eq(emailAddresses.isActive, true),
        eq(emailAddresses.userId, userId)
      ))
      .limit(1)

    if (emailAddressRecord[0]) {
      const { endpointId, webhookId } = emailAddressRecord[0]

      // Priority 1: Use endpointId if available
      if (endpointId) {
        const endpointRecord = await db
          .select()
          .from(endpoints)
          .where(and(
            eq(endpoints.id, endpointId),
            eq(endpoints.isActive, true),
            eq(endpoints.userId, userId)
          ))
          .limit(1)

        if (endpointRecord[0]) {
          console.log(`📍 findEndpointForEmail - Found email-specific endpoint: ${endpointRecord[0].name} for ${recipient}`)
          return endpointRecord[0]
        }
      }

      // Priority 2: Fall back to webhookId for backward compatibility
      if (webhookId) {
        console.log(`🔄 findEndpointForEmail - Using legacy webhook ${webhookId} for ${recipient}`)
        return null // Return null to trigger legacy webhook processing
      }
    }

    // Step 2: Check for domain-level catch-all configuration
    const domain = recipient.split('@')[1]
    if (!domain) {
      console.warn(`⚠️ findEndpointForEmail - Invalid email format: ${recipient}`)
      return null
    }

    console.log(`🌐 findEndpointForEmail - Checking catch-all configuration for domain: ${domain}`)

    const domainRecord = await db
      .select({
        isCatchAllEnabled: emailDomains.isCatchAllEnabled,
        catchAllEndpointId: emailDomains.catchAllEndpointId,
        catchAllWebhookId: emailDomains.catchAllWebhookId,
        domain: emailDomains.domain,
      })
      .from(emailDomains)
      .where(and(
        eq(emailDomains.domain, domain),
        eq(emailDomains.isCatchAllEnabled, true),
        eq(emailDomains.userId, userId)
      ))
      .limit(1)

    if (domainRecord[0]) {
      const { catchAllEndpointId, catchAllWebhookId } = domainRecord[0]
      console.log(`🌐 findEndpointForEmail - Found catch-all domain: ${domain}, endpointId: ${catchAllEndpointId}, webhookId: ${catchAllWebhookId}`)

      // Priority 3: Use catch-all endpoint
      if (catchAllEndpointId) {
        const catchAllEndpointRecord = await db
          .select()
          .from(endpoints)
          .where(and(
            eq(endpoints.id, catchAllEndpointId),
            eq(endpoints.isActive, true),
            eq(endpoints.userId, userId)
          ))
          .limit(1)

        if (catchAllEndpointRecord[0]) {
          console.log(`🌐 findEndpointForEmail - Found catch-all endpoint: ${catchAllEndpointRecord[0].name} for ${recipient}`)
          return catchAllEndpointRecord[0]
        } else {
          console.warn(`⚠️ findEndpointForEmail - Catch-all endpoint ${catchAllEndpointId} not found or inactive`)
        }
      }

      // Priority 4: Fall back to catch-all webhook for backward compatibility
      if (catchAllWebhookId) {
        console.log(`🔄 findEndpointForEmail - Using catch-all legacy webhook ${catchAllWebhookId} for ${recipient}`)
        return null // Return null to trigger legacy webhook processing
      }
    } else {
      console.warn(`⚠️ findEndpointForEmail - No catch-all domain configuration found for ${domain} (userId: ${userId})`)
    }

    console.warn(`⚠️ findEndpointForEmail - No endpoint, webhook, or catch-all configuration found for ${recipient}`)
    return null

  } catch (error) {
    console.error(`❌ findEndpointForEmail - Error finding endpoint for ${recipient}:`, error)
    return null
  }
}

/**
 * Handle webhook endpoint routing (direct implementation for unified endpoints)
 */
async function handleWebhookEndpoint(emailId: string, endpoint: Endpoint): Promise<void> {
  try {
    console.log(`📡 handleWebhookEndpoint - Processing webhook endpoint: ${endpoint.name}`)

    // Get email with structured data
    const emailData = await getEmailWithStructuredData(emailId)
    if (!emailData) {
      throw new Error('Email not found or missing structured data')
    }

    // Parse endpoint configuration
    const config = JSON.parse(endpoint.config)
    const webhookUrl = config.url
    const timeout = config.timeout || 30
    const retryAttempts = config.retryAttempts || 3
    const customHeaders = config.headers || {}

    if (!webhookUrl) {
      throw new Error('Webhook URL not configured')
    }

    console.log(`📤 handleWebhookEndpoint - Sending email ${emailData.messageId} to webhook: ${endpoint.name} (${webhookUrl})`)

    // Reconstruct ParsedEmailData from structured data
    const parsedEmailData = reconstructParsedEmailData(emailData)

    // Get the base URL for attachment downloads (from environment or construct from request)
    const baseUrl = process.env.NEXT_PUBLIC_BETTER_AUTH_URL || 'https://inbound.new'
    
    // Add download URLs to attachments in parsedData
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
      'X-Email-ID': emailData.structuredId, // Use structured email ID for v2 API compatibility
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
        
        // Record the delivery failure
        const deliveryId = nanoid()
        await db.insert(endpointDeliveries).values({
          id: deliveryId,
          emailId,
          endpointId: endpoint.id,
          status: 'failed',
          httpStatus: null,
          response: 'Payload too large after optimization',
          error: errorMessage,
          deliveredAt: new Date(),
          deliveryTimeMs: 0
        })
        
        throw new Error(errorMessage)
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
        body: finalPayloadString, // Use finalPayloadString after stripping
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

    // Track delivery in new endpoint deliveries table
    await trackEndpointDelivery(
      emailId, 
      endpoint.id, 
      'webhook', 
      deliverySuccess ? 'success' : 'failed',
      { 
        responseCode,
        responseBody: responseBody ? responseBody.substring(0, 2000) : null, // Limit response body size
        deliveryTime,
        error: errorMessage || null,
        url: webhookUrl,
        deliveredAt: new Date().toISOString()
      }
    )

    if (!deliverySuccess) {
      throw new Error(errorMessage || 'Webhook delivery failed')
    }

    console.log(`✅ handleWebhookEndpoint - Successfully delivered email ${emailId} to webhook ${endpoint.name}`)

  } catch (error) {
    console.error(`❌ handleWebhookEndpoint - Error processing webhook endpoint:`, error)
    throw error
  }
}




/**
 * Handle email forwarding endpoints (email and email_group types)
 */
async function handleEmailForwardEndpoint(
  emailId: string, 
  endpoint: Endpoint, 
  emailData: any
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
        senderName: config.senderName // Pass custom sender name if configured
      }
    )
    
    // Track successful delivery
    await trackEndpointDelivery(
      emailId, 
      endpoint.id, 
      'email_forward', 
      'success',
      { 
        toAddresses, 
        fromAddress,
        forwardedAt: new Date().toISOString()
      }
    )

    console.log(`✅ handleEmailForwardEndpoint - Successfully forwarded email to ${toAddresses.length} recipients`)

  } catch (error) {
    console.error(`❌ handleEmailForwardEndpoint - Error forwarding email:`, error)
    
    // Track failed delivery
    await trackEndpointDelivery(
      emailId, 
      endpoint.id, 
      'email_forward', 
      'failed',
      { 
        error: error instanceof Error ? error.message : 'Unknown error',
        failedAt: new Date().toISOString()
      }
    )
    
    throw error
  }
}

/**
 * Reconstruct ParsedEmailData from structured email data
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
 * Get default from address using verified domain
 */
async function getDefaultFromAddress(recipient: string): Promise<string> {
  try {
    const domain = recipient.split('@')[1]
    if (!domain) {
      throw new Error('Invalid recipient email format')
    }

    // Look up verified domain
    const domainRecord = await db
      .select({ domain: emailDomains.domain })
      .from(emailDomains)
      .where(and(
        eq(emailDomains.domain, domain),
        eq(emailDomains.status, 'verified'),
        eq(emailDomains.canReceiveEmails, true)
      ))
      .limit(1)

    if (domainRecord[0]) {
      return `noreply@${domainRecord[0].domain}`
    }

    // Fallback to recipient domain if not found in our records
    return `noreply@${domain}`

  } catch (error) {
    console.error('❌ getDefaultFromAddress - Error getting default from address:', error)
    // Ultimate fallback
    return 'noreply@example.com'
  }
}

/**
 * Track endpoint delivery in the unified deliveries table
 */
async function trackEndpointDelivery(
  emailId: string,
  endpointId: string,
  deliveryType: 'webhook' | 'email_forward',
  status: 'pending' | 'success' | 'failed',
  responseData?: any
): Promise<void> {
  try {
    const deliveryRecord = {
      id: nanoid(),
      emailId,
      endpointId,
      deliveryType,
      status,
      attempts: 1,
      lastAttemptAt: new Date(),
      responseData: responseData ? JSON.stringify(responseData) : null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    await db.insert(endpointDeliveries).values(deliveryRecord)
    console.log(`📊 trackEndpointDelivery - Tracked ${deliveryType} delivery: ${status}`)

  } catch (error) {
    console.error('❌ trackEndpointDelivery - Error tracking delivery:', error)
    // Don't throw here as this is just tracking
  }
}

/**
 * Check if this is a DMARC email and whether it should be routed based on domain settings
 * Returns true if it's a DMARC email AND routing should be skipped (receiveDmarcEmails = false)
 */
async function checkIfDmarcEmail(recipient: string, userId: string): Promise<boolean> {
  try {
    // Check if the recipient is a DMARC email (dmarc@domain)
    if (!recipient.toLowerCase().startsWith('dmarc@')) {
      return false // Not a DMARC email, proceed with normal routing
    }

    // Extract the domain from the recipient
    const domain = recipient.split('@')[1]
    if (!domain) {
      console.warn(`⚠️ checkIfDmarcEmail - Invalid email format: ${recipient}`)
      return false // Invalid format, proceed with normal routing
    }

    console.log(`🔍 checkIfDmarcEmail - Checking DMARC settings for domain: ${domain}`)

    // Look up the domain in the emailDomains table
    const domainRecord = await db
      .select({
        receiveDmarcEmails: emailDomains.receiveDmarcEmails
      })
      .from(emailDomains)
      .where(and(
        eq(emailDomains.domain, domain),
        eq(emailDomains.userId, userId)
      ))
      .limit(1)

    if (!domainRecord[0]) {
      console.warn(`⚠️ checkIfDmarcEmail - Domain ${domain} not found in user's domains, proceeding with normal routing`)
      return false // Domain not found, proceed with normal routing
    }

    const shouldReceiveDmarcEmails = domainRecord[0].receiveDmarcEmails || false

    if (!shouldReceiveDmarcEmails) {
      console.log(`🚫 checkIfDmarcEmail - DMARC emails disabled for domain ${domain}, skipping routing`)
      return true // Skip routing - email will be stored but not forwarded
    } else {
      console.log(`✅ checkIfDmarcEmail - DMARC emails enabled for domain ${domain}, proceeding with normal routing`)
      return false // Proceed with normal routing
    }

  } catch (error) {
    console.error(`❌ checkIfDmarcEmail - Error checking DMARC settings:`, error)
    return false // On error, proceed with normal routing to be safe
  }
} 