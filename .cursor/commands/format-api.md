# Format API Route to OpenAPI with Zod

Transform an existing Next.js API route to use `defineRoute` with Zod schemas for type-safe, self-documenting endpoints.

## Command Usage

Run this command on a route file:
```
/format-api app/api/v2/emails/route.ts
```

## Prerequisites

Before running this command, ensure the error schemas file exists:

**Create** `app/api/v2/schemas/errors.ts` if it doesn't exist (see rule file for complete implementation):

```typescript
import { z } from "zod"

export const ApiErrorSchema = z.object({
  type: z.string().url(),
  title: z.string(),
  status: z.number().int(),
  detail: z.string(),
  instance: z.string(),
  code: z.string(),
  category: z.enum([
    'authentication_error',
    'authorization_error',
    'validation_error',
    'not_found_error',
    'conflict_error',
    'rate_limit_error',
    'server_error'
  ]),
  field: z.string().optional(),
  errors: z.array(z.object({
    field: z.string(),
    code: z.string(),
    message: z.string(),
  })).optional(),
  request_id: z.string(),
  timestamp: z.string().datetime(),
  doc_url: z.string().url().optional(),
  suggestion: z.string().optional(),
})

export function buildApiError(params: {
  status: number
  code: string
  title: string
  detail: string
  instance: string
  category: string
  field?: string
  errors?: Array<{ field: string; code: string; message: string }>
  suggestion?: string
  requestId: string
}): z.infer<typeof ApiErrorSchema> {
  return {
    type: `https://api.inbound.new/errors/${params.code.toLowerCase().replace(/_/g, '-')}`,
    title: params.title,
    status: params.status,
    detail: params.detail,
    instance: params.instance,
    code: params.code,
    category: params.category as any,
    field: params.field,
    errors: params.errors,
    request_id: params.requestId,
    timestamp: new Date().toISOString(),
    doc_url: `https://docs.inbound.new/errors/${params.code.toLowerCase().replace(/_/g, '-')}`,
    suggestion: params.suggestion,
  }
}

