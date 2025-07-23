#!/usr/bin/env bun
/**
 * Inbound Email Webhook Test Script
 * 
 * Simulates a real SES email webhook for local development.
 * Generates realistic test data and sends it to the webhook endpoint
 * to test email processing without needing full AWS infrastructure.
 */

import { nanoid } from 'nanoid'
import dotenv from 'dotenv'

// Load environment variables
dotenv.config()

interface SESRecord {
  eventSource: string
  eventVersion: string
  ses: {
    receipt: {
      timestamp: string
      processingTimeMillis: number
      recipients: string[]
      spamVerdict: { status: string }
      virusVerdict: { status: string }
      spfVerdict: { status: string }
      dkimVerdict: { status: string }
      dmarcVerdict: { status: string }
      action: {
        type: string
        bucketName: string
        objectKey: string
      }
    }
    mail: {
      timestamp: string
      messageId: string
      source: string
      destination: string[]
      commonHeaders: {
        from: string[]
        to: string[]
        subject: string
        date?: string
        messageId?: string
      }
    }
  }
}

interface ProcessedSESRecord extends SESRecord {
  emailContent?: string | null
  s3Location?: {
    bucket: string
    key: string
    contentFetched: boolean
    contentSize: number
  }
  s3Error?: string
}

interface WebhookPayload {
  type: 'ses_event_with_content'
  timestamp: string
  originalEvent: {
    Records: SESRecord[]
  }
  processedRecords: ProcessedSESRecord[]
  context: {
    functionName: string
    functionVersion: string
    requestId: string
  }
}

/**
 * Generate sample email content in RFC 2822 format
 */
function generateSampleEmailContent(
  from: string,
  to: string,
  subject: string,
  htmlBody: string,
  textBody: string,
  messageId: string,
  date: Date
): string {
  return `Return-Path: <${from}>
Delivered-To: ${to}
Received: from mail.example.com (mail.example.com [192.168.1.1])
	by inbound-smtp.amazonaws.com with SMTP id ${nanoid()}
	for <${to}>; ${date.toUTCString()}
Date: ${date.toUTCString()}
From: ${from}
To: ${to}
Message-ID: <${messageId}>
Subject: ${subject}
MIME-Version: 1.0
Content-Type: multipart/alternative; boundary="boundary_${nanoid()}"

--boundary_${nanoid()}
Content-Type: text/plain; charset=UTF-8
Content-Transfer-Encoding: 7bit

${textBody}

--boundary_${nanoid()}
Content-Type: text/html; charset=UTF-8
Content-Transfer-Encoding: 7bit

${htmlBody}

--boundary_${nanoid()}--`
}

/**
 * Create test email templates
 */
