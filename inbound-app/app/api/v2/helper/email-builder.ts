/**
 * Enhanced email building utilities for v2 API
 * Supports multipart MIME with attachments
 * Maintains backward compatibility
 */

import { nanoid } from 'nanoid'
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
  const match = email.match(/@([^>]+)/)
  return match ? match[1] : 'localhost'
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
    .replace(/\r\n/g, '\n')
    .replace(/\n/g, '\r\n')
}

/**
 * Build raw email message with full MIME support including attachments
 */
export function buildRawEmailMessage(params: EmailMessageParams): string {
  const {
    from,
    to,
    cc,
    bcc,
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
  const hasAttachments = attachments.length > 0
  
  // Generate boundaries
  const mixedBoundary = generateBoundary()
  const alternativeBoundary = generateBoundary()
  
  // Check if Message-ID is provided in custom headers
  const hasCustomMessageId = customHeaders && 
    Object.keys(customHeaders).some(key => key.toLowerCase() === 'message-id')
  
  // Build headers
  const headers = [
    `From: ${from}`,
    `To: ${to.join(', ')}`,
    cc && cc.length > 0 ? `Cc: ${cc.join(', ')}` : null,
    replyTo && replyTo.length > 0 ? `Reply-To: ${replyTo.join(', ')}` : null,
    `Subject: ${subject}`,
    // Only add Message-ID if not provided in custom headers
    !hasCustomMessageId && messageId ? `Message-ID: <${messageId}@${extractDomain(from)}>` : null,
    inReplyTo ? `In-Reply-To: ${inReplyTo}` : null,
    references && references.length > 0 ? `References: ${references.join(' ')}` : null,
    `Date: ${formatEmailDate(date)}`,
    'MIME-Version: 1.0',
  ].filter((header): header is string => header !== null)
  
  // Add custom headers
  if (customHeaders) {
    for (const [key, value] of Object.entries(customHeaders)) {
      headers.push(`${key}: ${value}`)
    }
  }
  
  const messageParts: string[] = []
  
  if (hasAttachments) {
    // Multipart/mixed for attachments
    headers.push(`Content-Type: multipart/mixed; boundary="${mixedBoundary}"`)
    messageParts.push(...headers, '', 'This is a multi-part message in MIME format.', '')
    
    // Content part (either simple or alternative)
    messageParts.push(`--${mixedBoundary}`)
    
    if (hasText && hasHtml) {
      // Multipart/alternative for text and HTML
      messageParts.push(`Content-Type: multipart/alternative; boundary="${alternativeBoundary}"`, '')
      
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
      messageParts.push('Content-Type: text/plain; charset=UTF-8')
      messageParts.push('Content-Transfer-Encoding: quoted-printable')
      messageParts.push('')
      messageParts.push(encodeQuotedPrintable(textBody || ''))
      
    } else if (hasHtml) {
      // HTML only
      messageParts.push('Content-Type: text/html; charset=UTF-8')
      messageParts.push('Content-Transfer-Encoding: quoted-printable')
      messageParts.push('')
      messageParts.push(encodeQuotedPrintable(htmlBody || ''))
    }
    
    messageParts.push('')
    
    // Add attachments
    for (const attachment of attachments) {
      messageParts.push(`--${mixedBoundary}`)
      messageParts.push(`Content-Type: ${attachment.contentType}`)
      messageParts.push('Content-Transfer-Encoding: base64')
      messageParts.push(`Content-Disposition: attachment; filename="${attachment.filename}"`)
      messageParts.push('')
      
      // Split base64 content into 76-character lines (RFC requirement)
      const base64Lines = attachment.content.match(/.{1,76}/g) || []
      messageParts.push(...base64Lines)
      messageParts.push('')
    }
    
    messageParts.push(`--${mixedBoundary}--`)
    
  } else {
    // No attachments - simpler structure
    if (hasText && hasHtml) {
      // Multipart/alternative
      headers.push(`Content-Type: multipart/alternative; boundary="${alternativeBoundary}"`)
      messageParts.push(...headers, '', 'This is a multi-part message in MIME format.', '')
      
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
      headers.push('Content-Type: text/plain; charset=UTF-8')
      headers.push('Content-Transfer-Encoding: quoted-printable')
      messageParts.push(...headers, '')
      messageParts.push(encodeQuotedPrintable(textBody || ''))
      
    } else if (hasHtml) {
      // HTML only
      headers.push('Content-Type: text/html; charset=UTF-8')
      headers.push('Content-Transfer-Encoding: quoted-printable')
      messageParts.push(...headers, '')
      messageParts.push(encodeQuotedPrintable(htmlBody || ''))
      
    } else {
      // No content
      headers.push('Content-Type: text/plain; charset=UTF-8')
      messageParts.push(...headers, '')
      messageParts.push('[No content]')
    }
  }
  
  return messageParts.join('\r\n')
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
