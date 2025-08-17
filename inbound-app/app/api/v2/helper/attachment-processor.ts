/**
 * Attachment processing utilities for v2 API
 * Supports both remote file fetching and base64 content (Resend-compatible)
 * Maintains backward compatibility with existing attachment format
 */

export interface AttachmentInput {
  // Resend-compatible: either path OR content
  path?: string        // Remote file URL
  content?: string     // Base64 encoded content
  filename: string     // Required display name
  
  // Support both formats for backward compatibility
  contentType?: string   // camelCase (Resend-compatible)
  content_type?: string  // snake_case (legacy)
  
  // CID (Content-ID) for embedding images in HTML
  content_id?: string    // Content ID for embedding (e.g., "logo" for <img src="cid:logo">)
}

export interface ProcessedAttachment {
  content: string      // Always base64 after processing
  filename: string
  contentType: string
  size: number
  content_id?: string  // Content ID for CID embedding
}

// Configuration - Following industry standards and AWS SES limits
const MAX_ATTACHMENT_SIZE = 25 * 1024 * 1024 // 25MB per attachment (AWS SES limit)
const MAX_TOTAL_EMAIL_SIZE = 40 * 1024 * 1024 // 40MB total email size (industry standard)
const MAX_ATTACHMENTS_COUNT = 20              // Reasonable limit for number of attachments

// Comprehensive list of supported file types (excluding potentially dangerous ones)
const ALLOWED_CONTENT_TYPES = [
  // Documents
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.oasis.opendocument.text',
  'application/vnd.oasis.opendocument.spreadsheet',
  'application/vnd.oasis.opendocument.presentation',
  'application/rtf',
  
  // Images
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'image/bmp',
  'image/tiff',
  'image/ico',
  
  // Text and Data
  'text/plain',
  'text/csv',
  'text/html',
  'text/css',
  'text/javascript',
  'text/markdown',
  'application/json',
  'application/xml',
  'text/xml',
  'application/yaml',
  'text/yaml',
  
  // Archives (common ones)
  'application/zip',
  'application/x-zip-compressed',
  'application/gzip',
  'application/x-tar',
  'application/x-7z-compressed',
  
  // Audio/Video (common formats)
  'audio/mpeg',
  'audio/wav',
  'audio/ogg',
  'video/mp4',
  'video/mpeg',
  'video/quicktime',
  'video/webm',
  
  // Other safe formats
  'application/octet-stream' // Generic binary - will be allowed but flagged
]

// Explicitly blocked file types (security risks)
const BLOCKED_CONTENT_TYPES = [
  // Executable files
  'application/x-msdownload',
  'application/x-executable',
  'application/x-dosexec',
  'application/x-winexe',
  'application/x-msdos-program',
  
  // Scripts
  'application/x-sh',
  'application/x-csh',
  'application/x-perl',
  'application/x-python-code',
  'text/x-python',
  'application/x-ruby',
  
  // Potentially dangerous archives
  'application/x-rar-compressed',
  'application/vnd.rar',
  
  // System files
  'application/x-apple-diskimage',
  'application/x-iso9660-image',
  
  // Database files (often large and not email-appropriate)
  'application/x-sqlite3',
  'application/vnd.ms-access'
]

// File extensions that should be blocked regardless of MIME type
const BLOCKED_EXTENSIONS = [
  '.exe', '.bat', '.cmd', '.com', '.pif', '.scr', '.vbs', '.js', '.jar',
  '.app', '.deb', '.pkg', '.rpm', '.dmg', '.iso', '.msi', '.dll', '.so',
  '.sh', '.bash', '.csh', '.fish', '.ps1', '.psm1', '.psd1'
]

/**
 * Fetch a file from a remote URL and convert to base64
 */
