#!/usr/bin/env bun
/**
 * Simple Inbound Email Webhook Test Script
 * 
 * Simulates SES email requests to /api/inbound/webhook
 * Usage: bun run inbound-webhook from=sender@example.com to=recipient@domain.com type=newsletter
 */

import { nanoid } from 'nanoid'
import dotenv from 'dotenv'

// Load environment variables
dotenv.config()

/**
 * Email templates
 */
const EMAIL_TEMPLATES = {
  contact: {
    subject: 'Contact Form Submission',
    textBody: `Hello,

I'm interested in learning more about your services. Could you please send me more information?

Best regards,
John Doe
john.doe@example.com
(555) 123-4567`,
    htmlBody: `<html>
<body>
  <h2>Contact Form Submission</h2>
  <p>Hello,</p>
  <p>I'm interested in learning more about your services. Could you please send me more information?</p>
  <p>Best regards,<br>
  <strong>John Doe</strong><br>
  Email: <a href="mailto:john.doe@example.com">john.doe@example.com</a><br>
  Phone: (555) 123-4567</p>
</body>
</html>`
  },
  
  support: {
    subject: 'Technical Support Request - Urgent',
    textBody: `Technical Support Team,

I'm experiencing issues with email delivery. Emails sent to our webhook endpoints are not being received.

Error details:
- Webhook URL: https://api.example.com/webhooks/email
- Last successful delivery: 2 hours ago
- Error message: Connection timeout

Please investigate ASAP.

Thanks,
Support Team`,
    htmlBody: `<html>
<body>
  <h2>Technical Support Request</h2>
  <p><strong>Priority:</strong> <span style="color: red;">Urgent</span></p>
  <p>Technical Support Team,</p>
  <p>I'm experiencing issues with email delivery. Emails sent to our webhook endpoints are not being received.</p>
  <h3>Error Details:</h3>
  <ul>
    <li><strong>Webhook URL:</strong> https://api.example.com/webhooks/email</li>
    <li><strong>Last successful delivery:</strong> 2 hours ago</li>
    <li><strong>Error message:</strong> Connection timeout</li>
  </ul>
  <p>Please investigate ASAP.</p>
  <p>Thanks,<br>Support Team</p>
</body>
</html>`
  },
  
  newsletter: {
    subject: '📧 Weekly Newsletter - Email Processing Updates',
    textBody: `Weekly Email Processing Newsletter

This week's highlights:
- New webhook endpoint features
- Improved spam filtering
- Better error handling

Visit our blog for more details: https://blog.company.com

Unsubscribe: https://company.com/unsubscribe`,
    htmlBody: `<html>
<body style="font-family: Arial, sans-serif;">
  <div style="max-width: 600px; margin: 0 auto;">
    <h1 style="color: #333;">📧 Weekly Newsletter</h1>
    <h2 style="color: #666;">Email Processing Updates</h2>
    
    <h3>This week's highlights:</h3>
    <ul>
      <li>New webhook endpoint features</li>
      <li>Improved spam filtering</li>
      <li>Better error handling</li>
    </ul>
    
    <p><a href="https://blog.company.com" style="color: #007bff;">Visit our blog for more details</a></p>
    
    <hr style="margin: 20px 0;">
    <p style="font-size: 12px; color: #888;">
      <a href="https://company.com/unsubscribe" style="color: #888;">Unsubscribe</a>
    </p>
  </div>
</body>
</html>`
  }
}

/**
 * Generate RFC 2822 format email content
 */
