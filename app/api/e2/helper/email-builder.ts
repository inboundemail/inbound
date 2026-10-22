/**
 * Enhanced email building utilities for v2 API
 * Supports multipart MIME with attachments
 * Maintains backward compatibility
 */

import { nanoid } from 'nanoid'
import { findUnsafeCustomHeader, isReservedHeaderName } from '@/app/api/e2/helper/header-safety'
import {
  extractDomain as extractMailboxDomain,
  formatMailbox,
  parseMailbox,
} from '@/lib/email-management/agent-email-helper'
import type { ProcessedAttachment } from './attachment-processor'

export interface EmailMessageParams {
  from: string
  to: string[]
  cc?: string[]
  bcc?: string[]
  replyTo?: string[]
  subject: string
  textBody?: string
  htmlBody?: string
  messageId?: string
  inReplyTo?: string
  references?: string[]
  date?: Date
  customHeaders?: Record<string, string>
  attachments?: ProcessedAttachment[]
}

/**
 * Extract domain from email address
 */
function extractDomain(email: string): string {
  return extractMailboxDomain(email) || 'localhost'
}

/**
 * Formats an address list header from strictly parsed mailboxes, so the
 * header shows exactly the addresses mail is delivered to.
 */
function formatAddressList(field: string, values: string[]): string {
  return values
    .map((value) => {
      const parsed = parseMailbox(value)
      if (!parsed.ok) throw new Error(`Invalid ${field} address: ${parsed.error}`)
      return formatMailbox(parsed.mailbox)
    })
    .join(', ')
}

function assertSafeHeaderText(field: string, value: string): void {
  if (/[\r\n\u0000]/.test(value)) {
    throw new Error(`${field} must not contain line breaks or control characters`)
  }
}

/**
 * Format date for email headers (RFC 2822)
 */
function formatEmailDate(date: Date): string {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  
  const day = days[date.getUTCDay()]
  const dayNum = date.getUTCDate()
  const month = months[date.getUTCMonth()]
  const year = date.getUTCFullYear()
  const hours = date.getUTCHours().toString().padStart(2, '0')
  const minutes = date.getUTCMinutes().toString().padStart(2, '0')
  const seconds = date.getUTCSeconds().toString().padStart(2, '0')
  
  return `${day}, ${dayNum} ${month} ${year} ${hours}:${minutes}:${seconds} +0000`
}

/**
 * Generate a safe boundary string for MIME multipart
 */
function generateBoundary(): string {
  return `----=_Part_${nanoid()}_${Date.now()}`
}

/**
 * Encode content for email transmission
 * Uses quoted-printable for text and base64 for attachments
 */
function encodeQuotedPrintable(text: string): string {
  // Simple quoted-printable encoding for basic text
  // For production, consider using a proper library
  return text
    .replace(/=/g, '=3D')
    .replace(/\r\n?|\n/g, '\r\n')
}

/**
 * Build raw email message with full MIME support including attachments
 */