const EMAIL_TEMPLATES = {
  contact: {
    from: 'john.doe@example.com',
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
    from: 'support@customer.com',
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
    from: 'newsletter@company.com',
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
 * Generate a realistic SES webhook payload
 */
function generateWebhookPayload(
  recipient: string,
  template: keyof typeof EMAIL_TEMPLATES = 'contact'
): WebhookPayload {
  const messageId = `${nanoid()}@email.amazonaws.com`
  const timestamp = new Date()
  const emailTemplate = EMAIL_TEMPLATES[template]
  
  const emailContent = generateSampleEmailContent(
    emailTemplate.from,
    recipient,
    emailTemplate.subject,
    emailTemplate.htmlBody,
    emailTemplate.textBody,
    messageId,
    timestamp
  )

  const sesRecord: SESRecord = {
    eventSource: 'aws:ses',
    eventVersion: '1.0',
    ses: {
      receipt: {
        timestamp: timestamp.toISOString(),
        processingTimeMillis: Math.floor(Math.random() * 1000) + 100,
        recipients: [recipient],
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
        source: emailTemplate.from,
        destination: [recipient],
        commonHeaders: {
          from: [emailTemplate.from],
          to: [recipient],
          subject: emailTemplate.subject,
          date: timestamp.toUTCString(),
          messageId: messageId
        }
      }
    }
  }

  const processedRecord: ProcessedSESRecord = {
    ...sesRecord,
    emailContent: emailContent,
    s3Location: {
      bucket: sesRecord.ses.receipt.action.bucketName,
      key: sesRecord.ses.receipt.action.objectKey,
      contentFetched: true,
      contentSize: emailContent.length
    }
  }

  return {
    type: 'ses_event_with_content',
    timestamp: timestamp.toISOString(),
    originalEvent: {
      Records: [sesRecord]
    },
    processedRecords: [processedRecord],
    context: {
      functionName: 'inbound-email-processor-test',
      functionVersion: '$LATEST',
      requestId: `test-${nanoid()}`
    }
  }
}

/**
 * Send webhook payload to the local server
 */
async function sendWebhookTest(
  recipient: string,
  template: keyof typeof EMAIL_TEMPLATES = 'contact',
  webhookUrl?: string
): Promise<void> {
  const url = webhookUrl || 'http://localhost:3000/api/inbound/webhook'
  const apiKey = process.env.SERVICE_API_KEY
  
  if (!apiKey) {
    console.error('❌ SERVICE_API_KEY environment variable is required')
    process.exit(1)
  }

  const payload = generateWebhookPayload(recipient, template)
  
  console.log(`🚀 Sending test webhook to: ${url}`)
  console.log(`📧 Template: ${template}`)
  console.log(`📮 Recipient: ${recipient}`)
  console.log(`🔑 Message ID: ${payload.processedRecords[0].ses.mail.messageId}`)
  console.log(`📄 Subject: ${payload.processedRecords[0].ses.mail.commonHeaders.subject}`)
  console.log(`📏 Email content size: ${payload.processedRecords[0].emailContent?.length} bytes`)
  console.log('')

  try {
    const response = await fetch(url, {
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
      console.log('✅ Webhook test successful!')
      console.log(`📊 Processed emails: ${responseData.processedEmails}`)
      console.log(`❌ Rejected emails: ${responseData.rejectedEmails}`)
      
      if (responseData.emails && responseData.emails.length > 0) {
        console.log('\n📧 Processed Email Details:')
        responseData.emails.forEach((email: any, index: number) => {
          console.log(`  ${index + 1}. Email ID: ${email.emailId}`)
          console.log(`     Recipient: ${email.recipient}`)
          console.log(`     Subject: ${email.subject}`)
          console.log(`     Webhook Delivery: ${email.webhookDelivery?.success ? '✅ Success' : '❌ Failed'}`)
          if (email.webhookDelivery?.error) {
            console.log(`     Error: ${email.webhookDelivery.error}`)
          }
        })
      }

      if (responseData.rejected && responseData.rejected.length > 0) {
        console.log('\n❌ Rejected Emails:')
        responseData.rejected.forEach((rejected: any, index: number) => {
          console.log(`  ${index + 1}. Recipient: ${rejected.recipient}`)
          console.log(`     Reason: ${rejected.reason}`)
        })
      }
    } else {
      console.error('❌ Webhook test failed!')
      console.error(`Status: ${response.status} ${response.statusText}`)
      console.error('Response:', JSON.stringify(responseData, null, 2))
    }
  } catch (error) {
    console.error('❌ Error sending webhook test:', error)
  }
}

/**
 * Main function - parse command line arguments and run test
 */
async function main() {
  const args = process.argv.slice(2)
  
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
📧 Inbound Email Webhook Test Script

Usage:
  bun run inbound-webhook-test <recipient> [template] [webhook-url]

Arguments:
  recipient     Email address to send test email to (required)
  template      Email template to use: contact, support, newsletter (default: contact)
  webhook-url   Webhook URL to test (default: http://localhost:3000/api/inbound/webhook)

Examples:
  bun run inbound-webhook-test test@yourdomain.com
  bun run inbound-webhook-test support@yourdomain.com support
  bun run inbound-webhook-test newsletter@yourdomain.com newsletter
  bun run inbound-webhook-test test@yourdomain.com contact https://yourapp.com/api/inbound/webhook

Environment Variables:
  SERVICE_API_KEY  Required - API key for webhook authentication

Templates:
  contact     - Contact form submission with personal details
  support     - Technical support request with error details  
  newsletter  - Marketing newsletter with HTML formatting
`)
    return
  }

  const recipient = args[0]
  const template = (args[1] as keyof typeof EMAIL_TEMPLATES) || 'contact'
  const webhookUrl = args[2]

  if (!recipient) {
    console.error('❌ Recipient email address is required')
    process.exit(1)
  }

  if (!EMAIL_TEMPLATES[template]) {
    console.error(`❌ Invalid template: ${template}`)
    console.error(`Available templates: ${Object.keys(EMAIL_TEMPLATES).join(', ')}`)
    process.exit(1)
  }

  await sendWebhookTest(recipient, template, webhookUrl)
}

// Run the script
if (import.meta.main) {
  main().catch(console.error)
}
