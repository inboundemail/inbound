import { simpleParser } from 'mailparser'

export interface ExtractedAttachment {
  filename: string | undefined
  contentType: string | undefined
  size: number | undefined
  contentId: string | undefined
  contentDisposition: string | undefined
  content: Buffer // The actual attachment content
}

/**
 * Extract attachment content from raw email
 * This function parses the full email to get the actual attachment content
 */
export async function extractAttachmentContent(
  rawEmailContent: string,
  targetFilename?: string
): Promise<ExtractedAttachment[]> {
  try {
    // Parse the full email to get attachment content
    const parsed = await simpleParser(rawEmailContent)
    
    if (!parsed.attachments || parsed.attachments.length === 0) {
      return []
    }
    
    const extractedAttachments: ExtractedAttachment[] = []
    
    for (const attachment of parsed.attachments) {
      // Filter by filename if specified
      if (targetFilename && attachment.filename !== targetFilename) {
        continue
      }
      
      // Extract attachment with content
      extractedAttachments.push({
        filename: attachment.filename,
        contentType: attachment.contentType,
        size: attachment.size,
        contentId: attachment.contentId,
        contentDisposition: attachment.contentDisposition,
        content: attachment.content || Buffer.alloc(0) // Actual file content
      })
    }
    
    return extractedAttachments
  } catch (error) {
    console.error('Error extracting attachment content:', error)
    throw error
  }
}

/**
 * Extract specific attachment by filename
 */
export async function extractAttachmentByFilename(
  rawEmailContent: string,
  filename: string
): Promise<ExtractedAttachment | null> {
  const attachments = await extractAttachmentContent(rawEmailContent, filename)
  return attachments.length > 0 ? attachments[0] : null
}

/**
 * Extract specific attachment by contentId
 */
export async function extractAttachmentByContentId(
  rawEmailContent: string,
  contentId: string
): Promise<ExtractedAttachment | null> {
  try {
    const parsed = await simpleParser(rawEmailContent)
    
    if (!parsed.attachments || parsed.attachments.length === 0) {
      return null
    }
    
    const attachment = parsed.attachments.find(att => 
      att.contentId === contentId || 
      att.contentId === `<${contentId}>` || // Handle angle brackets
      att.contentId === contentId.replace(/^<|>$/g, '') // Remove angle brackets
    )
    
    if (!attachment) {
      return null
    }
    
    return {
      filename: attachment.filename,
      contentType: attachment.contentType,
      size: attachment.size,
      contentId: attachment.contentId,
      contentDisposition: attachment.contentDisposition,
      content: attachment.content || Buffer.alloc(0)
    }
  } catch (error) {
    console.error('Error extracting attachment by contentId:', error)
    throw error
  }
}

/**
 * Save attachment to filesystem or return as base64
 */
export function attachmentToBase64(attachment: ExtractedAttachment): string {
  return attachment.content.toString('base64')
}

export function attachmentToDataUrl(attachment: ExtractedAttachment): string {
  const base64 = attachmentToBase64(attachment)
  const mimeType = attachment.contentType || 'application/octet-stream'
  return `data:${mimeType};base64,${base64}`
}