// THIS IS THE PRIMARY WEBHOOK FOR PROCESSING EMAILS DO NOT DELETE THIS FILE

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { sesEvents, receivedEmails, parsedEmails, structuredEmails, emailDomains, emailAddresses, webhooks, webhookDeliveries } from '@/lib/db/schema'
import { nanoid } from 'nanoid'
import { eq, and } from 'drizzle-orm'
import { Autumn as autumn } from 'autumn-js'
import { createHmac } from 'crypto'
import { parseEmail, sanitizeHtml, type ParsedEmailData } from '@/lib/email-management/email-parser'
import { type SESEvent, type SESRecord } from '@/lib/aws-ses/aws-ses'
import { isEmailBlocked } from '@/lib/email-management/email-blocking'
import { routeEmail } from '@/lib/email-management/email-router'

interface ProcessedSESRecord extends SESRecord {
  emailContent?: string | null
  s3Location?: {
    bucket: string
    key: string
    contentFetched: boolean
    contentSize: number
  }
  s3Error?: string
}

interface WebhookPayload {
  type: 'ses_event_with_content'
  timestamp: string
  originalEvent: SESEvent
  processedRecords: ProcessedSESRecord[]
  context: {
    functionName: string
    functionVersion: string
    requestId: string
  }
}

/**
 * Extract domain from email address
 */
function extractDomain(email: string): string {
  return email.split('@')[1]?.toLowerCase() || ''
}

/**
 * Map recipient email to user ID by looking up domain owner
 * This function handles the mapping of email recipients to user IDs by:
 * 1. Extracting the domain from the recipient email
 * 2. Looking up the domain owner in the emailDomains table
 * 3. Returning the userId or 'system' as fallback
 */
async function mapRecipientToUserId(recipient: string): Promise<string> {
  try {
    // Validate email format first
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(recipient)) {
      console.warn(`⚠️ Webhook - Invalid email format: ${recipient}`)
      return 'system'
    }

    const domain = extractDomain(recipient)
    
    if (!domain) {
      console.warn(`⚠️ Webhook - Could not extract domain from recipient: ${recipient}`)
      return 'system'
    }

    console.log(`🔍 Webhook - Looking up domain owner for: ${domain}`)

    // Look up the domain in the emailDomains table to find the owner
    const domainRecord = await db
      .select({ 
        userId: emailDomains.userId,
        status: emailDomains.status,
        canReceiveEmails: emailDomains.canReceiveEmails
      })
      .from(emailDomains)
      .where(eq(emailDomains.domain, domain))
      .limit(1)

    if (domainRecord[0]?.userId) {
      const { userId, status, canReceiveEmails } = domainRecord[0]
      
      // Log domain status for debugging
      console.log(`✅ Webhook - Found domain ${domain}: status=${status}, canReceiveEmails=${canReceiveEmails}, userId=${userId}`)
      
      // Check if domain is properly configured to receive emails
      if (!canReceiveEmails) {
        console.warn(`⚠️ Webhook - Domain ${domain} is not configured to receive emails, but processing anyway`)
      }
      
      return userId
    } else {
      console.warn(`⚠️ Webhook - No domain owner found for ${domain} (recipient: ${recipient}), using system`)
      return 'system'
    }
  } catch (error) {
    console.error(`❌ Webhook - Error mapping recipient ${recipient} to user:`, error)
    return 'system'
  }
}

/**
 * Check and track inbound trigger usage for a user
 */
