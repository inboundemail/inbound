# 📬 Inbound - Email Infrastructure Made Simple

**Stop juggling email providers. Start building.**

Inbound gives you programmable email addresses that automatically process incoming messages and trigger webhooks in your app. Think of it as email infrastructure that actually works the way you'd want it to.

## What does it do?

### 📨 **Receive Emails Programmatically**
Create email addresses on-the-fly through our API. When someone sends an email to `support@yourdomain.com`, we'll parse it and instantly webhook your app with the full message content.

```javascript
// Create an email address
const response = await inbound.emailAddresses.create({
  address: "support@yourdomain.com",
  webhookUrl: "https://yourapp.com/handle-email"
})

// When emails arrive, you'll get webhooks like:
{
  "event": "email.received",
  "email": {
    "from": "customer@example.com",
    "subject": "Help with my account",
    "textBody": "I can't log into my account...",
    "htmlBody": "<p>I can't log into my account...</p>",
    "attachments": [...],
    "headers": {...}
  }
}
```

### 🔄 **Email Forwarding**
Forward emails to existing addresses or other services. Perfect for routing customer emails to your team or integrating with external tools.

### 🎯 **Smart Routing**
Route emails based on sender, subject, content, or any custom logic. Send support emails to your helpdesk, billing emails to your finance team, and everything else to a catch-all.

## 🚀 Coming Soon

### 💎 **Inbound VIP**
Pay-per-email premium routing for high-value communications. Skip the noise, get only the emails that matter with smart filtering and priority delivery.

### 🛠️ **Inbound Support**
Built-in ticketing and customer support workflows. Turn any email address into a support center with automatic ticket creation, assignment, and tracking.

### 📧 **ReEmail in SDK**
Send emails directly through the same infrastructure. One API for both sending and receiving emails, with automatic reply-to handling and conversation threading.

## Quick Start

### 1. Get your API key
```bash
# Sign up at inbound.exon.dev and grab your API key
export INBOUND_API_KEY="your-api-key-here"
```

### 2. Add a domain
```bash
curl -X POST "https://inbound.exon.dev/api/v2/domains" \
  -H "Authorization: Bearer $INBOUND_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"domain": "yourdomain.com"}'
```

### 3. Create an email address
```bash
curl -X POST "https://inbound.exon.dev/api/v2/email-addresses" \
  -H "Authorization: Bearer $INBOUND_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "address": "hello@yourdomain.com",
    "webhookUrl": "https://yourapp.com/webhook/email"
  }'
```

### 4. Start receiving emails
Send an email to `hello@yourdomain.com` and watch your webhook fire with the parsed content.

## Local Development

```bash
# Clone and setup
git clone https://github.com/R44VC0RP/inbound
cd inbound
bun install

# Start the dev server
bun run dev

# Test email webhooks locally (no AWS needed)
bun run inbound-webhook-test test@yourdomain.com
```

## SDK Usage

```javascript
import { Inbound } from '@inboundemail/sdk'

const inbound = new Inbound(process.env.INBOUND_API_KEY)

// Create email addresses
const emailAddress = await inbound.emailAddresses.create({
  address: 'support@yourdomain.com',
  webhookUrl: 'https://yourapp.com/handle-support'
})

// List received emails
const emails = await inbound.mail.list()

// Get full email content
const email = await inbound.mail.get(emailId)

// Reply to emails (coming soon with ReEmail)
await inbound.mail.reply(emailId, {
  subject: 'Re: Your support request',
  body: 'Thanks for reaching out...'
})
```

## API Features

- **REST API** with OpenAPI spec
- **Webhooks** with signature verification
- **Email parsing** with HTML/text extraction
- **Attachment handling** with S3 storage
- **Spam filtering** and security checks
- **Domain verification** and DNS management
- **Usage tracking** and billing integration

## Architecture

Built on AWS with SES for email receiving, Lambda for processing, and S3 for storage. The Next.js dashboard gives you full control over your email infrastructure.

```
Email → AWS SES → Lambda → Your Webhook
                     ↓
               Dashboard & API
```

## Deployment

For production deployments, check out our [deployment guide](docs/DEPLOYMENT_GUIDE.md). We handle all the AWS infrastructure setup automatically.

```bash
# Deploy to your own AWS account
bun run deploy:quick
```

## Contributing

We're building email infrastructure that doesn't suck. Want to help?

1. Fork the repo
2. Make your changes
3. Test with `bun run inbound-webhook-test`
4. Submit a pull request

---

**Ready to ditch your email provider? [Get started →](https://inbound.exon.dev)**
