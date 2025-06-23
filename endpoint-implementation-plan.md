# Endpoints System Implementation Plan

## 🚀 IMPLEMENTATION CHECKLIST

### **IMPLEMENTATION PROMPT FOR AI ASSISTANT:**
> You are implementing an "endpoints" system that extends webhook functionality to support email forwarding. The system allows users to create three types of endpoints: webhooks (existing), email forwards (single recipient), and email groups (multiple recipients). You must maintain 100% backward compatibility with existing webhooks while adding new functionality. Follow the project's established patterns: use Drizzle schema with `$inferSelect`/`$inferInsert`, organize types in `features/` directory, use server actions in `app/actions/`, and leverage the existing `structuredEmails` table and verified domain system. The email forwarding uses AWS SES `SendRawEmailCommand` to maintain proper email headers and threading.

---

### **PHASE 1: DATABASE SCHEMA & MIGRATIONS** 
**Status: 🟡 In Progress**

#### Database Schema Updates
- [x] **1.1** Add `endpoints` table to `lib/db/schema.ts`
  - [x] Use proper Drizzle `pgTable` syntax
  - [x] Include all fields: id, name, type, config, isActive, description, userId, timestamps
  - [x] Add proper type exports (`typeof endpoints.$inferSelect`)
  
- [x] **1.2** Add `emailGroups` table to `lib/db/schema.ts`
  - [x] Link to endpoints via `endpointId`
  - [x] Store individual email addresses for groups
  
- [x] **1.3** Add `endpointDeliveries` table to `lib/db/schema.ts` 
  - [x] Track deliveries for all endpoint types (webhook + email)
  - [x] Include delivery type, status, attempts, response data
  
- [x] **1.4** Update `emailAddresses` table
  - [x] Add `endpointId` column (nullable for backward compatibility)
  - [x] Keep existing `webhookId` column during transition

#### Migration Scripts
- [ ] **1.5** Create Drizzle migration files
  - [ ] Generate migration: `bun run drizzle-kit generate:pg`
  - [ ] Review generated SQL before applying
  
- [ ] **1.6** Create data migration script
  - [ ] Migrate existing webhooks to endpoints table
  - [ ] Set type='webhook' for all existing webhooks
  - [ ] Map webhook config to endpoint config JSON
  - [ ] Test with existing data (backup first!)

#### Testing
- [ ] **1.7** Test database changes
  - [ ] Verify all existing webhooks still work
  - [ ] Test new table relationships
  - [ ] Confirm no data loss

**Notes:**
- Backup database before running migrations
- Test migrations on development environment first
- Keep `webhookId` references for backward compatibility

---

### **PHASE 2: TYPE DEFINITIONS & FEATURES STRUCTURE**
**Status: 🔴 Not Started**

#### Type System Setup
- [ ] **2.1** Create `features/endpoints/types/index.ts`
  - [ ] Import schema tables: `endpoints`, `emailGroups`, `endpointDeliveries`
  - [ ] Export database types using `$inferSelect`/`$inferInsert`
  - [ ] Define config types: `WebhookConfig`, `EmailForwardConfig`, `EmailGroupConfig`
  - [ ] Define action types: `CreateEndpointData`, `UpdateEndpointData`

- [ ] **2.2** Create `features/endpoints/hooks/` directory structure
  - [ ] `index.ts` - Export all hooks
  - [ ] `useEndpointsQuery.ts` - Fetch user endpoints
  - [ ] `useCreateEndpointMutation.ts` - Create new endpoints
  - [ ] `useUpdateEndpointMutation.ts` - Update endpoints
  - [ ] `useDeleteEndpointMutation.ts` - Delete endpoints
  - [ ] `useTestEndpointMutation.ts` - Test endpoint functionality

#### React Query Integration  
- [ ] **2.3** Follow existing patterns from `features/webhooks/hooks/`
  - [ ] Use same error handling patterns
  - [ ] Include proper TypeScript types
  - [ ] Add optimistic updates where appropriate

**Notes:**
- Follow exact patterns from `features/webhooks/types/index.ts`
- Use consistent naming conventions
- Ensure all types are properly exported

---

### **PHASE 3: CORE SERVICES & EMAIL ROUTING**
**Status: 🔴 Not Started**

