/**
 * Email Router - Core email routing system for inbound emails
 * Routes incoming emails to configured endpoints (webhooks, email forwarding, email groups) based on recipient configuration.
 * Handles both legacy webhook systems and new unified endpoint architecture with fallback logic.
 * Used by the webhook API route after email ingestion to deliver emails to their configured destinations.
 */

import { db } from '@/lib/db'
import { structuredEmails, emailAddresses, endpoints, endpointDeliveries, emailDomains, svixApplications } from '@/lib/db/schema'
import { eq, and, or, asc } from 'drizzle-orm'
import { triggerEmailAction } from './webhook-trigger'
import { EmailForwarder } from './email-forwarder'
import { EmailThreader, type ThreadingResult } from './email-threader'
import { nanoid } from 'nanoid'
import type { ParsedEmailData } from './email-parser'
import { sanitizeHtml } from './email-parser'
import type { Endpoint } from '@/features/endpoints/types'
import { evaluateGuardRules } from '../guard/rule-matcher'
import { Autumn as autumn } from 'autumn-js'
import { getOrCreateVerificationToken } from '@/lib/webhooks/verification'
import { sendSvixMessage } from '@/lib/svix/client'
import { formatWebhookPayload } from '@/lib/svix/formatters'

// Maximum webhook payload size (5MB safety margin)
const MAX_WEBHOOK_PAYLOAD_SIZE = 1_000_000

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
    let threadingResult: ThreadingResult | null = null
    try {
      threadingResult = await EmailThreader.processEmailForThreading(emailId, emailData.userId)
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

  // 🛡️ GUARD: Check feature flag before evaluating Guard rules
  let guardFeatureEnabled = false
  try {
    const { data: guardCheck, error: guardCheckError } = await autumn.check({
      customer_id: emailData.userId,
      feature_id: 'inbound_guard',
    })
    if (guardCheckError) {
      console.error(`⚠️ routeEmail - Autumn inbound_guard check error for user ${emailData.userId}:`, guardCheckError)
    } else {
      guardFeatureEnabled = !!guardCheck?.allowed
    }
  } catch (featureError) {
    console.error('⚠️ routeEmail - Failed to check inbound_guard feature:', featureError)
  }

  if (guardFeatureEnabled) {
    // 🛡️ GUARD: Evaluate Guard rules before routing
    const guardResult = await evaluateGuardRules(emailData.structuredId, emailData.userId)
    
    if (guardResult.shouldBlock) {
      console.log(`🛡️ routeEmail - Email ${emailId} BLOCKED by Guard rule: ${guardResult.matchedRule?.name}`)
      
      // Update the structured email record with Guard information
      await db
        .update(structuredEmails)
        .set({
          guardBlocked: true,
          guardReason: guardResult.reason || `Blocked by rule: ${guardResult.matchedRule?.name}`,
          guardAction: 'block',
          guardRuleId: guardResult.matchedRule?.id || null,
          guardMetadata: guardResult.metadata ? JSON.stringify(guardResult.metadata) : null,
        })
        .where(eq(structuredEmails.id, emailData.structuredId))
      
      console.log(`✅ routeEmail - Updated email ${emailId} with Guard block information`)
      
      // Email is stored but not routed - blocked by Guard
      return
    }

    // Handle other Guard actions (flag, label) that don't block
    if (guardResult.action && guardResult.action !== 'allow' && !guardResult.shouldBlock) {
      console.log(`🛡️ routeEmail - Email ${emailId} flagged by Guard rule: ${guardResult.matchedRule?.name} (action: ${guardResult.action})`)
      
      // Update the structured email record with Guard information
      await db
        .update(structuredEmails)
        .set({
          guardBlocked: false,
          guardReason: guardResult.reason || `Flagged by rule: ${guardResult.matchedRule?.name}`,
          guardAction: guardResult.action,
          guardRuleId: guardResult.matchedRule?.id || null,
          guardMetadata: guardResult.metadata ? JSON.stringify(guardResult.metadata) : null,
        })
        .where(eq(structuredEmails.id, emailData.structuredId))
      
      console.log(`✅ routeEmail - Updated email ${emailId} with Guard flag information (${guardResult.action})`)
    }

    if (guardResult.action === 'route' && guardResult.routeToEndpointId) {
      console.log(`🛡️ routeEmail - Email ${emailId} ROUTED by Guard rule to endpoint: ${guardResult.routeToEndpointId}`)
      
      // Update the structured email record with Guard information
      await db
        .update(structuredEmails)
        .set({
          guardBlocked: false,
          guardReason: guardResult.reason || `Routed by rule: ${guardResult.matchedRule?.name}`,
          guardAction: 'route',
          guardRuleId: guardResult.matchedRule?.id || null,
          guardMetadata: guardResult.metadata ? JSON.stringify(guardResult.metadata) : null,
        })
        .where(eq(structuredEmails.id, emailData.structuredId))
      
      // Fetch the specific endpoint
      const [guardEndpoint] = await db
        .select()
        .from(endpoints)
        .where(and(
          eq(endpoints.id, guardResult.routeToEndpointId),
          eq(endpoints.isActive, true),
          eq(endpoints.userId, emailData.userId)
        ))
        .limit(1);

      if (guardEndpoint) {
        // Route to Guard-specified endpoint
        switch (guardEndpoint.type) {
          case 'webhook':
            await handleWebhookEndpoint(emailId, guardEndpoint)
            break
          case 'email':
          case 'email_group':
            await handleEmailForwardEndpoint(emailId, guardEndpoint, emailData)
            break
        }
        console.log(`✅ routeEmail - Successfully routed email ${emailId} via Guard to ${guardEndpoint.type} endpoint`)
        return
      } else {
        console.warn(`⚠️ routeEmail - Guard specified endpoint ${guardResult.routeToEndpointId} not found, falling back to normal routing`)
      }
    }
  } else {
    console.log('🛡️ routeEmail - Skipping Guard evaluation (feature inbound_guard disabled for user)')
    }
    
    // 🧵 Thread Continuity: Check if this is a thread reply and route to original endpoint
    let endpoint: Endpoint | null = null
    if (threadingResult && !threadingResult.isNewThread && threadingResult.threadPosition && threadingResult.threadPosition > 1) {
      console.log(`🧵 routeEmail - Email ${emailId} is a thread reply (position ${threadingResult.threadPosition}), checking for root endpoint routing`)
      const rootEndpoint = await getThreadRootEndpoint(threadingResult.threadId, emailData.userId, emailData.recipient)
      if (rootEndpoint) {
        endpoint = rootEndpoint
        console.log(`🧵 routeEmail - Thread Continuity: Routing reply to original endpoint ${rootEndpoint.name} from root message`)
      } else {
        console.log(`🧵 routeEmail - Thread Continuity: No root endpoint found or root recipient matches current, using normal routing`)
      }
    }
    
    // If thread routing didn't find an endpoint, use normal endpoint lookup
    if (!endpoint) {
      // Pass userId to findEndpointForEmail to ensure proper filtering
      endpoint = await findEndpointForEmail(emailData.recipient, emailData.userId)
    }
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

    // OPTIMIZATION: Check if this email has already been delivered to this endpoint
    // This is a fast-path check to avoid even calling the handler functions
    // Note: The handlers also INSERT delivery records first (with unique constraint)
    // to prevent race conditions at the network send level
    const existingDelivery = await db
      .select({ id: endpointDeliveries.id, status: endpointDeliveries.status, attempts: endpointDeliveries.attempts })
      .from(endpointDeliveries)
      .where(and(
        eq(endpointDeliveries.emailId, emailId),
        eq(endpointDeliveries.endpointId, endpoint.id)
      ))
      .limit(1)
    
    if (existingDelivery[0]) {
      console.log(`⏭️  routeEmail - Email ${emailId} already has delivery record for endpoint ${endpoint.id} (status: ${existingDelivery[0].status}, attempts: ${existingDelivery[0].attempts}). Skipping duplicate delivery.`)
      return
    }

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
 * Get the endpoint for the root email in a thread (Thread Continuity feature)
 * Routes thread replies to the original endpoint that received the first message
 */
async function getThreadRootEndpoint(threadId: string, userId: string, currentRecipient: string): Promise<Endpoint | null> {
  try {
    console.log(`🧵 getThreadRootEndpoint - Looking for root endpoint in thread ${threadId} (current recipient: ${currentRecipient})`)
    
    // First try to find email with threadPosition = 1
    let rootEmail = await db
      .select({
        recipient: structuredEmails.recipient,
        threadPosition: structuredEmails.threadPosition,
        id: structuredEmails.id,
        date: structuredEmails.date,
      })
      .from(structuredEmails)
      .where(
        and(
          eq(structuredEmails.threadId, threadId),
          eq(structuredEmails.threadPosition, 1),
          eq(structuredEmails.userId, userId)
        )
      )
      .limit(1)
    
    // If not found, fall back to finding the earliest email by threadPosition or date
    if (!rootEmail[0]) {
      console.log(`⚠️ getThreadRootEndpoint - No email with threadPosition=1 found, looking for earliest email in thread ${threadId}`)
      
      // Find all emails in thread, ordered by threadPosition (nulls last), then by date
      const allThreadEmails = await db
        .select({
          recipient: structuredEmails.recipient,
          threadPosition: structuredEmails.threadPosition,
          id: structuredEmails.id,
          date: structuredEmails.date,
        })
        .from(structuredEmails)
        .where(
          and(
            eq(structuredEmails.threadId, threadId),
            eq(structuredEmails.userId, userId)
          )
        )
        .orderBy(
          // Order by threadPosition ascending (nulls will naturally sort last), then by date ascending
          asc(structuredEmails.threadPosition),
          asc(structuredEmails.date)
        )
        .limit(1)
      
      if (allThreadEmails[0]) {
        rootEmail = [allThreadEmails[0]]
        console.log(`✅ getThreadRootEndpoint - Found earliest email in thread: ${rootEmail[0].id} (threadPosition: ${rootEmail[0].threadPosition || 'null'})`)
      }
    }
    
    if (!rootEmail[0]) {
      console.log(`⚠️ getThreadRootEndpoint - Root email not found in thread ${threadId}`)
      return null
    }
    
    const rootRecipient = rootEmail[0].recipient
    if (!rootRecipient) {
      console.log(`⚠️ getThreadRootEndpoint - Root email has no recipient`)
      return null
    }
    
    // If the current recipient is the same as root recipient, skip (already correct)
    if (rootRecipient === currentRecipient) {
      console.log(`🧵 getThreadRootEndpoint - Current recipient matches root recipient, using normal routing`)
      return null
    }
    
    console.log(`🧵 getThreadRootEndpoint - Found root email recipient: ${rootRecipient}`)
    
    // Find the endpoint for the root recipient
    const rootEndpoint = await findEndpointForEmail(rootRecipient, userId)
    
    if (!rootEndpoint) {
      console.log(`⚠️ getThreadRootEndpoint - No endpoint configured for root recipient ${rootRecipient}`)
      return null
    }
    
    // Verify endpoint is active
    if (!rootEndpoint.isActive) {
      console.log(`⚠️ getThreadRootEndpoint - Root endpoint ${rootEndpoint.id} is inactive, falling back to normal routing`)
      return null
    }
    
    console.log(`✅ getThreadRootEndpoint - Found root endpoint: ${rootEndpoint.name} (type: ${rootEndpoint.type}) for recipient ${rootRecipient}`)
    return rootEndpoint
    
  } catch (error) {
    console.error(`❌ getThreadRootEndpoint - Error finding root endpoint for thread ${threadId}:`, error)
    return null
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
 * Handle Svix webhook endpoint routing (v3)
 * Publishes events to Svix API which handles delivery, retries, and logging
 */
async function handleSvixWebhook(emailId: string, endpoint: Endpoint): Promise<void> {
  // PRE-CREATE delivery record to prevent race condition duplicates
  const deliveryId = nanoid()
  
  try {
    // Insert delivery record BEFORE sending to Svix to prevent race conditions
    await db.insert(endpointDeliveries).values({
      id: deliveryId,
      emailId,
      endpointId: endpoint.id,
      deliveryType: 'webhook',
      status: 'pending',
      attempts: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    console.log(`🔒 handleSvixWebhook - Created delivery lock ${deliveryId} for ${emailId} → ${endpoint.id}`)
  } catch (error: any) {
    // Check if this is a unique constraint violation (another request already processing)
    if (error?.code === '23505' || error?.message?.includes('duplicate key') || error?.message?.includes('unique constraint')) {
      console.log(`⏭️  handleSvixWebhook - Delivery already in progress for emailId=${emailId}, endpointId=${endpoint.id}. Skipping duplicate.`)
      return // Exit early - another request is handling this delivery
    }
    throw error // Re-throw other errors
  }

  try {
    console.log(`📡 handleSvixWebhook - Processing Svix webhook endpoint: ${endpoint.name}`)

    // Get email with structured data
    const emailData = await getEmailWithStructuredData(emailId)
    if (!emailData) {
      throw new Error('Email not found or missing structured data')
    }

    // Get user's Svix Application
    const svixApp = await db
      .select()
      .from(svixApplications)
      .where(eq(svixApplications.userId, emailData.userId))
      .limit(1)

    if (!svixApp[0]) {
      throw new Error('Svix application not found for user')
    }

    // Parse endpoint config
    const config = JSON.parse(endpoint.config)
    const format = endpoint.svixFormat || 'full'

    // Reconstruct parsed email data
    const parsedEmailData = reconstructParsedEmailData(emailData)

    // Add recipient to parsed email data for formatter
    const emailDataWithRecipient = {
      ...parsedEmailData,
      recipient: emailData.recipient || undefined,
    }

    // Format payload based on format type
    const payload = formatWebhookPayload(emailId, emailDataWithRecipient, format as 'full' | 'simple')

    // Send to Svix
    const svixResponse = await sendSvixMessage(
      svixApp[0].svixApplicationId,
      'email.received',
      payload
    )

    // Update delivery record
    await db
      .update(endpointDeliveries)
      .set({
        status: 'sent_to_svix',
        lastAttemptAt: new Date(),
        attempts: 1,
        responseData: JSON.stringify({
          svixMessageId: svixResponse.id,
          eventType: svixResponse.eventType,
        }),
        updatedAt: new Date(),
      })
      .where(eq(endpointDeliveries.id, deliveryId))

    console.log(`✅ handleSvixWebhook - Message sent to Svix: ${svixResponse.id} for endpoint: ${endpoint.name}`)
  } catch (error: any) {
    // Update delivery record with error
    await db
      .update(endpointDeliveries)
      .set({
        status: 'failed',
        lastAttemptAt: new Date(),
        attempts: 1,
        responseData: JSON.stringify({
          error: error.message || 'Unknown error',
        }),
        updatedAt: new Date(),
      })
      .where(eq(endpointDeliveries.id, deliveryId))

    console.error(`❌ handleSvixWebhook - Error sending to Svix:`, error)
    throw error
  }
}

/**
 * Handle webhook endpoint routing (direct implementation for unified endpoints)
 * Supports both v2 (direct HTTP) and v3 (Svix) webhook endpoints
 * TODO: Migrate v2 webhooks to v3 Svix system
 */
async function handleWebhookEndpoint(emailId: string, endpoint: Endpoint): Promise<void> {
  // Check if this is a v3 Svix webhook
  if (endpoint.svixEndpointId) {
    console.log(`🔷 handleWebhookEndpoint - Svix webhook detected (v3), using Svix delivery for endpoint: ${endpoint.name}`);
    return await handleSvixWebhook(emailId, endpoint);
  }

  // Legacy v2 webhook - direct HTTP delivery
  console.log(`🔶 handleWebhookEndpoint - Legacy v2 webhook, using direct HTTP delivery for endpoint: ${endpoint.name}`);
  
  // PRE-CREATE delivery record to prevent race condition duplicates
  // The unique constraint on (emailId, endpointId) acts as a distributed lock
  const deliveryId = nanoid()
  
  try {
    // Insert delivery record BEFORE sending webhook to prevent race conditions
    await db.insert(endpointDeliveries).values({
      id: deliveryId,
      emailId,
      endpointId: endpoint.id,
      deliveryType: 'webhook',
      status: 'pending',
      attempts: 1,
      lastAttemptAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    console.log(`🔒 handleWebhookEndpoint - Created delivery lock ${deliveryId} for ${emailId} → ${endpoint.id}`)
  } catch (error: any) {
    // Check if this is a unique constraint violation (another request already processing)
    if (error?.code === '23505' || error?.message?.includes('duplicate key') || error?.message?.includes('unique constraint')) {
      console.log(`⏭️  handleWebhookEndpoint - Delivery already in progress for emailId=${emailId}, endpointId=${endpoint.id}. Skipping duplicate.`)
      return // Exit early - another request is handling this delivery
    }
    throw error // Re-throw other errors
  }

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

    // Get or create verification token (will be added to config if missing)
    const hadToken = !!config.verificationToken
    const verificationToken = getOrCreateVerificationToken(config)
    
    // If we generated a new token, save it back to the database
    if (!hadToken) {
      await db.update(endpoints)
        .set({
          config: JSON.stringify(config),
          updatedAt: new Date()
        })
        .where(eq(endpoints.id, endpoint.id))
      console.log(`🔐 handleWebhookEndpoint - Generated and saved new verification token for endpoint ${endpoint.id}`)
    }

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
      'X-Webhook-Verification-Token': verificationToken, // Non-breaking verification token
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
          finalPayload = payloadWithCleanedRawAndNoHeaders
          finalPayloadString = payloadStringWithCleanedRawAndNoHeaders
          strippedFields.push('raw (attachment bodies removed)', 'headers')
          console.warn(`⚠️ handleWebhookEndpoint - Also removed headers, final size: ${payloadStringWithCleanedRawAndNoHeaders.length} bytes`)
        }
      }
      
      if (strippedFields.length > 0) {
        console.log(`📋 handleWebhookEndpoint - Cleaned payload for ${endpoint.name}: ${strippedFields.join(', ')}`)
      }
    }

    // Send the webhook
    const startTime = Date.now()
    let deliverySuccess = false
    let responseCode = 0
    let responseBody = ''
    let responseHeaders: Record<string, string> = {}
    let errorMessage = ''
    let deliveryTime = 0

    // Log comprehensive request details BEFORE sending
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log(`📤 Webhook Request - Starting delivery`)
    console.log(`  Endpoint:       ${endpoint.name} (ID: ${endpoint.id})`)
    console.log(`  URL:            ${webhookUrl}`)
    console.log(`  Method:         POST`)
    console.log(`  Timeout:        ${timeout}s`)
    console.log(`  Email ID:       ${emailData.structuredId}`)
    console.log(`  Message ID:     ${emailData.messageId}`)
    console.log(`  Recipient:      ${emailData.recipient}`)
    console.log(`  Subject:        ${emailData.subject}`)
    console.log(`  Payload Size:   ${finalPayloadString.length.toLocaleString()} bytes`)
    if (strippedFields.length > 0) {
      console.log(`  Stripped:       ${strippedFields.join(', ')}`)
    }
    console.log(`  Headers:`)
    Object.entries(headers).forEach(([key, value]) => {
      // Mask sensitive headers
      const displayValue = key.toLowerCase().includes('token') || key.toLowerCase().includes('auth')
        ? `${String(value).substring(0, 8)}...`
        : value
      console.log(`    ${key}: ${displayValue}`)
    })
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

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
      
      // Capture response headers
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value
      })

      // Log comprehensive response details
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
      console.log(`${deliverySuccess ? '✅' : '❌'} Webhook Response - ${deliverySuccess ? 'SUCCESS' : 'FAILED'}`)
      console.log(`  Status Code:    ${responseCode} ${response.statusText}`)
      console.log(`  Delivery Time:  ${deliveryTime}ms`)
      console.log(`  URL:            ${webhookUrl}`)
      console.log(`  Response Headers:`)
      Object.entries(responseHeaders).forEach(([key, value]) => {
        console.log(`    ${key}: ${value}`)
      })
      console.log(`  Response Body:  ${responseBody.length > 500 ? responseBody.substring(0, 500) + '... (truncated)' : responseBody}`)
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

      if (!deliverySuccess) {
        console.log(`❌ Webhook Failed - Non-OK status code`)
        console.log(`  Expected: 2xx status code`)
        console.log(`  Received: ${responseCode}`)
        console.log(`  This usually indicates:`)
        if (responseCode === 404) {
          console.log(`    - The webhook endpoint URL doesn't exist`)
          console.log(`    - The endpoint path is incorrect`)
          console.log(`    - The server is not handling POST requests at this path`)
        } else if (responseCode === 401 || responseCode === 403) {
          console.log(`    - Authentication/authorization failure`)
          console.log(`    - Check verification token or custom auth headers`)
        } else if (responseCode === 500 || responseCode === 502 || responseCode === 503) {
          console.log(`    - Server error on the webhook receiver side`)
          console.log(`    - Check the receiver's application logs`)
        } else if (responseCode === 400) {
          console.log(`    - Bad request - the payload may be invalid`)
          console.log(`    - Check the webhook receiver's expected format`)
        }
      }

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

      // Log comprehensive error details
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
      console.error(`❌ Webhook Error - Request Failed`)
      console.error(`  Error Type:     ${error instanceof Error ? error.name : 'Unknown'}`)
      console.error(`  Error Message:  ${errorMessage}`)
      console.error(`  Delivery Time:  ${deliveryTime}ms (failed)`)
      console.error(`  URL:            ${webhookUrl}`)
      console.error(`  Timeout Config: ${timeout}s`)
      
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          console.error(`  Cause:          Request exceeded timeout limit`)
          console.error(`  Resolution:     Increase timeout in endpoint config or optimize webhook handler`)
        } else if (error.message.includes('fetch failed') || error.message.includes('ECONNREFUSED')) {
          console.error(`  Cause:          Cannot connect to webhook URL`)
          console.error(`  Resolution:     Check if the URL is accessible and the server is running`)
        } else if (error.message.includes('ENOTFOUND') || error.message.includes('getaddrinfo')) {
          console.error(`  Cause:          DNS resolution failed`)
          console.error(`  Resolution:     Check if the domain name is correct and resolvable`)
        } else if (error.message.includes('certificate') || error.message.includes('SSL')) {
          console.error(`  Cause:          SSL/TLS certificate issue`)
          console.error(`  Resolution:     Check SSL certificate validity`)
        }
        
        if (error.stack) {
          console.error(`  Stack Trace:`)
          error.stack.split('\n').slice(0, 5).forEach(line => {
            console.error(`    ${line}`)
          })
        }
      }
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    }

    // Update the pre-created delivery record with results
    await db
      .update(endpointDeliveries)
      .set({
        status: deliverySuccess ? 'success' : 'failed',
        lastAttemptAt: new Date(),
        responseData: JSON.stringify({ 
          responseCode,
          responseBody: responseBody ? responseBody.substring(0, 2000) : null,
          responseHeaders,
          deliveryTime,
          error: errorMessage || null,
          url: webhookUrl,
          payloadSize: finalPayloadString.length,
          strippedFields: strippedFields.length > 0 ? strippedFields : null,
          deliveredAt: new Date().toISOString()
        }),
        updatedAt: new Date()
      })
      .where(eq(endpointDeliveries.id, deliveryId))

    if (!deliverySuccess) {
      // Log the failure but don't throw - webhook receiver errors are not our fault
      console.log(`❌ handleWebhookEndpoint - Webhook delivery failed with status ${responseCode} for email ${emailId} to ${endpoint.name}`)
      console.log(`   This is a receiver-side error and does not affect email processing`)
      return // Exit gracefully without throwing
    }

    console.log(`✅ handleWebhookEndpoint - Successfully delivered email ${emailId} to webhook ${endpoint.name} (${deliveryTime}ms)`)

  } catch (error) {
    // Update delivery record to failed state if any error occurred during processing
    try {
      await db
        .update(endpointDeliveries)
        .set({
          status: 'failed',
          lastAttemptAt: new Date(),
          responseData: JSON.stringify({
            error: error instanceof Error ? error.message : 'Unknown error',
            errorType: error instanceof Error ? error.name : 'Unknown',
            failedAt: new Date().toISOString()
          }),
          updatedAt: new Date()
        })
        .where(eq(endpointDeliveries.id, deliveryId))
    } catch (updateError) {
      console.error('❌ handleWebhookEndpoint - Failed to update delivery record:', updateError)
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.error(`❌ handleWebhookEndpoint - Final Error Summary`)
    console.error(`  Endpoint:       ${endpoint.name} (ID: ${endpoint.id})`)
    console.error(`  Email ID:       ${emailId}`)
    console.error(`  Error:          ${error instanceof Error ? error.message : 'Unknown error'}`)
    console.error(`  Delivery ID:    ${deliveryId}`)
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
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
  // PRE-CREATE delivery record to prevent race condition duplicates
  const deliveryId = nanoid()
  
  try {
    // Insert delivery record BEFORE forwarding to prevent race conditions
    await db.insert(endpointDeliveries).values({
      id: deliveryId,
      emailId,
      endpointId: endpoint.id,
      deliveryType: 'email_forward',
      status: 'pending',
      attempts: 1,
      lastAttemptAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    console.log(`🔒 handleEmailForwardEndpoint - Created delivery lock ${deliveryId} for ${emailId} → ${endpoint.id}`)
  } catch (error: any) {
    // Check if this is a unique constraint violation
    if (error?.code === '23505' || error?.message?.includes('duplicate key') || error?.message?.includes('unique constraint')) {
      console.log(`⏭️  handleEmailForwardEndpoint - Delivery already in progress for emailId=${emailId}, endpointId=${endpoint.id}. Skipping duplicate.`)
      return // Exit early
    }
    throw error
  }

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
    
    // Update delivery record with success
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
    // Update delivery record to failed state
    try {
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
    } catch (updateError) {
      console.error('❌ handleEmailForwardEndpoint - Failed to update delivery record:', updateError)
    }

    console.error(`❌ handleEmailForwardEndpoint - Error forwarding email:`, error)
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