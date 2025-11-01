# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Inbound is an email infrastructure platform that provides programmable email addresses for sending and receiving emails via API. Built with Next.js 15, AWS SES, Lambda, and Drizzle ORM.

**Official URLs:**
- Website: https://inbound.new
- API: https://inbound.new/api/v2
- Docs: https://docs.inbound.new
- SDK: @inboundemail/sdk

## Common Development Commands

**Package Manager:** Only use `bun` (never npm/yarn/pnpm)

### Development
```bash
bun run dev              # Start dev server with basehub & Next.js (requires approval)
bun run dev:basehub      # Start basehub dev server only
```

### Building & Type Checking
```bash
bun run build            # Build for production (requires approval)
bun run check            # Type check without emitting files
bun run lint             # Run Next.js linter
```

### Testing
```bash
bun run test-api         # Run v2 API tests
bun run test-sdk         # Run SDK tests
bun test <file>          # Run single test file (e.g., bun test app/api/v2/testing.test.ts)
```

### Database
```bash
bun run db-prepare       # Prepare database schema
# Note: NEVER run drizzle-kit generate/push directly - ask user to run it manually
```

### AWS Deployment
```bash
bun run deploy:quick     # Fast deployment for testing
bun run deploy:email     # Full deployment with validation
bun run deploy:lambda    # Lambda-only deployment
bun run deploy:cdk       # CDK infrastructure deployment
bun run test:deployment  # Verify deployment
```

## Architecture & Code Organization

### Tech Stack
- **Frontend:** Next.js 15 (App Router), React 19, TanStack Query, Radix UI, Tailwind CSS, Framer Motion
- **Backend:** Next.js API routes, Better Auth (authentication)
- **Database:** PostgreSQL with Drizzle ORM
- **AWS:** SES (email), Lambda (processing), S3 (attachments), CloudWatch (logging)
- **Infrastructure:** AWS CDK for IaC

### Directory Structure
```
app/                    # Next.js app directory
├── api/
│   └── v2/            # v2 REST API endpoints (primary API)
│       ├── domains/
│       ├── email-addresses/
│       ├── emails/
│       ├── endpoints/
│       ├── helper/    # Auth validation (validateRequest)
│       └── mail/      # Email threading
lib/                   # Shared utilities and core logic
├── auth/             # Better Auth configuration
├── aws-ses/          # AWS SES integration
├── db/               # Database schema and config
│   ├── schema.ts    # Main database schema
│   └── auth-schema.ts
├── domains-and-dns/  # Domain verification & DNS
├── email-management/ # Email parsing, routing, threading
└── webhooks/         # Webhook handling
features/             # Domain-specific business logic
components/           # React components
scripts/              # Deployment and utility scripts
aws/cdk/             # AWS CDK infrastructure
lambda/              # AWS Lambda functions
emails/              # Email templates (React Email)
```

### Database Schema

**Primary email table:** `structuredEmails` (use this, NOT deprecated `receivedEmails` or `parsedEmails`)

**Key tables:**
- `user`, `session`, `account`, `apikey` - Auth (Better Auth)
- `sesTenants` - AWS SES tenant isolation (1:1 with users)
- `emailDomains` - Verified domains for sending/receiving
- `emailAddresses` - Individual email addresses with webhooks
- `structuredEmails` - Received/sent emails (primary)
- `emailThreads` - Email conversation threading
- `subscriptions` - Stripe billing

**Always:**
- Scope queries by `userId` for multi-tenant safety
- Use Drizzle ORM (never raw SQL)
- Import from `@/lib/db/schema`

## API Patterns (v2)

All v2 API endpoints follow consistent patterns:

### Authentication
```typescript
import { validateRequest } from '../helper/main'

const { userId, error } = await validateRequest(request)
if (!userId) {
  return NextResponse.json({ error }, { status: 401 })
}
```

Supports both:
- Session-based auth (cookies)
- API key auth (Bearer token in Authorization header)

### Route Structure
- Collection: `app/api/v2/{resource}/route.ts`
- Item: `app/api/v2/{resource}/[id]/route.ts`
- Limited subresources: `app/api/v2/{resource}/[id]/{subresource}/route.ts`
- Keep route depth ≤ 2

### Response Patterns
**Lists:**
```typescript
{
  data: T[],
  pagination: { limit: number, offset: number, total: number, hasMore: boolean },
  meta?: {}
}
```

**Single resource:** Flat typed object

**Errors:** `{ error: string, details?: string }` with appropriate status code

