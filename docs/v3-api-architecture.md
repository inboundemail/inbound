# v3 API Architecture with oRPC

## Quick Reference

This document provides a high-level overview of the v3 API architecture decisions based on the oRPC-Handling rule.

## Key Architectural Decisions

### 1. Authentication Strategy

**Decision**: Unified auth context that accepts both session and API key authentication.

**Implementation**:
```typescript
// Both resolve to the same AuthenticatedContext
interface AuthenticatedContext {
  userId: string
  authMethod: 'session' | 'api_key'
  user: { id: string, email: string, name: string }
}
```

**Rationale**: 
- Maintains v2's flexibility
- Single middleware chain handles both auth types
- Better-auth user always available in context
- Clear tracking of auth method for analytics

### 2. File Structure

**Decision**: One file per operation with all types and logic included.

**Structure**:
```
app/api/v3/domains/
├── create.ts    # All create logic + types
├── get.ts       # All get logic + types  
├── update.ts    # All update logic + types
├── delete.ts    # All delete logic + types
├── list.ts      # All list logic + types
└── index.ts     # Router aggregation
```

**Rationale**:
- Easy to find all related code for an operation
- Clear separation of concerns
- Prevents merge conflicts
- Easier code review
- Better for AI assistance

### 3. Type Organization

**Decision**: Shared types in `/types` directory, operation-specific types in operation files.

**Structure**:
```
app/api/v3/types/
├── domain.ts    # Domain schemas & types
├── email.ts     # Email schemas & types
├── common.ts    # Pagination, etc.
└── errors.ts    # Error types
```

**Rationale**:
- Prevents duplication
- Single source of truth for shared types
- Easy to import across operations
- Clear separation of shared vs operation-specific

### 4. Middleware Stack

**Decision**: Procedure-level middleware with rate limiting, auth, and logging.

**Order**:
1. Base context creation
2. Authentication
3. Rate limiting (5 RPS per user)
4. Sentry tracing
5. Business logic

**Rationale**:
- Automatic rate limiting enforcement
- Consistent error handling
- Built-in monitoring
- No manual auth checks needed

### 5. OpenAPI Integration

**Decision**: Full OpenAPI spec generation with RESTful routes.

**Example**:
```typescript
.meta({
  openapi: {
    method: 'POST',
    path: '/v3/domains',
    tags: ['Domains'],
    summary: 'Create a new domain'
  }
})
```

**Routes**:
- `POST /v3/domains` - Create
- `GET /v3/domains/:id` - Get
- `PUT /v3/domains/:id` - Update
- `DELETE /v3/domains/:id` - Delete
- `GET /v3/domains` - List

**Rationale**:
- Standard REST conventions
- Auto-generated OpenAPI docs
- Easy for external consumers
- Familiar patterns

### 6. Rate Limiting

**Decision**: Upstash Redis with 5 RPS per user across all endpoints.

**Implementation**:
```typescript
const ratelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, "1s"),
  prefix: "ratelimit:v3"
})
```

**Rationale**:
- Protects infrastructure
- Per-user limiting prevents abuse
- Sliding window for smooth rate limiting
- Headers indicate limit status

### 7. Error Handling

**Decision**: Unified APIError class with structured responses.

**Format**:
```typescript
{
  error: {
    code: "NOT_FOUND",
    message: "Domain not found",
    details: { /* optional */ }
  }
}
```

**Rationale**:
- Consistent error format
- Machine-readable error codes
- Optional details for debugging
- Easy to handle on client

### 8. Validation

**Decision**: Zod schemas for all input/output validation.

**Example**:
```typescript
const CreateDomainSchema = z.object({
  domain: z.string().min(1).max(255),
  isCatchAllEnabled: z.boolean().default(false)
})
```

**Rationale**:
- Runtime type safety
- Automatic OpenAPI schema generation
- Clear validation errors
- Type inference

### 9. Monitoring

**Decision**: Sentry integration for error tracking and performance monitoring.

**Implementation**:
```typescript
const span = Sentry.startSpan({ 
  name: 'domain.create',
  attributes: { domain: input.domain }
})
```

**Rationale**:
- Error tracking with context
- Performance monitoring
- User tracking
- Request tracing

### 10. Database Types

**Decision**: Infer types from Drizzle schema, don't duplicate.

**Example**:
```typescript
// ✅ DO
export type Domain = typeof emailDomains.$inferSelect

// ❌ DON'T
interface Domain {
  id: string
  domain: string
  // ... duplicating schema
}
```

**Rationale**:
- Single source of truth
- Automatic schema updates
- No drift between DB and types
- Follows project convention

## Migration Strategy

### From v2 to v3

1. **Keep v2 Running**: Don't touch existing v2 code
2. **Copy Business Logic**: Reference v2 for business rules
3. **Add Type Safety**: Wrap with Zod schemas
4. **Add OpenAPI**: Document with metadata
5. **Test Thoroughly**: Ensure parity with v2
6. **Deprecate Gradually**: Move clients to v3

### Example Migration

v2 endpoint:
```typescript
// app/api/v2/domains/route.ts
export async function POST(request: NextRequest) {
  const { userId } = await validateRequest(request)
  const data = await request.json()
  // ... business logic
}
```

v3 procedure:
```typescript
// app/api/v3/domains/create.ts
export const createDomain = authenticatedProcedure
  .input(CreateDomainSchema)
  .output<DomainResponse>()
  .meta({ openapi: { method: 'POST', path: '/v3/domains' } })
  .mutation(async ({ input, context }) => {
    // ... same business logic
  })
```

## Client Usage

### Server-Side (Next.js)
```typescript
import { v3Client } from '@/lib/api/v3-client'

const domain = await v3Client.domains.create({
  domain: 'example.com',
  isCatchAllEnabled: true
})
```

### Client-Side (React)
```typescript
import { useMutation } from '@tanstack/react-query'
import { v3Client } from '@/lib/api/v3-client'

const { mutate } = useMutation({
  mutationFn: (data) => v3Client.domains.create(data)
})
```

### External API Consumers
```bash
curl -X POST https://inbound.new/v3/domains \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"domain":"example.com","isCatchAllEnabled":false}'
```

## Benefits Over v2

1. **Type Safety**: End-to-end type safety from client to server
2. **Auto Documentation**: OpenAPI spec generated automatically
3. **Better DX**: Clear error messages, IntelliSense support
4. **Rate Limiting**: Built-in protection against abuse
5. **Monitoring**: Automatic Sentry integration
6. **Validation**: Runtime validation with Zod
7. **Modularity**: Each operation is self-contained
8. **Testing**: Easier to test individual procedures

## Performance Considerations

- **Rate Limiting**: 5 RPS may need adjustment based on usage
- **Redis**: Upstash for rate limiting (consider self-hosted for scale)
- **Sentry**: Monitor performance impact of tracing
- **Validation**: Zod validation has minimal overhead
- **Database**: Same Drizzle queries as v2, no performance change

## Future Enhancements

1. **Webhooks**: Add webhook support for async operations
2. **Batch Operations**: Support batch creates/updates
3. **Caching**: Add Redis caching for frequently accessed data
4. **GraphQL**: Consider GraphQL alongside REST
5. **SDK Generation**: Auto-generate TypeScript/Python SDKs
6. **WebSockets**: Real-time updates for certain operations

## Questions?

Refer to:
- `.cursor/rules/oRPC-Handling.mdc` - Full implementation guide
- [oRPC Documentation](https://orpc.io) - Official docs
- `app/api/v2/` - Reference v2 implementations