export function buildRawEmailMessage(params: EmailMessageParams): string {
  const {
    from,
    to,
    cc,
    replyTo,
    subject,
    textBody,
    htmlBody,
    messageId,
    inReplyTo,
    references,
    date = new Date(),
    customHeaders,
    attachments = []
  } = params

  const hasText = !!textBody
  const hasHtml = !!htmlBody
  
  // Separate CID attachments from regular attachments
  const cidAttachments = attachments.filter(att => att.content_id)
  const regularAttachments = attachments.filter(att => !att.content_id)
  const hasCidAttachments = cidAttachments.length > 0
  const hasRegularAttachments = regularAttachments.length > 0
  
  // Generate boundaries
  const mixedBoundary = generateBoundary()
  const relatedBoundary = generateBoundary()
  const alternativeBoundary = generateBoundary()
  
  console.log(`📧 Email structure: CID=${hasCidAttachments}, Regular=${hasRegularAttachments}, Text=${hasText}, HTML=${hasHtml}`)
  
  assertSafeHeaderText('from', from)
  assertSafeHeaderText('subject', subject)
  for (const value of [messageId, inReplyTo, ...(references ?? [])]) {
    if (value) assertSafeHeaderText('Message reference', value)
  }

  const safeCustomHeaders: Array<[string, string]> = []
  for (const [key, value] of Object.entries(customHeaders ?? {})) {
    if (isReservedHeaderName(key)) {
      console.warn(`⚠️ Skipping reserved custom header: ${key}`)
      continue
    }
    const unsafe = findUnsafeCustomHeader(key, value)
    if (unsafe) throw new Error(unsafe)
    safeCustomHeaders.push([key, value])
  }

  // Ensure Message-ID has angle brackets and proper format
  let formattedMessageId = ''
  if (messageId) {
    // Check if messageId already contains @ (full format) or needs domain appended
    if (messageId.includes('@')) {
      // Already has domain, just ensure angle brackets
      formattedMessageId = messageId.startsWith('<') ? messageId : `<${messageId}>`
      formattedMessageId = formattedMessageId.endsWith('>') ? formattedMessageId : `${formattedMessageId}>`
    } else {
      // Need to append domain
      formattedMessageId = `<${messageId}@${extractDomain(from)}>`
    }
  }
  
  // Ensure In-Reply-To has angle brackets
  let formattedInReplyTo = ''
  if (inReplyTo) {
    formattedInReplyTo = inReplyTo.startsWith('<') ? inReplyTo : `<${inReplyTo}>`
    formattedInReplyTo = formattedInReplyTo.endsWith('>') ? formattedInReplyTo : `${formattedInReplyTo}>`
  }
  
  // Ensure each reference has angle brackets
  let formattedReferences: string[] = []
  if (references && references.length > 0) {
    formattedReferences = references.map(ref => {
      let formatted = ref.trim()
      if (!formatted.startsWith('<')) formatted = `<${formatted}`
      if (!formatted.endsWith('>')) formatted = `${formatted}>`
      return formatted
    })
  }
  
  // Build headers
  const headers = [
    `From: ${from}`,
    `To: ${to.length > 0 ? formatAddressList('to', to) : 'undisclosed-recipients:;'}`,
    cc && cc.length > 0 ? `Cc: ${formatAddressList('cc', cc)}` : null,
    replyTo && replyTo.length > 0 ? `Reply-To: ${formatAddressList('reply_to', replyTo)}` : null,
    `Subject: ${subject}`,
    formattedMessageId ? `Message-ID: ${formattedMessageId}` : null,
    formattedInReplyTo ? `In-Reply-To: ${formattedInReplyTo}` : null,
    formattedReferences.length > 0 ? `References: ${formattedReferences.join(' ')}` : null,
    `Date: ${formatEmailDate(date)}`,
    'MIME-Version: 1.0',
  ].filter((header): header is string => header !== null)
  
  for (const [key, value] of safeCustomHeaders) {
    headers.push(`${key}: ${value}`)
  }
  
  const messageParts: string[] = []
  
  // Determine the overall structure based on what we have
  if (hasRegularAttachments && hasCidAttachments) {
    // Mixed structure: multipart/mixed containing multipart/related and regular attachments
    headers.push(`Content-Type: multipart/mixed; boundary="${mixedBoundary}"`)
    messageParts.push(...headers, '', 'This is a multi-part message in MIME format.', '')
    
    // First part: multipart/related (content + CID attachments)
    messageParts.push(`--${mixedBoundary}`)
    messageParts.push(`Content-Type: multipart/related; boundary="${relatedBoundary}"`)
    messageParts.push('')
    
    // Add content and CID attachments in related part
    addContentAndCidAttachments(messageParts, relatedBoundary, alternativeBoundary, hasText, hasHtml, textBody, htmlBody, cidAttachments)
    
    // Add regular attachments
    for (const attachment of regularAttachments) {
      addRegularAttachment(messageParts, mixedBoundary, attachment)
    }
    
    messageParts.push(`--${mixedBoundary}--`)
    
  } else if (hasCidAttachments) {
    // Only CID attachments: use multipart/related
    headers.push(`Content-Type: multipart/related; boundary="${relatedBoundary}"`)
    messageParts.push(...headers, '', 'This is a multi-part message in MIME format.', '')
    
    addContentAndCidAttachments(messageParts, relatedBoundary, alternativeBoundary, hasText, hasHtml, textBody, htmlBody, cidAttachments)
    
  } else if (hasRegularAttachments) {
    // Only regular attachments: use multipart/mixed
    headers.push(`Content-Type: multipart/mixed; boundary="${mixedBoundary}"`)
    messageParts.push(...headers, '', 'This is a multi-part message in MIME format.', '')
    
    // Content part
    messageParts.push(`--${mixedBoundary}`)
    addContentPart(messageParts, alternativeBoundary, hasText, hasHtml, textBody, htmlBody)
    messageParts.push('')
    
    // Regular attachments
    for (const attachment of regularAttachments) {
      addRegularAttachment(messageParts, mixedBoundary, attachment)
    }
    
    messageParts.push(`--${mixedBoundary}--`)
    
  } else {
    // No attachments - simple content structure
    addContentPart(messageParts, alternativeBoundary, hasText, hasHtml, textBody, htmlBody, headers)
  }
  
  return messageParts.join('\r\n')
}

/**
 * Add content and CID attachments in a multipart/related structure
 */
