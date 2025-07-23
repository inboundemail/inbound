/**
 * Email Router - Core email routing system for inbound emails
 * Routes incoming emails to configured endpoints (webhooks, email forwarding, email groups) based on recipient configuration.
 * Handles both legacy webhook systems and new unified endpoint architecture with fallback logic.
 * Used by the webhook API route after email ingestion to deliver emails to their configured destinations.
 */

import { db } from '@/lib/db'
import { structuredEmails, emailAddresses, endpoints, endpointDeliveries, emailDomains, vipConfigs, vipAllowedSenders, vipPaymentSessions, vipEmailAttempts, userAccounts, apikey } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { triggerEmailAction } from '@/app/api/inbound/webhook/route'
import { EmailForwarder } from './email-forwarder'
import { nanoid } from 'nanoid'
import type { ParsedEmailData } from './email-parser'
import { sanitizeHtml } from './email-parser'
import type { Endpoint } from '@/features/endpoints/types'
import { Inbound } from '@inboundemail/sdk'
import Stripe from 'stripe'
import { generateVipPaymentRequestEmail } from '@/emails/vip-payment-request-preview'

// Default Stripe instance for VIP payments
const defaultStripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

/**
 * VIP Status Check Result
 */
interface VipStatusResult {
  isVipEnabled: boolean
  requiresPayment: boolean
  isAllowed: boolean
  config?: any
  reason?: string
}

/**
 * Check if an email requires VIP payment
 */
async function checkVipStatus(recipientEmail: string, senderEmail: string): Promise<VipStatusResult> {
  try {
    console.log(`🔍 VIP Check - Checking ${senderEmail} → ${recipientEmail}`)

    // Check if this email address has VIP enabled
    const emailAddressRecord = await db
      .select()
      .from(emailAddresses)
      .where(eq(emailAddresses.address, recipientEmail))
      .limit(1)

    if (!emailAddressRecord[0]?.isVipEnabled || !emailAddressRecord[0]?.vipConfigId) {
      console.log(`✅ VIP Check - ${recipientEmail} is not VIP-enabled`)
      return {
        isVipEnabled: false,
        requiresPayment: false,
        isAllowed: true,
        reason: 'not_vip_enabled'
      }
    }

    // Get VIP config
    const vipConfig = await db
      .select()
      .from(vipConfigs)
      .where(eq(vipConfigs.id, emailAddressRecord[0].vipConfigId))
      .limit(1)

    if (!vipConfig[0] || !vipConfig[0].isActive) {
      console.log(`✅ VIP Check - VIP config not found or inactive for ${recipientEmail}`)
      return {
        isVipEnabled: false,
        requiresPayment: false,
        isAllowed: true,
        reason: 'vip_config_inactive'
      }
    }

    // Check if sender is already allowed
    const allowedSender = await db
      .select()
      .from(vipAllowedSenders)
      .where(
        and(
          eq(vipAllowedSenders.vipConfigId, vipConfig[0].id),
          eq(vipAllowedSenders.senderEmail, senderEmail)
        )
      )
      .limit(1)

    if (allowedSender[0]) {
      // Check if still valid (not expired)
      if (!allowedSender[0].allowedUntil || new Date(allowedSender[0].allowedUntil) > new Date()) {
        console.log(`✅ VIP Check - ${senderEmail} is already allowed for ${recipientEmail}`)
        return {
          isVipEnabled: true,
          requiresPayment: false,
          isAllowed: true,
          config: vipConfig[0],
          reason: 'previously_allowed'
        }
      }
    }

    console.log(`💰 VIP Check - Payment required for ${senderEmail} → ${recipientEmail}`)
    return {
      isVipEnabled: true,
      requiresPayment: true,
      isAllowed: false,
      config: vipConfig[0],
      reason: 'payment_required'
    }

  } catch (error) {
    console.error('❌ VIP Check - Error checking VIP status:', error)
    // On error, allow email to proceed normally
    return {
      isVipEnabled: false,
      requiresPayment: false,
      isAllowed: true,
      reason: 'error_checking_vip'
    }
  }
}

/**
 * Get user's API key for Inbound SDK operations
 */
async function getUserApiKey(userId: string): Promise<string | null> {
  try {
    const userApiKey = await db
      .select({ key: apikey.key })
      .from(apikey)
      .where(
        and(
          eq(apikey.userId, userId),
          eq(apikey.enabled, true)
        )
      )
      .limit(1)

    return userApiKey[0]?.key || null
  } catch (error) {
    console.error('Error retrieving user API key:', error)
    return null
  }
}

/**
 * Handle VIP payment request - creates payment session and sends payment email
 */