#### Email Router Implementation
- [ ] **3.1** Create `lib/email-router.ts`
  - [ ] `routeEmail(emailId: string)` - Main routing function
  - [ ] `findEndpointForEmail(recipient: string)` - Find endpoint for email
  - [ ] `handleWebhookEndpoint()` - Use existing webhook logic
  - [ ] `handleEmailForwardEndpoint()` - New email forwarding logic
  - [ ] `trackEndpointDelivery()` - Track all delivery attempts

- [ ] **3.2** Create `lib/email-forwarder.ts`
  - [ ] `EmailForwarder` class with SES integration
  - [ ] `forwardEmail()` method using `SendRawEmailCommand`
  - [ ] `buildRawEmailMessage()` - RFC 2822 compliant email construction
  - [ ] Proper MIME handling for text/HTML/attachments
  - [ ] Header preservation (Reply-To, Message-ID, References)

#### Integration with Existing System
- [ ] **3.3** Update `app/api/inbound/webhook/route.ts`
  - [ ] Replace direct webhook calls with `routeEmail()`
  - [ ] Maintain existing `triggerEmailAction()` for backward compatibility
  - [ ] Add endpoint routing logic
  - [ ] Ensure no breaking changes

- [ ] **3.4** Helper Functions
  - [ ] `getEmailWithStructuredData()` - Fetch email with structured data
  - [ ] `reconstructParsedEmailData()` - Convert DB data to ParsedEmailData
  - [ ] `getDefaultFromAddress()` - Get verified domain email for sending

#### Testing
- [ ] **3.5** Test email forwarding
  - [ ] Test single email forwarding
  - [ ] Test email group forwarding  
  - [ ] Test header preservation
  - [ ] Test with different email formats (text, HTML, attachments)
  - [ ] Verify Reply-To functionality

**Notes:**
- Use existing `structuredEmails` table (not deprecated ones)
- Leverage verified domains from `emailDomains` table
- Maintain email threading with proper headers
- Handle SES rate limits and error responses

---

### **PHASE 4: API LAYER & SERVER ACTIONS**
**Status: 🔴 Not Started**

#### New Endpoints API
- [ ] **4.1** Create `app/api/v1/endpoints/route.ts`
  - [ ] GET - List user endpoints
  - [ ] POST - Create new endpoint
  - [ ] Follow existing auth patterns from webhook APIs
  - [ ] Proper error handling and validation

- [ ] **4.2** Create `app/api/v1/endpoints/[id]/route.ts`
  - [ ] GET - Get specific endpoint
  - [ ] PUT - Update endpoint
  - [ ] DELETE - Delete endpoint
  - [ ] Include delivery history

#### Server Actions
- [ ] **4.3** Create `app/actions/endpoints.ts`
  - [ ] `createEndpoint(data: CreateEndpointData)`
  - [ ] `updateEndpoint(id: string, data: UpdateEndpointData)`
  - [ ] `deleteEndpoint(id: string)`
  - [ ] `testEndpoint(id: string)` - Test endpoint functionality
  - [ ] `getEndpointDeliveries(id: string)` - Get delivery history

- [ ] **4.4** Email Group Management
  - [ ] `addEmailToGroup(endpointId: string, email: string)`
  - [ ] `removeEmailFromGroup(endpointId: string, email: string)`
  - [ ] `updateEmailGroup(endpointId: string, emails: string[])`

