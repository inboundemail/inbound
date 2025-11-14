# v3 API - oRPC Implementation

This directory contains the v3 API implementation using oRPC for type-safe RPC with OpenAPI support.

## Structure

```
app/api/v3/
├── _lib/                     # Core infrastructure
│   ├── context.ts           # Auth context (session + API key)
│   ├── rate-limiter.ts      # Upstash rate limiting (5 RPS)
│   ├── error-handler.ts     # Unified error handling
│   └── procedures.ts        # Base procedures
├── types/                    # Shared type definitions
│   ├── common.ts            # Pagination, etc.
│   ├── errors.ts            # Error types
│   ├── domain.ts            # Domain schemas
│   ├── email.ts             # Email schemas
│   ├── endpoint.ts          # Endpoint schemas
│   └── email-address.ts     # Email address schemas
├── domains/                  # Domain resource
│   ├── create.ts
│   ├── get.ts
│   ├── update.ts
│   ├── delete.ts
│   ├── list.ts
│   └── index.ts             # Router
├── emails/                   # Email resource
├── endpoints/                # Endpoint resource
├── email-addresses/          # Email address resource
└── route.ts                  # Main router + OpenAPI handler
```

## Features

- **Type Safety**: End-to-end type safety from client to server
- **OpenAPI**: Auto-generated OpenAPI specification
- **RESTful**: Standard REST conventions
- **Auth**: Unified session + API key authentication
- **Rate Limiting**: 5 RPS per user via Upstash
- **Monitoring**: Sentry integration for errors and performance
- **Validation**: Zod schemas for all inputs/outputs

## Environment Variables

Required for full functionality:

```env
# Rate Limiting (Upstash)
UPSTASH_REDIS_REST_URL=your-redis-url
UPSTASH_REDIS_REST_TOKEN=your-redis-token

# Already configured
SENTRY_DSN=your-sentry-dsn
```

## Usage

### Creating a New Resource

1. Create types in `types/{resource}.ts`
2. Create operations in `{resource}/` directory:
   - `create.ts`
   - `get.ts`
   - `update.ts`
   - `delete.ts`
   - `list.ts`
3. Create router in `{resource}/index.ts`
4. Add router to `route.ts`

### Example Procedure

```typescript
import { authenticatedProcedure } from '../_lib/procedures'
import { CreateDomainSchema, type DomainResponse } from '../types/domain'

export const createDomain = authenticatedProcedure
  .input(CreateDomainSchema)
  .output<DomainResponse>()
  .meta({
    openapi: {
      method: 'POST',
      path: '/v3/domains',
      tags: ['Domains'],
      summary: 'Create a new domain'
    }
  })
  .mutation(async ({ input, context }) => {
    // Implementation
  })
```

## Client Usage

```typescript
import { v3Client } from '@/lib/api/v3-client'

// Server-side
const domain = await v3Client.domains.create({
  domain: 'example.com',
  isCatchAllEnabled: true
})

// Client-side with React Query
const { mutate } = useMutation({
  mutationFn: (data) => v3Client.domains.create(data)
})
```

## Documentation

- Full implementation guide: `.cursor/rules/oRPC-Handling.mdc`
- Architecture decisions: `docs/v3-api-architecture.md`
- Implementation checklist: `docs/v3-implementation-checklist.md`

## Testing

Each operation should have a corresponding test file:

```
domains/
├── create.ts
├── create.test.ts
├── get.ts
├── get.test.ts
...
```

## Next Steps

1. Implement domain operations (follow checklist Phase 2)
2. Implement email operations (Phase 3)
3. Implement endpoint operations (Phase 4)
4. Set up OpenAPI handler in `route.ts`
5. Update client in `lib/api/v3-client.ts`