export const ERROR_CODES = {
  AUTHENTICATION_REQUIRED: 'AUTHENTICATION_REQUIRED',
  INVALID_API_KEY: 'INVALID_API_KEY',
  INSUFFICIENT_PERMISSIONS: 'INSUFFICIENT_PERMISSIONS',
  DOMAIN_NOT_OWNED: 'DOMAIN_NOT_OWNED',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  RESOURCE_NOT_FOUND: 'RESOURCE_NOT_FOUND',
  EMAIL_NOT_FOUND: 'EMAIL_NOT_FOUND',
  DOMAIN_NOT_FOUND: 'DOMAIN_NOT_FOUND',
  RESOURCE_ALREADY_EXISTS: 'RESOURCE_ALREADY_EXISTS',
  DOMAIN_ALREADY_REGISTERED: 'DOMAIN_ALREADY_REGISTERED',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  EMAIL_LIMIT_REACHED: 'EMAIL_LIMIT_REACHED',
  INTERNAL_SERVER_ERROR: 'INTERNAL_SERVER_ERROR',
  AWS_SES_ERROR: 'AWS_SES_ERROR',
} as const
```

## What This Command Does

1. **Analyzes** the existing route file to understand:
   - HTTP methods present (GET, POST, PUT, DELETE, PATCH)
   - Request/response TypeScript interfaces
   - Query parameters, path parameters, request bodies
   - Response status codes and shapes
   - Existing validation logic

2. **Converts** TypeScript interfaces to Zod schemas:
   - Infers proper Zod types from TypeScript types
   - Adds validation constraints from existing code
   - Handles nested objects, arrays, unions, enums

3. **Wraps** each HTTP method with `defineRoute`:
   - Adds OpenAPI metadata (operationId, summary, description, tags)
   - Defines request/response schemas
   - Moves handler logic into `action` function

4. **Preserves** all existing functionality:
   - Authentication calls (`validateRequest`)
   - Logging statements with emojis
   - Business logic and database operations
   - Error handling patterns
   - User scoping and multi-tenancy

5. **Validates** the transformation:
   - Ensures all methods are wrapped
   - Verifies schemas match original interfaces
   - Confirms all response types are defined
   - Checks that auth/logging are preserved

## Step-by-Step Process

### Step 1: Read and Analyze

Read the target route file and identify:
- File path and route pattern
- All HTTP method handlers (GET, POST, PUT, DELETE, PATCH)
- TypeScript interfaces for requests/responses
- Existing validation logic
- Response status codes used
- Path parameters (from folder structure like `[id]`)

### Step 2: Generate Zod Schemas

For each interface, create corresponding Zod schema:

**Interface → Schema Mapping:**

| TypeScript Type | Zod Schema |
|----------------|------------|
| `string` | `z.string()` |
| `number` | `z.number()` |
| `boolean` | `z.boolean()` |
| `Date` | `z.date()` or `z.coerce.date()` |
| `string \| null` | `z.string().nullable()` |
| `string \| undefined` | `z.string().optional()` |
| `string[]` | `z.array(z.string())` |
| `Record<string, string>` | `z.record(z.string())` |
| `'a' \| 'b' \| 'c'` | `z.enum(['a', 'b', 'c'])` |

**Add validation constraints based on existing code:**
- Length checks → `.min()`, `.max()`
- Email validation → `.email()`
- URL validation → `.url()`
- Regex patterns → `.regex()`
- Range checks → `.min()`, `.max()`
- Custom validation → `.refine()`

### Step 3: Wrap Each HTTP Method

For each handler function, create a `defineRoute` definition:

```typescript
export const { METHOD } = defineRoute({
  operationId: "{verb}{Resource}",
  method: "METHOD",
  summary: "Brief description",
  description: "Detailed description of what this endpoint does",
  tags: ["Resource"],
  
  // Add appropriate parameter schemas:
  queryParams: QuerySchema,      // For GET query params
  requestBody: RequestSchema,    // For POST/PUT/PATCH body
  pathParams: PathSchema,        // For dynamic routes with [id]
  
  responses: {
    200: { description: "Success", content: SuccessSchema },
    400: { description: "Bad request", content: ErrorSchema },
    401: { description: "Unauthorized", content: ErrorSchema },
    // ... other status codes used in the handler
  },
  
  action: async (params, req) => {
    // Extract validated parameters from params
    // Type assertions are safe here because Zod validation ensures correct shape
    const requestBody = params.body as RequestType
    const queryParams = params.query as QueryType
    const pathParams = params.path as PathType
    
    // Cast to NextRequest if needed for auth helpers
    const request = req as unknown as NextRequest
    
    // Move existing handler logic here
    // Params are already validated - no manual validation needed
  }
})
```

### Step 4: Update Imports

Ensure these imports are at the top:

```typescript
import { defineRoute } from "@omer-x/next-openapi-route-handler"
import { z } from "zod"
import { NextRequest, NextResponse } from 'next/server'
// ... other existing imports
```

### Step 5: Preserve Patterns

Keep these patterns intact:

**Authentication:**
```typescript
const { userId, error } = await validateRequest(request)
if (!userId) {
  return NextResponse.json({ error }, { status: 401 })
}
```

**Logging:**
```typescript
console.log('🌐 GET /api/v2/resource - Starting request')
console.log('🔐 Validating request authentication')
console.log('✅ Authentication successful')
console.log('📊 Query parameters:', { ... })
```

**Error Handling (RFC 9457):**
```typescript
import { buildApiError, ERROR_CODES } from '../schemas/errors'
import { nanoid } from 'nanoid'

try {
  const requestId = `req_${nanoid()}`
  // logic
} catch (error) {
  console.error(`❌ [${requestId}] METHOD /api/v2/resource - Error:`, error)
  const apiError = buildApiError({
    status: 500,
    code: ERROR_CODES.INTERNAL_SERVER_ERROR,
    title: 'Internal Server Error',
    detail: 'An unexpected error occurred',
    instance: '/api/v2/resource',
    category: 'server_error',
    suggestion: 'Please try again later or contact support',
    requestId,
  })
  return NextResponse.json(apiError, { status: 500 })
}
```

**User Scoping:**
```typescript
.where(and(
  eq(table.userId, userId),
  // other conditions
))
```

### Step 6: Remove Manual Validation

Delete manual validation code that's now handled by Zod:

**Remove:**
```typescript
// Manual field checks
if (!body.from || !body.to) {
  return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
}

