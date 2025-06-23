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
    
    const endpoint = await findEndpointForEmail(emailData.recipient)
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
 */
async function findEndpointForEmail(recipient: string): Promise<Endpoint | null> {
  try {
    // Look up the email address to find the configured endpoint
    const emailAddressRecord = await db
      .select({
        endpointId: emailAddresses.endpointId,
        webhookId: emailAddresses.webhookId, // Keep for backward compatibility
        address: emailAddresses.address,
        isActive: emailAddresses.isActive,
      })
      .from(emailAddresses)
      .where(and(
        eq(emailAddresses.address, recipient),
        eq(emailAddresses.isActive, true)
      ))
      .limit(1)

    if (!emailAddressRecord[0]) {
      console.warn(`⚠️ findEndpointForEmail - No email address record found for ${recipient}`)
      return null
    }

    const { endpointId, webhookId } = emailAddressRecord[0]

    // Priority: Use endpointId if available, otherwise fall back to webhookId
    if (endpointId) {
      // New endpoints system
      const endpointRecord = await db
        .select()
        .from(endpoints)
        .where(and(
          eq(endpoints.id, endpointId),
          eq(endpoints.isActive, true)
        ))
        .limit(1)

      if (endpointRecord[0]) {
        return endpointRecord[0]
      }
    }

    // Backward compatibility: If no endpoint but has webhook, create virtual endpoint
    if (webhookId) {
      console.log(`🔄 findEndpointForEmail - Using legacy webhook ${webhookId} for ${recipient}`)
      return null // Return null to trigger legacy webhook processing
    }

    console.warn(`⚠️ findEndpointForEmail - No valid endpoint or webhook found for ${recipient}`)
    return null

  } catch (error) {
    console.error(`❌ findEndpointForEmail - Error finding endpoint for ${recipient}:`, error)
    return null
  }
}

/**
 * Handle webhook endpoint routing (uses existing webhook logic)
 */
async function handleWebhookEndpoint(emailId: string, endpoint: Endpoint): Promise<void> {
  try {
    console.log(`📡 handleWebhookEndpoint - Processing webhook endpoint: ${endpoint.name}`)
    
    // Use existing webhook logic but track as endpoint delivery
    const result = await triggerEmailAction(emailId)
    
    // Track delivery in new endpoint deliveries table
    await trackEndpointDelivery(
      emailId, 
      endpoint.id, 
      'webhook', 
      result.success ? 'success' : 'failed',
      result.error ? { error: result.error, deliveryId: result.deliveryId } : { deliveryId: result.deliveryId }
    )

    if (!result.success) {
      throw new Error(result.error || 'Webhook delivery failed')
    }

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
    
    // Get verified domain email to send from
    const fromAddress = config.fromAddress || await getDefaultFromAddress(emailData.recipient)
    
    console.log(`📤 handleEmailForwardEndpoint - Forwarding to ${toAddresses.length} recipients from ${fromAddress}`)

    // Forward the email
    await forwarder.forwardEmail(
      parsedEmailData,
      fromAddress,
      toAddresses,
      {
        subjectPrefix: config.subjectPrefix,
        includeAttachments: config.includeAttachments
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