/**
 * Email Thread Parser Utilities
 * 
 * Utilities for parsing email content to separate new content from quoted content
 * in threaded conversations. This helps display clean email threads in the UI.
 * 
 * Enhanced to handle complex threading scenarios including:
 * - Gmail-style nested quotes
 * - Forwarded message chains
 * - Multiple attribution formats
 * - International quote prefixes
 */

export interface ParsedEmailContent {
  newContent: string
  quotedContent: string
  hasQuotedContent: boolean
  quoteLevels: number // How many levels of nesting detected
}

/**
 * Enhanced patterns for detecting quoted content start
 * Based on RFC 2822 and common email client practices
 */
const QUOTE_PATTERNS = [
  // Standard attribution lines
  /^On .+, .+ wrote:$/m, // "On Mon, 27 Jan 2025 10:30:00 +0000, John Doe wrote:"
  /^Am .+ schrieb .+:$/m, // German format
  /^Le .+ .+ a écrit :$/m, // French format
  /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}.*wrote:/m, // Date format variations
  /^\d{1,2}\/\d{1,2}\/\d{4} \d{1,2}:\d{2}.*wrote:/m, // US date format
  
  // Email header patterns
  /^From: .+$/m, // "From: sender@example.com"
  /^To: .+$/m, // "To: recipient@example.com"
  /^Subject: .+$/m, // "Subject: Re: Something"
  /^Date: .+$/m, // "Date: Mon, 27 Jan 2025"
  
  // Forwarded message patterns
  /^----- ?Original Message ?-----/m, // Outlook format
  /^----- ?Forwarded [Mm]essage ?-----/m, // Forward indicators
  /^Begin forwarded message:/m, // Apple Mail format
  /^---------- Forwarded message ----------/m, // Gmail format
  
  // Quote prefixes
  /^> /m, // Standard email quoting
  /^>\s*$/m, // Empty quoted line
  /^-----+/m, // Common divider lines
  /^_{3,}/m, // Underline dividers
  /^={3,}/m, // Equal sign dividers
  
  // Mobile client patterns
  /^Sent from my /m, // "Sent from my iPhone"
  /^Get Outlook for /m, // Outlook mobile
]

/**
 * Patterns that indicate attribution lines (who wrote what)
 */
const ATTRIBUTION_PATTERNS = [
  /On .+, .+ wrote:/,
  /Am .+ schrieb .+:/,
  /Le .+ .+ a écrit :/,
  /\d{4}-\d{2}-\d{2} \d{2}:\d{2}.*wrote:/,
  /\d{1,2}\/\d{1,2}\/\d{4} \d{1,2}:\d{2}.*wrote:/,
  /----- ?Original Message ?-----/,
  /----- ?Forwarded [Mm]essage ?-----/,
  /Begin forwarded message:/,
  /---------- Forwarded message ----------/,
]

/**
 * Parse text email content to separate new content from quoted content
 * Enhanced to handle complex nested threading
 */
export function parseTextEmailContent(content: string): ParsedEmailContent {
  if (!content || typeof content !== 'string') {
    return {
      newContent: '',
      quotedContent: '',
      hasQuotedContent: false,
      quoteLevels: 0
    }
  }

  const lines = content.split('\n')
  const newContentLines: string[] = []
  const quotedContentLines: string[] = []
  let foundQuoteStart = false
  let quoteLevels = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmedLine = line.trim()
    
    // Check if this line starts quoted content
    if (!foundQuoteStart) {
      // Check for attribution patterns
      const isAttributionLine = ATTRIBUTION_PATTERNS.some(pattern => pattern.test(line))
      
      // Check for quote prefixes
      const isQuoteLine = line.startsWith('>') || 
                         (trimmedLine === '' && lines[i + 1]?.startsWith('>'))
      
      // Check for other quote indicators
      const isQuoteIndicator = QUOTE_PATTERNS.some(pattern => pattern.test(line))
      
      if (isAttributionLine || isQuoteLine || isQuoteIndicator) {
        foundQuoteStart = true
        quotedContentLines.push(line)
        
        // Count quote levels
        if (line.startsWith('>')) {
          const quoteLevel = (line.match(/^>+/)?.[0]?.length || 0)
          quoteLevels = Math.max(quoteLevels, quoteLevel)
        }
      } else {
        newContentLines.push(line)
      }
    } else {
      quotedContentLines.push(line)
      
      // Update quote levels for nested content
      if (line.startsWith('>')) {
        const quoteLevel = (line.match(/^>+/)?.[0]?.length || 0)
        quoteLevels = Math.max(quoteLevels, quoteLevel)
      }
    }
  }

  // Clean up the content - remove trailing empty lines from new content
  while (newContentLines.length > 0 && newContentLines[newContentLines.length - 1].trim() === '') {
    newContentLines.pop()
  }

  const newContent = newContentLines.join('\n').trim()
  const quotedContent = quotedContentLines.join('\n').trim()

  return {
    newContent,
    quotedContent,
    hasQuotedContent: quotedContent.length > 0,
    quoteLevels
  }
}

/**
 * Parse HTML email content to separate new content from quoted content
 * Enhanced to handle Gmail and other modern email clients
 */