// Manual type coercion
const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100)

// Manual range checks
if (limit < 1 || limit > 100) {
  return NextResponse.json({ error: 'Invalid limit' }, { status: 400 })
}
```

**Replaced by Zod:**
```typescript
const QuerySchema = z.object({
  limit: z.coerce.number().min(1).max(100).optional().default(50),
})
// Validation happens automatically!
```

### Step 7: Implement RFC 9457 Error Responses

Replace all error returns with `buildApiError`:

**Old Error Format:**
```typescript
return NextResponse.json({ error: 'Something failed' }, { status: 500 })
```

**New RFC 9457 Error Format:**
```typescript
const apiError = buildApiError({
  status: 500,
  code: ERROR_CODES.INTERNAL_SERVER_ERROR,
  title: 'Internal Server Error',
  detail: 'An unexpected error occurred',
  instance: '/api/v2/resource',
  category: 'server_error',
  suggestion: 'Please try again later',
  requestId,
})
return NextResponse.json(apiError, { status: 500 })
```

Benefits:
- ✅ Unique error codes for indexing
- ✅ Categorized for filtering/monitoring
- ✅ Request IDs for debugging
- ✅ Helpful suggestions for users
- ✅ Links to error documentation

## Complete Examples

### Example 1: POST Endpoint Transformation

**Before:**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { validateRequest } from '../helper/main'

export interface PostEmailsRequest {
  from: string
  to: string | string[]
  subject: string
  html?: string
  text?: string
}

export interface PostEmailsResponse {
  id: string
  messageId: string
}

export async function POST(request: NextRequest) {
  console.log('📧 POST /api/v2/emails - Starting request')
  
  try {
    const { userId, error } = await validateRequest(request)
    if (!userId) {
      return NextResponse.json({ error }, { status: 401 })
    }
    
    const body: PostEmailsRequest = await request.json()
    
    if (!body.from || !body.to || !body.subject) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    }
    
    if (!body.html && !body.text) {
      return NextResponse.json({ error: 'Content required' }, { status: 400 })
    }
    
    // Business logic...
    
    return NextResponse.json({ id: 'email_123', messageId: 'msg_456' })
  } catch (error) {
    console.error('❌ POST /api/v2/emails - Error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
```

**After:**