#### Backward Compatibility
- [ ] **4.5** Webhook API Compatibility Layer
  - [ ] Keep existing `/api/v1/webhooks` working
  - [ ] Map webhook operations to endpoint operations
  - [ ] Add deprecation notices (but don't break)

**Notes:**
- Follow auth patterns from `app/actions/primary.ts`
- Use same error handling and validation
- Maintain session checking consistency

---

### **PHASE 5: USER INTERFACE & COMPONENTS**
**Status: 🔴 Not Started**

#### Endpoints Management Page
- [ ] **5.1** Create `app/(main)/endpoints/page.tsx`
  - [ ] Replace or extend existing webhooks page
  - [ ] List all endpoint types in unified interface
  - [ ] Add endpoint type filter/tabs
  - [ ] Show delivery statistics

- [ ] **5.2** Create endpoint management components
  - [ ] `components/endpoints/CreateEndpointDialog.tsx`
  - [ ] `components/endpoints/EditEndpointDialog.tsx`
  - [ ] `components/endpoints/DeleteEndpointDialog.tsx`
  - [ ] `components/endpoints/TestEndpointDialog.tsx`
  - [ ] `components/endpoints/EndpointTypeSelector.tsx`

#### Endpoint Configuration Forms
- [ ] **5.3** Type-specific configuration forms
  - [ ] Webhook config form (reuse existing)
  - [ ] Email forward config form (single recipient)
  - [ ] Email group config form (multiple recipients)
  - [ ] Verified domain selector for email endpoints

- [ ] **5.4** Email Address Configuration Updates
  - [ ] Update email setup flow to use endpoints
  - [ ] Add endpoint selection dropdown
  - [ ] Maintain backward compatibility with webhook selection

#### UI Components
- [ ] **5.5** Reusable components following existing patterns
  - [ ] Use same styling as webhook components
  - [ ] Maintain consistent icons (react-icons/hi)
  - [ ] Follow Tailwind patterns from existing components
  - [ ] Proper loading states and error handling

**Notes:**
- Follow existing component patterns from `components/webhooks/`
- Use consistent styling and interactions
- Maintain accessibility standards
- Test on mobile and desktop

---

### **PHASE 6: TESTING & DOCUMENTATION**
**Status: 🔴 Not Started**

#### Integration Testing
- [ ] **6.1** End-to-end testing
  - [ ] Test complete email flow: SES → Lambda → API → Endpoint routing
  - [ ] Test all endpoint types with real emails
  - [ ] Test backward compatibility (existing webhooks)
  - [ ] Test error scenarios and recovery

- [ ] **6.2** Performance Testing
  - [ ] Test with high email volume
  - [ ] Monitor SES rate limits
  - [ ] Test concurrent endpoint processing
  - [ ] Memory usage and optimization

#### Documentation Updates
- [ ] **6.3** Update API documentation
  - [ ] Document new endpoints API
  - [ ] Update webhook API with deprecation notices
  - [ ] Add code examples for all endpoint types

- [ ] **6.4** User Documentation
  - [ ] Migration guide for existing webhook users
  - [ ] Setup guide for email forwarding
  - [ ] Email group management guide
  - [ ] Troubleshooting guide

#### Final Validation
- [ ] **6.5** Pre-deployment checklist
  - [ ] All existing functionality works unchanged
  - [ ] New features work as specified
  - [ ] No performance regression
  - [ ] Documentation is complete
  - [ ] Error handling is comprehensive

**Notes:**
- Test in production-like environment
- Monitor SES usage and costs
- Validate email deliverability
- Check spam folder delivery

---

### **DEPLOYMENT & MONITORING**
**Status: 🔴 Not Started**

#### Deployment Strategy
- [ ] **7.1** Gradual rollout
  - [ ] Deploy database changes first
  - [ ] Deploy backend changes
  - [ ] Deploy frontend changes
  - [ ] Monitor each stage

- [ ] **7.2** Monitoring Setup
  - [ ] Track endpoint delivery success rates
  - [ ] Monitor SES usage and quotas
  - [ ] Set up alerts for failures
  - [ ] Track user adoption of new features

#### Post-Deployment
- [ ] **7.3** User Communication
  - [ ] Announce new features
  - [ ] Provide migration assistance
  - [ ] Collect user feedback
  - [ ] Iterate based on usage patterns

**Notes:**
- Have rollback plan ready
- Monitor error rates closely
- Be prepared for user support questions

---

## Overview

This plan outlines the implementation of an "endpoints" system that will extend the current webhook functionality to support multiple endpoint types:
- **Webhooks** (existing functionality)
- **Email addresses** (forward to single email)
- **Email groups** (forward to multiple emails)

## Current Architecture Analysis

### Database Schema
- **webhooks table**: Stores webhook configurations ✅
- **emailAddresses table**: Maps email addresses to domains and webhooks ✅
- **emailDomains table**: Stores verified domains ✅
- **structuredEmails table**: Stores parsed email data (preferred over deprecated receivedEmails/parsedEmails) ✅
- **webhookDeliveries table**: Tracks webhook delivery attempts ✅

### Email Processing Flow
1. Email arrives at SES → stored in S3 ✅
2. Lambda function fetches email from S3 ✅
3. Lambda sends webhook to `/api/inbound/webhook/route.ts` ✅
4. API processes email, stores in database, triggers webhook ✅

### Key Components
- **Lambda**: `aws/cdk/lib/lambda/email-processor.ts` ✅
- **Webhook API**: `app/api/inbound/webhook/route.ts` ✅
- **Email Actions**: `app/actions/primary.ts` ✅
- **AWS SES**: `lib/aws-ses.ts` ✅

## Implementation Plan

### Phase 1: Database Schema Updates

#### 1.1 Create Endpoints Table (Drizzle Schema)
```typescript
// Add to lib/db/schema.ts
export const endpoints = pgTable('endpoints', {
  id: varchar('id', { length: 255 }).primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  type: varchar('type', { length: 50 }).notNull(), // 'webhook', 'email', 'email_group'
  config: text('config').notNull(), // JSON configuration based on type
  isActive: boolean('is_active').default(true),
  description: text('description'),
  userId: varchar('user_id', { length: 255 }).notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});
```

#### 1.2 Create Email Groups Table (Drizzle Schema)
```typescript
// Add to lib/db/schema.ts
export const emailGroups = pgTable('email_groups', {
  id: varchar('id', { length: 255 }).primaryKey(),
  endpointId: varchar('endpoint_id', { length: 255 }).notNull(),
  emailAddress: varchar('email_address', { length: 255 }).notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});
```

#### 1.3 Create Endpoint Deliveries Table (extends webhook deliveries)
```typescript
// Add to lib/db/schema.ts
export const endpointDeliveries = pgTable('endpoint_deliveries', {
  id: varchar('id', { length: 255 }).primaryKey(),
  emailId: varchar('email_id', { length: 255 }),
  endpointId: varchar('endpoint_id', { length: 255 }).notNull(),
  deliveryType: varchar('delivery_type', { length: 50 }).notNull(), // 'webhook', 'email_forward'
  status: varchar('status', { length: 50 }).notNull(), // 'pending', 'success', 'failed'
  attempts: integer('attempts').default(0),
  lastAttemptAt: timestamp('last_attempt_at'),
  responseData: text('response_data'), // JSON response/error data
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});
```

#### 1.4 Migration Strategy for Existing Webhooks
- Create migration to populate endpoints table from existing webhooks
- Update emailAddresses table to reference endpointId instead of webhookId
- Add new column: `endpointId varchar(255)` to emailAddresses table
- Maintain backward compatibility with webhookId column during transition

### Phase 2: Type Definitions

#### 2.1 Endpoint Types (`features/endpoints/types/index.ts`)
```typescript
import { endpoints, emailGroups, endpointDeliveries } from '@/lib/db/schema'

// Database types using Drizzle inference (following project patterns)
export type Endpoint = typeof endpoints.$inferSelect
export type NewEndpoint = typeof endpoints.$inferInsert
export type EmailGroup = typeof emailGroups.$inferSelect
export type NewEmailGroup = typeof emailGroups.$inferInsert
export type EndpointDelivery = typeof endpointDeliveries.$inferSelect
export type NewEndpointDelivery = typeof endpointDeliveries.$inferInsert

// Endpoint configuration types
export type WebhookConfig = {
  url: string
  secret?: string
  headers?: Record<string, string>
  timeout?: number
  retryAttempts?: number
}

export type EmailForwardConfig = {
  forwardTo: string
  includeAttachments?: boolean
  subjectPrefix?: string
  fromAddress?: string // Which verified domain email to send from
}

export type EmailGroupConfig = {
  emails: string[]
  includeAttachments?: boolean
  subjectPrefix?: string
  fromAddress?: string // Which verified domain email to send from
}

// Action types for server actions
export type CreateEndpointData = {
  name: string
  type: 'webhook' | 'email' | 'email_group'
  description?: string
  config: WebhookConfig | EmailForwardConfig | EmailGroupConfig
}

export type UpdateEndpointData = {
  name?: string
  description?: string
  isActive?: boolean
  config?: WebhookConfig | EmailForwardConfig | EmailGroupConfig
}
```

### Phase 3: Core Implementation

#### 3.1 Email Router Function (`lib/email-router.ts`)
```typescript
import { db } from '@/lib/db'
import { structuredEmails, emailAddresses, endpoints, endpointDeliveries } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { triggerEmailAction } from '@/app/api/inbound/webhook/route'
import { EmailForwarder } from './email-forwarder'
import { nanoid } from 'nanoid'
import type { ParsedEmailData } from './email-parser'

export async function routeEmail(emailId: string): Promise<void> {
  console.log(`🎯 routeEmail - Processing email ID: ${emailId}`)

  // Get email with structured data
  const emailData = await getEmailWithStructuredData(emailId)
  if (!emailData) {
    throw new Error('Email not found or missing structured data')
  }

  // Find associated endpoint
  const endpoint = await findEndpointForEmail(emailData.recipient)
  if (!endpoint) {
    throw new Error(`No endpoint configured for ${emailData.recipient}`)
  }

  // Route based on endpoint type
  switch (endpoint.type) {
    case 'webhook':
      await handleWebhookEndpoint(emailId, endpoint)
      break
    case 'email':
    case 'email_group':
      await handleEmailForwardEndpoint(emailId, endpoint, emailData)
      break
    default:
      throw new Error(`Unknown endpoint type: ${endpoint.type}`)
  }
}

async function handleWebhookEndpoint(emailId: string, endpoint: Endpoint): Promise<void> {
  // Use existing webhook logic
  const result = await triggerEmailAction(emailId)
  
  // Track delivery
  await trackEndpointDelivery(emailId, endpoint.id, 'webhook', 
    result.success ? 'success' : 'failed', 
    result.error ? { error: result.error } : undefined
  )
}

async function handleEmailForwardEndpoint(
  emailId: string, 
  endpoint: Endpoint, 
  emailData: any
): Promise<void> {
  const config = JSON.parse(endpoint.config)
  const forwarder = new EmailForwarder()
  
  try {
    const parsedEmailData = reconstructParsedEmailData(emailData)
    const toAddresses = endpoint.type === 'email_group' 
      ? config.emails 
      : [config.forwardTo]
    
    await forwarder.forwardEmail(
      parsedEmailData,
      config.fromAddress || getDefaultFromAddress(emailData.recipient),
      toAddresses,
      {
        subjectPrefix: config.subjectPrefix,
        includeAttachments: config.includeAttachments
      }
    )
    
    await trackEndpointDelivery(emailId, endpoint.id, 'email_forward', 'success')
  } catch (error) {
    await trackEndpointDelivery(emailId, endpoint.id, 'email_forward', 'failed', 
      { error: error instanceof Error ? error.message : 'Unknown error' }
    )
    throw error
  }
}

// Helper functions...
```

#### 3.2 Email Forwarding Service (`lib/email-forwarder.ts`)
```typescript
import { SESClient, SendRawEmailCommand } from '@aws-sdk/client-ses'
import type { ParsedEmailData } from './email-parser'

export class EmailForwarder {
  private sesClient: SESClient

  constructor() {
    this.sesClient = new SESClient({ 
      region: process.env.AWS_REGION || 'us-east-2' 
    })
  }

  async forwardEmail(
    originalEmail: ParsedEmailData,
    fromAddress: string,
    toAddresses: string[],
    options?: {
      subjectPrefix?: string
      includeAttachments?: boolean
    }
  ): Promise<void> {
    // Build email with proper headers
    const subject = options?.subjectPrefix 
      ? `${options.subjectPrefix}${originalEmail.subject || 'No Subject'}`
      : originalEmail.subject || 'No Subject'

    // Create raw email message maintaining original structure
    const rawMessage = this.buildRawEmailMessage({
      from: fromAddress,
      to: toAddresses,
      replyTo: originalEmail.from?.addresses[0]?.address || fromAddress,
      subject,
      originalEmail,
      includeAttachments: options?.includeAttachments ?? true
    })

    const command = new SendRawEmailCommand({
      RawMessage: {
        Data: Buffer.from(rawMessage)
      },
      Source: fromAddress,
      Destinations: toAddresses
    })

    await this.sesClient.send(command)
    console.log(`✅ EmailForwarder - Forwarded email to ${toAddresses.length} recipients`)
  }

  private buildRawEmailMessage(params: {
    from: string
    to: string[]
    replyTo: string
    subject: string
    originalEmail: ParsedEmailData
    includeAttachments: boolean
  }): string {
    // Build RFC 2822 compliant email message
    // This is a simplified version - full implementation would handle MIME properly
    const boundary = `boundary_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    
    let message = [
      `From: ${params.from}`,
      `To: ${params.to.join(', ')}`,
      `Reply-To: ${params.replyTo}`,
      `Subject: ${params.subject}`,
      `Date: ${new Date().toUTCString()}`,
      `MIME-Version: 1.0`,
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      ``,
      `This is a multi-part message in MIME format.`,
      ``,
      `--${boundary}`,
      `Content-Type: text/plain; charset=UTF-8`,
      ``,
      params.originalEmail.textBody || 'No text content',
      ``
    ]

    if (params.originalEmail.htmlBody) {
      message.push(
        `--${boundary}`,
        `Content-Type: text/html; charset=UTF-8`,
        ``,
        params.originalEmail.htmlBody,
        ``
      )
    }

    // Add attachments if requested and available
    if (params.includeAttachments && params.originalEmail.attachments?.length) {
      // Note: This is simplified - full implementation would need to handle
      // attachment content from the original email
      message.push(`--${boundary}--`)
    } else {
      message.push(`--${boundary}--`)
    }

    return message.join('\r\n')
  }
}
```

### Phase 4: API Updates

#### 4.1 Update Webhook Route (`app/api/inbound/webhook/route.ts`)
- Replace direct webhook triggering with router function
- Update `triggerEmailAction` to use new routing system
- Maintain backward compatibility

#### 4.2 New Endpoints API (`app/api/v1/endpoints/route.ts`)
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { headers } from 'next/headers'
import { db } from '@/lib/db'
import { endpoints } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import type { CreateEndpointData, UpdateEndpointData } from '@/features/endpoints/types'

export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userEndpoints = await db
    .select()
    .from(endpoints)
    .where(eq(endpoints.userId, session.user.id))

  return NextResponse.json({ endpoints: userEndpoints })
}

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const data: CreateEndpointData = await request.json()
  
  const newEndpoint = {
    id: nanoid(),
    name: data.name,
    type: data.type,
    config: JSON.stringify(data.config),
    description: data.description || null,
    userId: session.user.id,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date()
  }

  const [createdEndpoint] = await db.insert(endpoints).values(newEndpoint).returning()
  
  return NextResponse.json({ endpoint: createdEndpoint })
}
```

