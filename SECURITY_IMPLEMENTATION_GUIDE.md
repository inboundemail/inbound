# Security Implementation Guide

This guide provides instructions on how to use the security features implemented in the Inbound application.

## Table of Contents
1. [Security Headers](#security-headers)
2. [Environment Variables](#environment-variables)
3. [API Security](#api-security)
4. [Input Validation](#input-validation)
5. [Rate Limiting](#rate-limiting)
6. [Webhook Security](#webhook-security)
7. [HTML Sanitization](#html-sanitization)

## Security Headers

Security headers are automatically applied to all routes via `next.config.ts`. No additional configuration needed.

### Headers Applied:
- **Content-Security-Policy**: Prevents XSS attacks
- **X-Frame-Options**: Prevents clickjacking
- **X-Content-Type-Options**: Prevents MIME-type sniffing
- **Strict-Transport-Security**: Forces HTTPS (production only)
- **Referrer-Policy**: Controls referrer information
- **Permissions-Policy**: Disables unnecessary browser features

## Environment Variables

Use the centralized environment validation system:

```typescript
import { env } from '@/lib/env-validation'

// Type-safe access to environment variables
const apiKey = env.RESEND_API_KEY
const dbUrl = env.DATABASE_URL
```

### Required Environment Variables:
- `DATABASE_URL`: Database connection string

### Optional Environment Variables:
See `lib/env-validation.ts` for the full list.

## API Security

### Using the Security Middleware

```typescript
import { withSecurity, securityPresets } from '@/lib/middleware/security'
import { mySchema } from '@/lib/validation/api-schemas'

export const POST = withSecurity(
  async (req: NextRequest) => {
    // Your handler code
  },
  {
    ...securityPresets.authenticated,
    bodySchema: mySchema,
    allowedMethods: ['POST'],
  }
)
```

### Authentication

For endpoints requiring authentication:

```typescript
import { authenticateV2Request } from '@/lib/auth/v2-auth'

const authResult = await authenticateV2Request(req)
if (!authResult.success) {
  return NextResponse.json({ error: authResult.error }, { status: 401 })
}

const userId = authResult.user.id
```

## Input Validation

### Creating Validation Schemas

```typescript
import { z } from 'zod'

export const mySchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(100),
  age: z.number().min(0).max(150).optional(),
})
```

### Using Validation in Endpoints

```typescript
import { validateRequestBody } from '@/lib/validation/api-schemas'

const validation = validateRequestBody(mySchema, body)
if (!validation.success) {
  return NextResponse.json(
    { error: validation.error },
    { status: 400 }
  )
}

const data = validation.data // Type-safe data
```

## Rate Limiting

### Default Rate Limits

- **Auth endpoints**: 5 requests per 15 minutes
- **API endpoints**: 60 requests per minute
- **Webhook endpoints**: 100 requests per minute
- **Email endpoints**: 10 requests per hour

### Custom Rate Limiting

```typescript
import { withRateLimit, rateLimitConfigs } from '@/lib/middleware/rate-limit'

export const POST = withRateLimit(
  async (req: NextRequest) => {
    // Your handler
  },
  {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 30,
    message: 'Custom rate limit message'
  }
)
```

## Webhook Security

### Generating Webhook Signatures

```typescript
import { generateWebhookSignature } from '@/lib/webhooks/signature-validation'

const signature = generateWebhookSignature(payload, secret)
// Returns: "t=1234567890,v1=abc123..."
```

### Validating Webhook Signatures

```typescript
import { validateWebhookSignature } from '@/lib/webhooks/signature-validation'

const result = validateWebhookSignature(payload, signature, secret)
if (!result.valid) {
  return NextResponse.json(
    { error: result.error },
    { status: 401 }
  )
}
```

### Webhook Best Practices

1. Always use HTTPS for webhook URLs
2. Implement signature validation
3. Use timestamp validation to prevent replay attacks
4. Set reasonable timeouts (10-30 seconds)
5. Implement retry logic with exponential backoff

## HTML Sanitization

### Sanitizing User Input

```typescript
import { sanitizeHtml } from '@/lib/email-management/email-parser'

const cleanHtml = sanitizeHtml(userInput)
```

### What Gets Removed:
- All `<script>` tags
- All `<style>` tags
- Event handlers (onclick, onload, etc.)
- javascript: and vbscript: protocols
- Form tags
- iframe, embed, object tags
- Meta and link tags
- Base tags
- HTML comments

## Security Checklist

Before deploying:

- [ ] All environment variables are validated
- [ ] All API endpoints use authentication where needed
- [ ] All user inputs are validated with Zod schemas
- [ ] Rate limiting is applied to all endpoints
- [ ] Webhook signatures are validated
- [ ] HTML content is sanitized
- [ ] Security headers are properly configured
- [ ] HTTPS is enforced in production
- [ ] Error messages don't expose sensitive information
- [ ] Dependencies are up to date

## Common Security Patterns

### Secure API Endpoint Pattern

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { withSecurity, securityPresets } from '@/lib/middleware/security'
import { mySchema } from '@/lib/validation/api-schemas'
import { authenticateV2Request } from '@/lib/auth/v2-auth'

export const POST = withSecurity(
  async (req: NextRequest) => {
    // Authentication
    const auth = await authenticateV2Request(req)
    if (!auth.success) {
      return NextResponse.json({ error: auth.error }, { status: 401 })
    }

    // Validated body is already available
    const data = getValidatedBody<typeof mySchema._type>(req)

    try {
      // Your business logic here
      return NextResponse.json({ success: true })
    } catch (error) {
      // Don't expose internal errors
      return NextResponse.json(
        { error: 'Operation failed' },
        { status: 500 }
      )
    }
  },
  {
    ...securityPresets.authenticated,
    bodySchema: mySchema,
    allowedMethods: ['POST'],
  }
)
```

### Secure Webhook Handler Pattern

```typescript
import { validateWebhookSignature } from '@/lib/webhooks/signature-validation'

export async function POST(req: NextRequest) {
  const signature = req.headers.get('x-webhook-signature')
  const body = await req.text()

  // Validate signature
  const validation = validateWebhookSignature(body, signature, webhookSecret)
  if (!validation.valid) {
    return NextResponse.json({ error: validation.error }, { status: 401 })
  }

  // Process webhook
  const data = JSON.parse(body)
  // ...
}
```

## Monitoring and Alerts

1. Monitor rate limit violations in logs
2. Set up alerts for repeated authentication failures
3. Track webhook signature validation failures
4. Monitor for unusual traffic patterns

## Updates and Maintenance

1. Regularly update dependencies: `npm update`
2. Review security headers quarterly
3. Audit API endpoints for proper authentication
4. Test rate limits under load
5. Rotate webhook secrets periodically