export function parseHtmlEmailContent(content: string): ParsedEmailContent {
  if (!content || typeof content !== 'string') {
    return {
      newContent: '',
      quotedContent: '',
      hasQuotedContent: false,
      quoteLevels: 0
    }
  }

  // Look for common HTML quote patterns
  const quotePatterns = [
    // Gmail style quotes
    /<div[^>]*class="[^"]*gmail_quote[^"]*"[^>]*>/i,
    /<blockquote[^>]*class="[^"]*gmail_quote[^"]*"[^>]*>/i,
    
    // General blockquote patterns
    /<blockquote[^>]*>/i,
    
    // Div with quote styling
    /<div[^>]*style="[^"]*border-left[^"]*"[^>]*>/i,
    /<div[^>]*style="[^"]*margin-left[^"]*"[^>]*>/i,
    
    // Outlook quote patterns
    /<div[^>]*style="[^"]*border-top[^"]*"[^>]*>/i,
    
    // Quote class patterns
    /<div[^>]*class="[^"]*quote[^"]*"[^>]*>/i,
    /<div[^>]*class="[^"]*moz-cite-prefix[^"]*"[^>]*>/i,
  ]

  // Also look for text-based attribution patterns in HTML
  const textPatterns = [
    /On .+, .+ wrote:/,
    /From: .+/,
    /----- ?Original Message ?-----/,
    /----- ?Forwarded [Mm]essage ?-----/,
    /Begin forwarded message:/,
    /---------- Forwarded message ----------/,
    /Sent from my /,
    /Get Outlook for /,
  ]

  // Find the earliest quote pattern
  let quoteStartIndex = -1
  let quoteLevels = 0
  
  // Check HTML patterns
  for (const pattern of quotePatterns) {
    const match = content.match(pattern)
    if (match && match.index !== undefined) {
      if (quoteStartIndex === -1 || match.index < quoteStartIndex) {
        quoteStartIndex = match.index
        quoteLevels = 1 // HTML quotes are typically one level
      }
    }
  }

  // Check text patterns as fallback
  for (const pattern of textPatterns) {
    const match = content.match(pattern)
    if (match && match.index !== undefined) {
      if (quoteStartIndex === -1 || match.index < quoteStartIndex) {
        quoteStartIndex = match.index
        quoteLevels = 1
      }
    }
  }

  // Check for nested blockquotes to determine levels
  if (quoteStartIndex !== -1) {
    const quotedPortion = content.substring(quoteStartIndex)
    const blockquoteMatches = quotedPortion.match(/<blockquote[^>]*>/gi)
    if (blockquoteMatches) {
      quoteLevels = Math.max(quoteLevels, blockquoteMatches.length)
    }
  }

  if (quoteStartIndex !== -1) {
    const newContent = content.substring(0, quoteStartIndex).trim()
    const quotedContent = content.substring(quoteStartIndex).trim()
    
    return {
      newContent,
      quotedContent,
      hasQuotedContent: quotedContent.length > 0,
      quoteLevels
    }
  }

  return {
    newContent: content.trim(),
    quotedContent: '',
    hasQuotedContent: false,
    quoteLevels: 0
  }
}

/**
 * Parse email content (auto-detects HTML vs text)
 * Enhanced with better detection and nesting support
 */
export function parseEmailContent(content: string): ParsedEmailContent {
  if (!content) {
    return {
      newContent: '',
      quotedContent: '',
      hasQuotedContent: false,
      quoteLevels: 0
    }
  }

  // More sophisticated HTML detection
  const hasHtmlTags = /<[^>]+>/g.test(content)
  const hasHtmlEntities = /&[a-zA-Z0-9#]+;/g.test(content)
  const isLikelyHtml = hasHtmlTags || hasHtmlEntities

  if (isLikelyHtml) {
    return parseHtmlEmailContent(content)
  } else {
    return parseTextEmailContent(content)
  }
}

/**
 * Extract just the new content from an email (strips quoted content)
 * Enhanced to handle complex threading
 */
export function extractNewContent(content: string): string {
  const parsed = parseEmailContent(content)
  return parsed.newContent
}

/**
 * Check if email content contains quoted content
 */
export function hasQuotedContent(content: string): boolean {
  const parsed = parseEmailContent(content)
  return parsed.hasQuotedContent
}

/**
 * Get the number of quote levels in the content
 */
export function getQuoteLevels(content: string): number {
  const parsed = parseEmailContent(content)
  return parsed.quoteLevels
}

/**
 * Split email content into individual messages based on attribution patterns
 * Useful for complex forwarded email chains
 */
export function splitIntoMessages(content: string): Array<{
  content: string
  attribution?: string
  isForwarded: boolean
}> {
  if (!content) return []

  const messages: Array<{
    content: string
    attribution?: string
    isForwarded: boolean
  }> = []

  const lines = content.split('\n')
  let currentMessage: string[] = []
  let currentAttribution: string | undefined

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    
    // Check if this line is an attribution line
    const isAttribution = ATTRIBUTION_PATTERNS.some(pattern => pattern.test(line))
    
    if (isAttribution && currentMessage.length > 0) {
      // Save the current message
      messages.push({
        content: currentMessage.join('\n').trim(),
        attribution: currentAttribution,
        isForwarded: /forward|fwd/i.test(currentAttribution || '')
      })
      
      // Start a new message
      currentMessage = []
      currentAttribution = line.trim()
    } else if (isAttribution) {
      currentAttribution = line.trim()
    } else {
      currentMessage.push(line)
    }
  }

  // Add the final message
  if (currentMessage.length > 0) {
    messages.push({
      content: currentMessage.join('\n').trim(),
      attribution: currentAttribution,
      isForwarded: /forward|fwd/i.test(currentAttribution || '')
    })
  }

  return messages.filter(msg => msg.content.length > 0)
} 