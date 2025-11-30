import type { ParsedEmailData } from '@/lib/email-management/email-parser';
import type { WebhookPayloadFormat } from './types';
import { SVIX_EVENT_TYPES } from '@/lib/svix/event-types';

/**
 * Format webhook payload based on format type
 * @param emailId - The email ID
 * @param emailData - Parsed email data (with optional recipient property)
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
    type: SVIX_EVENT_TYPES.EMAIL_RECEIVED,
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

