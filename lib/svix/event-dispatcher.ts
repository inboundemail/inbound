/**
 * SVIX Event Dispatcher
 * 
 * Dispatches sent email lifecycle events to SVIX for webhook delivery.
 * Call these functions when email events occur (sent, bounced, etc.)
 */

import { db } from '@/lib/db'
import { sentEmails, emailDeliveryEvents } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { sendMessage, isSvixEnabled } from './index'
import {
  SVIX_EVENT_TYPES,
  getBounceEventType,
  createEventTimestamp,
  type EmailSentPayload,
  type EmailBouncedPayload,
  type EmailComplaintPayload,
  type EmailDeliveredPayload,
} from './event-types'

// ============================================================================
// Dispatch Results
// ============================================================================

export interface DispatchResult {
  success: boolean
  messageId?: string
  error?: string
  skipped?: boolean
  reason?: string
}

// ============================================================================
// Email Sent Event
// ============================================================================

/**
 * Dispatch an email.sent event when an email is successfully sent
 */
export async function dispatchEmailSentEvent(sentEmailId: string): Promise<DispatchResult> {
  if (!isSvixEnabled()) {
    return { success: true, skipped: true, reason: 'SVIX not configured' }
  }
  
  try {
    // Fetch the sent email details
    const sentEmail = await db
      .select({
        id: sentEmails.id,
        messageId: sentEmails.messageId,
        from: sentEmails.from,
        to: sentEmails.to,
        cc: sentEmails.cc,
        bcc: sentEmails.bcc,
        subject: sentEmails.subject,
        userId: sentEmails.userId,
        sentAt: sentEmails.sentAt,
      })
      .from(sentEmails)
      .where(eq(sentEmails.id, sentEmailId))
      .limit(1)
    
    if (!sentEmail[0]) {
      return { success: false, error: `Sent email ${sentEmailId} not found` }
    }
    
    const email = sentEmail[0]
    
    // Parse recipient arrays
    const toAddresses = email.to ? JSON.parse(email.to) : []
    const ccAddresses = email.cc ? JSON.parse(email.cc) : []
    const bccAddresses = email.bcc ? JSON.parse(email.bcc) : []
    
    const payload: EmailSentPayload = {
      emailId: email.id,
      messageId: email.messageId || undefined,
      from: email.from,
      to: toAddresses,
      cc: ccAddresses.length > 0 ? ccAddresses : undefined,
      bcc: bccAddresses.length > 0 ? bccAddresses : undefined,
      subject: email.subject || undefined,
      timestamp: email.sentAt?.toISOString() || createEventTimestamp(),
    }
    
    const result = await sendMessage(
      email.userId,
      SVIX_EVENT_TYPES.EMAIL_SENT,
      payload,
      `email-sent-${email.id}` // Idempotency key
    )
    
    if (result) {
      return { success: true, messageId: result.messageId }
    }
    
    return { success: true, skipped: true, reason: 'No SVIX application for user' }
  } catch (error) {
    console.error(`[SVIX Dispatcher] Error dispatching email.sent for ${sentEmailId}:`, error)
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }
  }
}

// ============================================================================
// Email Bounced Event
// ============================================================================

/**
 * Dispatch an email.bounced event when a bounce is recorded
 */
