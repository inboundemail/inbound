import { simpleParser, ParsedMail, Attachment } from 'mailparser'

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