function generateEmailContent(
  from: string,
  to: string,
  subject: string,
  textBody: string,
  htmlBody: string,
  messageId: string,
  timestamp: Date
): string {
  const boundary = `boundary_${nanoid()}`
  
  return `Return-Path: <${from}>
Delivered-To: ${to}
Received: from mail.example.com (mail.example.com [192.168.1.1])
	by inbound-smtp.amazonaws.com with SMTP id ${nanoid()}
	for <${to}>; ${timestamp.toUTCString()}
Date: ${timestamp.toUTCString()}
From: ${from}
To: ${to}
Message-ID: <${messageId}>
Subject: ${subject}
MIME-Version: 1.0
Content-Type: multipart/alternative; boundary="${boundary}"

--${boundary}
Content-Type: text/plain; charset=UTF-8
Content-Transfer-Encoding: 7bit

${textBody}

--${boundary}
Content-Type: text/html; charset=UTF-8
Content-Transfer-Encoding: 7bit

${htmlBody}

--${boundary}--`
}

/**
 * Generate SES webhook payload that matches what the real Lambda sends
 */
function generateSESWebhookPayload(from: string, to: string, templateType: keyof typeof EMAIL_TEMPLATES) {
  const messageId = `${nanoid()}@email.amazonaws.com`
  const timestamp = new Date()
  const template = EMAIL_TEMPLATES[templateType]
  
  const emailContent = generateEmailContent(
    from,
    to,
    template.subject,
    template.textBody,
    template.htmlBody,
    messageId,
    timestamp
  )

  // This matches the format from the existing inbound-webhook-test.ts
  return {
    type: 'ses_event_with_content',
    timestamp: timestamp.toISOString(),
    originalEvent: {
      Records: [{
        eventSource: 'aws:ses',
        eventVersion: '1.0',
        ses: {
          receipt: {
            timestamp: timestamp.toISOString(),
            processingTimeMillis: Math.floor(Math.random() * 1000) + 100,
            recipients: [to],
            spamVerdict: { status: 'PASS' },
            virusVerdict: { status: 'PASS' },
            spfVerdict: { status: 'PASS' },
            dkimVerdict: { status: 'PASS' },
            dmarcVerdict: { status: 'PASS' },
            action: {
              type: 'S3',
              bucketName: `inbound-emails-test-${nanoid()}`,
              objectKey: `emails/${timestamp.getFullYear()}/${String(timestamp.getMonth() + 1).padStart(2, '0')}/${String(timestamp.getDate()).padStart(2, '0')}/${messageId}`
            }
          },
          mail: {
            timestamp: timestamp.toISOString(),
            messageId: messageId,
            source: from,
            destination: [to],
            commonHeaders: {
              from: [from],
              to: [to],
              subject: template.subject,
              date: timestamp.toUTCString(),
              messageId: messageId
            }
          }
        }
      }]
    },
    processedRecords: [{
      eventSource: 'aws:ses',
      eventVersion: '1.0',
      ses: {
        receipt: {
          timestamp: timestamp.toISOString(),
          processingTimeMillis: Math.floor(Math.random() * 1000) + 100,
          recipients: [to],
          spamVerdict: { status: 'PASS' },
          virusVerdict: { status: 'PASS' },
          spfVerdict: { status: 'PASS' },
          dkimVerdict: { status: 'PASS' },
          dmarcVerdict: { status: 'PASS' },
          action: {
            type: 'S3',
            bucketName: `inbound-emails-test-${nanoid()}`,
            objectKey: `emails/${timestamp.getFullYear()}/${String(timestamp.getMonth() + 1).padStart(2, '0')}/${String(timestamp.getDate()).padStart(2, '0')}/${messageId}`
          }
        },
        mail: {
          timestamp: timestamp.toISOString(),
          messageId: messageId,
          source: from,
          destination: [to],
          commonHeaders: {
            from: [from],
            to: [to],
            subject: template.subject,
            date: timestamp.toUTCString(),
            messageId: messageId
          }
        }
      },
      emailContent: emailContent,
      s3Location: {
        bucket: `inbound-emails-test-${nanoid()}`,
        key: `emails/${timestamp.getFullYear()}/${String(timestamp.getMonth() + 1).padStart(2, '0')}/${String(timestamp.getDate()).padStart(2, '0')}/${messageId}`,
        contentFetched: true,
        contentSize: emailContent.length
      }
    }],
    context: {
      functionName: 'inbound-email-processor-test',
      functionVersion: '$LATEST',
      requestId: `test-${nanoid()}`
    }
  }
}

