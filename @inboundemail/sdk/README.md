# @inboundemail/sdk

The official SDK for the Inbound Email API v2. This SDK provides a simple and intuitive interface for managing email receiving, sending, and webhook endpoints.

## Installation

```bash
npm install @inboundemail/sdk
```

## Quick Start

```typescript
import { Inbound } from '@inboundemail/sdk'

const inbound = new Inbound('your-api-key-here')

// Send an email
const email = await inbound.emails.send({
  from: 'hello@yourdomain.com',
  to: 'user@example.com',
  subject: 'Hello World',
  html: '<h1>Hello World</h1><p>This is your first email!</p>',
})

console.log(email.id)
```

## Streamlined Webhook Replies

The SDK includes a streamlined `reply()` method that makes it incredibly easy to reply to emails directly from webhook handlers:

### Quick Setup

```typescript
import { Inbound, type InboundWebhookPayload, isInboundWebhook } from '@inboundemail/sdk'
import { NextRequest, NextResponse } from 'next/server'

// Configure with default reply address for super simple replies
const inbound = new Inbound({
  apiKey: process.env.INBOUND_API_KEY!,
  defaultReplyFrom: 'support@yourdomain.com'
})

export async function POST(request: NextRequest) {
  const payload: InboundWebhookPayload = await request.json()
  
  if (!isInboundWebhook(payload)) {
    return NextResponse.json({ error: 'Invalid webhook' }, { status: 400 })
  }
  
  const { email } = payload
  
  // 🔥 Super simple replies!
  if (email.subject?.includes('thanks')) {
    await inbound.reply(email, "You're welcome!")
  }
  
  if (email.subject?.includes('support')) {
    await inbound.reply(email, "Thanks for contacting support! We'll respond within 24 hours.")
  }
  
  return NextResponse.json({ success: true })
}
```

### Reply Methods

**1. Simple String Reply (with defaultReplyFrom configured):**
```typescript
await inbound.reply(email, "Thanks for your message!")
```

**2. Override From Address:**
```typescript
await inbound.reply(email, {
  from: 'billing@yourdomain.com',
  text: "Thanks for your billing inquiry."
})
```

**3. Full Control:**
```typescript
await inbound.reply(email, {
  from: 'sales@yourdomain.com',
  subject: 'Custom Subject',
  html: '<h1>Thanks!</h1><p>We got your message.</p>',
  text: 'Thanks! We got your message.',
  cc: ['manager@yourdomain.com'],
  headers: { 'X-Priority': 'High' }
})
```

**4. Reply by Email ID:**
```typescript
await inbound.reply('email-id-string', {
  from: 'support@yourdomain.com',
  text: "Thanks!"
})
```

## Webhook Types for Incoming Requests

The SDK includes comprehensive TypeScript types for webhook payloads that Inbound sends to your server. Use these types to add type safety to your webhook handlers:

### Basic Webhook Handler

```typescript
import type { InboundWebhookPayload, isInboundWebhook } from '@inboundemail/sdk'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  // Parse with type safety
  const payload: InboundWebhookPayload = await request.json()
  
  // Verify it's a valid Inbound webhook
  if (!isInboundWebhook(payload)) {
    return NextResponse.json({ error: 'Invalid webhook' }, { status: 400 })
  }
  
  // Access typed email data
  const { email, endpoint, timestamp } = payload
  console.log(`📧 New email: ${email.subject}`)
  console.log(`👤 From: ${email.from?.addresses[0]?.address}`)
  
  return NextResponse.json({ success: true })
}
```

### Using Helper Functions

```typescript
import { 
  getSenderInfo, 
  getEmailText, 
  getEmailHtml,
  getAttachmentInfo 
} from '@inboundemail/sdk'

// Get sender information
const sender = getSenderInfo(email)
console.log(`From: ${sender.name} <${sender.address}>`)

// Get email content
const textContent = getEmailText(email)
const htmlContent = getEmailHtml(email)

// Process attachments with metadata
email.cleanedContent.attachments.forEach(attachment => {
  const info = getAttachmentInfo(attachment)
  console.log(`📎 ${attachment.filename} - ${info.isImage ? 'Image' : 'Document'}`)
})
```

### Framework-Specific Examples

**Next.js Pages Router:**
```typescript
import type { NextApiRequest, NextApiResponse } from 'next'
import type { InboundWebhookPayload } from '@inboundemail/sdk'

interface TypedRequest extends NextApiRequest {
  body: InboundWebhookPayload
}

export default function handler(req: TypedRequest, res: NextApiResponse) {
  const { email } = req.body
  // Process with full type safety
}
```

**Express.js:**
```typescript
import express from 'express'
import type { InboundWebhookPayload } from '@inboundemail/sdk'

app.post('/webhook', (req: express.Request, res: express.Response) => {
  const payload = req.body as InboundWebhookPayload
  // Handle webhook with types
})
```

**Available Webhook Types:**
- `InboundWebhookPayload` - Complete webhook payload
- `InboundWebhookEmail` - Email data structure
- `InboundWebhookHeaders` - Webhook HTTP headers
- `InboundEmailAddress` - Email address structure
- `InboundEmailAttachment` - Attachment metadata
- `InboundParsedEmailData` - Complete parsed email data

## API Reference

### Initialization

```typescript
// Basic initialization
const inbound = new Inbound('your-api-key')

// With configuration object
const inbound = new Inbound({
  apiKey: 'your-api-key',
  baseUrl: 'https://inbound.new/api/v2' // optional
})

// With default reply address for streamlined replies
const inbound = new Inbound({
  apiKey: 'your-api-key',
  defaultReplyFrom: 'support@yourdomain.com' // enables simple string replies
})
```

