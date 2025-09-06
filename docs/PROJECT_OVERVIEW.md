# Inbound - Project Overview

## What is Inbound?

**Inbound** is a modern email infrastructure platform designed for developers who need to programmatically handle email communication. It's essentially "email infrastructure that actually works the way you'd want it to" - providing programmable email addresses that automatically process incoming messages and trigger webhooks in your applications.

## Core Value Proposition

**"Stop juggling email providers. Start building."**

Inbound eliminates the complexity of traditional email providers by offering:

- 📨 **Programmable Email Addresses** - Create email addresses that trigger webhooks when receiving emails
- 🔄 **Bidirectional Email** - Both send and receive emails programmatically
- 🎯 **Smart Routing** - Route emails to different endpoints based on recipient
- 📊 **Real-time Analytics** - Track email delivery, open rates, and webhook performance
- 🛡️ **Built-in Security** - Spam filtering, domain verification, and webhook authentication

## How It Works

### 1. Email Reception Flow
```
Incoming Email → AWS SES → Lambda Processing → Webhook to Your App
```

1. **Email arrives** at your custom domain (e.g., support@yourdomain.com)
2. **AWS SES receives** the email and triggers a Lambda function  
3. **Lambda processes** the email (parsing, security checks, storage)
4. **Webhook fires** to your application with structured email data
5. **Your app responds** - could auto-reply, create tickets, process orders, etc.

### 2. Email Sending Flow
```
Your App → Inbound API → Email Service → Recipient
```

- Send transactional emails via API
- Reply to received emails contextually
- Track delivery status and analytics

## Key Features

### 📧 Email Management
- **Domain Management**: Add and verify custom domains
- **Email Addresses**: Create programmable email addresses with webhook endpoints
- **Email Parsing**: Automatic extraction of text, HTML, attachments
- **DMARC Handling**: Special handling for DMARC reports

### 🔗 Webhook System
- **Flexible Endpoints**: HTTP webhooks, database storage, or custom processing
- **Retry Logic**: Automatic retry with exponential backoff
- **Signature Verification**: Secure webhook authentication
- **Delivery Tracking**: Monitor webhook success/failure rates

### 📊 Analytics & Monitoring
- **Email Volume Tracking**: Monitor incoming/outgoing email counts
- **Delivery Analytics**: Track webhook delivery success rates
- **Domain Statistics**: Per-domain email volume and performance
- **Real-time Dashboard**: Visual insights into email processing

### 🔒 Security & Reliability
- **Spam Filtering**: Built-in spam and virus protection via AWS SES
- **Domain Verification**: DNS-based domain ownership verification  
- **Blocklist Management**: Block unwanted senders automatically
- **Rate Limiting**: Protect against email flooding

### 🛠️ Developer Experience
- **TypeScript SDK**: Fully typed SDK for easy integration
- **OpenAPI Spec**: RESTful API with complete documentation
- **Local Development**: Test webhook endpoints locally without AWS
- **Server Actions**: Type-safe server-side operations

## Architecture

### Tech Stack
- **Frontend**: Next.js 15 + React 19 with TypeScript
- **Backend**: Next.js API Routes + Server Actions
- **Database**: PostgreSQL with Drizzle ORM
- **Email Processing**: AWS Lambda + SES
- **Storage**: AWS S3 for email attachments
- **Authentication**: Better Auth with session management
- **Payments**: Stripe integration for billing
- **Analytics**: Vercel Analytics + Dub Analytics
- **Monitoring**: Sentry for error tracking

### Key Components

#### AWS Infrastructure (`aws/`)
- **CDK Stack**: Infrastructure as Code for AWS resources
- **Lambda Functions**: Email processing and webhook delivery
- **SES Configuration**: Email receiving and sending setup

#### Core Features (`features/`)
- **Domains**: Domain management and verification
- **Webhooks**: Webhook configuration and delivery tracking  
- **Analytics**: Email and webhook performance metrics
- **Endpoints**: Modern replacement for simple webhooks
- **VIP**: Premium features for enterprise customers

#### Database Schema (`lib/db/schema.ts`)
- **Structured Emails**: Modern email storage with better typing
- **Domain Management**: Custom domain configuration
- **Webhook Tracking**: Delivery attempts and success rates
- **User Management**: Authentication and billing integration
- **Analytics Tables**: Email volume and performance metrics

## Use Cases

### 1. Customer Support
```javascript
// Auto-route support emails and create tickets
if (email.to.includes('support@')) {
  await createSupportTicket(email)
  await sendAutoReply(email, 'Ticket created!')
}
```

### 2. Order Processing
```javascript
// Process order confirmations from suppliers
if (email.subject.includes('Order Confirmed')) {
  const orderData = parseOrderEmail(email.content)
  await updateInventory(orderData)
}
```

### 3. Lead Management
```javascript
// Capture leads from contact forms
if (email.to === 'leads@company.com') {
  await createLead(email.from, email.content)
  await sendToSalesTeam(email)
}
```

### 4. Notification Processing
```javascript
// Process system alerts and notifications
if (email.from.includes('alerts@')) {
  await processSystemAlert(email.content)
  await notifyOncallTeam(email)
}
```

## Recent Development Focus

### Migration to Structured Emails
The project is currently migrating from deprecated `receivedEmails` and `parsedEmails` tables to a new `structuredEmails` table with:
- Better type safety
- Cleaner data structure  
- Improved performance
- Enhanced querying capabilities

### V2 API Development
Building a comprehensive V2 API with:
- Unified endpoint structure
- Better error handling
- Improved type definitions
- OpenAPI documentation

### Features Architecture
Implementing a feature-based architecture following React Query best practices:
- Modular feature organization
- Custom hooks for data fetching
- Server actions integration
- Consistent query patterns

## Getting Started

### For Users
1. **Sign up** at inbound.new
2. **Add your domain** and verify DNS records
3. **Create email addresses** with webhook endpoints
4. **Install the SDK** and start receiving emails

### For Development
1. **Clone the repository**
2. **Install dependencies**: `bun install`
3. **Set up environment**: Copy `.env.example` to `.env.local`
4. **Run development server**: `bun run dev`
5. **Test locally**: `bun run inbound-webhook-test test@domain.com`

## Business Model

- **Freemium**: Basic email processing included
- **Usage-based**: Scale pricing based on email volume
- **Enterprise**: Custom domains, SLA, dedicated support
- **VIP Program**: Bring-your-own-key Stripe integration

## Why Inbound Exists

Traditional email providers are built for marketing, not developers. They focus on:
- ❌ Bulk sending capabilities
- ❌ Template editors and campaign management
- ❌ Marketing analytics and A/B testing

Inbound focuses on what developers actually need:
- ✅ Reliable email reception and parsing
- ✅ Webhook-driven architecture
- ✅ Programmatic email handling
- ✅ Real-time processing capabilities
- ✅ Developer-friendly APIs and tooling

---

*This project represents a complete rethinking of how email infrastructure should work for modern applications - making email as programmable and reliable as any other API service.*