#### 4.3 Server Actions (`app/actions/endpoints.ts`)
```typescript
"use server"

import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { db } from '@/lib/db'
import { endpoints, emailGroups } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import type { CreateEndpointData, UpdateEndpointData } from '@/features/endpoints/types'

export async function createEndpoint(data: CreateEndpointData) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id) {
    return { error: 'Unauthorized' }
  }

  try {
    const newEndpoint = {
      id: nanoid(),
      name: data.name,
      type: data.type,
      config: JSON.stringify(data.config),
      description: data.description || null,
      userId: session.user.id,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    }

    const [createdEndpoint] = await db.insert(endpoints).values(newEndpoint).returning()
    
    // If it's an email group, create the group entries
    if (data.type === 'email_group' && 'emails' in data.config) {
      const groupEntries = data.config.emails.map(email => ({
        id: nanoid(),
        endpointId: createdEndpoint.id,
        emailAddress: email,
        createdAt: new Date()
      }))
      
      await db.insert(emailGroups).values(groupEntries)
    }

    return { success: true, endpoint: createdEndpoint }
  } catch (error) {
    console.error('Error creating endpoint:', error)
    return { error: 'Failed to create endpoint' }
  }
}

// Additional CRUD operations...
```

### Phase 5: UI Updates

#### 5.1 Endpoints Management Page (`app/(main)/endpoints/page.tsx`)
- Replace webhooks page with unified endpoints page
- Support creating all endpoint types with type-specific forms
- Show delivery history for all types
- Maintain familiar UI patterns from existing webhook page

