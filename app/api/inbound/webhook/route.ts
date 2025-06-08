// THIS IS THE PRIMARY WEBHOOK FOR PROCESSING EMAILS DO NOT DELETE THIS FILE

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { sesEvents, receivedEmails, emailDomains, emailAddresses, webhooks, webhookDeliveries } from '@/lib/db/schema'
import { nanoid } from 'nanoid'
import { eq, and } from 'drizzle-orm'
import { Autumn as autumn } from 'autumn-js'
import { createHmac } from 'crypto'
import { parseEmailContent, sanitizeHtml } from '@/lib/email-parser'

interface SESEvent {
  Records: Array<{
    eventSource: string
    eventVersion: string
    ses: {
      receipt: {
        timestamp: string
        processingTimeMillis: number
        recipients: string[]
        spamVerdict: { status: string }
        virusVerdict: { status: string }
        spfVerdict: { status: string }
        dkimVerdict: { status: string }
        dmarcVerdict: { status: string }
        action: {
          type: string
          bucketName: string
          objectKey: string
        }
      }
      mail: {
        timestamp: string
        messageId: string
        source: string
        destination: string[]
        commonHeaders: {
          from: string[]
          to: string[]
          subject: string
          date?: string
          messageId?: string
        }
      }
    }
  }>
}

interface ProcessedSESRecord {
  eventSource: string
  eventVersion: string
  ses: {
    receipt: {
      timestamp: string
      processingTimeMillis: number
      recipients: string[]
      spamVerdict: { status: string }
      virusVerdict: { status: string }
      spfVerdict: { status: string }
      dkimVerdict: { status: string }
      dmarcVerdict: { status: string }
      action: {
        type: string
        bucketName: string
        objectKey: string
      }
    }
    mail: {
      timestamp: string
      messageId: string
      source: string
      destination: string[]
      commonHeaders: {
        from: string[]
        to: string[]
        subject: string
        date?: string
        messageId?: string
      }
    }
  }
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
 * Forward email to configured webhook for the recipient
 */
async function forwardToWebhook(emailRecord: any, sesRecord: ProcessedSESRecord): Promise<void> {
  try {
    console.log(`🔗 Webhook - Looking up webhook for recipient: ${emailRecord.recipient}`)

    // Look up the email address to find the configured webhook
    const emailAddressRecord = await db
      .select({
        webhookId: emailAddresses.webhookId,
        address: emailAddresses.address,
        isActive: emailAddresses.isActive,
      })
      .from(emailAddresses)
      .where(and(
        eq(emailAddresses.address, emailRecord.recipient),
        eq(emailAddresses.isActive, true)
      ))
      .limit(1)

    if (!emailAddressRecord[0]?.webhookId) {
      console.log(`ℹ️ Webhook - No webhook configured for ${emailRecord.recipient}, skipping forwarding`)
      return
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
      console.warn(`⚠️ Webhook - Webhook ${webhookId} not found or disabled for ${emailRecord.recipient}`)
      return
    }

    const webhook = webhookRecord[0]

    console.log(`📤 Webhook - Forwarding email ${emailRecord.messageId} to webhook: ${webhook.name} (${webhook.url})`)

    // Parse email content using the same logic as analytics dashboard
    const parsedEmail = await parseEmailContent(sesRecord.emailContent || '')
    
    // Create cleaned content with sanitized HTML and formatted text
    const cleanedContent = {
      html: parsedEmail.htmlBody ? sanitizeHtml(parsedEmail.htmlBody) : null,
      text: parsedEmail.textBody || null,
      hasHtml: !!parsedEmail.htmlBody,
      hasText: !!parsedEmail.textBody,
      attachments: parsedEmail.attachments,
      headers: parsedEmail.headers
    }

    // Create webhook payload
    const webhookPayload = {
      event: 'email.received',
      timestamp: new Date().toISOString(),
      email: {
        id: emailRecord.id,
        messageId: emailRecord.messageId,
        from: emailRecord.from,
        to: JSON.parse(emailRecord.to),
        recipient: emailRecord.recipient,
        subject: emailRecord.subject,
        receivedAt: emailRecord.receivedAt,
        content: sesRecord.emailContent || null, // Raw content
        cleanedContent: cleanedContent, // Parsed and cleaned content (same as analytics)
        headers: sesRecord.ses.mail.commonHeaders,
        s3Location: sesRecord.s3Location || {
          bucket: sesRecord.ses.receipt.action.bucketName,
          key: sesRecord.ses.receipt.action.objectKey
        },
        authResults: {
          spf: sesRecord.ses.receipt.spfVerdict.status,
          dkim: sesRecord.ses.receipt.dkimVerdict.status,
          dmarc: sesRecord.ses.receipt.dmarcVerdict.status,
          spam: sesRecord.ses.receipt.spamVerdict.status,
          virus: sesRecord.ses.receipt.virusVerdict.status,
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
      'X-Email-ID': emailRecord.id,
      'X-Message-ID': emailRecord.messageId,
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

      console.log(`${deliverySuccess ? '✅' : '❌'} Webhook - Delivery ${deliverySuccess ? 'succeeded' : 'failed'} for ${emailRecord.recipient}: ${responseCode} in ${deliveryTime}ms`)

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

      console.error(`❌ Webhook - Delivery failed for ${emailRecord.recipient}:`, errorMessage)
    }

    // Create final delivery record with all data
    const deliveryRecord = {
      id: deliveryId,
      emailId: emailRecord.id,
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

    console.log(`📊 Webhook - Updated webhook stats for ${webhook.name}`)

  } catch (error) {
    console.error(`❌ Webhook - Error forwarding email ${emailRecord.messageId} for ${emailRecord.recipient}:`, error)
  }
}

export async function POST(request: NextRequest) {
  try {
    console.log('📧 Webhook - Received email event from Lambda');
    
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

    const processedEmails = []
    const rejectedEmails = []

    // Process each enhanced SES record
    for (const record of payload.processedRecords) {
      try {
        const sesData = record.ses
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

          const emailRecord = {
            id: nanoid(),
            sesEventId: sesEventId,
            messageId: mail.messageId,
            from: mail.source,
            to: JSON.stringify(mail.destination),
            recipient: recipient,
            subject: mail.commonHeaders.subject || 'No Subject',
            receivedAt: new Date(mail.timestamp),
            processedAt: new Date(),
            status: 'received' as const,
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
            }),
            userId: userId,
            updatedAt: new Date(),
          }

          await db.insert(receivedEmails).values(emailRecord)
          processedEmails.push({
            emailId: emailRecord.id,
            sesEventId: sesEventId,
            messageId: mail.messageId,
            recipient: recipient,
            subject: mail.commonHeaders.subject,
          })

          console.log(`✅ Webhook - Stored email ${mail.messageId} for ${recipient}`);

          // Forward email to configured webhook
          await forwardToWebhook(emailRecord, record)
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

// GET endpoint for webhook health check
export async function GET() {
  return NextResponse.json({
    status: 'healthy',
    service: 'inbound-email-webhook',
    timestamp: new Date(),
    version: '3.0.0',
    description: 'Receives SES events with email content from Lambda forwarder',
    features: [
      'Raw SES event processing',
      'S3 email content fetching',
      'Full email content storage',
      'Enhanced metadata tracking',
      'SES event storage in dedicated table',
      'Autumn inbound trigger limits and tracking'
    ]
  })
} 