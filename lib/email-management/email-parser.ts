/**
 * Core email parsing utilities using mailparser for processing raw email content.
 * Provides the main parseEmail function for converting raw email strings into structured ParsedEmailData objects.
 * Used extensively throughout the application for webhook processing, email routing, and data storage.
 * Includes HTML sanitization and type definitions for consistent email data handling.
 */
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
    'received'?: string | string[]
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

export function sanitizeHtml(html: string): string {
  if (!html) return ''
  
  // Comprehensive HTML sanitization to prevent XSS attacks
  let sanitized = html
  
  // Remove all script tags and their content
  sanitized = sanitized.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
  
  // Remove all style tags and their content (can be used for CSS injection)
  sanitized = sanitized.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
  
  // Remove all event handlers (onclick, onload, etc.)
  sanitized = sanitized.replace(/\s*on\w+\s*=\s*["'][^"']*["']/gi, '')
  sanitized = sanitized.replace(/\s*on\w+\s*=\s*[^\s>]*/gi, '')
  
  // Remove javascript: protocol
  sanitized = sanitized.replace(/javascript\s*:/gi, '')
  
  // Remove vbscript: protocol
  sanitized = sanitized.replace(/vbscript\s*:/gi, '')
  
  // Remove data: URLs except for images
  sanitized = sanitized.replace(/(<(?!img)[^>]+\s+(?:src|href)\s*=\s*["']?)data:(?!image\/)/gi, '$1')
  
  // Remove form tags to prevent form injection
  sanitized = sanitized.replace(/<\/?form[^>]*>/gi, '')
  
  // Remove iframe, embed, and object tags
  sanitized = sanitized.replace(/<\/?(?:iframe|embed|object)[^>]*>/gi, '')
  
  // Remove meta tags
  sanitized = sanitized.replace(/<\/?meta[^>]*>/gi, '')
  
  // Remove link tags that could inject stylesheets
  sanitized = sanitized.replace(/<link[^>]*>/gi, '')
  
  // Clean up any remaining dangerous attributes
  sanitized = sanitized.replace(/\s*(?:xmlns|xml)[^=]*="[^"]*"/gi, '')
  
  // Remove any base tags that could hijack URLs
  sanitized = sanitized.replace(/<\/?base[^>]*>/gi, '')
  
  // Ensure no HTML comments with potential payloads
  sanitized = sanitized.replace(/<!--[\s\S]*?-->/g, '')
  
  return sanitized
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

/**
 * Extract a single email address from various address object formats (mailparser AddressObject)
 * Handles string, AddressObject, and array formats commonly returned by mailparser
 */
export function extractEmailAddress(addressObj: any): string {
  if (!addressObj) return 'unknown'
  if (typeof addressObj === 'string') return addressObj
  if (addressObj.text) return addressObj.text
  if (Array.isArray(addressObj) && addressObj.length > 0) {
    return addressObj[0].text || addressObj[0].address || 'unknown'
  }
  if (addressObj.address) return addressObj.address
  if (addressObj.name) return addressObj.name
  return 'unknown'
}

/**
 * Extract multiple email addresses from various address object formats (mailparser AddressObject)
 * Returns an array of email address strings
 */
export function extractEmailAddresses(addressObj: any): string[] {
  if (!addressObj) return []
  if (typeof addressObj === 'string') return [addressObj]
  if (Array.isArray(addressObj)) {
    return addressObj.map(addr => addr.text || addr.address || 'unknown')
  }
  if (addressObj.text) return [addressObj.text]
  if (addressObj.address) return [addressObj.address]
  return []
}

// Export the ParsedEmailData type for use in other files
export type { ParsedEmailData, ParsedEmailAddress, ParsedEmailHeaderValue, ParsedEmailListHeader } 