### Sending Emails

```typescript
// Basic email
await inbound.emails.send({
  from: 'hello@yourdomain.com',
  to: 'user@example.com',
  subject: 'Hello World',
  text: 'Hello World',
})

// Advanced email with multiple recipients and attachments
await inbound.emails.send({
  from: 'hello@yourdomain.com',
  to: ['user1@example.com', 'user2@example.com'],
  cc: ['manager@example.com'],
  bcc: ['archive@example.com'],
  subject: 'Important Update',
  html: '<h1>Important Update</h1><p>Please review the attached document.</p>',
  text: 'Important Update\n\nPlease review the attached document.',
  headers: {
    'X-Priority': 'High'
  },
  attachments: [{
    filename: 'document.pdf',
    content: 'base64-encoded-content',
    content_type: 'application/pdf'
  }]
})

// Using the legacy send method (same as emails.send)
await inbound.send({
  from: 'hello@yourdomain.com',
  to: 'user@example.com',
  subject: 'Hello World',
  text: 'Hello World',
})
```

### Retrieving Sent Emails

```typescript
// Get a sent email by ID
const email = await inbound.emails.get('email-id')
console.log(email.subject, email.last_event)
```

### Managing Received Emails

```typescript
// List all received emails
const emails = await inbound.mail.list({
  limit: 10,
  status: 'processed'
})

// Get a specific received email
const email = await inbound.mail.get('email-id')

// Reply to an email (legacy method)
await inbound.mail.reply({
  emailId: 'email-id',
  to: 'sender@example.com',
  subject: 'Re: Original Subject',
  textBody: 'Thank you for your email!'
})
```

### Reply to Emails

```typescript
// Streamlined reply (new method - recommended)
await inbound.reply(email, "Thanks for your message!")

// Reply with options
await inbound.reply(email, {
  from: 'support@yourdomain.com',
  text: 'Thank you for contacting us!',
  html: '<p>Thank you for contacting us!</p>'
})

// Advanced reply method (via emails.reply)
await inbound.emails.reply('email-id', {
  from: 'support@yourdomain.com',
  to: ['custom@example.com'],
  cc: ['manager@yourdomain.com'],
  subject: 'Custom Reply Subject',
  text: 'Custom reply message',
  include_original: true // Include quoted original message
})
```

### Managing Endpoints

```typescript
// List all endpoints
const endpoints = await inbound.endpoints.list()

// Create a webhook endpoint
const endpoint = await inbound.endpoints.create({
  name: 'My Webhook',
  type: 'webhook',
  description: 'Handles incoming emails',
  config: {
    url: 'https://your-app.com/webhook',
    timeout: 30,
    retryAttempts: 3,
    headers: {
      'Authorization': 'Bearer your-token'
    }
  }
})

// Get endpoint details
const endpoint = await inbound.endpoints.get('endpoint-id')

// Update an endpoint
await inbound.endpoints.update('endpoint-id', {
  name: 'Updated Webhook Name',
  isActive: true
})

// Delete an endpoint
await inbound.endpoints.delete('endpoint-id')
```

### Managing Domains

```typescript
// List all domains
const domains = await inbound.domains.list()

// Create a new domain
const domain = await inbound.domains.create({
  domain: 'mail.yourdomain.com'
})

// Get domain details
const domain = await inbound.domains.get('domain-id')

// Update domain catch-all settings
await inbound.domains.update('domain-id', {
  isCatchAllEnabled: true,
  catchAllEndpointId: 'endpoint-id'
})
```

### Managing Email Addresses

```typescript
// List all email addresses
const addresses = await inbound.emailAddresses.list()

// Create a new email address
const address = await inbound.emailAddresses.create({
  address: 'support@yourdomain.com',
  domainId: 'domain-id',
  endpointId: 'endpoint-id',
  isActive: true
})

// Get email address details
const address = await inbound.emailAddresses.get('address-id')

// Update an email address
await inbound.emailAddresses.update('address-id', {
  isActive: false
})

// Delete an email address
await inbound.emailAddresses.delete('address-id')
```

## Error Handling

The SDK throws errors for failed requests. Always wrap your calls in try-catch blocks:

```typescript
try {
  const email = await inbound.emails.send({
    from: 'hello@yourdomain.com',
    to: 'user@example.com',
    subject: 'Hello World',
    text: 'Hello World',
  })
  console.log('Email sent:', email.id)
} catch (error) {
  console.error('Failed to send email:', error.message)
}
```

## Convenience Aliases

The SDK provides several convenience aliases for better developer experience:

```typescript
// These are equivalent
inbound.endpoints === inbound.endpoint
inbound.domains === inbound.domain  
inbound.emailAddresses === inbound.emailAddress
inbound.emails === inbound.email

// Legacy send method
inbound.send === inbound.emails.send

// Streamlined reply method
inbound.reply // Works with webhook emails or email IDs
```

## TypeScript Support

The SDK is written in TypeScript and provides full type definitions:

```typescript
import type { 
  PostEmailsRequest, 
  PostEmailsResponse,
  GetMailResponse,
  InboundWebhookPayload, // For webhook handlers
  InboundEmailConfigExtended // For extended config with defaultReplyFrom
} from '@inboundemail/sdk'

const emailData: PostEmailsRequest = {
  from: 'hello@yourdomain.com',
  to: 'user@example.com',
  subject: 'Hello World',
  text: 'Hello World',
}

const response: PostEmailsResponse = await inbound.emails.send(emailData)
```

## License

MIT 