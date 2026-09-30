# AGENTS.md - Inbound Email Platform

> Guidelines for AI agents working with this Next.js 15 + Elysia API codebase.

## Quick Reference

| Task | Command |
|------|---------|
| Local dev (Docker Postgres, no prod services) | `bun run dev:local` |
| Single test | `bun test path/to/file.test.ts` |
| All E2 API tests | `bun run test:e2` |
| Legacy API tests | `bun run test-api` |
| SDK tests | `bun run test-sdk` |
| Lint | `bun run lint` |
| Generate OpenAPI | `bun run generate:openapi` |

### Restricted Commands
- `bun run dev` / `bun run build` - Ask before running
- `bunx drizzle-kit generate/push` - Prompt user to run manually
- `npx tsc` - Never run (breaks project state)

## Package Manager

**Only use `bun`** - Never npm, yarn, or pnpm.

## Architecture

```
app/api/
├── e2/                    # Elysia API (primary)
│   ├── domains/           # Domain endpoints
│   ├── emails/            # Email endpoints  
│   ├── lib/               # Auth, types, responses
│   └── [[...slugs]]/route.ts
└── v2/                    # Legacy Next.js routes

lib/db/schema.ts           # Drizzle schema (type source of truth)
features/                  # Feature-specific logic
```

## Code Style

### Imports
```typescript
// Order: external packages -> local modules -> types
import { Elysia, t } from "elysia";
import { db } from "@/lib/db";
import { emailDomains } from "@/lib/db/schema";
import type { InferSelectModel } from "drizzle-orm";
```

**Always use `@/` path alias** - Never relative paths like `../../../`.

### TypeScript
- **No `any`** - Biome enforces `noExplicitAny: error`
- **Find existing types** in `lib/db/schema.ts` - don't duplicate
- **Infer DB types**: `InferSelectModel<typeof tableName>`
- **Route params**: `params: Promise<{ id: string }>`, then `const { id } = await params`

### Database
- **Drizzle ORM only** - No raw SQL
- **Use `structuredEmails`** - NOT deprecated `receivedEmails`/`parsedEmails`
- Always scope queries by `userId` for multi-tenant safety

### Naming Conventions
- Files: `kebab-case.ts`
- React components: `PascalCase.tsx`
- Hooks: `use` prefix + Query/Mutation suffix (`useDomainsQuery.ts`)
- Tests: Same name + `.test.ts`

### React Components
- Use variant props for styling - never custom colors/sizes/border-radius
- Colors from CSS variables in `global.css`
- Use Suspense with fallback for async data
- Use TanStack Query (`useQuery`, `useMutation`) for data fetching

### Comments
- No comments unless explicitly requested
- No unnecessary README files

## Elysia API Patterns

### Response Schemas (Critical for OpenAPI)
**Always use status-code keyed objects, NOT `t.Union()`:**

```typescript
// CORRECT - All responses properly documented
response: {
  200: SuccessResponse,
  400: ErrorResponse,
  401: ErrorResponse,
  404: ErrorResponse,
  500: ErrorResponse,
}

// WRONG - won't show in OpenAPI docs
response: t.Union([SuccessResponse, ErrorResponse])
```

### Error Handling
```typescript
import { createErrorResponse } from "./lib/responses";

set.status = 400;
return createErrorResponse(400, "Bad Request", "Validation failed");
```

| Code | Use Case |
|------|----------|
| 200 | Success (GET, PATCH, DELETE) |
| 201 | Created (POST) |
| 400 | Validation error |
| 401 | Auth required |
| 404 | Not found |
| 409 | Conflict |
| 500 | Server error |

## Testing

Tests use `bun:test` against the dev API:

```typescript
import { describe, it, expect } from "bun:test";

const API_URL = "https://dev.inbound.new/api/e2";

async function apiRequest(endpoint: string, options: RequestInit = {}) {
  return fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${process.env.INBOUND_API_KEY}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
}

describe("Domains API", () => {
  it("should list domains", async () => {
    const response = await apiRequest("/domains");
    expect(response.status).toBe(200);
  });
});
```

## Pagination Standard

All list endpoints return:
```typescript
{
  data: Item[],
  pagination: { limit: number, offset: number, total: number, hasMore: boolean }
}
```

## Common Pitfalls

1. Don't duplicate types - use `lib/db/schema.ts`
2. Don't use deprecated tables (`receivedEmails`/`parsedEmails`)
3. Don't forget user scoping in DB queries
4. Don't use `t.Union()` for Elysia responses
5. Don't run drizzle-kit commands directly

## User Ban System

**Ban enforcement is already built-in** - setting `user.banned = true` blocks access immediately:

- `app/api/e2/lib/auth.ts:168-220` - Validates ban status on every E2 API request
- `lib/email-management/outbound-send-guard.ts:194-209` - Blocks banned users from sending emails
- `app/api/e2/helper/main.ts:92-129` - Validates ban status for V2 API (legacy)

Ban fields in `user` table:
- `banned` (boolean) - Primary ban flag
- `banReason` (text) - Displayed to user on 403 responses
- `banExpires` (timestamp) - Optional expiry; `null` = permanent

**Admin endpoints** (require admin role):
- `POST /admin/users/:userId/ban` - Ban user, set reason/expiry
- `POST /admin/users/:userId/unban` - Clear ban, reset fields

**Additional enforcement** when banning for abuse:
1. **Suspend tenant** - Set `sesTenants.status = "suspended"` and call `suspendTenantSending()` to disable AWS SES config set
2. **Cancel scheduled emails** - Update `scheduledEmails` where `status IN ("scheduled", "processing")` to `"cancelled"`
3. See `scripts/ban-user.ts` for complete ban workflow including tenant suspension and scheduled email cleanup

**Tenant suspension helpers**:
- `lib/aws-ses/aws-ses-tenants.ts:1160` - `suspendTenantSending(configSetName, reason)` - disables AWS SES sending
- `lib/aws-ses/aws-ses-tenants.ts:1153` - `pauseTenantSending(configSetName, reason)` - for temporary pauses
- Both update `sesTenants.status` in DB and call AWS SES `PutConfigurationSetSendingOptionsCommand`


6. Don't skip `validateAndRateLimit()` in handlers
