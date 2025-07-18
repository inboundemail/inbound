# @inboundemail/sdk

Official TypeScript/JavaScript SDK for the Inbound Email API.

## Installation

```bash
npm install @inboundemail/sdk
```

## Quick Start

```typescript
import { InboundEmailClient } from '@inboundemail/sdk'

const client = new InboundEmailClient({
  apiKey: 'your-api-key-here'
})

// Example usage
const emails = await client.mail.list()
console.log(emails)
```

## Features

- 📧 **Email Management** - List, retrieve, and reply to emails
- 🔗 **Endpoint Management** - Create and manage webhook endpoints
- 🏷️ **Email Address Management** - Create and manage email addresses
- 🌐 **Domain Management** - Add and verify domains
- 📊 **Analytics** - Access email analytics and stats
- 🔒 **Type Safety** - Full TypeScript support with comprehensive type definitions

## API Reference

### Authentication

All API requests require authentication using your API key:

```typescript
const client = new InboundEmailClient({
  apiKey: 'your-api-key-here',
  baseUrl: 'https://api.inbound.email' // optional, defaults to production
})
```

### Methods

Coming soon...

## Development

This SDK is built with TypeScript and uses modern tooling:

- **TypeScript** - Full type safety
- **tsup** - Fast bundling
- **Vitest** - Testing framework
- **ESLint** - Code linting

## License

MIT License - see LICENSE file for details.

## Support

- 📖 [Documentation](https://docs.inbound.email)
- 💬 [Discord Community](https://discord.gg/inbound)
- 🐛 [Report Issues](https://github.com/inboundemail/sdk/issues) 