```typescript
import { defineRoute } from "@omer-x/next-openapi-route-handler"
import { z } from "zod"
import { NextRequest, NextResponse } from 'next/server'
import { validateRequest } from '../helper/main'
import { ApiErrorSchema, buildApiError, ERROR_CODES } from '../schemas/errors'
import { nanoid } from 'nanoid'

// Define Zod schemas
const PostEmailsRequestSchema = z.object({
  from: z.string().email(),
  to: z.union([z.string().email(), z.array(z.string().email())]),
  subject: z.string().min(1),
  html: z.string().optional(),
  text: z.string().optional(),
}).refine(
  (data) => data.html || data.text,
  { message: "Either html or text required" }
)

const PostEmailsResponseSchema = z.object({
  id: z.string(),
  messageId: z.string(),
})

export const { POST } = defineRoute({
  operationId: "sendEmail",
  method: "POST",
  summary: "Send an email",
  description: "Sends an email using AWS SES and returns an email ID",
  tags: ["Emails"],
  requestBody: PostEmailsRequestSchema,
  responses: {
    200: { description: "Email sent successfully", content: PostEmailsResponseSchema },
    400: { description: "Invalid request body", content: ApiErrorSchema },
    401: { description: "Unauthorized", content: ApiErrorSchema },
    500: { description: "Internal server error", content: ApiErrorSchema },
  },
  action: async (params, req) => {
    const requestId = `req_${nanoid()}`
    console.log(`📧 [${requestId}] POST /api/v2/emails - Starting request`)
    
    // Extract validated requestBody from params
    // Type assertion is safe here because Zod validation ensures correct shape
    const requestBody = params.body as PostEmailsRequest
    
    // Cast to NextRequest for validateRequest compatibility
    const request = req as unknown as NextRequest
    
    try {
      const { userId, error } = await validateRequest(request)
      if (!userId) {
        const apiError = buildApiError({
          status: 401,
          code: ERROR_CODES.AUTHENTICATION_REQUIRED,
          title: 'Authentication Required',
          detail: error || 'Valid API key required',
          instance: '/api/v2/emails',
          category: 'authentication_error',
          suggestion: 'Include Authorization: Bearer <api_key> header',
          requestId,
        })
        return NextResponse.json(apiError, { status: 401 })
      }
      
      // requestBody is already validated by Zod - no manual checks needed!
      const { from, to, subject, html, text } = requestBody
      
      // Business logic (unchanged)...
      
      return NextResponse.json({ id: 'email_123', messageId: 'msg_456' })
    } catch (error) {
      console.error(`❌ [${requestId}] POST /api/v2/emails - Error:`, error)
      const apiError = buildApiError({
        status: 500,
        code: ERROR_CODES.INTERNAL_SERVER_ERROR,
        title: 'Internal Server Error',
        detail: 'An unexpected error occurred while sending email',
        instance: '/api/v2/emails',
        category: 'server_error',
        suggestion: 'Please try again later or contact support',
        requestId,
      })
      return NextResponse.json(apiError, { status: 500 })
    }
  }
})
```

### Example 2: GET with Query Parameters

**Before:**

```typescript
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100)
  const offset = parseInt(searchParams.get('offset') || '0')
  const status = searchParams.get('status')
  
  if (limit < 1 || limit > 100) {
    return NextResponse.json({ error: 'Invalid limit' }, { status: 400 })
  }
  
  if (offset < 0) {
    return NextResponse.json({ error: 'Invalid offset' }, { status: 400 })
  }
  
  // Business logic...
}
```

**After:**

```typescript
import { ApiErrorSchema, buildApiError, ERROR_CODES } from '../schemas/errors'
import { nanoid } from 'nanoid'

const GetDomainsQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(100).optional().default(50),
  offset: z.coerce.number().min(0).optional().default(0),
  status: z.enum(['pending', 'verified', 'failed']).optional(),
})

const GetDomainsResponseSchema = z.object({
  data: z.array(z.any()),
  pagination: z.object({
    limit: z.number(),
    offset: z.number(),
    total: z.number(),
    hasMore: z.boolean(),
  })
})

export const { GET } = defineRoute({
  operationId: "getDomains",
  method: "GET",
  summary: "List domains",
  description: "Retrieves a paginated list of domains with optional filtering",
  tags: ["Domains"],
  queryParams: GetDomainsQuerySchema,
  responses: {
    200: { description: "Success", content: GetDomainsResponseSchema },
    400: { description: "Invalid query parameters", content: ApiErrorSchema },
    401: { description: "Unauthorized", content: ApiErrorSchema },
    500: { description: "Internal server error", content: ApiErrorSchema },
  },
  action: async (params, req) => {
    const requestId = `req_${nanoid()}`
    console.log(`🌐 [${requestId}] GET /api/v2/domains - Starting request`)
    
    // Extract validated queryParams from params
    const queryParams = params.query as { limit: number; offset: number; status?: string }
    
    // Cast to NextRequest for validateRequest compatibility
    const request = req as unknown as NextRequest
    
    try {
      const { userId, error } = await validateRequest(request)
      if (!userId) {
        const apiError = buildApiError({
          status: 401,
          code: ERROR_CODES.AUTHENTICATION_REQUIRED,
          title: 'Authentication Required',
          detail: error || 'Valid API key required',
          instance: '/api/v2/domains',
          category: 'authentication_error',
          suggestion: 'Include Authorization: Bearer <api_key> header',
          requestId,
        })
        return NextResponse.json(apiError, { status: 401 })
      }
      
      // queryParams are validated by Zod and typed!
      const { limit, offset, status } = queryParams
      
      // Business logic (validation removed)...
      
      return NextResponse.json({
        data: [],
        pagination: { limit, offset, total: 0, hasMore: false }
      })
    } catch (error) {
      console.error(`❌ [${requestId}] GET /api/v2/domains - Error:`, error)
      const apiError = buildApiError({
        status: 500,
        code: ERROR_CODES.INTERNAL_SERVER_ERROR,
        title: 'Internal Server Error',
        detail: 'An unexpected error occurred while fetching domains',
        instance: '/api/v2/domains',
        category: 'server_error',
        suggestion: 'Please try again later or contact support',
        requestId,
      })
      return NextResponse.json(apiError, { status: 500 })
    }
  }
})
```