export async function dispatchEmailBouncedEvent(deliveryEventId: string): Promise<DispatchResult> {
  if (!isSvixEnabled()) {
    return { success: true, skipped: true, reason: 'SVIX not configured' }
  }
  
  try {
    // Fetch the delivery event details
    const deliveryEvent = await db
      .select({
        id: emailDeliveryEvents.id,
        failedRecipient: emailDeliveryEvents.failedRecipient,
        bounceType: emailDeliveryEvents.bounceType,
        bounceSubType: emailDeliveryEvents.bounceSubType,
        statusCode: emailDeliveryEvents.statusCode,
        diagnosticCode: emailDeliveryEvents.diagnosticCode,
        addedToBlocklist: emailDeliveryEvents.addedToBlocklist,
        originalSentEmailId: emailDeliveryEvents.originalSentEmailId,
        originalFrom: emailDeliveryEvents.originalFrom,
        originalTo: emailDeliveryEvents.originalTo,
        originalSubject: emailDeliveryEvents.originalSubject,
        originalMessageId: emailDeliveryEvents.originalMessageId,
        userId: emailDeliveryEvents.userId,
        createdAt: emailDeliveryEvents.createdAt,
      })
      .from(emailDeliveryEvents)
      .where(eq(emailDeliveryEvents.id, deliveryEventId))
      .limit(1)
    
    if (!deliveryEvent[0]) {
      return { success: false, error: `Delivery event ${deliveryEventId} not found` }
    }
    
    const event = deliveryEvent[0]
    
    // We need a userId to send the event
    if (!event.userId) {
      return { success: true, skipped: true, reason: 'No user associated with bounce event' }
    }
    
    // Parse recipient addresses
    let toAddresses: string[] = []
    if (event.originalTo) {
      try {
        toAddresses = JSON.parse(event.originalTo)
      } catch {
        toAddresses = [event.originalTo]
      }
    }
    
    const bounceType = (event.bounceType as 'hard' | 'soft' | 'transient') || 'soft'
    
    const payload: EmailBouncedPayload = {
      emailId: event.originalSentEmailId || deliveryEventId,
      messageId: event.originalMessageId || undefined,
      from: event.originalFrom || 'unknown',
      to: toAddresses,
      subject: event.originalSubject || undefined,
      recipient: event.failedRecipient,
      bounceType,
      bounceSubType: event.bounceSubType || 'unknown',
      statusCode: event.statusCode || undefined,
      reason: getHumanReadableReason(event.bounceSubType, event.diagnosticCode),
      diagnosticCode: event.diagnosticCode || undefined,
      addedToBlocklist: event.addedToBlocklist || false,
      timestamp: event.createdAt?.toISOString() || createEventTimestamp(),
    }
    
    // Send both the specific bounce type and the general bounce event
    const eventType = getBounceEventType(bounceType)
    const bounceAttemptKey = `${deliveryEventId}-${bounceType}-${event.statusCode || 'unknown'}`
    
    const result = await sendMessage(
      event.userId,
      eventType,
      payload,
      `bounce-${bounceAttemptKey}` // Idempotency key
    )
    
    // Also send the general email.bounced event
    await sendMessage(
      event.userId,
      SVIX_EVENT_TYPES.EMAIL_BOUNCED,
      payload,
      `bounce-general-${bounceAttemptKey}`
    )
    
    if (result) {
      return { success: true, messageId: result.messageId }
    }
    
    return { success: true, skipped: true, reason: 'No SVIX application for user' }
  } catch (error) {
    console.error(`[SVIX Dispatcher] Error dispatching email.bounced for ${deliveryEventId}:`, error)
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }
  }
}

// ============================================================================
// Email Delivered Event
// ============================================================================

/**
 * Dispatch an email.delivered event
 * Call this when SES confirms delivery
 */
