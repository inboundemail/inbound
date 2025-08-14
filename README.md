# 📬 Inbound - Email Infrastructure Made Simple
<img width="2912" height="1363" alt="Frame 2" src="https://github.com/user-attachments/assets/a9ca6121-869c-4a00-84fb-24e5c08207bc" />

**Stop juggling email providers. Start building.**

Inbound gives you programmable email addresses that automatically process incoming messages and trigger webhooks in your app. Think of it as email infrastructure that actually works the way you'd want it to.

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

---

**Ready to ditch your email provider? [Get started →](https://inbound.new)**