### Example 3: Dynamic Route with Path Parameters

**Before:**

```typescript
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  
  if (!id) {
    return NextResponse.json({ error: 'ID required' }, { status: 400 })
  }
  
  // Fetch resource by id...
  const resource = null // Replace with actual fetch
  
  if (!resource) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
}
```

**After:**

```typescript
import { ApiErrorSchema, buildApiError, ERROR_CODES } from '../schemas/errors'
import { nanoid } from 'nanoid'

const PathParamsSchema = z.object({
  id: z.string().min(1),
})

const DomainSchema = z.object({
  id: z.string(),
  domain: z.string(),
  status: z.string(),
})

export const { GET } = defineRoute({
  operationId: "getDomainById",
  method: "GET",
  summary: "Get domain by ID",
  description: "Retrieves detailed information about a specific domain",
  tags: ["Domains"],
  pathParams: PathParamsSchema,
  responses: {
    200: { description: "Domain found", content: DomainSchema },
    401: { description: "Unauthorized", content: ApiErrorSchema },
    404: { description: "Not found", content: ApiErrorSchema },
    500: { description: "Internal server error", content: ApiErrorSchema },
  },
  action: async (params, req) => {
    const requestId = `req_${nanoid()}`
    
    // Extract validated pathParams from params
    const pathParams = params.path as { id: string }
    const { id } = pathParams // Already validated by Zod!
    
    console.log(`🌐 [${requestId}] GET /api/v2/domains/[id] - Request for:`, id)
    
    // Cast to NextRequest for validateRequest compatibility
    const request = req as unknown as NextRequest
    
    try {
      const { userId, error } = await validateRequest(request)
      if (!userId) {
        const apiError = buildApiError({
          status: 401,
          code: ERROR_CODES.AUTHENTICATION_REQUIRED,
          title: 'Authentication Required',
          detail: error || 'Valid API key required',
          instance: `/api/v2/domains/${id}`,
          category: 'authentication_error',
          suggestion: 'Include Authorization: Bearer <api_key> header',
          requestId,
        })
        return NextResponse.json(apiError, { status: 401 })
      }
      
      // Fetch resource by id...
      const resource = null // Replace with actual fetch
      
      if (!resource) {
        const apiError = buildApiError({
          status: 404,
          code: ERROR_CODES.DOMAIN_NOT_FOUND,
          title: 'Domain Not Found',
          detail: `Domain with ID ${id} does not exist`,
          instance: `/api/v2/domains/${id}`,
          category: 'not_found_error',
          requestId,
        })
        return NextResponse.json(apiError, { status: 404 })
      }
      
      return NextResponse.json(resource)
    } catch (error) {
      console.error(`❌ [${requestId}] GET /api/v2/domains/[id] - Error:`, error)
      const apiError = buildApiError({
        status: 500,
        code: ERROR_CODES.INTERNAL_SERVER_ERROR,
        title: 'Internal Server Error',
        detail: 'An unexpected error occurred',
        instance: `/api/v2/domains/${id}`,
        category: 'server_error',
        suggestion: 'Please try again later',
        requestId,
      })
      return NextResponse.json(apiError, { status: 500 })
    }
  }
})
```

## Validation Checklist

After transformation, verify:

