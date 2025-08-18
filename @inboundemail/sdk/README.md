# @inboundemail/sdk

The official SDK for the Inbound Email API v2. This SDK provides a simple and intuitive hierarchical interface for managing email receiving, sending, domains, email addresses, and webhook endpoints.

**Version 4.0.0** introduces a new hierarchical structure with `inbound.email.address.*` methods and consistent `{ data, error }` response patterns.

## Installation

```bash
npm install @inboundemail/sdk
```

## Quick Start

```typescript
import { Inbound } from '@inboundemail/sdk'

const inbound = new Inbound(process.env.INBOUND_API_KEY!)

// Send an email (with { data, error } pattern)
const { data: email, error } = await inbound.email.send({
  from: 'hello@yourdomain.com',
  to: 'user@example.com',
  subject: 'Hello World',
  html: '<h1>Hello World</h1><p>This is your first email!</p>',
})

if (error) {
  console.error('Failed to send email:', error)
} else {
  console.log('Email sent:', email.id)
}
```

## 🏗️ Hierarchical Structure (New in v4.0.0)

The SDK now uses a logical hierarchical structure:

```typescript
// 📧 Inbound Email Management
inbound.mail.list()           // List received emails
inbound.mail.get(id)          // Get specific email
inbound.mail.thread(id)       // Get email thread
inbound.mail.markRead(id)     // Mark as read
inbound.mail.archive(id)      // Archive email
inbound.mail.reply(params)    // Reply to email

// 📤 Outbound Email Management  
inbound.email.send(data)           // Send email immediately
inbound.email.schedule(data)       // Schedule email
inbound.email.reply(id, data)      // Reply to sent email
inbound.email.listScheduled()      // List scheduled emails
inbound.email.cancel(id)           // Cancel scheduled email

// 📮 Email Address Management (NEW - nested under email)
inbound.email.address.create(data)       // Create email address
inbound.email.address.list()             // List email addresses
inbound.email.address.get(id)            // Get address details
inbound.email.address.update(id, data)   // Update address routing
inbound.email.address.delete(id)         // Remove address

// 🌐 Domain Management
inbound.domain.create(data)        // Add new domain
inbound.domain.list()              // List all domains
inbound.domain.verify(id)          // Verify domain
inbound.domain.getDnsRecords(id)   // Get DNS records

// 🔗 Endpoint Management (Webhooks & Forwarding)
inbound.endpoint.create(data)      // Create endpoint
inbound.endpoint.list()            // List endpoints
inbound.endpoint.test(id)          // Test endpoint
```

## 📊 Response Pattern

All methods now return a consistent `{ data, error }` pattern:

```typescript
// Success case
const { data, error } = await inbound.mail.list()
if (error) {
  console.error('Error:', error)
  return
}
console.log('Emails:', data.emails)

// Or with destructuring
const { data: emails, error: emailsError } = await inbound.mail.list()
const { data: domains, error: domainsError } = await inbound.domain.list()
```

## Streamlined Webhook Replies

The SDK includes a streamlined `reply()` method that makes it easy to reply to emails directly from webhook handlers:

### Quick Setup

```typescript
import { Inbound, type InboundWebhookPayload, isInboundWebhook } from '@inboundemail/sdk'
import { NextRequest, NextResponse } from 'next/server'

const inbound = new Inbound(process.env.INBOUND_API_KEY!)

export async function POST(request: NextRequest) {
  const payload: InboundWebhookPayload = await request.json()
  
  if (!isInboundWebhook(payload)) {
    return NextResponse.json({ error: 'Invalid webhook' }, { status: 400 })
  }
  
  const { email } = payload
  
  // Reply to emails with new { data, error } pattern
  const { data, error } = await inbound.reply(email, {
    from: 'support@yourdomain.com',
    text: 'Thanks for your message! We\'ll get back to you soon.'
  })

  if (error) {
    console.error('Reply failed:', error)
    return NextResponse.json({ error }, { status: 500 })
  }

  return NextResponse.json({ success: true, messageId: data.messageId })
}
```

