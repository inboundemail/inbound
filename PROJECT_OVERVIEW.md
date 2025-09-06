# Inbound - Project Overview

## What is Inbound?

**Inbound** is an email infrastructure platform that makes email handling as simple as making API calls. It's designed for developers who are tired of dealing with email complexity and want a unified solution for both sending and receiving emails.

## The Problem We Solve

Developers typically spend weeks implementing email functionality:
- Configuring SMTP servers and dealing with authentication
- Parsing raw email headers and MIME content
- Building webhook endpoints for incoming emails
- Handling email threading and conversation management  
- Managing deliverability and spam filtering
- Scaling email infrastructure

## Our Solution

Inbound provides a simple TypeScript SDK that handles all email infrastructure:

### 🚀 Send Emails
```javascript
await inbound.emails.send({
  from: 'hello@yourdomain.com',
  to: 'user@example.com', 
  subject: 'Welcome!',
  html: '<p>Thanks for signing up!</p>'
})
```

### 📬 Receive Emails as Webhooks
```javascript
export async function POST(request: NextRequest) {
  const { email } = await request.json()
  
  // Email is already parsed and structured
  console.log(email.subject, email.html, email.attachments)
  
  return NextResponse.json({ success: true })
}
```

### 💬 Reply with Threading
```javascript
await inbound.reply(email, {
  from: 'support@yourdomain.com',
  text: 'Thanks for your message!',
  tags: [{ name: 'type', value: 'auto-reply' }]
})
```

## Key Features

- **No Configuration Required**: Skip SMTP setup, DNS headaches, and complex authentication
- **Webhook-First**: Turn any email address into a webhook endpoint that receives structured JSON
- **TypeScript Native**: Full type safety with IntelliSense support
- **Auto-Threading**: Automatic conversation management and reply threading
- **Production Ready**: Built to handle 10k-10M emails/day with the same simple API
- **AI Agent Friendly**: Perfect for building automated email responses and customer support bots

## Who Uses Inbound?

- **SaaS Developers**: Adding email notifications, support systems, and user communication
- **AI/Bot Builders**: Creating intelligent email agents that can read and respond to emails
- **Startups**: Rapid email integration without infrastructure overhead  
- **Enterprise Teams**: Replacing complex email provider combinations with one unified API

## Technical Architecture

- **Frontend**: Next.js 15 with React 19, TanStack Query, Tailwind CSS
- **Backend**: TypeScript with Drizzle ORM, unified v2 API
- **Infrastructure**: AWS SES, Lambda, S3, CloudWatch
- **Database**: PostgreSQL with structured email schema
- **SDK**: Published as `@inboundemail/sdk` on npm

## Getting Started

1. **Install SDK**: `bun add @inboundemail/sdk`
2. **Get API Key**: Sign up at [inbound.new](https://inbound.new)  
3. **Add Domain**: Configure your sending domain
4. **Create Email Address**: Set up webhook endpoints
5. **Start Building**: Send, receive, and reply to emails

## Business Model

- **Freemium**: Generous free tier for getting started
- **Usage-Based**: Pay for what you use as you scale
- **Enterprise**: Custom solutions for high-volume users

## Competitive Advantage

Unlike traditional email providers (SendGrid, Mailgun, etc.) that only handle **sending** emails, Inbound provides a complete email infrastructure that handles both sending AND receiving emails through webhooks. This makes it uniquely suited for:

- Building email-based applications and workflows
- Creating AI agents that interact via email
- Automating customer support and responses
- Processing inbound lead generation emails

## Open Source

Inbound is built in the open with contributions welcome. The codebase demonstrates modern development practices and can serve as a reference for email infrastructure implementation.

---

**TL;DR**: Inbound turns email into a simple API. Send emails like Resend, receive emails as webhooks, reply with perfect threading. Built for developers who want to focus on their product, not email infrastructure.