#### 5.2 Email Configuration Updates
- Update email address configuration to select endpoints instead of webhooks
- Add endpoint type selection in email setup flow
- Maintain backward compatibility during transition

### Phase 6: Backward Compatibility

#### 6.1 Webhook Compatibility Layer
- Keep existing webhook APIs functional during transition
- Map webhook operations to endpoint operations automatically
- Provide gradual migration path for existing users

#### 6.2 Database Compatibility
- Maintain webhookId references in emailAddresses table
- Create database views for backward compatibility
- No breaking changes to existing webhook data

## Implementation Steps

### Step 1: Database Migration (Day 1)
1. ✅ Create new Drizzle schema definitions
2. ✅ Generate and run migration for new tables
3. ✅ Create migration script for existing webhooks → endpoints
4. ✅ Test migration with existing data

### Step 2: Core Services (Day 2-3)
1. ✅ Implement EmailForwarder class with proper SES integration
2. ✅ Create email router function with endpoint type handling
3. ✅ Update webhook route to use new routing system
4. ✅ Test email forwarding functionality with verified domains

### Step 3: API Layer (Day 4)
1. ✅ Create endpoints API with full CRUD operations
2. ✅ Update server actions following project patterns
3. ✅ Maintain webhook API compatibility
4. ✅ Test all endpoint types with proper error handling