async function checkAndTrackInboundTrigger(userId: string, recipient: string): Promise<{ allowed: boolean; error?: string }> {
  // Skip tracking for system emails
  if (userId === 'system') {
    console.log(`📧 Webhook - Skipping inbound trigger check for system email: ${recipient}`)
    return { allowed: true }
  }

  try {
    // Check if user can use inbound triggers
    const { data: triggerCheck, error: triggerCheckError } = await autumn.check({
      customer_id: userId,
      feature_id: "inbound_triggers",
    })

    if (triggerCheckError) {
      console.error(`❌ Webhook - Autumn inbound trigger check error for user ${userId}:`, triggerCheckError)
      return { 
        allowed: false, 
        error: `Failed to check inbound trigger limits: ${triggerCheckError}` 
      }
    }

    if (!triggerCheck?.allowed) {
      console.warn(`⚠️ Webhook - User ${userId} not allowed to use inbound triggers for email: ${recipient}`)
      return { 
        allowed: false, 
        error: 'Inbound trigger limit reached. Please upgrade your plan to process more emails.' 
      }
    }

    // Track the inbound trigger usage if allowed and not unlimited
    if (!triggerCheck.unlimited) {
      const { error: trackError } = await autumn.track({
        customer_id: userId,
        feature_id: "inbound_triggers",
        value: 1,
      })

      if (trackError) {
        console.error(`❌ Webhook - Failed to track inbound trigger usage for user ${userId}:`, trackError)
        return { 
          allowed: false, 
          error: `Failed to track inbound trigger usage: ${trackError}` 
        }
      }

      console.log(`📊 Webhook - Tracked inbound trigger usage for user ${userId}, email: ${recipient}`)
    } else {
      console.log(`♾️ Webhook - User ${userId} has unlimited inbound triggers, no tracking needed for: ${recipient}`)
    }

    return { allowed: true }
  } catch (error) {
    console.error(`❌ Webhook - Error checking/tracking inbound trigger for user ${userId}:`, error)
    return { 
      allowed: false, 
      error: `Inbound trigger check failed: ${error instanceof Error ? error.message : 'Unknown error'}` 
    }
  }
}

/**
 * Create a parsed email record from ParsedEmailData
 */