## 📮 Email Address Management

The new hierarchical structure makes email address management more intuitive:

```typescript
// List all email addresses
const { data: addresses, error } = await inbound.email.address.list()

// Create a new email address
const { data: newAddress, error: createError } = await inbound.email.address.create({
  address: 'support@yourdomain.com',
  domainId: 'domain-123'
})

// Update routing for an email address
const { data: updated, error: updateError } = await inbound.email.address.update('address-123', {
  endpointId: 'webhook-456',
  isActive: true
})

// Delete an email address
const { data: deleted, error: deleteError } = await inbound.email.address.delete('address-123')
```

## 🌐 Domain Management

```typescript
// Create and verify a domain
const { data: domain, error } = await inbound.domain.create({
  domain: 'yourdomain.com'
})

if (!error) {
  // Get DNS records needed for verification
  const { data: dnsRecords } = await inbound.domain.getDnsRecords(domain.id)
  console.log('Add these DNS records:', dnsRecords)
  
  // Verify domain after DNS setup
  const { data: verification } = await inbound.domain.verify(domain.id)
}
```

## 🔗 Endpoint Management

```typescript
// Create a webhook endpoint
const { data: webhook, error } = await inbound.endpoint.create({
  name: 'My Webhook',
  type: 'webhook',
  config: {
    url: 'https://yourapp.com/webhook',
    timeout: 30000,
    retryAttempts: 3
  }
})

// Test the endpoint
if (!error) {
  const { data: testResult } = await inbound.endpoint.test(webhook.id)
  console.log('Test result:', testResult)
}
```

## 🎯 Convenience Methods

```typescript
// Quick reply to an email
const { data, error } = await inbound.quickReply(
  'email-123', 
  'Thanks for your message!', 
  'support@yourdomain.com',
  { idempotencyKey: 'quick-reply-123' }
)

// One-step domain setup with webhook
const { data: setup } = await inbound.setupDomain(
  'newdomain.com',
  'https://yourapp.com/webhook'
)

// Create email forwarder
const { data: forwarder } = await inbound.createForwarder(
  'info@yourdomain.com',
  'team@yourdomain.com'
)

// Schedule a reminder
const { data: reminder } = await inbound.scheduleReminder(
  'user@example.com',
  'Meeting Tomorrow',
  'tomorrow at 9am',
  'reminders@yourdomain.com',
  { idempotencyKey: 'reminder-meeting-456' }
)
```

## 🔄 Legacy Compatibility

All previous method names still work for backwards compatibility:

```typescript
// These are equivalent:
inbound.email === inbound.emails
inbound.domain === inbound.domains  
inbound.endpoint === inbound.endpoints
inbound.email.address === inbound.emailAddresses

// Legacy usage still works:
const { data } = await inbound.emails.send(emailData)
const { data } = await inbound.domains.list()
```

## 📧 Email Sending & Scheduling

### Send Immediate Email

```typescript
const { data: email, error } = await inbound.email.send({
  from: 'hello@yourdomain.com',
  to: ['user@example.com', 'admin@example.com'],
  subject: 'Welcome!',
  html: '<h1>Welcome to our service!</h1>',
  text: 'Welcome to our service!',
  attachments: [
    {
      filename: 'welcome.pdf',
      path: './welcome.pdf'
    }
  ]
})
```

### Schedule Email

```typescript
const { data: scheduled, error } = await inbound.email.schedule({
  from: 'hello@yourdomain.com',
  to: 'user@example.com',
  subject: 'Scheduled Email',
  html: '<p>This email was scheduled!</p>',
  scheduled_at: 'in 1 hour',           // Natural language
  timezone: 'America/New_York'
})

// Or with specific date
const { data: scheduled2 } = await inbound.email.schedule({
  from: 'hello@yourdomain.com',
  to: 'user@example.com',
  subject: 'New Year Email',
  html: '<p>Happy New Year!</p>',
  scheduled_at: '2024-01-01T00:00:00Z'  // ISO 8601
})
```

