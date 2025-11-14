# v3 API Setup Guide

## Prerequisites

- [x] Bun installed
- [x] Database configured
- [x] Better Auth configured
- [x] Sentry configured (optional but recommended)

## Installation

### 1. Dependencies Installed ✅

The following packages have been installed:
- `@orpc/server` - oRPC server framework
- `@orpc/client` - oRPC client
- `@orpc/openapi` - OpenAPI integration
- `@upstash/redis` - Redis client
- `@upstash/ratelimit` - Rate limiting
- `zod` - Schema validation

### 2. Configure Upstash Redis (Rate Limiting)

**Option A: Use Upstash (Recommended)**

1. Go to [https://console.upstash.com](https://console.upstash.com)
2. Create a new Redis database (free tier available)
3. Copy the REST URL and TOKEN
4. Add to your `.env`:

```env
UPSTASH_REDIS_REST_URL=https://your-redis-instance.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-token-here
```

**Option B: Skip Rate Limiting (Development Only)**

Rate limiting will be disabled automatically if credentials are not provided.
Check the console for the warning:
```
⚠️ Upstash Redis credentials not found. Rate limiting disabled.
```

### 3. Verify Setup

Run this command to check everything is working:

```bash
bun run typecheck
```

## Infrastructure Overview

### Core Files Created ✅

```
app/api/v3/
├── _lib/
│   ├── context.ts           ✅ Auth context (session + API key)
│   ├── rate-limiter.ts      ✅ Rate limiting (5 RPS per user)
│   ├── error-handler.ts     ✅ Unified error handling
│   └── procedures.ts        ✅ Base procedures
├── types/
│   ├── common.ts            ✅ Pagination helpers
│   ├── errors.ts            ✅ Error types
│   ├── domain.ts            ✅ Domain schemas
│   ├── email.ts             ✅ Email schemas
│   ├── endpoint.ts          ✅ Endpoint schemas
│   └── email-address.ts     ✅ Email address schemas
lib/api/
└── v3-client.ts             ✅ Client (placeholder)
```

## Next Steps

### Phase 1: Implement Your First Resource (Domains)

Follow the implementation checklist:
```bash
# See the full checklist at:
open docs/v3-implementation-checklist.md
```

**Quick Start - Domain Resource:**

1. Create `app/api/v3/domains/create.ts`
2. Create `app/api/v3/domains/get.ts`
3. Create `app/api/v3/domains/update.ts`
4. Create `app/api/v3/domains/delete.ts`
5. Create `app/api/v3/domains/list.ts`
6. Create `app/api/v3/domains/index.ts` (router)
7. Test each operation

### Phase 2: Create Main Router

Once you have at least one resource router:

1. Create `app/api/v3/route.ts`
2. Import your resource routers
3. Configure OpenAPI handler
4. Export route handlers

### Phase 3: Update Client

1. Update `lib/api/v3-client.ts`
2. Import AppRouter type
3. Configure createClient
4. Export typed client

## Testing

Create test files alongside your implementations:

```typescript
// app/api/v3/domains/create.test.ts
import { describe, it, expect } from 'bun:test'
import { createDomain } from './create'

describe('createDomain', () => {
  it('should create a domain successfully', async () => {
    // Test implementation
  })
})
```

Run tests:
```bash
bun test app/api/v3
```

## Authentication

Both methods work out of the box:

**Session Auth:**
```typescript
// Automatic via cookies in browser
fetch('/api/v3/domains', {
  method: 'POST',
  body: JSON.stringify({ domain: 'example.com' })
})
```

**API Key Auth:**
```bash
curl -X POST https://inbound.new/v3/domains \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"domain":"example.com"}'
```

## Rate Limiting

- 5 requests per second per user
- Sliding window
- Rate limit info in response headers:
  - `X-RateLimit-Limit`
  - `X-RateLimit-Remaining`
  - `X-RateLimit-Reset`

## Error Handling

All errors follow this format:

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Domain not found",
    "details": { /* optional */ }
  }
}
```

Common error codes:
- `UNAUTHORIZED` (401)
- `FORBIDDEN` (403)
- `NOT_FOUND` (404)
- `VALIDATION_ERROR` (400)
- `RATE_LIMIT_EXCEEDED` (429)
- `CONFLICT` (409)
- `INTERNAL_ERROR` (500)

## Monitoring

Sentry integration is automatic. Each request is traced with:
- User ID
- Auth method
- Endpoint name
- Duration
- Errors

View in Sentry dashboard after deployment.

## Resources

- **Full Guide**: `.cursor/rules/oRPC-Handling.mdc`
- **Architecture**: `docs/v3-api-architecture.md`
- **Checklist**: `docs/v3-implementation-checklist.md`
- **oRPC Docs**: [https://orpc.io](https://orpc.io)
- **Zod Docs**: [https://zod.dev](https://zod.dev)

## Troubleshooting

### Issue: Rate limiting not working
**Solution**: Check that `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are set in `.env`

### Issue: Auth not working
**Solution**: Verify Better Auth is configured correctly. Check existing v2 auth works.

### Issue: TypeScript errors
**Solution**: Run `bun run typecheck` to see specific errors. Ensure all types are properly imported.

### Issue: Can't import procedures
**Solution**: Check that `@orpc/server` is installed: `bun add @orpc/server`

## Support

- Review existing v2 implementations for business logic reference
- Check the rule file for detailed examples
- All infrastructure is set up, you're ready to build routes!


