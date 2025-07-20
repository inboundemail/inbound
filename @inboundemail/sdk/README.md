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

## API Reference

### Initialization

```typescript
// With API key only (recommended)
const inbound = new Inbound('your-api-key')

// With configuration object
const inbound = new Inbound({
  apiKey: 'your-api-key',
  baseUrl: 'https://api.inbound.email/api/v2' // optional
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
// Reply to an email with automatic recipient and subject
await inbound.emails.reply('email-id', {
  from: 'support@yourdomain.com',
  text: 'Thank you for contacting us!',
  html: '<p>Thank you for contacting us!</p>'
})

// Reply with custom recipients and subject
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
```

## TypeScript Support

The SDK is written in TypeScript and provides full type definitions:

```typescript
import type { 
  PostEmailsRequest, 
  PostEmailsResponse,
  GetMailResponse 
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