/**
 * Send webhook to the normal SES endpoint
 */
async function sendWebhook(from: string, to: string, templateType: keyof typeof EMAIL_TEMPLATES) {
  const webhookUrl = 'http://localhost:3000/api/inbound/webhook'
  const apiKey = process.env.SERVICE_API_KEY
  
  if (!apiKey) {
    console.error('❌ SERVICE_API_KEY environment variable is required')
    process.exit(1)
  }

  const payload = generateSESWebhookPayload(from, to, templateType)
  const template = EMAIL_TEMPLATES[templateType]

  console.log(`🚀 Sending SES webhook to: ${webhookUrl}`)
  console.log(`📧 From: ${from}`)
  console.log(`📮 To: ${to}`)
  console.log(`📄 Subject: ${template.subject}`)
  console.log(`🎨 Template: ${templateType}`)
  console.log(`🆔 Message ID: ${payload.processedRecords[0].ses.mail.messageId}`)
  console.log(`📏 Email content size: ${payload.processedRecords[0].emailContent?.length} bytes`)
  console.log()

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'User-Agent': 'AWS-Lambda-Email-Forwarder/1.0'
      },
      body: JSON.stringify(payload)
    })

    const responseData = await response.json()

    if (response.ok) {
      console.log('✅ Webhook sent successfully!')
      console.log(`📊 Response:`, JSON.stringify(responseData, null, 2))
    } else {
      console.error('❌ Webhook failed!')
      console.error(`Status: ${response.status} ${response.statusText}`)
      console.error('Response:', JSON.stringify(responseData, null, 2))
    }
  } catch (error) {
    console.error('❌ Error sending webhook:', error)
  }
}

/**
 * Parse command line arguments in key=value format
 */
function parseArgs(): { from?: string; to?: string; type?: string } {
  const args = process.argv.slice(2)
  const parsed: { from?: string; to?: string; type?: string } = {}

  for (const arg of args) {
    if (arg.includes('=')) {
      const [key, value] = arg.split('=', 2)
      if (key === 'from' || key === 'to' || key === 'type') {
        parsed[key] = value
      }
    }
  }

  return parsed
}

/**
 * Main function
 */
async function main() {
  const args = process.argv.slice(2)
  
  if (args.includes('--help') || args.includes('-h') || args.length === 0) {
    console.log(`
🚀 Simple Inbound Email Webhook Tester

Usage:
  bun run inbound-webhook from=<email> to=<email> type=<template>

Parameters:
  from=<email>     Sender email address (required)
  to=<email>       Recipient email address (required)  
  type=<template>  Email template: contact, support, newsletter (default: contact)

Examples:
  bun run inbound-webhook from=sender@example.com to=recipient@domain.com
  bun run inbound-webhook from=customer@client.com to=support@domain.com type=support
  bun run inbound-webhook from=newsletter@company.com to=user@domain.com type=newsletter

Templates:
  contact    - Contact form submission with personal details
  support    - Technical support request with error details  
  newsletter - Marketing newsletter with HTML formatting

Environment:
  SERVICE_API_KEY - Required for webhook authentication
`)
    return
  }

  const { from, to, type = 'contact' } = parseArgs()

  if (!from) {
    console.error('❌ from parameter is required (e.g., from=sender@example.com)')
    process.exit(1)
  }

  if (!to) {
    console.error('❌ to parameter is required (e.g., to=recipient@domain.com)')
    process.exit(1)
  }

  if (!(type in EMAIL_TEMPLATES)) {
    console.error(`❌ Invalid template type: ${type}`)
    console.error(`Available types: ${Object.keys(EMAIL_TEMPLATES).join(', ')}`)
    process.exit(1)
  }

  console.log('='.repeat(60))
  await sendWebhook(from, to, type as keyof typeof EMAIL_TEMPLATES)
}

main().catch(console.error)
