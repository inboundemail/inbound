/**
 * Utility functions for the Inbound Email SDK
 */

/**
 * Check if a string is a valid email address
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

/**
 * Build query string from parameters
 */
export function buildQueryString(params: Record<string, any>): string {
  const searchParams = new URLSearchParams()
  
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      searchParams.append(key, String(value))
    }
  })
  
  const queryString = searchParams.toString()
  return queryString ? `?${queryString}` : ''
}

/**
 * Inline Image Utilities
 */

/**
 * Get content type from file extension
 */
export function getContentTypeFromExtension(filename: string): string {
  const ext = filename.toLowerCase().split('.').pop()
  const contentTypes: Record<string, string> = {
    'png': 'image/png',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'gif': 'image/gif',
    'webp': 'image/webp',
    'svg': 'image/svg+xml',
    'bmp': 'image/bmp',
    'ico': 'image/x-icon',
    'tiff': 'image/tiff',
    'tif': 'image/tiff'
  }
  return contentTypes[ext || ''] || 'application/octet-stream'
}

/**
 * Validate contentId for inline images
 * ContentId should be less than 128 characters and contain valid characters
 */
export function validateContentId(contentId: string): boolean {
  if (!contentId || contentId.length === 0) {
    return false
  }
  
  if (contentId.length > 127) { // Less than 128 as per Resend docs
    return false
  }
  
  // ContentId should not contain special characters that might break email parsing
  // Allow alphanumeric, hyphens, underscores, and periods
  const validContentIdRegex = /^[a-zA-Z0-9._-]+$/
  return validContentIdRegex.test(contentId)
}

/**
 * Generate a unique contentId for inline images
 */
export function generateContentId(prefix?: string): string {
  const timestamp = Date.now()
  const random = Math.random().toString(36).substring(2, 8)
  const baseId = `${timestamp}-${random}`
  
  if (prefix) {
    return `${prefix}-${baseId}`
  }
  
  return baseId
}

/**
 * Check if a string is base64 encoded
 */
export function isBase64(str: string): boolean {
  if (!str || str.length === 0) {
    return false
  }
  
  try {
    // Check if string matches base64 pattern
    const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/
    if (!base64Regex.test(str)) {
      return false
    }
    
    // Additional check: base64 length should be multiple of 4
    return str.length % 4 === 0
  } catch {
    return false
  }
}

/**
 * Create an inline image attachment object from a remote URL
 */
export function createRemoteInlineImage(
  url: string,
  contentId: string,
  filename?: string,
  contentType?: string
): { path: string; filename: string; contentId: string; contentType?: string } {
  if (!validateContentId(contentId)) {
    throw new Error(`Invalid contentId: ${contentId}. Must be less than 128 characters and contain only alphanumeric characters, hyphens, underscores, and periods.`)
  }
  
  // Extract filename from URL if not provided
  const inferredFilename = filename || url.split('/').pop()?.split('?')[0] || 'image'
  
  // Infer content type from filename if not provided
  const inferredContentType = contentType || getContentTypeFromExtension(inferredFilename)
  
  return {
    path: url,
    filename: inferredFilename,
    contentId,
    ...(inferredContentType !== 'application/octet-stream' && { contentType: inferredContentType })
  }
}

/**
 * Create an inline image attachment object from base64 content
 */
export function createBase64InlineImage(
  base64Content: string,
  filename: string,
  contentId: string,
  contentType?: string
): { content: string; filename: string; contentId: string; contentType: string } {
  if (!validateContentId(contentId)) {
    throw new Error(`Invalid contentId: ${contentId}. Must be less than 128 characters and contain only alphanumeric characters, hyphens, underscores, and periods.`)
  }
  
  if (!isBase64(base64Content)) {
    throw new Error('Content must be valid base64 encoded data')
  }
  
  // Infer content type from filename if not provided
  const inferredContentType = contentType || getContentTypeFromExtension(filename)
  
  return {
    content: base64Content,
    filename,
    contentId,
    contentType: inferredContentType
  }
}

/**
 * Extract all contentIds referenced in HTML content
 * Finds all cid: references in img src attributes
 */
export function extractContentIdsFromHtml(html: string): string[] {
  const contentIds: string[] = []
  
  // Match img tags with cid: src attributes
  const cidRegex = /<img[^>]+src=["']cid:([^"']+)["'][^>]*>/gi
  let match
  
  while ((match = cidRegex.exec(html)) !== null) {
    const contentId = match[1]
    if (contentId && !contentIds.includes(contentId)) {
      contentIds.push(contentId)
    }
  }
  
  return contentIds
}

/**
 * Validate that all contentIds in HTML have corresponding attachments
 */
export function validateInlineImageReferences(
  html: string,
  attachments: Array<{ contentId?: string }> = []
): { isValid: boolean; missingContentIds: string[]; unusedContentIds: string[] } {
  const referencedContentIds = extractContentIdsFromHtml(html)
  const attachmentContentIds = attachments
    .filter(att => att.contentId)
    .map(att => att.contentId!)
  
  const missingContentIds = referencedContentIds.filter(
    id => !attachmentContentIds.includes(id)
  )
  
  const unusedContentIds = attachmentContentIds.filter(
    id => !referencedContentIds.includes(id)
  )
  
  return {
    isValid: missingContentIds.length === 0,
    missingContentIds,
    unusedContentIds
  }
} 