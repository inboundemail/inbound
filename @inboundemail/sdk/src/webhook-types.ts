/**
 * TypeScript types for Inbound Email webhook payloads
 * Use these types to add type safety to your webhook handlers
 */

// Base email address structure
export interface InboundEmailAddress {
  text: string
  addresses: Array<{
    name: string | null
    address: string | null
  }>
}

// Email attachment structure
export interface InboundEmailAttachment {
  filename: string | undefined
  contentType: string | undefined
  size: number | undefined
  contentId: string | undefined
  contentDisposition: string | undefined
}

// Email headers structure with common headers typed
export interface InboundEmailHeaders extends Record<string, any> {
  'return-path'?: {
    value?: Array<{ address: string; name: string }> | string
    html?: string
    text?: string
    params?: Record<string, string>
  }
  'received'?: string | string[]
  'received-spf'?: string
  'authentication-results'?: string
  'x-ses-receipt'?: string
  'x-ses-dkim-signature'?: string
  'dkim-signature'?: Array<{
    value: string
    params: Record<string, string>
  }> | {
    value?: Array<{ address: string; name: string }> | string
    html?: string
    text?: string
    params?: Record<string, string>
  }
  'list'?: {
    unsubscribe?: { url: string }
    'unsubscribe-post'?: { name: string }
  }
  'x-entity-ref-id'?: string
  'from'?: {
    value?: Array<{ address: string; name: string }> | string
    html?: string
    text?: string
    params?: Record<string, string>
  }
  'to'?: {
    value?: Array<{ address: string; name: string }> | string
    html?: string
    text?: string
    params?: Record<string, string>
  }
  'subject'?: string
  'message-id'?: string
  'date'?: string
  'mime-version'?: string
  'content-type'?: {
    value: string
    params: Record<string, string>
  }
  'feedback-id'?: string
  'x-ses-outgoing'?: string
}

// Complete parsed email data structure
export interface InboundParsedEmailData {
  messageId: string | undefined
  date: Date | undefined
  subject: string | undefined
  from: InboundEmailAddress | null
  to: InboundEmailAddress | null
  cc: InboundEmailAddress | null
  bcc: InboundEmailAddress | null
  replyTo: InboundEmailAddress | null
  inReplyTo: string | undefined
  references: string[] | undefined
  textBody: string | undefined
  htmlBody: string | undefined
  raw?: string
  attachments: InboundEmailAttachment[]
  headers: InboundEmailHeaders
  priority: string | false | undefined
}

// Email data structure in webhook
export interface InboundWebhookEmail {
  id: string // Structured email ID (compatible with v2 API reply endpoint)
  messageId: string | null
  from: InboundEmailAddress | null
  to: InboundEmailAddress | null
  recipient: string
  subject: string | null
  receivedAt: Date | string
  
  // Full parsed email data structure
  parsedData: InboundParsedEmailData
  
  // Cleaned content for backward compatibility
  cleanedContent: {
    html: string | null
    text: string | null
    hasHtml: boolean
    hasText: boolean
    attachments: InboundEmailAttachment[]
    headers: InboundEmailHeaders
  }
}

// Endpoint information in webhook
export interface InboundWebhookEndpoint {
  id: string
  name: string
  type: 'webhook' | 'email' | 'email_group'
}

// Main webhook payload structure
export interface InboundWebhookPayload {
  event: 'email.received'
  timestamp: string
  email: InboundWebhookEmail
  endpoint: InboundWebhookEndpoint
}

// Webhook headers that Inbound sends with each webhook request
export interface InboundWebhookHeaders {
  'content-type': 'application/json'
  'user-agent': 'InboundEmail-Webhook/1.0'
  'x-webhook-event': 'email.received'
  'x-endpoint-id': string
  'x-webhook-timestamp': string
  'x-email-id': string
  'x-message-id': string
  [key: string]: string // Allow for custom headers configured in endpoint
}

// Complete webhook request structure for server frameworks
export interface InboundWebhookRequest {
  method: 'POST'
  headers: InboundWebhookHeaders
  body: InboundWebhookPayload
}

// Type guard to check if a request is an Inbound webhook
export function isInboundWebhook(payload: any): payload is InboundWebhookPayload {
  return (
    payload &&
    typeof payload === 'object' &&
    payload.event === 'email.received' &&
    typeof payload.timestamp === 'string' &&
    payload.email &&
    typeof payload.email === 'object' &&
    typeof payload.email.id === 'string' &&
    payload.endpoint &&
    typeof payload.endpoint === 'object' &&
    typeof payload.endpoint.id === 'string'
  )
}

// Utility type for extracting just the email content
export type InboundEmailContent = Pick<InboundWebhookEmail, 'subject' | 'parsedData' | 'cleanedContent'>

// Utility type for extracting just attachment information
export type InboundAttachmentInfo = InboundEmailAttachment & {
  hasContent: boolean
  isImage: boolean
  isDocument: boolean
}

// Helper function to get attachment info with additional metadata
export function getAttachmentInfo(attachment: InboundEmailAttachment): InboundAttachmentInfo {
  const contentType = attachment.contentType?.toLowerCase() || ''
  
  return {
    ...attachment,
    hasContent: !!attachment.size && attachment.size > 0,
    isImage: contentType.startsWith('image/'),
    isDocument: contentType.includes('pdf') || 
                contentType.includes('document') || 
                contentType.includes('text/') ||
                contentType.includes('application/msword') ||
                contentType.includes('application/vnd.openxmlformats')
  }
}

// Helper function to extract plain text from email
export function getEmailText(email: InboundWebhookEmail): string {
  return email.cleanedContent.text || 
         email.parsedData.textBody || 
         (email.cleanedContent.html ? email.cleanedContent.html.replace(/<[^>]*>/g, '') : '') ||
         ''
}

// Helper function to extract HTML from email
export function getEmailHtml(email: InboundWebhookEmail): string {
  return email.cleanedContent.html || 
         email.parsedData.htmlBody || 
         (email.cleanedContent.text ? email.cleanedContent.text.replace(/\n/g, '<br>') : '') ||
         ''
}

// Helper function to get sender information
export function getSenderInfo(email: InboundWebhookEmail): { name: string | null; address: string | null } {
  const from = email.from || email.parsedData.from
  if (!from || !from.addresses || from.addresses.length === 0) {
    return { name: null, address: null }
  }
  
  const firstAddress = from.addresses[0]
  return {
    name: firstAddress.name,
    address: firstAddress.address
  }
}

// Helper function to get all recipient addresses
export function getRecipientAddresses(email: InboundWebhookEmail): string[] {
  const to = email.to || email.parsedData.to
  if (!to || !to.addresses) {
    return [email.recipient] // Fallback to the main recipient
  }
  
  return to.addresses
    .map(addr => addr.address)
    .filter((addr): addr is string => addr !== null)
}