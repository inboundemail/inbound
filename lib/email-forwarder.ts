import { SESClient, SendRawEmailCommand } from '@aws-sdk/client-ses'
import type { ParsedEmailData } from './email-parser'
import { generateEmailBannerHTML } from '@/components/email-banner'

export class EmailForwarder {
  private sesClient: SESClient

  constructor() {
    this.sesClient = new SESClient({ 
      region: process.env.AWS_REGION || 'us-east-2' 
    })
  }

  async forwardEmail(
    originalEmail: ParsedEmailData,
    fromAddress: string,
    toAddresses: string[],
    options?: {
      subjectPrefix?: string
      includeAttachments?: boolean
      recipientEmail?: string // The original recipient email (e.g., user@domain.com)
    }
  ): Promise<void> {
    console.log(`📨 EmailForwarder - Forwarding email from ${fromAddress} to ${toAddresses.length} recipients`)

    // Build email subject with optional prefix
    const subject = options?.subjectPrefix 
      ? `${options.subjectPrefix}${originalEmail.subject || 'No Subject'}`
      : originalEmail.subject || 'No Subject'

    // Create raw email message maintaining original structure
    const rawMessage = await this.buildRawEmailMessage({
      from: fromAddress,
      to: toAddresses,
      replyTo: originalEmail.from?.addresses?.[0]?.address || fromAddress,
      subject,
      originalEmail,
      includeAttachments: options?.includeAttachments ?? true,
      recipientEmail: options?.recipientEmail
    })

    console.log(`📤 EmailForwarder - Sending email message (${rawMessage.length} bytes) with ${originalEmail.htmlBody ? 'HTML' : 'text'} content and ${originalEmail.attachments?.length || 0} attachments`)

    const command = new SendRawEmailCommand({
      RawMessage: {
        Data: Buffer.from(rawMessage)
      },
      Source: fromAddress,
      Destinations: toAddresses
    })

    try {
      const result = await this.sesClient.send(command)
      console.log(`✅ EmailForwarder - Successfully forwarded email to ${toAddresses.length} recipients`, {
        messageId: result.MessageId,
        toAddresses,
        attachmentCount: originalEmail.attachments?.length || 0
      })
    } catch (error) {
      console.error(`❌ EmailForwarder - Failed to forward email:`, error)
      throw new Error(`Email forwarding failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  private async buildRawEmailMessage(params: {
    from: string
    to: string[]
    replyTo: string
    subject: string
    originalEmail: ParsedEmailData
    includeAttachments: boolean
    recipientEmail?: string
  }): Promise<string> {
    // Generate a boundary for multipart messages
    const boundary = `----=_NextPart_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    
    // Build RFC 2822 compliant email headers
    const headers = [
      `From: ${params.from}`,
      `To: ${params.to.join(', ')}`,
      `Reply-To: ${params.replyTo}`,
      `Subject: ${this.encodeSubject(params.subject)}`,
      `Date: ${new Date().toUTCString()}`,
      `MIME-Version: 1.0`,
    ]

    // Add original message headers for threading (if available)
    if (params.originalEmail.messageId) {
      headers.push(`In-Reply-To: ${params.originalEmail.messageId}`)
    }
    if (params.originalEmail.references?.length) {
      headers.push(`References: ${params.originalEmail.references.join(' ')}`)
    }

    // Check if we need multipart (attachments or both HTML and text)
    const hasAttachments = params.includeAttachments && params.originalEmail.attachments && params.originalEmail.attachments.length > 0
    const hasHtml = !!params.originalEmail.htmlBody
    const hasText = !!params.originalEmail.textBody
    const needsMultipart = hasAttachments || (hasHtml && hasText)

    if (!needsMultipart) {
      // Simple single-part message
      if (hasHtml) {
        headers.push('Content-Type: text/html; charset=UTF-8')
        headers.push('Content-Transfer-Encoding: 8bit')
        const htmlWithBanner = this.addBannerToHtml(params.originalEmail.htmlBody || '', params)
        return [...headers, '', htmlWithBanner].join('\r\n')
      } else if (hasText) {
        headers.push('Content-Type: text/plain; charset=UTF-8')
        headers.push('Content-Transfer-Encoding: 8bit')
        const textWithBanner = this.addBannerToText(params.originalEmail.textBody || '', params)
        return [...headers, '', textWithBanner].join('\r\n')
      } else {
        headers.push('Content-Type: text/plain; charset=UTF-8')
        headers.push('Content-Transfer-Encoding: 8bit')
        return [...headers, '', '[This email has no content]'].join('\r\n')
      }
    }

    // Multipart message
    headers.push(`Content-Type: multipart/mixed; boundary="${boundary}"`)

    const messageParts = [
      ...headers,
      '',
      'This is a multi-part message in MIME format.',
      ''
    ]

    // Add text/HTML content part(s)
    if (hasHtml && hasText) {
      // Both HTML and text - create multipart/alternative for the body
      const altBoundary = `----=_NextPart_Alt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      
      messageParts.push(
        `--${boundary}`,
        `Content-Type: multipart/alternative; boundary="${altBoundary}"`,
        '',
        `--${altBoundary}`,
        'Content-Type: text/plain; charset=UTF-8',
        'Content-Transfer-Encoding: 8bit',
        '',
        this.addBannerToText(params.originalEmail.textBody || '', params),
        '',
        `--${altBoundary}`,
        'Content-Type: text/html; charset=UTF-8',
        'Content-Transfer-Encoding: 8bit',
        '',
        this.addBannerToHtml(params.originalEmail.htmlBody || '', params),
        '',
        `--${altBoundary}--`,
        ''
      )
    } else if (hasHtml) {
      messageParts.push(
        `--${boundary}`,
        'Content-Type: text/html; charset=UTF-8',
        'Content-Transfer-Encoding: 8bit',
        '',
        this.addBannerToHtml(params.originalEmail.htmlBody || '', params),
        ''
      )
    } else if (hasText) {
      messageParts.push(
        `--${boundary}`,
        'Content-Type: text/plain; charset=UTF-8',
        'Content-Transfer-Encoding: 8bit',
        '',
        this.addBannerToText(params.originalEmail.textBody || '', params),
        ''
      )
    } else {
      messageParts.push(
        `--${boundary}`,
        'Content-Type: text/plain; charset=UTF-8',
        'Content-Transfer-Encoding: 8bit',
        '',
        '[This email has no content]',
        ''
      )
    }

    // Add attachments if requested
    if (hasAttachments) {
      console.log(`📎 EmailForwarder - Including ${params.originalEmail.attachments!.length} attachments in forwarded email`)
      
      for (const attachment of params.originalEmail.attachments!) {
        if (!attachment.filename) {
          console.warn(`⚠️ EmailForwarder - Skipping attachment without filename`)
          continue
        }

        // Get attachment content from the structured email data
        const attachmentContent = await this.getAttachmentContent(params.originalEmail, attachment.filename)
        
        if (!attachmentContent) {
          console.warn(`⚠️ EmailForwarder - Could not retrieve content for attachment: ${attachment.filename}`)
          continue
        }

        messageParts.push(
          `--${boundary}`,
          `Content-Type: ${attachment.contentType || 'application/octet-stream'}`,
          `Content-Transfer-Encoding: base64`,
          `Content-Disposition: attachment; filename="${this.encodeFilename(attachment.filename)}"`,
          ''
        )

        // Split base64 content into 76-character lines (RFC 2045)
        const base64Content = Buffer.from(attachmentContent).toString('base64')
        const lines = base64Content.match(/.{1,76}/g) || []
        messageParts.push(...lines, '')
      }
    }

    // Close the multipart message
    messageParts.push(`--${boundary}--`)

    return messageParts.join('\r\n')
  }

  /**
   * Get attachment content from the original email
   * This is a simplified version - in a real implementation you might need to
   * fetch from S3 or parse the raw email content again
   */
  private async getAttachmentContent(originalEmail: ParsedEmailData, filename: string): Promise<Buffer | null> {
    try {
      // If we have the raw email content, parse it to get attachment content
      if (originalEmail.raw) {
        const { simpleParser } = await import('mailparser')
        const parsed = await simpleParser(originalEmail.raw)
        
        const attachment = parsed.attachments?.find(att => att.filename === filename)
        if (attachment && attachment.content) {
          return attachment.content
        }
      }

      // If no raw content available, we can't include the attachment
      console.warn(`⚠️ EmailForwarder - No raw email content available to extract attachment: ${filename}`)
      return null
    } catch (error) {
      console.error(`❌ EmailForwarder - Error extracting attachment ${filename}:`, error)
      return null
    }
  }

  /**
   * Encode email subject to handle special characters
   */
  private encodeSubject(subject: string): string {
    // Basic implementation - in production you might want to use proper RFC 2047 encoding
    return subject.replace(/[\r\n]/g, ' ').trim()
  }

  /**
   * Encode filename for Content-Disposition header
   */
  private encodeFilename(filename: string): string {
    // Basic filename encoding - escape quotes and handle special characters
    return filename.replace(/"/g, '\\"')
  }

  /**
   * Convert HTML to plain text (basic implementation)
   */
  private htmlToText(html: string): string {
    return html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .trim()
  }

  /**
   * Add the Inbound banner to HTML content
   */
  private addBannerToHtml(htmlContent: string, params: { originalEmail: ParsedEmailData; recipientEmail?: string }): string {
    // Only add banner if we have the necessary information
    if (!params.recipientEmail || !params.originalEmail.from?.addresses?.[0]?.address) {
      return htmlContent
    }

    const senderEmail = params.originalEmail.from.addresses[0].address
    const recipientEmail = params.recipientEmail
    
    // Generate the banner HTML
    const bannerHtml = generateEmailBannerHTML(recipientEmail, senderEmail)
    
    // Try to insert banner before closing body tag, or append if no body tag found
    if (htmlContent.includes('</body>')) {
      return htmlContent.replace('</body>', `${bannerHtml}</body>`)
    } else if (htmlContent.includes('</html>')) {
      return htmlContent.replace('</html>', `${bannerHtml}</html>`)
    } else {
      // No proper HTML structure, just append
      return `${htmlContent}${bannerHtml}`
    }
  }

  /**
   * Add the Inbound banner to plain text content
   */
  private addBannerToText(textContent: string, params: { originalEmail: ParsedEmailData; recipientEmail?: string }): string {
    // Only add banner if we have the necessary information
    if (!params.recipientEmail || !params.originalEmail.from?.addresses?.[0]?.address) {
      return textContent
    }

    const senderEmail = params.originalEmail.from.addresses[0].address
    
    // Create a simple plain text version
    const bannerText = `

---
sent via inbound.new, block ${senderEmail}: https://inbound.new/addtoblocklist?email=${encodeURIComponent(senderEmail)}
`
    
    return `${textContent}${bannerText}`
  }
} 