### Step 4: UI Updates (Day 5)
1. ✅ Create endpoints management interface
2. ✅ Update email configuration flow
3. ✅ Add endpoint type selection with proper validation
4. ✅ Test user flows and accessibility

### Step 5: Testing & Documentation (Day 6)
1. ✅ Integration tests for all endpoint types
2. ✅ Update API documentation using Mintlify
3. ✅ Create migration guide for existing users
4. ✅ Performance testing with SES limits

## Technical Considerations

### Email Forwarding Implementation
1. **Authentication**: Use verified domains from emailDomains table
2. **Headers**: Preserve Message-ID, References for proper threading
3. **Attachments**: Handle MIME multipart messages correctly
4. **Rate Limiting**: Respect SES sending quotas and limits
5. **Bounce Handling**: Implement proper error handling and retry logic

### Security & Validation
1. **Email Validation**: Validate all email addresses using existing patterns
2. **Domain Verification**: Only send from verified domains in emailDomains table
3. **Access Control**: Users can only manage their own endpoints
4. **Config Encryption**: Consider encrypting sensitive endpoint configurations

### Performance Optimizations
1. **Async Processing**: Use existing webhook processing patterns
2. **Batch Operations**: Group operations for email groups efficiently
3. **Caching**: Cache endpoint configurations for faster lookups
4. **Monitoring**: Track success rates and performance metrics