async function fetchRemoteFile(url: string): Promise<{ content: string; contentType: string; size: number }> {
  console.log('📥 Fetching remote file:', url)
  
  try {
    // Validate URL format
    const parsedUrl = new URL(url)
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      throw new Error('Only HTTP and HTTPS URLs are supported')
    }
    
    // Fetch with timeout and size limits
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 30000) // 30 second timeout
    
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'InboundEmail-AttachmentFetcher/1.0'
      }
    })
    
    clearTimeout(timeoutId)
    
    if (!response.ok) {
      throw new Error(`Failed to fetch file: ${response.status} ${response.statusText}`)
    }
    
    // Check content length
    const contentLength = response.headers.get('content-length')
    if (contentLength && parseInt(contentLength) > MAX_ATTACHMENT_SIZE) {
      throw new Error(`File too large: ${contentLength} bytes (max: ${MAX_ATTACHMENT_SIZE} bytes)`)
    }
    
    // Get content type
    const contentType = response.headers.get('content-type') || 'application/octet-stream'
    
    // Read response as array buffer
    const arrayBuffer = await response.arrayBuffer()
    
    // Check actual size
    if (arrayBuffer.byteLength > MAX_ATTACHMENT_SIZE) {
      throw new Error(`File too large: ${arrayBuffer.byteLength} bytes (max: ${MAX_ATTACHMENT_SIZE} bytes)`)
    }
    
    // Convert to base64
    const buffer = Buffer.from(arrayBuffer)
    const content = buffer.toString('base64')
    
    console.log('✅ Remote file fetched successfully:', {
      size: arrayBuffer.byteLength,
      contentType,
      base64Length: content.length
    })
    
    return {
      content,
      contentType,
      size: arrayBuffer.byteLength
    }
    
  } catch (error) {
    console.error('❌ Failed to fetch remote file:', error)
    if (error instanceof Error) {
      throw new Error(`Failed to fetch remote file: ${error.message}`)
    }
    throw new Error('Failed to fetch remote file: Unknown error')
  }
}

/**
 * Validate and process base64 content
 */
function processBase64Content(content: string, declaredContentType?: string): { content: string; contentType: string; size: number } {
  console.log('🔍 Processing base64 content')
  
  try {
    // Remove data URL prefix if present (e.g., "data:image/png;base64,")
    const base64Content = content.replace(/^data:[^;]+;base64,/, '')
    
    // Validate base64 format
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(base64Content)) {
      throw new Error('Invalid base64 format')
    }
    
    // Calculate size
    const buffer = Buffer.from(base64Content, 'base64')
    const size = buffer.byteLength
    
    if (size > MAX_ATTACHMENT_SIZE) {
      throw new Error(`File too large: ${size} bytes (max: ${MAX_ATTACHMENT_SIZE} bytes)`)
    }
    
    // Determine content type
    let contentType = declaredContentType || 'application/octet-stream'
    
    // Try to detect content type from base64 content if not provided
    if (!declaredContentType || declaredContentType === 'application/octet-stream') {
      const detectedType = detectContentTypeFromBase64(base64Content)
      if (detectedType) {
        contentType = detectedType
      }
    }
    
    console.log('✅ Base64 content processed:', {
      size,
      contentType,
      originalLength: content.length,
      cleanedLength: base64Content.length
    })
    
    return {
      content: base64Content,
      contentType,
      size
    }
    
  } catch (error) {
    console.error('❌ Failed to process base64 content:', error)
    if (error instanceof Error) {
      throw new Error(`Invalid base64 content: ${error.message}`)
    }
    throw new Error('Invalid base64 content')
  }
}

/**
 * Detect content type from base64 content using magic bytes
 */
function detectContentTypeFromBase64(base64: string): string | null {
  try {
    // Get first few bytes to check magic numbers
    const buffer = Buffer.from(base64.substring(0, 32), 'base64')
    const bytes = Array.from(buffer)
    
    // PDF
    if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
      return 'application/pdf'
    }
    
    // PNG
    if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) {
      return 'image/png'
    }
    
    // JPEG
    if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) {
      return 'image/jpeg'
    }
    
    // GIF
    if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
      return 'image/gif'
    }
    
    // ZIP
    if (bytes[0] === 0x50 && bytes[1] === 0x4B) {
      return 'application/zip'
    }
    
    return null
  } catch (error) {
    return null
  }
}

/**
 * Validate content type and filename against security policies
 */
function validateFileType(contentType: string, filename: string): { 
  valid: boolean; 
  reason?: string; 
  warning?: string 
} {
  const normalizedType = contentType.toLowerCase().split(';')[0].trim()
  const fileExtension = filename.toLowerCase().match(/\.[^.]*$/)?.[0] || ''
  
  // Check for explicitly blocked content types
  if (BLOCKED_CONTENT_TYPES.includes(normalizedType)) {
    return {
      valid: false,
      reason: `File type '${normalizedType}' is not allowed for security reasons`
    }
  }
  
  // Check for blocked file extensions
  if (BLOCKED_EXTENSIONS.includes(fileExtension)) {
    return {
      valid: false,
      reason: `File extension '${fileExtension}' is not allowed for security reasons`
    }
  }
  
  // Check against allowed content types
  if (!ALLOWED_CONTENT_TYPES.includes(normalizedType)) {
    return {
      valid: false,
      reason: `File type '${normalizedType}' is not supported. Please use a common document, image, text, or archive format.`
    }
  }
  
  // Special warning for generic binary files
  if (normalizedType === 'application/octet-stream') {
    return {
      valid: true,
      warning: `Generic binary file detected. Consider specifying a more specific content type.`
    }
  }
  
  return { valid: true }
}

