/**
 * Example: Handling Received Headers in Webhook Payloads
 * 
 * This example demonstrates how to properly handle the 'received' header field
 * which can be either a string (single header) or string[] (multiple headers).
 */

import { InboundWebhookPayload, InboundEmailHeaders } from '../src/webhook-types';

/**
 * Safely extract received headers as an array
 */
function getReceivedHeaders(headers: InboundEmailHeaders): string[] {
  if (!headers.received) {
    return [];
  }
  
  // Handle both single string and array cases
  return Array.isArray(headers.received) ? headers.received : [headers.received];
}

/**
 * Parse received headers to extract mail server information
 */
function parseReceivedHeaders(headers: InboundEmailHeaders) {
  const receivedHeaders = getReceivedHeaders(headers);
  
  return receivedHeaders.map((header, index) => {
    // Simple regex to extract from/by information
    const fromMatch = header.match(/from\s+([^\s]+)/i);
    const byMatch = header.match(/by\s+([^\s]+)/i);
    const ipMatch = header.match(/\[([0-9.]+)\]/);
    
    return {
      hop: index + 1,
      from: fromMatch ? fromMatch[1] : null,
      by: byMatch ? byMatch[1] : null,
      ip: ipMatch ? ipMatch[1] : null,
      raw: header
    };
  });
}

/**
 * Example webhook handler
 */
export function handleEmailWebhook(payload: InboundWebhookPayload) {
  const { email } = payload;
  
  console.log(`Processing email: ${email.subject}`);
  console.log(`From: ${email.from?.text || 'Unknown'}`);
  
  // Handle received headers from parsed data
  const parsedHeaders = email.parsedData.headers;
  const receivedHops = parseReceivedHeaders(parsedHeaders);
  
  console.log(`\nEmail routing path (${receivedHops.length} hops):`);
  receivedHops.forEach(hop => {
    console.log(`  ${hop.hop}. ${hop.from} -> ${hop.by} ${hop.ip ? `(${hop.ip})` : ''}`);
  });
  
  // Also handle received headers from cleaned content
  const cleanedHeaders = email.cleanedContent.headers;
  const cleanedReceivedHops = parseReceivedHeaders(cleanedHeaders);
  
  if (cleanedReceivedHops.length > 0) {
    console.log(`\nCleaned content also has ${cleanedReceivedHops.length} received headers`);
  }
  
  // Example: Check if email came through a specific mail server
  const cameFromAmazonSES = receivedHops.some(hop => 
    hop.from?.includes('amazonses.com') || hop.by?.includes('amazonses.com')
  );
  
  if (cameFromAmazonSES) {
    console.log('✅ Email was processed through Amazon SES');
  }
  
  return {
    processed: true,
    hops: receivedHops.length,
    fromSES: cameFromAmazonSES
  };
}

// Example usage with mock data
if (require.main === module) {
  const mockPayload: InboundWebhookPayload = {
    event: 'email.received',
    timestamp: new Date().toISOString(),
    email: {
      id: 'test-email-123',
      messageId: '<test@example.com>',
      from: { text: 'sender@example.com', addresses: [{ name: 'Sender', address: 'sender@example.com' }] },
      to: { text: 'recipient@domain.com', addresses: [{ name: null, address: 'recipient@domain.com' }] },
      recipient: 'recipient@domain.com',
      subject: 'Test Email',
      receivedAt: new Date().toISOString(),
      parsedData: {
        messageId: '<test@example.com>',
        date: new Date(),
        subject: 'Test Email',
        from: { text: 'sender@example.com', addresses: [{ name: 'Sender', address: 'sender@example.com' }] },
        to: { text: 'recipient@domain.com', addresses: [{ name: null, address: 'recipient@domain.com' }] },
        cc: null,
        bcc: null,
        replyTo: null,
        inReplyTo: undefined,
        references: undefined,
        textBody: 'This is a test email.',
        htmlBody: undefined,
        attachments: [],
        headers: {
          // Example with multiple received headers (array)
          'received': [
            'from mail1.example.com (mail1.example.com [192.168.1.1]) by mail2.example.com with SMTP id abc123 for <recipient@domain.com>; Mon, 01 Jan 2024 12:00:00 +0000',
            'from mail0.example.com (mail0.example.com [192.168.1.0]) by mail1.example.com with SMTP id def456 for <recipient@domain.com>; Mon, 01 Jan 2024 11:59:00 +0000'
          ],
          'from': { text: 'sender@example.com', addresses: [{ name: 'Sender', address: 'sender@example.com' }] },
          'to': { text: 'recipient@domain.com', addresses: [{ name: null, address: 'recipient@domain.com' }] },
          'subject': 'Test Email'
        },
        priority: undefined
      },
      cleanedContent: {
        html: null,
        text: 'This is a test email.',
        hasHtml: false,
        hasText: true,
        attachments: [],
        headers: {
          // Example with single received header (string)
          'received': 'from mail1.example.com (mail1.example.com [192.168.1.1]) by inbound-smtp.amazonaws.com with SMTP id xyz789 for <recipient@domain.com>; Mon, 01 Jan 2024 12:01:00 +0000'
        }
      }
    },
    endpoint: {
      id: 'webhook-123',
      name: 'Test Webhook',
      type: 'webhook'
    }
  };
  
  handleEmailWebhook(mockPayload);
}