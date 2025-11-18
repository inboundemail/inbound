# v3 Endpoints API - Route Planning

## Architecture

**Endpoint** = Destination for email data (parent concept)

**Endpoint Types:**
- `webhook` - HTTP endpoint powered by Svix
- `email_forward` - Forward to single email address
- `email_group` - Forward to multiple email addresses

---

## Routes

### 1. Collection Operations
**`GET /api/v3/endpoints`**
- List all endpoints with pagination
- Query: `limit`, `offset`, `type`, `active`, `sortBy`
- Returns: endpoints with delivery stats

**`POST /api/v3/endpoints`**
- Create any type of endpoint (webhook, email_forward, or email_group)
- For `webhook`: Svix application + endpoint created automatically
- For `email_forward`: No Svix, direct email forwarding
- For `email_group`: No Svix, direct email forwarding to multiple addresses
- Config structure varies by type

**Config examples:**
```typescript
// webhook type
{
  type: "webhook",
  config: {
    url: "https://api.example.com/webhook",
    subscribedEvents: ["email.received"],
    timeout: 30,
    headers: {}
  }
}

// email_forward type
{
  type: "email_forward",
  config: {
    forwardTo: "user@example.com"
  }
}

// email_group type
{
  type: "email_group",
  config: {
    emails: ["user1@example.com", "user2@example.com"]
  }
}
```

---

### 2. Individual Endpoint Operations
**`GET /api/v3/endpoints/{id}`**
- Get endpoint details + delivery stats
- Webhook types include: Svix IDs + portal URL (time-limited, 1hr)
- Query: `includePortal=true` (optional, webhook only - generates fresh portal URL)

**`PUT /api/v3/endpoints/{id}`**
- Update endpoint (name, config, isActive)
- Syncs to Svix if webhook type

**`DELETE /api/v3/endpoints/{id}`**
- Delete endpoint
- Removes from Svix if webhook type
- Returns count of affected email addresses

---

### 3. Send Operations
**`POST /api/v3/endpoints/{id}/send`**
- **Test mode** (all types): Send test event with synthetic data
  - Optional: `eventType`, `overrideUrl`
- **Resend mode** (webhooks only): Resend existing event
  - Required: `eventId`

---

### 4. Webhook Events (webhooks only)
**`GET /api/v3/endpoints/{id}/events`**
- List webhook delivery history from Svix
- Query: `limit`, `offset`, `eventType`, `status`, `startDate`, `endDate`

**`GET /api/v3/endpoints/{id}/events/{eventId}`**
- Get full event details including all delivery attempts
- Shows request/response logs, timing, errors

---

### 5. Metadata
**`GET /api/v3/endpoints/event-types`**
- List all available webhook event types
- Returns name, description, JSON schema

---

## Route Summary

| Method | Route | Purpose | Types |
|--------|-------|---------|-------|
| `GET` | `/api/v3/endpoints` | List endpoints | All |
| `POST` | `/api/v3/endpoints` | Create endpoint | All |
| `GET` | `/api/v3/endpoints/{id}` | Get details + portal URL | All |
| `PUT` | `/api/v3/endpoints/{id}` | Update | All |
| `DELETE` | `/api/v3/endpoints/{id}` | Delete | All |
| `POST` | `/api/v3/endpoints/{id}/send` | Test/resend | All |
| `GET` | `/api/v3/endpoints/{id}/events` | List events | Webhook |
| `GET` | `/api/v3/endpoints/{id}/events/{eventId}` | Event details | Webhook |
| `GET` | `/api/v3/endpoints/event-types` | Event types | Meta |

**9 routes total** (6 for all types, 2 webhook-only, 1 metadata)

---

## Webhook Event Types

- `email.received` - New email received
- `email.replied` - Reply sent
- `email.bounced` - Email bounced
- `email.delivered` - Delivery confirmed
- `email.failed` - Delivery failed
- `domain.verified` - Domain verified
- `domain.verification_failed` - Verification failed
- `email.opened` - Opened (if tracking enabled)
- `email.clicked` - Link clicked (if tracking enabled)

---

## Implementation Strategy

### Webhook Endpoints
- Create: Svix Application + Endpoint
- Update: Sync to Svix
- Delete: Remove from Svix
- Events: Proxy to Svix API
- Portal URL: Generated on GET (optional via `?includePortal=true`), time-limited (1hr)

### Email Forward/Group Endpoints
- Direct email forwarding (no Svix)
- Works same as v2

### Migration
- v2 API stays functional
- Auto-migrate v2 webhooks → Svix on first v3 use