async function handleVipPaymentRequest(emailData: any, vipConfig: any, originalEmailId: string): Promise<void> {
  try {
    console.log(`💳 VIP Payment - Creating payment request for ${emailData.senderEmail} → ${emailData.recipient}`)

    // Get user's API key for Inbound SDK
    const userApiKey = await getUserApiKey(vipConfig.userId)
    if (!userApiKey) {
      console.error('No API key found for user:', vipConfig.userId)
      throw new Error('User API key not found')
    }

    // Create user-specific Inbound client
    const inbound = new Inbound({
      apiKey: userApiKey,
      defaultReplyFrom: 'payments@inbound.new'
    })

    // Get user's account-level Stripe key
    const userAccount = await db
      .select()
      .from(userAccounts)
      .where(eq(userAccounts.userId, vipConfig.userId))
      .limit(1)

    // Determine which Stripe instance to use
    const stripe = userAccount[0]?.stripeRestrictedKey 
      ? new Stripe(userAccount[0].stripeRestrictedKey)
      : defaultStripe

    // Create payment session
    const sessionId = nanoid()
    const expiresAt = new Date()
    expiresAt.setHours(expiresAt.getHours() + (vipConfig.paymentLinkExpirationHours || 24))

    // Create Stripe checkout session
    const checkoutSession = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: `Email delivery to ${emailData.recipient}`,
            description: vipConfig.customMessage || 
              `Pay to deliver your email to ${emailData.recipient}. ${
                vipConfig.allowAfterPayment 
                  ? 'After payment, all your future emails will be delivered automatically.' 
                  : 'This payment covers delivery of your current email only.'
              }`
          },
          unit_amount: vipConfig.priceInCents,
        },
        quantity: 1,
      }],
      mode: 'payment',
      metadata: {
        sessionId,
        vipConfigId: vipConfig.id,
        senderEmail: emailData.senderEmail,
        recipientEmail: emailData.recipient,
        emailId: originalEmailId,
      },
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/api/products/inboundvip/success?session_id=${sessionId}`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/api/products/inboundvip/cancelled`,
      expires_at: Math.floor(expiresAt.getTime() / 1000),
    })

    // Store payment session
    await db.insert(vipPaymentSessions).values({
      id: sessionId,
      vipConfigId: vipConfig.id,
      senderEmail: emailData.senderEmail,
      originalEmailId: originalEmailId,
      stripePaymentLinkId: checkoutSession.id,
      stripePaymentLinkUrl: checkoutSession.url,
      stripeSessionId: checkoutSession.id,
      status: 'pending',
      expiresAt,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    // Log the payment required attempt
    await db.insert(vipEmailAttempts).values({
      id: nanoid(),
      vipConfigId: vipConfig.id,
      senderEmail: emailData.senderEmail,
      recipientEmail: emailData.recipient,
      originalEmailId: originalEmailId,
      emailSubject: emailData.subject,
      status: 'payment_required',
      paymentSessionId: sessionId,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    // Send payment request email
    const recipientName = emailData.recipient.split('@')[0]
    const senderName = emailData.senderEmail.split('@')[0]
    
    const emailHtml = await generateVipPaymentRequestEmail({
      senderName,
      senderEmail: emailData.senderEmail,
      recipientName,
      recipientEmail: emailData.recipient,
      emailSubject: emailData.subject || 'No subject',
      priceInCents: vipConfig.priceInCents,
      customMessage: vipConfig.customMessage || undefined,
      paymentUrl: checkoutSession.url!,
      allowAfterPayment: vipConfig.allowAfterPayment || false,
      expirationHours: vipConfig.paymentLinkExpirationHours || 24,
    })
    
    // Reply using the original email ID directly
    await inbound.reply(originalEmailId, {
      from: 'payments@inbound.new',
      subject: `Payment Required: ${emailData.subject}`,
      html: emailHtml,
      text: `Payment Required to Deliver Your Email

Hi ${senderName},

You're trying to reach ${recipientName} at ${emailData.recipient}, but they require a payment of $${(vipConfig.priceInCents / 100).toFixed(2)} to receive emails from new senders.

${vipConfig.customMessage || ''}

Your email subject: ${emailData.subject}

Pay here: ${checkoutSession.url}

${vipConfig.allowAfterPayment 
  ? 'After payment, all your future emails to this address will be delivered automatically.' 
  : 'This payment covers delivery of your current email only.'}

This payment link expires in ${vipConfig.paymentLinkExpirationHours} hours.`
    })

    console.log(`✅ VIP Payment - Payment request sent to ${emailData.senderEmail}`)

  } catch (error) {
    console.error('❌ VIP Payment - Error creating payment request:', error)
    throw error
  }
}

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

    // NEW: Check VIP status before routing
    if (emailData.senderEmail) {
      const vipResult = await checkVipStatus(emailData.recipient, emailData.senderEmail)
      if (vipResult.requiresPayment) {
        console.log(`💰 VIP payment required for ${emailData.senderEmail} → ${emailData.recipient}`)
        await handleVipPaymentRequest(emailData, vipResult.config, emailId)
        return // Don't route to endpoint yet - wait for payment
      }
      
      if (vipResult.isVipEnabled && vipResult.isAllowed) {
        // Log allowed VIP attempt
        await db.insert(vipEmailAttempts).values({
          id: nanoid(),
          vipConfigId: vipResult.config.id,
          senderEmail: emailData.senderEmail,
          recipientEmail: emailData.recipient,
          originalEmailId: emailId,
          emailSubject: emailData.subject,
          status: 'allowed',
          allowedReason: vipResult.reason || 'unknown',
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        console.log(`✅ VIP allowed - ${emailData.senderEmail} → ${emailData.recipient}`)
      }
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
    .select({ 
      recipient: receivedEmails.recipient,
      from: receivedEmails.from 
    })
    .from(receivedEmails)
    .where(eq(receivedEmails.id, emailId))
    .limit(1)

  const recipient = recipientRecord[0]?.recipient
  const senderEmail = recipientRecord[0]?.from

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

  if (!emailWithStructuredData[0]) {
    return null
  }

  return {
    ...emailWithStructuredData[0],
    recipient,
    senderEmail
  }
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