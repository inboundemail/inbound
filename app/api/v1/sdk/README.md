# exon-inbound

Official TypeScript SDK for the Inbound Email API. Easily manage email domains, email addresses, and webhooks programmatically.

## Installation

```bash
npm install exon-inbound
# or
yarn add exon-inbound
# or
pnpm add exon-inbound
# or
bun add exon-inbound
```

## Quick Start

```typescript
import { createInboundClient } from 'exon-inbound'

// Initialize the client
const inbound = createInboundClient({
  apiKey: 'your_api_key_here',
  baseUrl: 'https://your-domain.com/api/v1' // optional, defaults to production
})

// Create an email address
const email = await inbound.createEmail({
  domain: 'example.com',
  email: 'hello@example.com',
  webhookId: 'webhook_123' // optional
})

console.log('Created email:', email.address)
```

## API Reference

### Client Initialization

```typescript
import { InboundClient, createInboundClient } from 'exon-inbound'

// Option 1: Using factory function (recommended)
const inbound = createInboundClient({
  apiKey: 'your_api_key',
  baseUrl: 'https://api.inbound.email/api/v1' // optional
})

// Option 2: Direct instantiation
const inbound = new InboundClient({
  apiKey: 'your_api_key',
  baseUrl: 'https://api.inbound.email/api/v1' // optional
})
```

### Domain Management

#### List Domains

```typescript
const domains = await inbound.listDomains()
// or
const domains = await inbound.getDomains()

console.log(domains)
// [
//   {
//     id: 'indm_abc123',
//     domain: 'example.com',
//     status: 'verified',
//     canReceiveEmails: true,
//     createdAt: '2024-01-01T00:00:00.000Z',
//     updatedAt: '2024-01-01T00:00:00.000Z'
//   }
// ]
```

### Email Address Management

#### Create Email Address

```typescript
// Method 1: Using createEmail
const email = await inbound.createEmail({
  domain: 'example.com',
  email: 'support@example.com',
  webhookId: 'webhook_123' // optional
})

// Method 2: Using convenience method
const email = await inbound.addEmail(
  'example.com',
  'support@example.com',
  'webhook_123' // optional
)

console.log(email)
// {
//   id: 'email_abc123',
//   address: 'support@example.com',
//   domainId: 'indm_abc123',
//   webhookId: 'webhook_123',
//   isActive: true,
//   createdAt: '2024-01-01T00:00:00.000Z'
// }
```

#### List Email Addresses

```typescript
// Method 1: Get full response with domain info
const response = await inbound.listEmails('example.com')
console.log(response.domain) // 'example.com'
console.log(response.emails) // EmailAddress[]

// Method 2: Get just the emails array
const emails = await inbound.getEmails('example.com')
console.log(emails) // EmailAddress[]
```

#### Remove Email Address

```typescript
// Method 1: Using removeEmail
const result = await inbound.removeEmail('example.com', 'support@example.com')

// Method 2: Using convenience method
const result = await inbound.deleteEmail('example.com', 'support@example.com')

console.log(result.message)
// 'Email address support@example.com removed from domain example.com'
```

### Webhook Management

#### Create Webhook

```typescript
// Method 1: Using createWebhook
const webhook = await inbound.createWebhook({
  name: 'My Webhook',
  endpoint: 'https://api.example.com/webhook',
  description: 'Processes incoming emails', // optional
  retry: 3, // optional, defaults to 3
  timeout: 30 // optional, defaults to 30
})

// Method 2: Using convenience method
const webhook = await inbound.addWebhook(
  'My Webhook',
  'https://api.example.com/webhook',
  {
    description: 'Processes incoming emails',
    retry: 3,
    timeout: 30
  }
)

console.log(webhook)
// {
//   id: 'webhook_abc123',
//   name: 'My Webhook',
//   url: 'https://api.example.com/webhook',
//   secret: 'webhook_secret_for_verification',
//   description: 'Processes incoming emails',
//   isActive: true,
//   timeout: 30,
//   retryAttempts: 3,
//   createdAt: '2024-01-01T00:00:00.000Z'
// }
```

#### List Webhooks

```typescript
const webhooks = await inbound.listWebhooks()
// or
const webhooks = await inbound.getWebhooks()

console.log(webhooks)
// [
//   {
//     id: 'webhook_abc123',
//     name: 'My Webhook',
//     url: 'https://api.example.com/webhook',
//     description: 'Processes incoming emails',
//     isActive: true,
//     timeout: 30,
//     retryAttempts: 3,
//     totalDeliveries: 150,
//     successfulDeliveries: 145,
//     failedDeliveries: 5,
//     lastUsed: '2024-01-01T00:00:00.000Z',
//     createdAt: '2024-01-01T00:00:00.000Z',
//     updatedAt: '2024-01-01T00:00:00.000Z'
//   }
// ]
```

