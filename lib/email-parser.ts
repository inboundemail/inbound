import { simpleParser, ParsedMail, Attachment } from 'mailparser'

// Types for the parsed email data structure
interface ParsedEmailAddress {
  text: string
  addresses: Array<{
    name: string | null
    address: string | null
  }>
}

// Header value types for complex header structures
interface ParsedEmailHeaderValue {
  value?: Array<{
    address: string
    name: string
  }> | string
  html?: string
  text?: string
  params?: Record<string, string>
}

interface ParsedEmailListHeader {
  unsubscribe?: {
    url: string
  }
  'unsubscribe-post'?: {
    name: string
  }
}

interface ParsedEmailData {
  messageId: string | undefined
  date: Date | undefined
  subject: string | undefined
  from: ParsedEmailAddress | null
  to: ParsedEmailAddress | null
  cc: ParsedEmailAddress | null
  bcc: ParsedEmailAddress | null
  replyTo: ParsedEmailAddress | null
  inReplyTo: string | undefined
  references: string[] | undefined
  textBody: string | undefined
  htmlBody: string | undefined
  raw?: string
  attachments: Array<{
    filename: string | undefined
    contentType: string | undefined
    size: number | undefined
    contentId: string | undefined
    contentDisposition: string | undefined
  }>
  headers: Record<string, any> & {
    'return-path'?: ParsedEmailHeaderValue
    'received'?: string
    'received-spf'?: string
    'authentication-results'?: string
    'x-ses-receipt'?: string
    'x-ses-dkim-signature'?: string
    'dkim-signature'?: Array<{
      value: string
      params: Record<string, string>
    }> | ParsedEmailHeaderValue
    'list'?: ParsedEmailListHeader
    'x-entity-ref-id'?: string
    'from'?: ParsedEmailHeaderValue
    'to'?: ParsedEmailHeaderValue
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
  priority: string | false | undefined
}

export async function parseEmail(emailContent: string): Promise<ParsedEmailData> {
  try {
    // Parse the email
    const parsed = await simpleParser(emailContent);
    
    // Helper function to extract address info
    const extractAddressInfo = (addressObj: any): ParsedEmailAddress | null => {
      if (!addressObj) return null;
      
      if (Array.isArray(addressObj)) {
        return {
          text: addressObj.map(addr => addr.text || `${addr.name || ''} <${addr.address || ''}>`).join(', '),
          addresses: addressObj.map(addr => ({
            name: addr.name || null,
            address: addr.address || null
          }))
        };
      } else if (addressObj.value && Array.isArray(addressObj.value)) {
        // Handle AddressObject with value array
        return {
          text: addressObj.text,
          addresses: addressObj.value.map((addr: any) => ({
            name: addr.name || null,
            address: addr.address || null
          }))
        };
      } else if (addressObj.value) {
        // Handle AddressObject with single value
        return {
          text: addressObj.text,
          addresses: [{
            name: addressObj.value.name || null,
            address: addressObj.value.address || null
          }]
        };
      } else {
        // Handle direct address object
        return {
          text: addressObj.text || `${addressObj.name || ''} <${addressObj.address || ''}>`,
          addresses: [{
            name: addressObj.name || null,
            address: addressObj.address || null
          }]
        };
      }
    };
    
    // Extract key information
    const emailData: ParsedEmailData = {
      messageId: parsed.messageId,
      date: parsed.date,
      subject: parsed.subject,
      from: extractAddressInfo(parsed.from),
      to: extractAddressInfo(parsed.to),
      cc: extractAddressInfo(parsed.cc),
      bcc: extractAddressInfo(parsed.bcc),
      replyTo: extractAddressInfo(parsed.replyTo),
      inReplyTo: parsed.inReplyTo,
      references: Array.isArray(parsed.references) ? parsed.references : parsed.references ? [parsed.references] : undefined,
      textBody: parsed.text,
      htmlBody: parsed.html || undefined,
      raw: emailContent,
      attachments: parsed.attachments?.map(att => ({
        filename: att.filename,
        contentType: att.contentType,
        size: att.size,
        contentId: att.contentId,
        contentDisposition: att.contentDisposition
      })) || [],
      headers: Object.fromEntries(parsed.headers),
      priority: parsed.priority
    };
    
    // Return the full parsed data for programmatic use
    return emailData;
    
  } catch (error) {
    console.error('Error parsing email:', error);
    throw error;
  }
}

// Legacy interface for backward compatibility
interface ParsedEmail {
  headers: Record<string, string>
  htmlBody: string | null
  textBody: string | null
  attachments: Array<{
    filename: string
    contentType: string
    size: number
    contentId?: string
    isInline?: boolean
  }>
}

export async function parseEmailContent(rawEmail: string): Promise<ParsedEmail> {
  if (!rawEmail) {
    return {
      headers: {},
      htmlBody: null,
      textBody: null,
      attachments: []
    }
  }

  try {
    // Use mailparser to properly parse the email
    const parsed: ParsedMail = await simpleParser(rawEmail)
    
    // Extract headers
    const headers: Record<string, string> = {}
    if (parsed.headers) {
      // Convert headers to a simple key-value object
      for (const [key, value] of parsed.headers) {
        if (typeof value === 'string') {
          headers[key.toLowerCase()] = value
        } else if (Array.isArray(value)) {
          headers[key.toLowerCase()] = value.join(', ')
        } else if (value && typeof value === 'object' && 'value' in value) {
          headers[key.toLowerCase()] = String(value.value)
        } else {
          headers[key.toLowerCase()] = String(value)
        }
      }
    }

    // Extract text and HTML bodies
    const textBody = parsed.text || null
    let htmlBody = parsed.html || null

    // Process inline images if HTML body exists
    if (htmlBody && parsed.attachments) {
      htmlBody = processInlineImages(htmlBody, parsed.attachments)
    }

    // Extract attachments
    const attachments: Array<{ 
      filename: string; 
      contentType: string; 
      size: number;
      contentId?: string;
      isInline?: boolean;
    }> = []
    
    if (parsed.attachments && parsed.attachments.length > 0) {
      for (const attachment of parsed.attachments) {
        attachments.push({
          filename: attachment.filename || 'unknown',
          contentType: attachment.contentType || 'application/octet-stream',
          size: attachment.size || 0,
          contentId: attachment.contentId || undefined,
          isInline: attachment.contentDisposition === 'inline' || !!attachment.contentId
        })
      }
    }

    return {
      headers,
      htmlBody,
      textBody,
      attachments
    }
  } catch (error) {
    console.error('Error parsing email with mailparser:', error)
    
    // Fallback to basic parsing if mailparser fails
    return fallbackParseEmailContent(rawEmail)
  }
}

// Process inline images by converting Content-ID references to data URLs
function processInlineImages(html: string, attachments: Attachment[]): string {
  if (!html || !attachments) return html

  let processedHtml = html

  // Create a map of Content-ID to attachment data
  const cidMap = new Map<string, string>()
  
  for (const attachment of attachments) {
    if (attachment.contentId && attachment.content) {
      // Remove angle brackets from Content-ID if present
      const cleanCid = attachment.contentId.replace(/^<|>$/g, '')
      
      // Convert attachment content to base64 data URL
      const base64Data = attachment.content.toString('base64')
      const dataUrl = `data:${attachment.contentType || 'application/octet-stream'};base64,${base64Data}`
      
      cidMap.set(cleanCid, dataUrl)
    }
  }

  // Replace Content-ID references in HTML
  for (const [cid, dataUrl] of cidMap) {
    // Replace various formats of Content-ID references
    const patterns = [
      new RegExp(`src-cid=["']${cid}["']`, 'gi'),
      new RegExp(`src=["']cid:${cid}["']`, 'gi'),
      new RegExp(`src=["']${cid}["']`, 'gi'),
    ]

    for (const pattern of patterns) {
      processedHtml = processedHtml.replace(pattern, `src="${dataUrl}"`)
    }
  }

  return processedHtml
}

// Fallback parser for cases where mailparser fails
function fallbackParseEmailContent(rawEmail: string): ParsedEmail {
  const lines = rawEmail.split('\r\n')
  const headers: Record<string, string> = {}
  let bodyStartIndex = 0
  
  // Parse headers
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    
    // Empty line indicates end of headers
    if (line === '') {
      bodyStartIndex = i + 1
      break
    }
    
    // Handle header continuation (lines starting with whitespace)
    if (line.startsWith(' ') || line.startsWith('\t')) {
      const lastHeaderKey = Object.keys(headers).pop()
      if (lastHeaderKey) {
        headers[lastHeaderKey] += ' ' + line.trim()
      }
      continue
    }
    
    // Parse header line
    const colonIndex = line.indexOf(':')
    if (colonIndex > 0) {
      const key = line.substring(0, colonIndex).trim().toLowerCase()
      const value = line.substring(colonIndex + 1).trim()
      headers[key] = value
    }
  }
  
