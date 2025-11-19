import type { ParsedEmailData } from '@/lib/email-management/email-parser';
import type { WebhookPayloadFormat } from './types';

/**
 * Format webhook payload based on format type
 * @param emailId - The email ID
 * @param emailData - Parsed email data
 * @param recipient - The recipient email address
 * @param format - Payload format ('full' or 'simple')
 * @returns Formatted webhook payload
 */
export function formatWebhookPayload(
  emailId: string,
  emailData: ParsedEmailData & { recipient?: string },
  format: WebhookPayloadFormat = 'full'
) {
  const basePayload = {
    id: emailId,
    type: 'email.received',
    timestamp: new Date().toISOString(),
  };

  if (format === 'simple') {
    return {
      ...basePayload,
      email: {
        from: emailData.from?.text || '',
        to: emailData.recipient || emailData.to?.text || '',
        subject: emailData.subject || '',
        text: emailData.textBody || '',
        hasAttachments: (emailData.attachments?.length || 0) > 0,
        attachmentCount: emailData.attachments?.length || 0,
      },
    };
  }

  // Full format (existing structure)
  return {
    ...basePayload,
    email: emailData,
  };
}