#### Remove Webhook

```typescript
// Method 1: Using removeWebhook
const result = await inbound.removeWebhook('My Webhook')

// Method 2: Using convenience method
const result = await inbound.deleteWebhook('My Webhook')

console.log(result.message)
// "Webhook 'My Webhook' has been removed"
```

## Error Handling

The SDK throws `InboundError` for API errors:

```typescript
import { InboundError } from 'exon-inbound'

try {
  const email = await inbound.createEmail({
    domain: 'nonexistent.com',
    email: 'test@nonexistent.com'
  })
} catch (error) {
  if (error instanceof InboundError) {
    console.error('API Error:', error.message)
    console.error('Status:', error.status)
    console.error('Code:', error.code)
  } else {
    console.error('Unexpected error:', error)
  }
}
```

## Complete Example

```typescript
import { createInboundClient, InboundError } from 'exon-inbound'

async function setupEmailInfrastructure() {
  const inbound = createInboundClient({
    apiKey: process.env.INBOUND_API_KEY!
  })

  try {
    // 1. List existing domains
    const domains = await inbound.getDomains()
    console.log('Available domains:', domains.map(d => d.domain))

    // 2. Create a webhook
    const webhook = await inbound.addWebhook(
      'Email Processor',
      'https://api.myapp.com/process-email',
      {
        description: 'Processes all incoming emails',
        timeout: 30,
        retry: 3
      }
    )
    console.log('Created webhook:', webhook.name)
    console.log('Webhook secret:', webhook.secret)

    // 3. Create email addresses
    const emails = [
      'support@example.com',
      'hello@example.com',
      'contact@example.com'
    ]

    for (const emailAddress of emails) {
      const email = await inbound.addEmail(
        'example.com',
        emailAddress,
        webhook.id
      )
      console.log(`Created email: ${email.address}`)
    }

    // 4. List all emails for the domain
    const domainEmails = await inbound.getEmails('example.com')
    console.log(`Total emails for example.com: ${domainEmails.length}`)

    // 5. List all webhooks
    const allWebhooks = await inbound.getWebhooks()
    console.log(`Total webhooks: ${allWebhooks.length}`)

  } catch (error) {
    if (error instanceof InboundError) {
      console.error('Inbound API Error:', error.message)
      if (error.status) {
        console.error('HTTP Status:', error.status)
      }
    } else {
      console.error('Unexpected error:', error)
    }
  }
}

setupEmailInfrastructure()
```

## TypeScript Support

The SDK is written in TypeScript and provides full type safety:

```typescript
import { Domain, EmailAddress, Webhook, InboundClient } from 'exon-inbound'

// All methods return properly typed responses
const domains: Domain[] = await inbound.getDomains()
const emails: EmailAddress[] = await inbound.getEmails('example.com')
const webhooks: Webhook[] = await inbound.getWebhooks()

// Type-safe configuration
const client: InboundClient = createInboundClient({
  apiKey: 'your_key',
  baseUrl: 'https://api.example.com/v1' // optional
})
```

## Environment Variables

For security, store your API key in environment variables:

```bash
# .env
INBOUND_API_KEY=your_api_key_here
```

```typescript
const inbound = createInboundClient({
  apiKey: process.env.INBOUND_API_KEY!
})
```

## API Methods Summary

| Method | Description | Returns |
|--------|-------------|---------|
| `listDomains()` / `getDomains()` | Get all domains | `Domain[]` |
| `createEmail(params)` / `addEmail(domain, email, webhookId?)` | Create email address | `EmailAddress` |
| `listEmails(domain)` | Get emails for domain | `DomainEmailsResponse` |
| `getEmails(domain)` | Get emails array for domain | `EmailAddress[]` |
| `removeEmail(domain, email)` / `deleteEmail(domain, email)` | Remove email address | `{message: string}` |
| `listWebhooks()` / `getWebhooks()` | Get all webhooks | `Webhook[]` |
| `createWebhook(params)` / `addWebhook(name, endpoint, options?)` | Create webhook | `WebhookCreateResponse` |
| `removeWebhook(name)` / `deleteWebhook(name)` | Remove webhook | `{message: string}` |

## Requirements

- Node.js 16.0.0 or higher
- Valid Inbound Email API key

## License

MIT

## Support

For issues and questions:
- GitHub Issues: [https://github.com/your-org/inbound-sdk/issues](https://github.com/your-org/inbound-sdk/issues)
- Documentation: [https://docs.inbound.email](https://docs.inbound.email)
- API Reference: [https://api.inbound.email/v1](https://api.inbound.email/v1) 