### AWS SES Integration
1. **Verified Domains**: Leverage existing domain verification system
2. **Sending Limits**: Monitor and respect SES sending quotas
3. **Bounce Management**: Handle bounces and complaints properly
4. **Raw Email Format**: Use SendRawEmailCommand for proper forwarding

## Migration Path

### For Existing Users
1. ✅ Existing webhooks continue working unchanged
2. ✅ Webhooks automatically appear as "webhook" type endpoints
3. ✅ Users can gradually adopt new endpoint types
4. ✅ No action required for basic webhook functionality

### API Compatibility
1. ✅ `/api/v1/webhooks` continues working (compatibility layer)
2. ✅ New `/api/v1/endpoints` API for enhanced features
3. ✅ Webhook-specific fields mapped to endpoint config
4. ✅ Gradual deprecation with proper notices

## Success Criteria
1. ✅ All existing webhooks continue functioning without changes
2. ✅ Emails can be forwarded to single addresses using verified domains
3. ✅ Email groups support multiple recipients efficiently
4. ✅ Proper email headers maintained (From, Reply-To, threading)
5. ✅ Delivery tracking for all endpoint types
6. ✅ No breaking changes to existing APIs or user workflows
7. ✅ Performance maintained or improved over current system
8. ✅ Clear migration path with comprehensive documentation

## Key Improvements from Review

### Architecture Alignment
- ✅ Use Drizzle schema patterns (`$inferSelect`, `$inferInsert`)
- ✅ Follow existing type organization in `features/` directory
- ✅ Maintain consistency with current server action patterns
- ✅ Leverage existing `structuredEmails` table (not deprecated ones)

### SES Integration
- ✅ Utilize existing verified domain system
- ✅ Proper email forwarding with `SendRawEmailCommand`
- ✅ Maintain email threading and headers correctly
- ✅ Handle attachments and MIME types properly

### Error Handling
- ✅ Follow existing error handling patterns
- ✅ Proper logging and monitoring integration
- ✅ Graceful fallbacks for failed operations
- ✅ Comprehensive delivery tracking

### User Experience
- ✅ Maintain familiar UI patterns from webhook management
- ✅ Seamless transition for existing users
- ✅ Clear endpoint type selection and configuration
- ✅ Proper validation and error messaging

## Next Steps
1. ✅ Review and approve updated implementation plan
2. ✅ Set up development branch for endpoint system
3. ✅ Begin Phase 1: Database schema updates with Drizzle
4. ✅ Implement core services following project patterns
5. ✅ Test thoroughly with existing email processing flow 