### Manage Scheduled Emails

```typescript
// List scheduled emails
const { data: scheduledEmails } = await inbound.email.listScheduled({
  status: 'scheduled',
  limit: 10
})

// Get specific scheduled email
const { data: scheduledEmail } = await inbound.email.getScheduled('email-id')

// Cancel scheduled email
const { data: cancelled } = await inbound.email.cancel('email-id')
```

## 📬 Inbound Email Management

```typescript
// List received emails
const { data: emails } = await inbound.mail.list({
  limit: 50,
  status: 'processed',
  timeRange: '7d'
})

// Get specific email
const { data: email } = await inbound.mail.get('email-123')

// Get email thread/conversation
const { data: thread } = await inbound.mail.thread('email-123')

// Mark email as read/unread
await inbound.mail.markRead('email-123')
await inbound.mail.markUnread('email-123')

// Archive/unarchive emails
await inbound.mail.archive('email-123')
await inbound.mail.unarchive('email-123')

// Bulk operations
const { data: result } = await inbound.mail.bulk(
  ['email-1', 'email-2', 'email-3'],
  { isRead: true }
)
```

## 🔧 Advanced Usage

### React Email Components

```typescript
import { EmailTemplate } from './EmailTemplate'

const { data, error } = await inbound.email.send({
  from: 'hello@yourdomain.com',
  to: 'user@example.com',
  subject: 'Welcome!',
  react: EmailTemplate({ name: 'John', welcomeUrl: 'https://app.com' })
})
```

### Idempotency

Prevent duplicate emails by using idempotency keys:

```typescript
const { data, error } = await inbound.email.send({
  from: 'hello@yourdomain.com',
  to: 'user@example.com',
  subject: 'Important Email',
  text: 'This email will only be sent once'
}, {
  idempotencyKey: 'unique-key-123'
})

// Works with all email sending methods
await inbound.email.schedule({
  from: 'hello@yourdomain.com',
  to: 'user@example.com',
  subject: 'Scheduled Email',
  text: 'This scheduled email is idempotent',
  scheduled_at: 'tomorrow at 9am'
}, {
  idempotencyKey: 'scheduled-email-456'
})

// Also works with replies
await inbound.email.reply('email-123', {
  from: 'support@yourdomain.com',
  text: 'This reply will only be sent once'
}, {
  idempotencyKey: 'reply-789'
})
```

## 🛠️ Error Handling

```typescript
const { data, error } = await inbound.email.send(emailData)

if (error) {
  // Handle different error types
  if (error.includes('Invalid API key')) {
    console.error('Authentication failed')
  } else if (error.includes('Rate limit')) {
    console.error('Rate limit exceeded')
  } else {
    console.error('Unknown error:', error)
  }
  return
}

// Success case
console.log('Email sent successfully:', data.id)
```

## 📚 TypeScript Support

The SDK is fully typed with TypeScript:

```typescript
import type { 
  ApiResponse,
  PostEmailsRequest,
  PostEmailsResponse,
  InboundWebhookPayload 
} from '@inboundemail/sdk'

// Type-safe email sending
const emailRequest: PostEmailsRequest = {
  from: 'hello@yourdomain.com',
  to: 'user@example.com',
  subject: 'Typed Email',
  html: '<p>This is type-safe!</p>'
}

const response: ApiResponse<PostEmailsResponse> = await inbound.email.send(emailRequest)
```

## 🔗 Links

- [API Documentation](https://docs.inbound.new)
- [GitHub Repository](https://github.com/inboundemail/sdk)
- [NPM Package](https://www.npmjs.com/package/@inboundemail/sdk)

## 📄 License

MIT License - see LICENSE file for details. 