**Route Structure:**
- [ ] All HTTP methods are wrapped with `defineRoute`
- [ ] All TypeScript interfaces converted to Zod schemas
- [ ] Schema validations match original interface requirements
- [ ] Additional constraints from manual validation added to schemas
- [ ] Manual validation code removed (now in Zod schemas)
- [ ] File imports updated correctly

**OpenAPI Metadata:**
- [ ] Descriptive `operationId` follows naming convention
- [ ] Appropriate `tags` set for grouping
- [ ] `summary` and `description` are clear and helpful
- [ ] All response status codes defined in `responses`

**Error Handling (RFC 9457):**
- [ ] All error responses use `buildApiError` helper
- [ ] All errors include proper `code` from `ERROR_CODES`
- [ ] All errors include appropriate `category`
- [ ] All errors include helpful `suggestion` when applicable
- [ ] Request ID generated and used in all errors
- [ ] All errors use `ApiErrorSchema` in response definitions

**Preserved Functionality:**
- [ ] All `validateRequest` calls preserved
- [ ] All logging statements preserved (with emojis)
- [ ] Request IDs included in all log statements
- [ ] All business logic unchanged
- [ ] All database operations unchanged
- [ ] User scoping maintained
- [ ] Idempotency key handling preserved (if applicable)

**Code Quality:**
- [ ] No TypeScript errors
- [ ] Route still functions identically
- [ ] Schemas exported for testing (if needed)

## Common Error Patterns

Use these patterns consistently across all routes:

### Authentication Error (401)
```typescript
const apiError = buildApiError({
  status: 401,
  code: ERROR_CODES.AUTHENTICATION_REQUIRED,
  title: 'Authentication Required',
  detail: error || 'Valid API key required to access this endpoint',
  instance: request.url, // or specific path like '/api/v2/emails'
  category: 'authentication_error',
  suggestion: 'Include Authorization: Bearer <api_key> header in your request',
  requestId,
})
return NextResponse.json(apiError, { status: 401 })
```

### Authorization Error (403)
```typescript
const apiError = buildApiError({
  status: 403,
  code: ERROR_CODES.DOMAIN_NOT_OWNED,
  title: 'Permission Denied',
  detail: `You don't have permission to access domain: ${domain}`,
  instance: `/api/v2/domains/${id}`,
  category: 'authorization_error',
  suggestion: 'Verify you own this domain or check your permissions',
  requestId,
})
return NextResponse.json(apiError, { status: 403 })
```

### Validation Error (400) - from Zod
```typescript
import { ZodError } from 'zod'
import { zodErrorToApiError } from '../schemas/errors'