  // Get the body content
  const bodyContent = lines.slice(bodyStartIndex).join('\r\n')
  
  return {
    headers,
    htmlBody: bodyContent.includes('<html') ? bodyContent : null,
    textBody: !bodyContent.includes('<html') ? bodyContent : null,
    attachments: []
  }
}

export function sanitizeHtml(html: string): string {
  if (!html) return ''
  
  // Basic HTML sanitization - remove script tags and dangerous attributes
  // Allow data: URLs for images but be restrictive about other uses
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/on\w+="[^"]*"/gi, '')
    .replace(/on\w+='[^']*'/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/vbscript:/gi, '')
    // Only remove data: URLs that are NOT for images
    .replace(/(?<!src=["'])data:(?!image\/)/gi, '')
}

export function extractEmailDomain(email: string): string {
  const match = email.match(/@([^>]+)/)
  return match ? match[1] : ''
}

export function formatEmailAddress(email: string): { name: string; address: string } {
  // Handle formats like "Name <email@domain.com>" or just "email@domain.com"
  const match = email.match(/^(.+?)\s*<(.+?)>$/)
  if (match) {
    return {
      name: match[1].replace(/['"]/g, '').trim(),
      address: match[2].trim()
    }
  }
  
  return {
    name: '',
    address: email.trim()
  }
}

// Export the ParsedEmailData type for use in other files
export type { ParsedEmailData, ParsedEmailAddress, ParsedEmailHeaderValue, ParsedEmailListHeader } 