# AGENTS.md - Inbound Email Platform

> Guidelines for AI agents working with this Next.js 15 + Elysia API codebase.

## Quick Reference

| Task | Command |
|------|---------|
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
6. Don't skip `validateAndRateLimit()` in handlers

## Cursor Cloud specific instructions

- **Dev server**: `bun run dev` starts Next.js 16 with Turbopack on port 3000. The first page compile takes ~7s; subsequent compiles are fast.
- **Lint**: `bun run lint` runs Biome. The codebase has pre-existing warnings/errors (~329 errors, ~989 warnings); these are not caused by your changes.
- **API tests hit remote**: Tests in `app/api/e2/**/*.test.ts` call `https://dev.inbound.new/api/e2` (not localhost). They require the `INBOUND_API_KEY` secret.
- **No Docker/local DB**: All infrastructure (Neon Postgres, Upstash Redis, AWS SES/S3/Lambda) is cloud-hosted SaaS. No containers needed.
- **NEXT_PUBLIC_ vars**: `NEXT_PUBLIC_APP_URL` is injected as a secret. For local dev it defaults to `http://localhost:3000` in code fallbacks.
- **OpenAPI docs**: Available at `/api/e2/docs` when the dev server is running. Generate the spec with `bun run generate:openapi`.
- **Blocked postinstall**: `bun install` blocks 1 postinstall script (esbuild). This is expected and does not affect functionality.