// Zod will automatically throw validation errors
// Catch them and convert to RFC 9457 format:
try {
  // validation happens automatically in defineRoute
} catch (err) {
  if (err instanceof ZodError) {
    const apiError = zodErrorToApiError(err, '/api/v2/emails', requestId)
    return NextResponse.json(apiError, { status: 400 })
  }
}
```

### Not Found Error (404)
```typescript
const apiError = buildApiError({
  status: 404,
  code: ERROR_CODES.DOMAIN_NOT_FOUND,
  title: 'Domain Not Found',
  detail: `Domain with ID ${id} does not exist or has been deleted`,
  instance: `/api/v2/domains/${id}`,
  category: 'not_found_error',
  requestId,
})
return NextResponse.json(apiError, { status: 404 })
```

### Conflict Error (409)
```typescript
const apiError = buildApiError({
  status: 409,
  code: ERROR_CODES.DOMAIN_ALREADY_REGISTERED,
  title: 'Domain Already Exists',
  detail: `Domain ${domain} is already registered`,
  instance: '/api/v2/domains',
  category: 'conflict_error',
  suggestion: 'Use a different domain or contact support to transfer ownership',
  requestId,
})
return NextResponse.json(apiError, { status: 409 })
```

### Rate Limit Error (429)
```typescript
const apiError = buildApiError({
  status: 429,
  code: ERROR_CODES.EMAIL_LIMIT_REACHED,
  title: 'Rate Limit Exceeded',
  detail: 'You have reached your email sending limit for this period',
  instance: '/api/v2/emails',
  category: 'rate_limit_error',
  suggestion: 'Upgrade your plan for higher limits or wait for the limit to reset',
  requestId,
})
return NextResponse.json(apiError, { status: 429 })
```

### Internal Server Error (500)
```typescript
const apiError = buildApiError({
  status: 500,
  code: ERROR_CODES.INTERNAL_SERVER_ERROR,
  title: 'Internal Server Error',
  detail: 'An unexpected error occurred while processing your request',
  instance: request.url,
  category: 'server_error',
  suggestion: 'Please try again later or contact support if the issue persists',
  requestId,
})
return NextResponse.json(apiError, { status: 500 })
```

## Common Pitfalls to Avoid

### 1. Correct Parameter Extraction Pattern

The library provides validated parameters in the `params` object. Extract them correctly:

```typescript
action: async (params, req) => {
  // ✅ CORRECT: Extract parameters from params object
  const requestBody = params.body as YourRequestType
  const queryParams = params.query as YourQueryType
  const pathParams = params.path as YourPathType
  
  // ✅ CORRECT: Cast req to NextRequest if needed for auth helpers
  const request = req as unknown as NextRequest
  
  // ❌ WRONG: Trying to destructure directly
  // action: async ({ requestBody }, req) => // This won't work!
  
  // ❌ WRONG: Using (params as any).body
  // This works but defeats TypeScript's purpose
}
```

### 2. Request Type Casting for Auth Helpers

The library provides standard `Request`, but Next.js auth helpers expect `NextRequest`:

```typescript
action: async (params, req) => {
  // Cast once at the top for clarity
  const request = req as unknown as NextRequest
  
  // Now use with validateRequest or other NextRequest-specific helpers
  const { userId } = await validateRequest(request)
}
```

### 3. Query Parameter Coercion

URL query params are strings. Use `z.coerce` to convert:

```typescript
z.object({
  limit: z.coerce.number(), // Converts string to number
  active: z.coerce.boolean(), // Converts 'true'/'false' to boolean
})
```

### 4. Type Assertions Are Safe After Zod Validation

Since Zod validates the data structure before it reaches your action function, type assertions are safe:

```typescript
action: async (params, req) => {
  // ✅ Safe because Zod already validated the schema
  const requestBody = params.body as PostEmailsRequest
  
  // The type assertion just helps TypeScript understand what we already know
  // from Zod's validation
}
```

### 5. Optional vs Nullable

Choose correctly:
- `.optional()` - field can be omitted
- `.nullable()` - field must be present but can be null
- `.nullish()` - field can be omitted or null

### 6. Export Schemas for Testing

Make schemas available for tests:

```typescript
// Export schemas
export { 
  PostEmailsRequestSchema, 
  PostEmailsResponseSchema 
}
```

## Reference Files

- **Rule**: `.cursor/rules/oct10th-api-endpoints.mdc` - Comprehensive patterns and examples
- **Current Rules**: `.cursor/rules/api-endpoints.mdc` - Existing endpoint guidelines  
- **Example Routes**:
  - `app/api/v2/emails/route.ts` - POST with request body
  - `app/api/v2/domains/route.ts` - GET with query params, POST
  - `app/api/v2/domains/[id]/route.ts` - Dynamic route with path params
  - `app/api/v2/endpoints/route.ts` - Multiple methods in one file

## Testing the Transformation

After transforming a route:

1. **Check TypeScript compilation**: `bun run type-check` (don't actually run, just verify mentally)
2. **Test manually**: Use the API to verify behavior unchanged
3. **Verify validation**: Try invalid inputs to confirm Zod catches them
4. **Check error messages**: Ensure Zod error messages are user-friendly
5. **Review logs**: Confirm all logging still works
6. **Test auth**: Verify authentication still works correctly

## Summary

This command transforms traditional Next.js API routes into modern, type-safe, self-documenting endpoints using:

✅ **Zod schemas** for runtime validation  
✅ **OpenAPI metadata** for documentation  
✅ **TypeScript inference** for type safety  
✅ **Preserved logic** for consistency  
✅ **Better DX** through automatic validation  

The result is cleaner code with better documentation and type safety, while maintaining all existing functionality.