### Typing
- Define request/response interfaces per handler
- Never use `any`
- Infer DB types from Drizzle schema (don't duplicate)
- Dynamic route params: `{ params }: { params: Promise<{ id: string }> }`
- Always `await params` before use

### Logging
Use emojis for clarity:
- 🌐 Request start
- 🔐 Auth validation
- ✅ Success / ❌ Error
- 🔍 DB queries
- 📊 Results
- 🔧 AWS operations

### Idempotency
Support `Idempotency-Key` header for create/send operations to prevent duplicates

## Authentication (Better Auth)

### Client-side
```typescript
import { signIn, signUp, useSession } from "@/lib/auth/auth-client"

// Session hook
const { data: session, isPending, error } = useSession()

// Sign in
await signIn.email({ email, password })
await signIn.social({ provider: "github" })

// Magic link
await signIn.magicLink({ email })
```

### Server-side
```typescript
import { auth } from "@/lib/auth/auth"
import { headers } from "next/headers"

const session = await auth.api.getSession({
  headers: await headers()
})
```

**Social Providers:** GitHub, Google (with OAuth proxy for preview deployments)

## Data Fetching & Caching

Use React Query for all client-side data fetching:

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

// Fetch data
const { data, isLoading, error } = useQuery({
  queryKey: ['resource', id],
  queryFn: fetchResource
})

// Mutations
const mutation = useMutation({
  mutationFn: updateResource,
  onSuccess: () => queryClient.invalidateQueries(['resource'])
})
```

**Server Components with Suspense:**
```tsx
function StatsCard() {
  return (
    <Suspense fallback={<Skeleton />}>
      <StatsCardInternal />
    </Suspense>
  )
}

async function StatsCardInternal() {
  const data = await getData()
  return <div>{...data}</div>
}
```

## Code Style & Conventions

### Type Safety
- Never use `any`
- Find existing types in schemas before creating new ones
- Use discriminated unions where needed
- Prefer explicit interfaces over type inference for APIs

### Imports
```typescript
// External packages first
import { NextRequest, NextResponse } from 'next/server'
import { eq, and, desc } from 'drizzle-orm'

// Internal imports with @/ alias
import { db } from '@/lib/db'
import { validateRequest } from '../helper/main'

// Type imports last
import type { User } from '@/lib/db/schema'
```

### Async Patterns
- Prefer `async/await` over `.then()` chains
- Use try/catch for error handling
- Propagate errors appropriately

### UI Components
- Use Radix UI primitives (already configured)
- Tailwind CSS for styling (use `cn()` utility from `@/lib/utils`)
- Framer Motion for animations
- Icons: Use Nucleo icons via MCP

### File Naming
- Use kebab-case for files: `email-parser.ts`
- React components: PascalCase `EmailList.tsx`
- Routes: Next.js conventions (`route.ts`, `page.tsx`)

## AWS Infrastructure

### SES Configuration
- **Tenant Isolation:** Each user gets isolated SES tenant (`sesTenants` table)
- **Domain Verification:** DKIM, SPF, DMARC via `lib/domains-and-dns/`
- **MAIL FROM:** Custom MAIL FROM domain removes "via amazonses.com"
- **Receiving:** SES receipt rules → Lambda → S3 (attachments) → API webhook

### Lambda Email Processor
- Source: `lambda/email-processor/`
- Triggered by SES receipt rules
- Stores raw emails in S3
- Parses and stores in `structuredEmails`
- Triggers user webhooks

### CDK Stack
- Source: `aws/cdk/lib/inbound-email-stack.ts`
- Creates: Lambda, S3 bucket, SES rules, CloudWatch alarms
- Region: us-east-2 (default)
- Naming: `inbound-*` prefix

### Environment Variables
```bash
SERVICE_API_URL=https://inbound.new
SERVICE_API_KEY=your-api-key
EMAIL_DOMAINS=example.com,test.com
AWS_REGION=us-east-2
```

## Critical Rules

1. **Package Manager:** Only use `bun` (never npm/yarn/pnpm)
2. **Approval Required:** Never run `bun run dev` or `bun run build` without user approval
3. **Database Migrations:** Never run `drizzle-kit generate/push` directly - prompt user to run manually
4. **No Comments:** Don't add code comments unless explicitly requested
5. **Type Safety:** Never use `any`, find/extend existing types from schemas
6. **Data Source:** Use `structuredEmails` table, NOT deprecated `receivedEmails`/`parsedEmails`
7. **User Scoping:** Always scope DB queries by `userId` from auth
8. **AWS Commands:** Don't run AWS list commands (formatting issues) - ask user to run them
9. **Icons:** Use Nucleo icons via MCP only
10. **No Useless Docs:** Don't create README files for self-explanatory code

## Email Threading & Replies

Threading uses normalized `Message-ID` and `References` headers:

```typescript
// Reply handling
await inbound.reply(email, {
  from: 'support@domain.com',
  text: 'Response text',
  tags: [{ name: 'type', value: 'auto-reply' }]
})
```

**Auto-defaults for replies:**
- `to`: Original sender if omitted
- `subject`: `Re: {original}` if omitted
- `In-Reply-To` and `References`: Automatically constructed

## Testing

### API Tests
Located in `app/api/v2/api.test.ts` - comprehensive test suite for all v2 endpoints

### Test Requirements
- Add/update tests when creating/modifying endpoints
- Test auth failures, validation, edge cases
- Use idempotency keys for create operations
- Update Mintlify docs in parallel

### Environment
- Uses `.env` for local testing
- Requires valid API key and DB connection
- Can run against local or deployed API

## Development Workflow

1. **Start Development:**
   ```bash
   bun run dev  # (requires approval)
   ```

2. **Make Changes:**
   - Create/modify files following patterns above
   - Use existing types from schemas
   - Scope all queries by userId
   - Add logging with emoji patterns

3. **Test Changes:**
   ```bash
   bun run test-api      # Run API tests
   bun run check         # Type check
   ```

4. **Database Changes:**
   - Modify `lib/db/schema.ts`
   - Ask user to run: `drizzle-kit generate && drizzle-kit push`

5. **Deploy:**
   ```bash
   bun run deploy:quick  # Quick test deployment
   # or
   bun run deploy:email  # Full deployment
   ```

## External Integrations

- **Stripe:** Billing via @better-auth/stripe plugin
- **Dub:** Analytics via @dub/analytics and @dub/better-auth
- **Sentry:** Error tracking (Next.js integration)
- **BaseHub:** CMS for blog/docs content
- **Resend:** Backup email sending (magic links, notifications)
- **Vercel:** Deployment platform

## Resources

- **SDK Docs:** https://docs.inbound.new
- **API Reference:** https://inbound.new/api/v2
- **GitHub:** https://github.com/inboundemail/inbound
- **Cursor Rules:** `.cursor/rules/` (detailed patterns)