function addContentAndCidAttachments(
  messageParts: string[], 
  relatedBoundary: string, 
  alternativeBoundary: string,
  hasText: boolean, 
  hasHtml: boolean, 
  textBody?: string, 
  htmlBody?: string, 
  cidAttachments: ProcessedAttachment[] = []
) {
  // Content part (first in related)
  messageParts.push(`--${relatedBoundary}`)
  addContentPart(messageParts, alternativeBoundary, hasText, hasHtml, textBody, htmlBody)
  messageParts.push('')
  
  // CID attachments
  for (const attachment of cidAttachments) {
    messageParts.push(`--${relatedBoundary}`)
    messageParts.push(`Content-Type: ${attachment.contentType}`)
    messageParts.push('Content-Transfer-Encoding: base64')
    messageParts.push(`Content-ID: <${attachment.content_id}>`)
    messageParts.push(`Content-Disposition: inline; filename="${attachment.filename}"`)
    console.log(`📎 Added CID attachment: <${attachment.content_id}> for ${attachment.filename}`)
    messageParts.push('')
    
    // Split base64 content into 76-character lines (RFC requirement)
    const base64Lines = attachment.content.match(/.{1,76}/g) || []
    messageParts.push(...base64Lines)
    messageParts.push('')
  }
  
  messageParts.push(`--${relatedBoundary}--`)
}

/**
 * Add a regular (non-CID) attachment
 */
function addRegularAttachment(messageParts: string[], boundary: string, attachment: ProcessedAttachment) {
  messageParts.push(`--${boundary}`)
  messageParts.push(`Content-Type: ${attachment.contentType}`)
  messageParts.push('Content-Transfer-Encoding: base64')
  messageParts.push(`Content-Disposition: attachment; filename="${attachment.filename}"`)
  messageParts.push('')
  
  // Split base64 content into 76-character lines (RFC requirement)
  const base64Lines = attachment.content.match(/.{1,76}/g) || []
  messageParts.push(...base64Lines)
  messageParts.push('')
}

/**
 * Add content part (text/html with proper multipart/alternative if needed)
 */
function addContentPart(
  messageParts: string[], 
  alternativeBoundary: string,
  hasText: boolean, 
  hasHtml: boolean, 
  textBody?: string, 
  htmlBody?: string,
  headers?: string[]
) {
  if (hasText && hasHtml) {
    // Multipart/alternative for text and HTML
    if (headers) {
      headers.push(`Content-Type: multipart/alternative; boundary="${alternativeBoundary}"`)
      messageParts.push(...headers, '', 'This is a multi-part message in MIME format.', '')
    } else {
      messageParts.push(`Content-Type: multipart/alternative; boundary="${alternativeBoundary}"`, '')
    }
    
    // Text part
    messageParts.push(`--${alternativeBoundary}`)
    messageParts.push('Content-Type: text/plain; charset=UTF-8')
    messageParts.push('Content-Transfer-Encoding: quoted-printable')
    messageParts.push('')
    messageParts.push(encodeQuotedPrintable(textBody || ''))
    messageParts.push('')
    
    // HTML part
    messageParts.push(`--${alternativeBoundary}`)
    messageParts.push('Content-Type: text/html; charset=UTF-8')
    messageParts.push('Content-Transfer-Encoding: quoted-printable')
    messageParts.push('')
    messageParts.push(encodeQuotedPrintable(htmlBody || ''))
    messageParts.push('')
    
    messageParts.push(`--${alternativeBoundary}--`)
    
  } else if (hasText) {
    // Text only
    if (headers) {
      headers.push('Content-Type: text/plain; charset=UTF-8')
      headers.push('Content-Transfer-Encoding: quoted-printable')
      messageParts.push(...headers, '')
    } else {
      messageParts.push('Content-Type: text/plain; charset=UTF-8')
      messageParts.push('Content-Transfer-Encoding: quoted-printable')
      messageParts.push('')
    }
    messageParts.push(encodeQuotedPrintable(textBody || ''))
    
  } else if (hasHtml) {
    // HTML only
    if (headers) {
      headers.push('Content-Type: text/html; charset=UTF-8')
      headers.push('Content-Transfer-Encoding: quoted-printable')
      messageParts.push(...headers, '')
    } else {
      messageParts.push('Content-Type: text/html; charset=UTF-8')
      messageParts.push('Content-Transfer-Encoding: quoted-printable')
      messageParts.push('')
    }
    messageParts.push(encodeQuotedPrintable(htmlBody || ''))
    
  } else {
    // No content
    if (headers) {
      headers.push('Content-Type: text/plain; charset=UTF-8')
      messageParts.push(...headers, '')
    } else {
      messageParts.push('Content-Type: text/plain; charset=UTF-8')
      messageParts.push('')
    }
    messageParts.push('[No content]')
  }
}

/**
 * Legacy function for backward compatibility
 * Simple email building without attachments
 */
export function buildSimpleEmailMessage(params: {
  from: string
  to: string[]
  cc?: string[]
  bcc?: string[]
  replyTo?: string[]
  subject: string
  textBody?: string
  htmlBody?: string
  headers?: Record<string, string>
}): string {
  return buildRawEmailMessage({
    ...params,
    date: new Date(),
    customHeaders: params.headers
  })
}
