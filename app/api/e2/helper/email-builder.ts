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
 * Strip CR/LF (and other control chars) from a value destined for an email
 * header. This is the primary defense against email header / MIME injection
 * (CWE-93): every header field below is assembled by string interpolation and
 * the parts are joined with CRLF, so an embedded CR/LF in any value would
 * otherwise start an attacker-controlled header line or terminate the header
 * block. Folding whitespace is collapsed to a single space so the resulting
 * value stays a single logical header line.
 */
function sanitizeHeaderValue(value: string): string {
  // Replace CR/LF/tab with a single space, then drop any remaining C0/DEL
  // control characters. Regular spaces and printable content are preserved.
  return String(value).replace(/[\r\n\t]+/g, " ").replace(/[\x00-\x1F\x7F]/g, "").trim();
}

/**
 * Sanitize a custom header NAME. Header names may not contain CR/LF, spaces,
 * colons or other separators (RFC 5322 field-name = printable US-ASCII minus
 * ':'). Anything illegal is dropped.
 */
function sanitizeHeaderName(name: string): string {
  return String(name).replace(/[^A-Za-z0-9!#$%&'*+\-.^_`|~]/g, '')
}

/**
 * Sanitize an attachment filename for use inside a quoted parameter value
 * (filename="..."). Strips CR/LF and removes double quotes so the value cannot
 * break out of the quoted string and inject additional header lines.
 */
function sanitizeFilename(filename: string): string {
  return String(filename).replace(/[\r\n\t]+/g, ' ').replace(/"/g, '').trim()
}

/**
 * Sanitize a Content-ID value placed inside <...>. Strips CR/LF and angle
 * brackets so it cannot escape the Content-ID header.
 */
function sanitizeContentId(contentId: string): string {
  return String(contentId).replace(/[\x00-\x1F\x7F<>]+/g, '').trim()
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
  // RFC 2045 quoted-printable encoding.
  // Encodes any byte that is not a printable ASCII "safe" character (and the
  // '=' escape char) as =XX, preserves spaces/tabs except at end-of-line, and
  // enforces the 76-character soft line-length limit with "=\r\n" soft breaks.
  // This prevents the prior implementation's RFC 5321 998-octet line-length
  // violations and mislabelled raw 8-bit (UTF-8) bytes under a declared QP body.
  const bytes = Buffer.from(text, 'utf-8')
  const lines: string[] = []
  let line = ''

  const pushSoftBreak = () => {
    // RFC 2045: whitespace must not sit at the end of an encoded line. If the
    // line ends in a space/tab, carry it to the start of the next line (legal
    // there) instead of emitting "<space>=", which decoders may strip.
    let carry = ''
    if (line.endsWith(' ') || line.endsWith('\t')) {
      carry = line.slice(-1)
      line = line.slice(0, -1)
    }
    lines.push(`${line}=`)
    line = carry
  }

  const appendToken = (token: string) => {
    // Keep room for a trailing soft-break '=' within the 76-char limit
    if (line.length + token.length > 75) {
      pushSoftBreak()
    }
    line += token
  }

  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes[i]

    // Hard line break: normalize CR, LF and CRLF to a single CRLF
    if (byte === 0x0d || byte === 0x0a) {
      if (byte === 0x0d && bytes[i + 1] === 0x0a) i++ // consume LF of CRLF pair
      lines.push(line)
      line = ''
      continue
    }

    const isSpace = byte === 0x20 || byte === 0x09 // space or tab
    const isPrintable = byte >= 0x21 && byte <= 0x7e && byte !== 0x3d // '!'..'~' except '='

    if (isPrintable) {
      appendToken(String.fromCharCode(byte))
    } else if (isSpace) {
      // A space/tab is literal unless it is the last char before a line break,
      // in which case it must be encoded. Look ahead to decide.
      const next = bytes[i + 1]
      const atEndOfLine = next === undefined || next === 0x0d || next === 0x0a
      appendToken(atEndOfLine ? `=${byte.toString(16).toUpperCase().padStart(2, '0')}` : String.fromCharCode(byte))
    } else {
      appendToken(`=${byte.toString(16).toUpperCase().padStart(2, '0')}`)
    }
  }

  lines.push(line)
  return lines.join('\r\n')
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
  
  // Check if Message-ID is provided in custom headers
  const hasCustomMessageId = customHeaders && 
    Object.keys(customHeaders).some(key => key.toLowerCase() === 'message-id')
  
  // Ensure Message-ID has angle brackets and proper format
  let formattedMessageId = ''
  if (!hasCustomMessageId && messageId) {
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
  
  // Build headers. Every interpolated value is passed through
  // sanitizeHeaderValue to strip CR/LF/control characters, preventing email
  // header / MIME injection (CWE-93) - the parts below are joined with CRLF, so
  // an unsanitized newline in any field would inject attacker-controlled header
  // lines or terminate the header block.
  const headers = [
    `From: ${sanitizeHeaderValue(from)}`,
    `To: ${to.map(sanitizeHeaderValue).join(', ')}`,
    cc && cc.length > 0 ? `Cc: ${cc.map(sanitizeHeaderValue).join(', ')}` : null,
    replyTo && replyTo.length > 0 ? `Reply-To: ${replyTo.map(sanitizeHeaderValue).join(', ')}` : null,
    `Subject: ${sanitizeHeaderValue(subject)}`,
    // Only add Message-ID if not provided in custom headers
    formattedMessageId ? `Message-ID: ${sanitizeHeaderValue(formattedMessageId)}` : null,
    formattedInReplyTo ? `In-Reply-To: ${sanitizeHeaderValue(formattedInReplyTo)}` : null,
    formattedReferences.length > 0 ? `References: ${formattedReferences.map(sanitizeHeaderValue).join(' ')}` : null,
    `Date: ${formatEmailDate(date)}`,
    'MIME-Version: 1.0',
  ].filter((header): header is string => header !== null)

  // Add custom headers (name and value both sanitized; empty/invalid names skipped)
  if (customHeaders) {
    for (const [key, value] of Object.entries(customHeaders)) {
      const safeKey = sanitizeHeaderName(key)
      if (!safeKey) continue
      headers.push(`${safeKey}: ${sanitizeHeaderValue(value)}`)
    }
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
    messageParts.push(`Content-Type: ${sanitizeHeaderValue(attachment.contentType)}`)
    messageParts.push('Content-Transfer-Encoding: base64')
    messageParts.push(`Content-ID: <${sanitizeContentId(attachment.content_id || '')}>`)
    messageParts.push(`Content-Disposition: inline; filename="${sanitizeFilename(attachment.filename)}"`)
    console.log(`📎 Added CID attachment: <${sanitizeContentId(attachment.content_id || '')}> for ${sanitizeFilename(attachment.filename)}`)
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
  messageParts.push(`Content-Type: ${sanitizeHeaderValue(attachment.contentType)}`)
  messageParts.push('Content-Transfer-Encoding: base64')
  messageParts.push(`Content-Disposition: attachment; filename="${sanitizeFilename(attachment.filename)}"`)
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