export async function dispatchEmailDeliveredEvent(
  sentEmailId: string,
  recipient: string,
  smtpResponse?: string,
  processingTimeMs?: number
): Promise<DispatchResult> {
  if (!isSvixEnabled()) {
    return { success: true, skipped: true, reason: 'SVIX not configured' }
  }
  
  try {
    // Fetch the sent email details
    const sentEmail = await db
      .select({
        id: sentEmails.id,
        messageId: sentEmails.messageId,
        from: sentEmails.from,
        to: sentEmails.to,
        subject: sentEmails.subject,
        userId: sentEmails.userId,
      })
      .from(sentEmails)
      .where(eq(sentEmails.id, sentEmailId))
      .limit(1)
    
    if (!sentEmail[0]) {
      return { success: false, error: `Sent email ${sentEmailId} not found` }
    }
    
    const email = sentEmail[0]
    const toAddresses = email.to ? JSON.parse(email.to) : []
    
    const payload: EmailDeliveredPayload = {
      emailId: email.id,
      messageId: email.messageId || undefined,
      from: email.from,
      to: toAddresses,
      subject: email.subject || undefined,
      recipient,
      smtpResponse,
      processingTimeMs,
      timestamp: createEventTimestamp(),
    }
    
    const result = await sendMessage(
      email.userId,
      SVIX_EVENT_TYPES.EMAIL_DELIVERED,
      payload,
      `delivered-${email.id}-${recipient}` // Idempotency key
    )
    
    if (result) {
      return { success: true, messageId: result.messageId }
    }
    
    return { success: true, skipped: true, reason: 'No SVIX application for user' }
  } catch (error) {
    console.error(`[SVIX Dispatcher] Error dispatching email.delivered for ${sentEmailId}:`, error)
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }
  }
}

// ============================================================================
// Email Complaint Event
// ============================================================================

/**
 * Dispatch an email.complained event
 * Call this when a spam complaint is received
 */
export async function dispatchEmailComplaintEvent(
  sentEmailId: string,
  recipient: string,
  complaintType?: string,
  userAgent?: string
): Promise<DispatchResult> {
  if (!isSvixEnabled()) {
    return { success: true, skipped: true, reason: 'SVIX not configured' }
  }
  
  try {
    // Fetch the sent email details
    const sentEmail = await db
      .select({
        id: sentEmails.id,
        messageId: sentEmails.messageId,
        from: sentEmails.from,
        to: sentEmails.to,
        subject: sentEmails.subject,
        userId: sentEmails.userId,
      })
      .from(sentEmails)
      .where(eq(sentEmails.id, sentEmailId))
      .limit(1)
    
    if (!sentEmail[0]) {
      return { success: false, error: `Sent email ${sentEmailId} not found` }
    }
    
    const email = sentEmail[0]
    const toAddresses = email.to ? JSON.parse(email.to) : []
    
    const payload: EmailComplaintPayload = {
      emailId: email.id,
      messageId: email.messageId || undefined,
      from: email.from,
      to: toAddresses,
      subject: email.subject || undefined,
      recipient,
      complaintType,
      userAgent,
      timestamp: createEventTimestamp(),
    }
    
    const result = await sendMessage(
      email.userId,
      SVIX_EVENT_TYPES.EMAIL_COMPLAINED,
      payload,
      `complaint-${email.id}-${recipient}` // Idempotency key
    )
    
    if (result) {
      return { success: true, messageId: result.messageId }
    }
    
    return { success: true, skipped: true, reason: 'No SVIX application for user' }
  } catch (error) {
    console.error(`[SVIX Dispatcher] Error dispatching email.complained for ${sentEmailId}:`, error)
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get a human-readable reason for a bounce
 */
function getHumanReadableReason(bounceSubType: string | null, diagnosticCode: string | null): string {
  if (diagnosticCode) {
    // Clean up the diagnostic code for display
    return diagnosticCode.substring(0, 200)
  }
  
  // Map bounce sub-types to readable messages
  const reasonMap: Record<string, string> = {
    'invalid_domain': 'The recipient domain does not exist',
    'user_unknown': 'The recipient email address does not exist',
    'mailbox_disabled': 'The recipient mailbox is disabled',
    'mailbox_full': 'The recipient mailbox is full',
    'message_too_large': 'The message was too large for the recipient',
    'dns_failure': 'Unable to resolve the recipient domain',
    'delivery_timeout': 'Delivery timed out after multiple attempts',
    'connection_failed': 'Could not connect to the recipient mail server',
    'suppression_list': 'The recipient is on the suppression list',
    'policy_rejection': 'The email was rejected by the recipient server policy',
    'content_rejected': 'The email content was rejected',
    'general_failure': 'The email could not be delivered',
  }
  
  return reasonMap[bounceSubType || ''] || 'The email could not be delivered'
}

