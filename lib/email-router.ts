import { db } from '@/lib/db'
import { structuredEmails, emailAddresses, endpoints, endpointDeliveries, emailDomains } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { triggerEmailAction } from '@/app/api/inbound/webhook/route'
import { EmailForwarder } from './email-forwarder'
import { nanoid } from 'nanoid'
import type { ParsedEmailData } from './email-parser'
import type { Endpoint } from '@/features/endpoints/types'

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

    // Find associated endpoint for this email
    if (!emailData.recipient) {
      throw new Error('Email recipient not found')
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
  // First get the email record to find the recipient
  const emailRecord = await db
    .select({
      recipient: structuredEmails.emailId, // We'll get this from receivedEmails
      userId: structuredEmails.userId,
    })
    .from(structuredEmails)
    .where(eq(structuredEmails.emailId, emailId))
    .limit(1)

  if (!emailRecord[0]) {
    return null
  }

  // Get the recipient from receivedEmails table
  const { receivedEmails } = await import('@/lib/db/schema')
  const recipientRecord = await db
    .select({ recipient: receivedEmails.recipient })
    .from(receivedEmails)
    .where(eq(receivedEmails.id, emailId))
    .limit(1)

  const recipient = recipientRecord[0]?.recipient

  // Now get the full structured email data
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
    })
    .from(structuredEmails)
    .where(eq(structuredEmails.emailId, emailId))
    .limit(1)

  const result = emailWithStructuredData[0]
  if (result) {
    return {
      ...result,
      recipient: recipient || null
    }
  }

  return null
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

    // Create webhook payload with the exact structure expected
    const webhookPayload = {
      event: 'email.received',
      timestamp: new Date().toISOString(),
      email: {
        id: emailData.emailId,
        messageId: emailData.messageId,
        from: emailData.fromData ? JSON.parse(emailData.fromData) : null,
        to: emailData.toData ? JSON.parse(emailData.toData) : null,
        recipient: emailData.recipient,
        subject: emailData.subject,
        receivedAt: emailData.date,
        
        // Full ParsedEmailData structure
        parsedData: parsedEmailData,
        
        // Cleaned content for backward compatibility
        cleanedContent: {
          html: parsedEmailData.htmlBody ? sanitizeHtml(parsedEmailData.htmlBody) : null,
          text: parsedEmailData.textBody || null,
          hasHtml: !!parsedEmailData.htmlBody,
          hasText: !!parsedEmailData.textBody,
          attachments: parsedEmailData.attachments || [],
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
      'X-Email-ID': emailData.emailId,
      'X-Message-ID': emailData.messageId || '',
      ...customHeaders
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
        body: payloadString,
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
 * Simple HTML sanitization (basic implementation)
 */
function sanitizeHtml(html: string): string {
  // Basic sanitization - remove script tags and dangerous attributes
  // For production, consider using a proper HTML sanitization library
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/on\w+\s*=\s*"[^"]*"/gi, '')
    .replace(/on\w+\s*=\s*'[^']*'/gi, '')
    .replace(/javascript:/gi, '')
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
        recipientEmail: emailData.recipient
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