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

    console.log(`📤 EmailForwarder - Sending simplified email message (${rawMessage.length} bytes) with ${originalEmail.htmlBody ? 'HTML' : 'text'} content`)

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

    let message: string[]
    let bodyContent: string

    // Determine content type and body based on what's available
    if (params.originalEmail.htmlBody) {
      // Send HTML body as the main content
      headers.push('Content-Type: text/html; charset=UTF-8')
      headers.push('Content-Transfer-Encoding: 8bit')
      bodyContent = params.originalEmail.htmlBody
    } else if (params.originalEmail.textBody) {
      // Fall back to text body
      headers.push('Content-Type: text/plain; charset=UTF-8')
      headers.push('Content-Transfer-Encoding: 8bit')
      bodyContent = params.originalEmail.textBody
    } else {
      // No content available
      headers.push('Content-Type: text/plain; charset=UTF-8')
      headers.push('Content-Transfer-Encoding: 8bit')
      bodyContent = '[This email has no content]'
    }

    // Build the complete message
    message = [
      ...headers,
      '', // Empty line to separate headers from body
      bodyContent
    ]

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