/**
 * Validate content_id parameters for CID embedding
 */
function validateContentIds(attachments: AttachmentInput[]): void {
  const contentIds = new Set<string>()
  
  for (let i = 0; i < attachments.length; i++) {
    const attachment = attachments[i]
    
    if (attachment.content_id) {
      // Check length limit (Resend spec: max 128 characters)
      if (attachment.content_id.length > 128) {
        throw new Error(`Attachment ${i + 1}: content_id must be less than 128 characters (current: ${attachment.content_id.length})`)
      }
      
      // Check for duplicates
      if (contentIds.has(attachment.content_id)) {
        throw new Error(`Duplicate content_id "${attachment.content_id}" found in attachments. Each content_id must be unique.`)
      }
      
      contentIds.add(attachment.content_id)
      
      console.log(`📎 Content ID validated: "${attachment.content_id}" for ${attachment.filename}`)
    }
  }
}

/**
 * Process all attachments in a request
 * Supports both remote URLs (path) and base64 content
 * Maintains backward compatibility
 */
export async function processAttachments(attachments: AttachmentInput[]): Promise<ProcessedAttachment[]> {
  console.log('📎 Processing attachments:', attachments.length)
  
  if (!attachments || attachments.length === 0) {
    return []
  }
  
  // Check attachment count limit
  if (attachments.length > MAX_ATTACHMENTS_COUNT) {
    throw new Error(`Too many attachments: ${attachments.length} (max: ${MAX_ATTACHMENTS_COUNT})`)
  }
  
  // Validate content_id parameters for CID embedding
  validateContentIds(attachments)
  
  const processed: ProcessedAttachment[] = []
  let totalSize = 0
  
  for (let i = 0; i < attachments.length; i++) {
    const attachment = attachments[i]
    console.log(`📎 Processing attachment ${i + 1}/${attachments.length}:`, attachment.filename)
    
    // Validate required fields
    if (!attachment.filename) {
      throw new Error(`Attachment ${i + 1}: filename is required`)
    }
    
    // Must have either path or content
    if (!attachment.path && !attachment.content) {
      throw new Error(`Attachment ${i + 1}: either 'path' (remote URL) or 'content' (base64) is required`)
    }
    
    // Cannot have both path and content
    if (attachment.path && attachment.content) {
      throw new Error(`Attachment ${i + 1}: cannot specify both 'path' and 'content' - use one or the other`)
    }
    
    let processedContent: { content: string; contentType: string; size: number }
    
    // Determine content type (support both formats for backward compatibility)
    const declaredContentType = attachment.contentType || attachment.content_type
    
    if (attachment.path) {
      // Remote file
      processedContent = await fetchRemoteFile(attachment.path)
    } else if (attachment.content) {
      // Base64 content
      processedContent = processBase64Content(attachment.content, declaredContentType)
    } else {
      throw new Error(`Attachment ${i + 1}: no content provided`)
    }
    
    // Validate file type and security
    const fileValidation = validateFileType(processedContent.contentType, attachment.filename)
    if (!fileValidation.valid) {
      console.log('❌ File type validation failed:', fileValidation.reason)
      throw new Error(`Attachment ${i + 1}: ${fileValidation.reason}`)
    }
    
    if (fileValidation.warning) {
      console.log('⚠️ File type warning:', fileValidation.warning)
    }
    
    // Check total email size limit (40MB including all content)
    totalSize += processedContent.size
    if (totalSize > MAX_TOTAL_EMAIL_SIZE) {
      const totalSizeMB = Math.round(totalSize / (1024 * 1024) * 100) / 100
      const maxSizeMB = Math.round(MAX_TOTAL_EMAIL_SIZE / (1024 * 1024))
      throw new Error(`Total email size too large: ${totalSizeMB}MB (max: ${maxSizeMB}MB including all attachments)`)
    }
    
    processed.push({
      content: processedContent.content,
      filename: attachment.filename,
      contentType: processedContent.contentType,
      size: processedContent.size,
      content_id: attachment.content_id
    })
    
    console.log(`✅ Attachment ${i + 1} processed:`, {
      filename: attachment.filename,
      contentType: processedContent.contentType,
      size: processedContent.size
    })
  }
  
  console.log('✅ All attachments processed successfully:', {
    count: processed.length,
    totalSize
  })
  
  return processed
}

/**
 * Convert processed attachments back to storage format (backward compatible)
 */
export function attachmentsToStorageFormat(attachments: ProcessedAttachment[]): Array<{
  content: string
  filename: string
  content_type: string
  size?: number
}> {
  return attachments.map(att => ({
    content: att.content,
    filename: att.filename,
    content_type: att.contentType,
    size: att.size
  }))
}
