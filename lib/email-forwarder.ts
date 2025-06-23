import { SESClient, SendRawEmailCommand } from '@aws-sdk/client-ses'
import type { ParsedEmailData } from './email-parser'

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
    }
  ): Promise<void> {
    console.log(`📨 EmailForwarder - Forwarding email from ${fromAddress} to ${toAddresses.length} recipients`)

    // Build email subject with optional prefix
    const subject = options?.subjectPrefix 
      ? `${options.subjectPrefix}${originalEmail.subject || 'No Subject'}`
      : originalEmail.subject || 'No Subject'

    // Create raw email message maintaining original structure
    const rawMessage = this.buildRawEmailMessage({
      from: fromAddress,
      to: toAddresses,
      replyTo: originalEmail.from?.addresses?.[0]?.address || fromAddress,
      subject,
      originalEmail,
      includeAttachments: options?.includeAttachments ?? true
    })

    console.log(`📤 EmailForwarder - Sending raw email message (${rawMessage.length} bytes)`)

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
        toAddresses
      })
    } catch (error) {
      console.error(`❌ EmailForwarder - Failed to forward email:`, error)
      throw new Error(`Email forwarding failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  private buildRawEmailMessage(params: {
    from: string
    to: string[]
    replyTo: string
    subject: string
    originalEmail: ParsedEmailData
    includeAttachments: boolean
  }): string {
    // Generate unique boundary for multipart message
    const boundary = `boundary_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    
    // Build RFC 2822 compliant email headers
    const headers = [
      `From: ${params.from}`,
      `To: ${params.to.join(', ')}`,
      `Reply-To: ${params.replyTo}`,
      `Subject: ${this.encodeSubject(params.subject)}`,
      `Date: ${new Date().toUTCString()}`,
      `MIME-Version: 1.0`,
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
    ]

    // Add original message headers for threading (if available)
    if (params.originalEmail.messageId) {
      headers.push(`In-Reply-To: ${params.originalEmail.messageId}`)
    }
    if (params.originalEmail.references?.length) {
      headers.push(`References: ${params.originalEmail.references.join(' ')}`)
    }

    // Start building the message
    let message = [
      ...headers,
      '', // Empty line to separate headers from body
      'This is a multi-part message in MIME format.',
      '',
      `--${boundary}`,
    ]

    // Add text body if available
    if (params.originalEmail.textBody) {
      message.push(
        'Content-Type: text/plain; charset=UTF-8',
        'Content-Transfer-Encoding: 8bit',
        '',
        params.originalEmail.textBody,
        ''
      )
    }

    // Add HTML body if available
    if (params.originalEmail.htmlBody) {
      message.push(
        `--${boundary}`,
        'Content-Type: text/html; charset=UTF-8',
        'Content-Transfer-Encoding: 8bit',
        '',
        params.originalEmail.htmlBody,
        ''
      )
    }

    // Add plain text fallback if only HTML is available
    if (!params.originalEmail.textBody && params.originalEmail.htmlBody) {
      message.push(
        `--${boundary}`,
        'Content-Type: text/plain; charset=UTF-8',
        'Content-Transfer-Encoding: 8bit',
        '',
        this.htmlToText(params.originalEmail.htmlBody),
        ''
      )
    }

    // Add fallback content if no body is available
    if (!params.originalEmail.textBody && !params.originalEmail.htmlBody) {
      message.push(
        'Content-Type: text/plain; charset=UTF-8',
        'Content-Transfer-Encoding: 8bit',
        '',
        '[This email has no text content]',
        ''
      )
    }

    // Add attachments if requested and available
    if (params.includeAttachments && params.originalEmail.attachments?.length) {
      console.log(`📎 EmailForwarder - Adding ${params.originalEmail.attachments.length} attachments`)
      
      for (const attachment of params.originalEmail.attachments) {
        message.push(
          `--${boundary}`,
          `Content-Type: ${attachment.contentType || 'application/octet-stream'}`,
          `Content-Transfer-Encoding: base64`,
          `Content-Disposition: attachment; filename="${attachment.filename || 'attachment'}"`,
          ''
        )
        
        // Note: In a full implementation, you would need to extract the actual
        // attachment content from the original email. For now, we'll add a placeholder
        // indicating that attachment processing needs to be implemented.
        message.push(
          '// TODO: Implement attachment content extraction',
          '// This requires parsing the original raw email content',
          '// and extracting the base64-encoded attachment data',
          ''
        )
      }
    }

    // Close the multipart message
    message.push(`--${boundary}--`)

    return message.join('\r\n')
  }

  /**
   * Encode email subject to handle special characters
   */
  private encodeSubject(subject: string): string {
    // Basic implementation - in production you might want to use proper RFC 2047 encoding
    return subject.replace(/[\r\n]/g, ' ').trim()
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
} 