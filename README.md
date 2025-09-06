# 📬 Inbound - Email Infrastructure Made Simple
<img width="2912" height="1363" alt="Frame 2" src="https://github.com/user-attachments/assets/a9ca6121-869c-4a00-84fb-24e5c08207bc" />

## What is Inbound?

**Inbound is an email infrastructure platform that makes email handling as simple as making API calls.**

Instead of juggling multiple email providers, configuring SMTP servers, and parsing raw email content, Inbound provides a unified TypeScript SDK that handles both sending and receiving emails through webhooks.

**Perfect for:**
- 🤖 Building AI email agents and automated responses
- 📧 Adding email functionality to your SaaS application  
- 🔗 Processing inbound emails as structured webhook data
- ⚡ Rapid email integration without infrastructure overhead

**Stop juggling email providers. Start building.**

<a href="https://vercel.com/oss?utm_source=inbound&utm_medium=referral&utm_campaign=oss">
  <img alt="Vercel OSS Program" src="https://vercel.com/oss/program-badge.svg" />
</a>

## What does it do?

### 📨 **Send & Receive Emails Programmatically**

#### Sending Emails

```javascript
import { Inbound } from '@inboundemail/sdk'

const inbound = new Inbound(process.env.INBOUND_API_KEY!)

const email = await inbound.emails.send({
  from: 'Inbound User <hello@yourdomain.com>',
  to: 'user@example.com',
  subject: 'Welcome!',
  html: '<p>Thanks for signing up!</p>',
  tags: [{ name: 'campaign', value: 'welcome' }]
})

console.log(`Email sent: ${email.id}`)
```

#### Receiving & Replying to Emails

```javascript
import { Inbound, type InboundWebhookPayload, isInboundWebhook } from '@inboundemail/sdk'
import { NextRequest, NextResponse } from 'next/server'

const inbound = new Inbound(process.env.INBOUND_API_KEY!)

export async function POST(request: NextRequest) {
  try {
    const payload: InboundWebhookPayload = await request.json()
    
    // Verify this is a valid Inbound webhook
    if (!isInboundWebhook(payload)) {
      return NextResponse.json({ error: 'Invalid webhook' }, { status: 400 })
    }
    
    const { email } = payload
    console.log(`📧 Received email: ${email.subject} from ${email.from?.addresses?.[0]?.address}`)
    
    // Auto-reply to support emails
    if (email.subject?.toLowerCase().includes('support')) {
      await inbound.reply(email, {
        from: 'support@yourdomain.com',
        text: 'Thanks for contacting support! We\'ll get back to you within 24 hours.',
        tags: [{ name: 'type', value: 'auto-reply' }]
      })
    }
    
    // Auto-reply to thank you emails
    if (email.subject?.toLowerCase().includes('thanks')) {
      await inbound.reply(email, {
        from: 'hello@yourdomain.com',
        html: '<p>You\'re welcome! Let us know if you need anything else.</p>'
      })
    }
    
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Webhook error:', error)
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 })
  }
}
```

## Quick Start

### 1. Install the SDK
```bash
npm install @inboundemail/sdk
# or
bun add @inboundemail/sdk
```

### 2. Initialize with your API key
```javascript
import { Inbound } from '@inboundemail/sdk'

// Get your API key from inbound.new
const inbound = new Inbound(process.env.INBOUND_API_KEY)
```

### 3. Add a domain
```javascript
const domain = await inbound.domains.create({
  domain: "yourdomain.com"
})

console.log("Domain added:", domain.domain)
```

### 4. Create an email address
```javascript
const emailAddress = await inbound.emailAddresses.create({
  address: "hello@yourdomain.com",
  webhookUrl: "https://yourapp.com/webhook/email"
})

console.log("Email address created:", emailAddress.address)
```

### 5. Start receiving emails
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

## API Features

- **REST API** with OpenAPI spec
- **Webhooks** with signature verification
- **Email parsing** with HTML/text extraction
- **Attachment handling** with S3 storage
- **Spam filtering** and security checks
- **Domain verification** and DNS management
- **Usage tracking** and billing integration


## Contributing

We're building email infrastructure that doesn't suck. Want to help?

1. Fork the repo
2. Make your changes
3. Test with `bun run inbound-webhook-test`
4. Submit a pull request

## Frequently Asked Questions

### What is the purpose of this project?

Inbound solves the email infrastructure problem that every developer faces. Instead of spending weeks configuring SMTP servers, parsing email headers, and building webhook endpoints, you get a simple API that handles both sending and receiving emails. Think of it as "Stripe for email" - it just works.

### How is this different from SendGrid/Mailgun/Resend?

Traditional email providers only handle **sending** emails. Inbound handles both sending AND receiving emails as structured webhook data. This makes it perfect for building email-based applications, AI agents, and automated workflows.

### Who should use Inbound?

- **SaaS developers** adding email functionality to their apps
- **AI/bot builders** creating email-based automation
- **Startups** needing rapid email integration
- **Anyone tired of email infrastructure complexity**

### Is this production ready?

Yes! Inbound is built on AWS infrastructure (SES, Lambda, S3) and handles everything from deliverability to spam filtering. It's designed to scale from 10 emails/day to 10M emails/day with the same simple API.

### Can I self-host this?

While the codebase is open source, Inbound is designed as a managed service to handle the complexity of email infrastructure, DNS management, and deliverability. However, you can explore the code to understand how modern email systems work.

---

**Ready to ditch your email provider? [Get started →](https://inbound.new)**