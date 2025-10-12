---
title: Migrate a file to Hono
description: Convert an API file to a Hono router with OpenAPI annotations and mount it in v3
---

Usage
- /command @path/to/file.ts

What this does
1) Discovery
   - Read the target file and any helpers/types it imports
   - Detect HTTP methods, route path, params, inputs (query/json/body), and response shape(s)
2) Design
   - Map handlers to Hono with `basePath` and per-method routes
   - Define request schemas where possible; otherwise add placeholders
   - Add `describeRoute` for responses; add `validator` for known request shapes
3) Implement
   - Create `app/api/v3/(routes)/<feature>.ts` exporting default Hono router
   - Mount in `app/api/v3/[[...routes]]/route.ts` with `app.route('/', router)`
4) Double-check
   - Run lints on edited files; resolve any errors
5) Self-test (static)
   - Verify `/api/v3/openapi` would include the new path(s)
   - Ensure `basePath` matches intended resource path
6) Handoff
   - Summarize changes and list new endpoints

Constraints
- Use Bun (no npm/pnpm/yarn)
- Do not run dev/build/typecheck without explicit approval
- Prefer inferred/known types; avoid duplicating DB schema types

Notes
- If original logic is complex or uses middlewares, create a minimal functional migration first, then incrementally port behavior behind feature flags if needed
- Include a basic GET returning `{ ok: true, resource: '<feature>' }` if the response schema is unclear

Examples

Before (Next.js route handler):
```ts
// app/api/v2/widgets/route.ts
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const limit = Number(searchParams.get('limit') ?? '10')
  if (Number.isNaN(limit)) {
    return new Response('Invalid limit', { status: 400 })
  }
  return Response.json({ items: [], nextCursor: null })
}
```

After (Hono router with OpenAPI + auth + rate limiting):
```ts
// app/api/v3/(routes)/widgets.ts
import { Hono } from 'hono'
import { describeRoute } from 'hono-openapi'
import { validateRequest } from '../lib/helper'

const router = new Hono().basePath('/widgets')

router.get(
  '/',
  describeRoute({
    summary: 'List widgets',
    responses: {
      200: {
        description: 'OK',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                items: { type: 'array', items: { type: 'object' } },
                nextCursor: {
                  anyOf: [
                    { type: 'string' },
                    { type: 'null' }
                  ]
                }
              },
              required: ['items']
            }
          }
        }
      },
      401: { description: 'Unauthorized' },
      429: { description: 'Rate limit exceeded' }
    }
  }),
  async (c) => {
    const auth = await validateRequest(c.req.raw)
    
    if (!('userId' in auth)) {
      return c.json({ error: auth.error || 'Unauthorized' }, 401)
    }

    if (auth.error === 'Rate limit exceeded') {
      c.header('X-RateLimit-Limit', String(auth.rateLimit?.limit || 0))
      c.header('X-RateLimit-Remaining', String(auth.rateLimit?.remaining || 0))
      c.header('X-RateLimit-Reset', auth.rateLimit?.reset || '')
      return c.json({ error: 'Rate limit exceeded', rateLimit: auth.rateLimit }, 429)
    }

    if (auth.rateLimit) {
      c.header('X-RateLimit-Limit', String(auth.rateLimit.limit))
      c.header('X-RateLimit-Remaining', String(auth.rateLimit.remaining))
      c.header('X-RateLimit-Reset', auth.rateLimit.reset)
    }

    return c.json({ items: [], nextCursor: null })
  }
)

export default router
```

Mount in catch-all:
```ts
// app/api/v3/[[...routes]]/route.ts
import widgets from '../(routes)/widgets'
app.route('/', widgets)
```

Key patterns enforced:
- **Auth + Rate Limiting**: Always use `validateRequest(c.req.raw)` from `../lib/helper`
- **Response handling**:
  - Check `!('userId' in auth)` → return 401
  - Check `auth.error === 'Rate limit exceeded'` → return 429 with headers
  - Add `X-RateLimit-*` headers to all successful responses
- **OpenAPI schemas**: Use `anyOf: [{ type: 'string' }, { type: 'null' }]` for nullable fields
- **Response codes**: Always include 401 and 429 in `describeRoute` responses

Verify
- OpenAPI spec available at `/api/v3/openapi` and includes `/widgets` GET
- Lints pass on edited files
- Rate limiting: 4 requests/sec per user enforced via Upstash Redis