async function createParsedEmailRecord(emailId: string, parsedEmailData: ParsedEmailData): Promise<void> {
  try {
    console.log(`📝 Webhook - Creating parsed email record for ${emailId}`)

    // Helper function to extract first address from ParsedEmailAddress
    const extractFirstAddress = (addressData: any) => {
      if (!addressData || !addressData.addresses || addressData.addresses.length === 0) {
        return { address: null, name: null }
      }
      const first = addressData.addresses[0]
      return {
        address: first.address || null,
        name: first.name || null
      }
    }

    // Extract primary from address for indexing
    const fromInfo = extractFirstAddress(parsedEmailData.from)

    // Count attachments
    const attachmentCount = parsedEmailData.attachments?.length || 0
    const hasAttachments = attachmentCount > 0

    const parsedEmailRecord = {
      id: nanoid(),
      emailId: emailId,
      messageId: parsedEmailData.messageId || null,
      
      // From address fields
      fromText: parsedEmailData.from?.text || null,
      fromAddress: fromInfo.address,
      fromName: fromInfo.name,
      
      // To addresses
      toText: parsedEmailData.to?.text || null,
      toAddresses: parsedEmailData.to?.addresses ? JSON.stringify(parsedEmailData.to.addresses) : null,
      
      // CC addresses
      ccText: parsedEmailData.cc?.text || null,
      ccAddresses: parsedEmailData.cc?.addresses ? JSON.stringify(parsedEmailData.cc.addresses) : null,
      
      // BCC addresses
      bccText: parsedEmailData.bcc?.text || null,
      bccAddresses: parsedEmailData.bcc?.addresses ? JSON.stringify(parsedEmailData.bcc.addresses) : null,
      
      // Reply-to addresses
      replyToText: parsedEmailData.replyTo?.text || null,
      replyToAddresses: parsedEmailData.replyTo?.addresses ? JSON.stringify(parsedEmailData.replyTo.addresses) : null,
      
      // Email content
      subject: parsedEmailData.subject || null,
      textBody: parsedEmailData.textBody || null,
      htmlBody: parsedEmailData.htmlBody || null,
      
      // Email threading
      inReplyTo: parsedEmailData.inReplyTo || null,
      references: parsedEmailData.references ? JSON.stringify(parsedEmailData.references) : null,
      
      // Email metadata
      priority: typeof parsedEmailData.priority === 'string' ? parsedEmailData.priority : null,
      emailDate: parsedEmailData.date || null,
      
      // Attachments
      attachments: parsedEmailData.attachments ? JSON.stringify(parsedEmailData.attachments) : null,
      attachmentCount: attachmentCount,
      hasAttachments: hasAttachments,
      
      // Headers
      headers: parsedEmailData.headers ? JSON.stringify(parsedEmailData.headers) : null,
      
      // Content flags
      hasTextBody: !!parsedEmailData.textBody,
      hasHtmlBody: !!parsedEmailData.htmlBody,
      
      // Parsing metadata
      parseSuccess: true,
      parseError: null,
      
      // Timestamps
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    await db.insert(parsedEmails).values(parsedEmailRecord)
    console.log(`✅ Webhook - Created parsed email record ${parsedEmailRecord.id} for email ${emailId}`)

  } catch (error) {
    console.error(`❌ Webhook - Error creating parsed email record for ${emailId}:`, error)
    
    // Create a minimal record indicating parse failure
    try {
      const failedParseRecord = {
        id: nanoid(),
        emailId: emailId,
        parseSuccess: false,
        parseError: error instanceof Error ? error.message : 'Unknown parsing error',
        createdAt: new Date(),
        updatedAt: new Date(),
      }
      await db.insert(parsedEmails).values(failedParseRecord)
      console.log(`⚠️ Webhook - Created failed parse record for email ${emailId}`)
    } catch (insertError) {
      console.error(`❌ Webhook - Failed to create failed parse record for ${emailId}:`, insertError)
    }
  }
}

/**
 * Create a structured email record from ParsedEmailData that matches the type exactly
 */
async function createStructuredEmailRecord(
  emailId: string, 
  sesEventId: string, 
  parsedEmailData: ParsedEmailData, 
  userId: string
): Promise<void> {
  try {
    console.log(`📝 Webhook - Creating structured email record for ${emailId}`)

    const structuredEmailRecord = {
      id: nanoid(),
      emailId: emailId,
      sesEventId: sesEventId,
      
      // Core email fields matching ParsedEmailData exactly
      messageId: parsedEmailData.messageId || null,
      date: parsedEmailData.date || null,
      subject: parsedEmailData.subject || null,
      
      // Address fields - stored as JSON matching ParsedEmailAddress structure
      fromData: parsedEmailData.from ? JSON.stringify(parsedEmailData.from) : null,
      toData: parsedEmailData.to ? JSON.stringify(parsedEmailData.to) : null,
      ccData: parsedEmailData.cc ? JSON.stringify(parsedEmailData.cc) : null,
      bccData: parsedEmailData.bcc ? JSON.stringify(parsedEmailData.bcc) : null,
      replyToData: parsedEmailData.replyTo ? JSON.stringify(parsedEmailData.replyTo) : null,
      
      // Threading fields
      inReplyTo: parsedEmailData.inReplyTo || null,
      references: parsedEmailData.references ? JSON.stringify(parsedEmailData.references) : null,
      
      // Content fields
      textBody: parsedEmailData.textBody || null,
      htmlBody: parsedEmailData.htmlBody || null,
      rawContent: parsedEmailData.raw || null,
      
      // Attachments - stored as JSON array matching ParsedEmailData structure
      attachments: parsedEmailData.attachments ? JSON.stringify(parsedEmailData.attachments) : null,
      
      // Headers - stored as JSON object matching enhanced headers structure
      headers: parsedEmailData.headers ? JSON.stringify(parsedEmailData.headers) : null,
      
      // Priority field
      priority: typeof parsedEmailData.priority === 'string' ? parsedEmailData.priority : 
                parsedEmailData.priority === false ? 'false' : null,
      
      // Processing metadata
      parseSuccess: true,
      parseError: null,
      
      // User and timestamps
      userId: userId,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    await db.insert(structuredEmails).values(structuredEmailRecord)
    console.log(`✅ Webhook - Created structured email record ${structuredEmailRecord.id} for email ${emailId}`)

  } catch (error) {
    console.error(`❌ Webhook - Error creating structured email record for ${emailId}:`, error)
    
    // Create a minimal record indicating parse failure
    try {
      const failedStructuredRecord = {
        id: nanoid(),
        emailId: emailId,
        sesEventId: sesEventId,
        parseSuccess: false,
        parseError: error instanceof Error ? error.message : 'Unknown parsing error',
        userId: userId,
        createdAt: new Date(),
        updatedAt: new Date(),
      }
      await db.insert(structuredEmails).values(failedStructuredRecord)
      console.log(`⚠️ Webhook - Created failed structured parse record for email ${emailId}`)
    } catch (insertError) {
      console.error(`❌ Webhook - Failed to create failed structured parse record for ${emailId}:`, insertError)
    }
  }
}



/**
 * Trigger email action by emailID - looks up email data and sends to configured webhook
 * This function separates webhook processing from the main email ingestion flow
 */
export async function triggerEmailAction(emailId: string): Promise<{ success: boolean; error?: string; deliveryId?: string }> {
  try {
    console.log(`🎯 triggerEmailAction - Processing email ID: ${emailId}`)

    // Get the email record with structured data
    const emailWithStructuredData = await db
      .select({
        // Email record fields
        emailId: receivedEmails.id,
        messageId: receivedEmails.messageId,
        from: receivedEmails.from,
        to: receivedEmails.to,
        recipient: receivedEmails.recipient,
        subject: receivedEmails.subject,
        receivedAt: receivedEmails.receivedAt,
        userId: receivedEmails.userId,
        
        // Structured email data (ParsedEmailData)
        structuredId: structuredEmails.id,
        structuredMessageId: structuredEmails.messageId,
        structuredDate: structuredEmails.date,
        structuredSubject: structuredEmails.subject,
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
      .from(receivedEmails)
      .leftJoin(structuredEmails, eq(receivedEmails.id, structuredEmails.emailId))
      .where(eq(receivedEmails.id, emailId))
      .limit(1)

    if (!emailWithStructuredData[0]) {
      return { success: false, error: 'Email not found' }
    }

    const emailData = emailWithStructuredData[0]

    // Check if we have structured data
    if (!emailData.structuredId || !emailData.parseSuccess) {
      return { 
        success: false, 
        error: `No structured email data found or parsing failed: ${emailData.parseError || 'Unknown error'}` 
      }
    }

    // Look up the email address to find the configured webhook
    const emailAddressRecord = await db
      .select({
        webhookId: emailAddresses.webhookId,
        address: emailAddresses.address,
        isActive: emailAddresses.isActive,
      })
      .from(emailAddresses)
      .where(and(
        eq(emailAddresses.address, emailData.recipient),
        eq(emailAddresses.isActive, true)
      ))
      .limit(1)

    if (!emailAddressRecord[0]?.webhookId) {
      return { 
        success: false, 
        error: `No webhook configured for ${emailData.recipient}` 
      }
    }

    const webhookId = emailAddressRecord[0].webhookId

    // Get the webhook configuration
    const webhookRecord = await db
      .select()
      .from(webhooks)
      .where(and(
        eq(webhooks.id, webhookId),
        eq(webhooks.isActive, true)
      ))
      .limit(1)

    if (!webhookRecord[0]) {
      return { 
        success: false, 
        error: `Webhook ${webhookId} not found or disabled for ${emailData.recipient}` 
      }
    }

    const webhook = webhookRecord[0]

    console.log(`📤 triggerEmailAction - Sending email ${emailData.messageId} to webhook: ${webhook.name} (${webhook.url})`)

    // Reconstruct ParsedEmailData from structured data
    const parsedEmailData: ParsedEmailData = {
      messageId: emailData.structuredMessageId || undefined,
      date: emailData.structuredDate || undefined,
      subject: emailData.structuredSubject || undefined,
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

    // Create webhook payload with the exact ParsedEmailData structure
    const webhookPayload = {
      event: 'email.received',
      timestamp: new Date().toISOString(),
      email: {
        id: emailData.structuredId, // Use structured email ID for v2 API compatibility
        messageId: emailData.messageId,
        from: emailData.from,
        to: JSON.parse(emailData.to),
        recipient: emailData.recipient,
        subject: emailData.subject,
        receivedAt: emailData.receivedAt,
        
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
      webhook: {
        id: webhook.id,
        name: webhook.name
      }
    }

    const payloadString = JSON.stringify(webhookPayload)

    // Create webhook signature if secret exists
    let signature = null
    if (webhook.secret) {
      const hmac = createHmac('sha256', webhook.secret)
      hmac.update(payloadString)
      signature = `sha256=${hmac.digest('hex')}`
    }

    // Prepare headers
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      'User-Agent': 'InboundEmail-Webhook/1.0',
      'X-Webhook-Event': 'email.received',
      'X-Webhook-ID': webhook.id,
      'X-Webhook-Timestamp': webhookPayload.timestamp,
      'X-Email-ID': emailData.structuredId, // Use structured email ID for v2 API compatibility
      'X-Message-ID': emailData.messageId,
    }

    if (signature) {
      headers['X-Webhook-Signature'] = signature
    }

    // Add custom headers if any
    if (webhook.headers) {
      try {
        const customHeaders = JSON.parse(webhook.headers)
        Object.assign(headers, customHeaders)
      } catch (error) {
        console.error('Error parsing custom headers:', error)
      }
    }

    // Create delivery record
    const deliveryId = nanoid()
    
    // Send the webhook
    const startTime = Date.now()
    let deliverySuccess = false
    let responseCode = 0
    let responseBody = ''
    let errorMessage = ''
    let deliveryTime = 0

    try {
      const response = await fetch(webhook.url, {
        method: 'POST',
        headers,
        body: payloadString,
        signal: AbortSignal.timeout((webhook.timeout || 30) * 1000)
      })

      deliveryTime = Date.now() - startTime
      responseCode = response.status
      responseBody = await response.text().catch(() => 'Unable to read response body')
      deliverySuccess = response.ok

      console.log(`${deliverySuccess ? '✅' : '❌'} triggerEmailAction - Delivery ${deliverySuccess ? 'succeeded' : 'failed'} for ${emailData.recipient}: ${responseCode} in ${deliveryTime}ms`)

    } catch (error) {
      deliveryTime = Date.now() - startTime
      deliverySuccess = false
      
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          errorMessage = `Request timeout after ${webhook.timeout}s`
        } else {
          errorMessage = error.message
        }
      } else {
        errorMessage = 'Unknown error'
      }

      console.error(`❌ triggerEmailAction - Delivery failed for ${emailData.recipient}:`, errorMessage)
    }

    // Create final delivery record with all data
    const deliveryRecord = {
      id: deliveryId,
      emailId: emailData.emailId,
      webhookId: webhook.id,
      endpoint: webhook.url,
      payload: payloadString,
      status: deliverySuccess ? 'success' as const : 'failed' as const,
      attempts: 1,
      lastAttemptAt: new Date(),
      responseCode: responseCode || null,
      responseBody: responseBody ? responseBody.substring(0, 2000) : null, // Limit response body size
      deliveryTime: deliveryTime,
      error: errorMessage || null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    // Store delivery record
    await db.insert(webhookDeliveries).values(deliveryRecord)

    // Update webhook stats
    await db
      .update(webhooks)
      .set({
        lastUsed: new Date(),
        totalDeliveries: (webhook.totalDeliveries || 0) + 1,
        successfulDeliveries: deliverySuccess ? (webhook.successfulDeliveries || 0) + 1 : (webhook.successfulDeliveries || 0),
        failedDeliveries: deliverySuccess ? (webhook.failedDeliveries || 0) : (webhook.failedDeliveries || 0) + 1,
        updatedAt: new Date()
      })
      .where(eq(webhooks.id, webhook.id))

    console.log(`📊 triggerEmailAction - Updated webhook stats for ${webhook.name}`)

    return { 
      success: deliverySuccess, 
      error: deliverySuccess ? undefined : errorMessage,
      deliveryId: deliveryId
    }

  } catch (error) {
    console.error(`❌ triggerEmailAction - Error processing email ${emailId}:`, error)
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }
  }
}

export async function POST(request: NextRequest) {
  try {
    console.log('===============================================')
    console.log('📧 Webhook - Received email event from Lambda')
    console.log('===============================================')
    
    // Verify the request is from our Lambda function
    const authHeader = request.headers.get('authorization')
    const expectedApiKey = process.env.SERVICE_API_KEY
    
    if (!authHeader || !expectedApiKey) {
      console.error('❌ Webhook - Missing authentication');
      return NextResponse.json(
        { error: 'Missing authentication' },
        { status: 401 }
      )
    }

    const providedKey = authHeader.replace('Bearer ', '')
    if (providedKey !== expectedApiKey) {
      console.error('❌ Webhook - Invalid authentication');
      return NextResponse.json(
        { error: 'Invalid authentication' },
        { status: 401 }
      )
    }

    const payload: WebhookPayload = await request.json()
    console.log('🔍 Webhook - Payload type:', payload.type);

    // Validate payload structure
    if (payload.type !== 'ses_event_with_content' || !payload.processedRecords) {
      console.error('❌ Webhook - Invalid payload structure');
      return NextResponse.json(
        { error: 'Invalid payload structure' },
        { status: 400 }
      )
    }

    const processedEmails: Array<{
      emailId: string
      sesEventId: string
      messageId: string
      recipient: string
      subject: string
      webhookDelivery: { success: boolean; deliveryId?: string; error?: string } | null
    }> = []
    
    const rejectedEmails: Array<{
      messageId: string
      recipient: string
      userId: string
      reason: string
      subject: string
    }> = []

    // Process each enhanced SES record
    for (const record of payload.processedRecords) {
      try {
        const sesData = record.ses
        // console.log('===============================================')
        // console.log('Record Full Data:', JSON.stringify(record, null, 2))
        // console.log('===============================================')
        const mail = sesData.mail
        const receipt = sesData.receipt

        console.log(`📨 Webhook - Processing email: ${mail.messageId}`);
        console.log(`👥 Webhook - Recipients: ${receipt.recipients.join(', ')}`);

        // First, store the SES event
        const sesEventId = nanoid()
        const sesEventRecord = {
          id: sesEventId,
          eventSource: record.eventSource,
          eventVersion: record.eventVersion,
          messageId: mail.messageId,
          source: mail.source,
          destination: JSON.stringify(mail.destination),
          subject: mail.commonHeaders.subject || null,
          timestamp: new Date(mail.timestamp),
          receiptTimestamp: new Date(receipt.timestamp),
          processingTimeMillis: receipt.processingTimeMillis,
          recipients: JSON.stringify(receipt.recipients),
          spamVerdict: receipt.spamVerdict.status,
          virusVerdict: receipt.virusVerdict.status,
          spfVerdict: receipt.spfVerdict.status,
          dkimVerdict: receipt.dkimVerdict.status,
          dmarcVerdict: receipt.dmarcVerdict.status,
          actionType: receipt.action.type,
          s3BucketName: receipt.action.bucketName,
          s3ObjectKey: receipt.action.objectKey,
          emailContent: record.emailContent || null,
          s3ContentFetched: record.s3Location?.contentFetched || false,
          s3ContentSize: record.s3Location?.contentSize || null,
          s3Error: record.s3Error || null,
          commonHeaders: JSON.stringify(mail.commonHeaders),
          rawSesEvent: JSON.stringify(record.ses),
          lambdaContext: JSON.stringify(payload.context),
          webhookPayload: JSON.stringify(payload),
          updatedAt: new Date(),
        }

        await db.insert(sesEvents).values(sesEventRecord)
        console.log(`✅ Webhook - Stored SES event ${sesEventId} for message ${mail.messageId}`);

        /**
         * CRITICAL: Create individual receivedEmail records for each recipient
         *
         * This design is essential for system longevity and multi-tenant architecture:
         *
         * 1. MULTI-RECIPIENT EMAIL HANDLING:
         *    - AWS SES sends one event for emails with multiple recipients (e.g., alice@domain.com, bob@domain.com)
         *    - Each recipient may belong to different users/tenants with separate configurations
         *    - Individual records allow per-recipient processing, routing, and ownership
         *
         * 2. PER-RECIPIENT OWNERSHIP & TRACKING:
         *    - Each record links to the specific userId who owns that email address domain
         *    - Enables separate analytics, billing, and feature limits per user
         *    - Allows individual email status tracking (received/blocked/failed)
         *
         * 3. FAULT ISOLATION:
         *    - If one recipient's domain is misconfigured, others still receive their emails
         *    - Individual routing rules and endpoint configurations per recipient
         *    - Prevents single point of failure affecting all recipients
         *
         * 4. BACKWARD COMPATIBILITY BRIDGE:
         *    - Serves as a stable interface between raw SES events and structured data
         *    - Legacy systems and analytics depend on this per-recipient structure
         *    - Enables gradual migration to structuredEmails without breaking changes
         *
         * 5. AUDIT TRAIL & DEBUGGING:
         *    - Complete per-recipient history for troubleshooting
         *    - Individual processing status and error tracking
         *    - Rich metadata for debugging delivery issues
         *
         * DO NOT REMOVE: This per-recipient architecture is fundamental to the system's
         * multi-tenant design and ensures proper email isolation between users.
         */
        // Then, create a receivedEmail record for each recipient
        for (const recipient of receipt.recipients) {
          const userId = await mapRecipientToUserId(recipient)

          // Check and track inbound trigger usage
          const triggerResult = await checkAndTrackInboundTrigger(userId, recipient)
          
          if (!triggerResult.allowed) {
            console.warn(`⚠️ Webhook - Rejected email for ${recipient} due to inbound trigger limits: ${triggerResult.error}`)
            rejectedEmails.push({
              messageId: mail.messageId,
              recipient: recipient,
              userId: userId,
              reason: triggerResult.error || 'Inbound trigger limit reached',
              subject: mail.commonHeaders.subject,
            })
            continue // Skip processing this recipient
          }

          // Check if the sender email is blocked
          const senderBlocked = await isEmailBlocked(mail.source)
          let emailStatus: 'received' | 'blocked' = 'received'
          
          if (senderBlocked) {
            console.warn(`🚫 Webhook - Email from blocked sender ${mail.source} to ${recipient}`)
            emailStatus = 'blocked'
          }

          // Parse the email content using the new parseEmail function
          let parsedEmailData: ParsedEmailData | null = null
          console.log('Email content:', record.emailContent)
          if (record.emailContent) {
            console.log(`📧📧📧 Webhook - Parsing email content for ${mail.messageId}`)
            try {
              parsedEmailData = await parseEmail(record.emailContent)
              console.log(`✅ Webhook - Successfully parsed email content for ${mail.messageId}`)
            } catch (parseError) {
              console.error(`❌ Webhook - Failed to parse email content for ${mail.messageId}:`, parseError)
            }
          }

          const emailRecord = {
            id: nanoid(),
            sesEventId: sesEventId,
            messageId: mail.messageId,
            from: mail.source,
            to: JSON.stringify(mail.destination),
            recipient: recipient,
            subject: mail.commonHeaders.subject || 'No Subject',
            
            // Parsed email data fields
            fromParsed: parsedEmailData?.from ? JSON.stringify(parsedEmailData.from) : null,
            toParsed: parsedEmailData?.to ? JSON.stringify(parsedEmailData.to) : null,
            ccParsed: parsedEmailData?.cc ? JSON.stringify(parsedEmailData.cc) : null,
            bccParsed: parsedEmailData?.bcc ? JSON.stringify(parsedEmailData.bcc) : null,
            replyToParsed: parsedEmailData?.replyTo ? JSON.stringify(parsedEmailData.replyTo) : null,
            
            // Email content
            textBody: parsedEmailData?.textBody || null,
            htmlBody: parsedEmailData?.htmlBody || null,
            rawEmailContent: record.emailContent || null,
            
            // Email metadata
            inReplyTo: parsedEmailData?.inReplyTo || null,
            references: parsedEmailData?.references ? JSON.stringify(parsedEmailData.references) : null,
            priority: typeof parsedEmailData?.priority === 'string' ? parsedEmailData.priority : null,
            
            // Attachments and headers
            attachments: parsedEmailData?.attachments ? JSON.stringify(parsedEmailData.attachments) : null,
            headers: parsedEmailData?.headers ? JSON.stringify(parsedEmailData.headers) : null,
            
            // Timestamps
            emailDate: parsedEmailData?.date || null,
            receivedAt: new Date(mail.timestamp),
            processedAt: new Date(),
            
            // Status and tracking
            status: emailStatus,
            isRead: false,
            readAt: null,
            
            // Legacy metadata field for backward compatibility
            metadata: JSON.stringify({
              recipient: recipient,
              authResults: {
                spf: receipt.spfVerdict.status,
                dkim: receipt.dkimVerdict.status,
                dmarc: receipt.dmarcVerdict.status,
                spam: receipt.spamVerdict.status,
                virus: receipt.virusVerdict.status,
              },
              s3Location: record.s3Location || {
                bucket: receipt.action.bucketName,
                key: receipt.action.objectKey,
              },
              headers: mail.commonHeaders,
              lambdaContext: payload.context,
              processingTimeMillis: receipt.processingTimeMillis,
              emailContent: record.emailContent ? {
                hasContent: true,
                contentSize: record.emailContent.length,
                contentPreview: record.emailContent.substring(0, 500) + (record.emailContent.length > 500 ? '...' : '')
              } : {
                hasContent: false,
                s3Error: record.s3Error
              },
              inboundTriggerTracked: true, // Flag to indicate this email was tracked for inbound triggers
              parsedSuccessfully: !!parsedEmailData, // Flag to indicate if email was successfully parsed
              senderBlocked: senderBlocked, // Flag to indicate if the sender was blocked
              blockedReason: senderBlocked ? 'Sender email address is on the blocklist' : null
            }),
            userId: userId,
            updatedAt: new Date(),
          }

          await db.insert(receivedEmails).values(emailRecord)
          
          // Initialize email processing record
          const emailProcessingRecord = {
            emailId: emailRecord.id,
            sesEventId: sesEventId,
            messageId: mail.messageId,
            recipient: recipient,
            subject: mail.commonHeaders.subject,
            webhookDelivery: null as { success: boolean; deliveryId?: string; error?: string } | null,
          }

          console.log(`✅ Webhook - Stored email ${mail.messageId} for ${recipient}`);

          /**
           * DUAL RECORD CREATION: parsedEmails (deprecated) + structuredEmails (current)
           *
           * This dual approach exists for migration and backward compatibility:
           *
           * 1. PARSED EMAILS (DEPRECATED - TO BE REMOVED):
           *    - Legacy table structure with individual columns for each email field
           *    - Used by existing analytics, admin dashboards, and legacy integrations
           *    - Creates duplicate data storage but maintains compatibility
           *    - Will be removed once all consumers migrate to structuredEmails
           *
           * 2. STRUCTURED EMAILS (CURRENT STANDARD):
           *    - Matches ParsedEmailData type exactly with JSON fields
           *    - More efficient storage and better type safety
           *    - Used by email router and new features
           *    - Future-proof design that matches our data structures
           *
           * WHY BOTH? GRADUAL MIGRATION STRATEGY:
           *    - Analytics queries still depend on parsedEmails table
           *    - Admin dashboard shows counts from parsedEmails
           *    - Legacy webhook consumers expect this format
           *    - Cannot break existing functionality during migration
           *
           * MIGRATION TIMELINE:
           *    1. Keep both during transition period
           *    2. Update all consumers to use structuredEmails
           *    3. Remove parsedEmails table and createParsedEmailRecord function
           *    4. Clean up deprecated code paths
           *
           * PERFORMANCE IMPACT:
           *    - Temporary data duplication (acceptable for migration)
           *    - Extra database writes (minimal overhead)
           *    - Ensures zero downtime during migration
           */
          // Create parsed email record if we have parsed data
          if (parsedEmailData) {
            await createParsedEmailRecord(emailRecord.id, parsedEmailData) // this will be deprecated in the future
            // Create structured email record that matches ParsedEmailData type exactly
            await createStructuredEmailRecord(emailRecord.id, sesEventId, parsedEmailData, userId)
          }

          // Route email using the new unified routing system (skip routing for blocked emails)
          if (emailStatus === 'blocked') {
            console.log(`🚫 Webhook - Skipping routing for blocked email ${emailRecord.id} from ${mail.source}`)
            
            // Update processing record to indicate blocked
            emailProcessingRecord.webhookDelivery = {
              success: false,
              error: 'Email blocked - sender is on the blocklist'
            }
          } else {
            try {
              
              await routeEmail(emailRecord.id)
              console.log(`✅ Webhook - Successfully routed email ${emailRecord.id}`)
              
              // Update processing record with success
              emailProcessingRecord.webhookDelivery = {
                success: true,
                deliveryId: undefined // Will be tracked in endpointDeliveries table
              }
            } catch (routingError) {
              console.error(`❌ Webhook - Failed to route email ${emailRecord.id}:`, routingError)
              
              // Update processing record with failure
              emailProcessingRecord.webhookDelivery = {
                success: false,
                error: routingError instanceof Error ? routingError.message : 'Unknown routing error'
              }
            }
          }

          // Processing record already updated above in the try/catch block

          processedEmails.push(emailProcessingRecord)
        }
      } catch (recordError) {
        console.error('❌ Webhook - Error processing SES record:', recordError);
        // Continue processing other records
      }
    }

    const response = {
      success: true,
      processedEmails: processedEmails.length,
      rejectedEmails: rejectedEmails.length,
      emails: processedEmails,
      rejected: rejectedEmails,
      timestamp: new Date(),
      lambdaContext: payload.context,
    }

    console.log(`✅ Webhook - Successfully processed ${processedEmails.length} emails, rejected ${rejectedEmails.length} emails`);

    return NextResponse.json(response)
  } catch (error) {
    console.error('💥 Webhook - Processing error:', error)
    
    // Return success even on error to prevent Lambda retries
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to process email webhook',
        details: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date()
      },
      { status: 200 } // Return 200 to prevent retries
    )
  }
}