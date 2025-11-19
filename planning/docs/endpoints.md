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

---

## Implementation Notes

### Current Status

**Completed:**
- ✅ Database schema (`endpoints`, `emailGroups`, `endpointDeliveries` tables)
- ✅ Zod validation schemas (app/api/v3/endpoints/_schemas.ts)
- ✅ Svix type definitions (lib/svix/types.ts, lib/svix/event-types.ts)
- ✅ Svix integration documentation (lib/svix/README.md)

**Pending Implementation:**
- ⏳ ORPC route handlers for all 9 endpoints
- ⏳ Svix SDK client wrapper
- ⏳ Endpoint CRUD operations with Svix sync
- ⏳ Event delivery and query operations
- ⏳ V2 to V3 migration logic
- ⏳ Integration tests

### Architecture Decisions

**1. Svix Application-to-User Mapping**
- Each user gets one Svix Application (created on first webhook endpoint)
- All of a user's webhook endpoints belong to their Svix Application
- Provides isolation and proper multi-tenancy

**2. Endpoint Type Handling**
- `webhook` type: Synced with Svix (create/update/delete operations)
- `email_forward` type: Direct email forwarding, no Svix
- `email_group` type: Uses `emailGroups` table for multiple recipients, no Svix

**3. Configuration Storage**
- Endpoint `config` field stores JSON (type-specific structure)
- Webhook config: `{ url, subscribedEvents, timeout, headers, retryAttempts }`
- Email forward config: `{ forwardTo }`
- Email group config: `{ emails: [] }` (stored in `emailGroups` table)

**4. Event Delivery**
- Webhook events: Svix handles delivery, retries, and logging
- Email forwards: Direct SES sending
- Delivery tracking via `endpointDeliveries` table for all types

### Error Handling Patterns

**Svix Integration Errors:**
```typescript
// Application not found → create it
// Endpoint creation failure → rollback DB transaction
// Event delivery failure → logged in endpointDeliveries
// Rate limit → exponential backoff retry
```

**Validation Errors:**
- Zod schemas validate all inputs before processing
- Type-specific config validation via discriminated unions
- URL validation for webhooks (must be HTTPS in production)

### Rate Limits

**Svix API Limits:**
- 1000 requests/minute to Svix API
- Configurable per-application rate limits
- Configurable per-endpoint rate limits

**Recommended Limits:**
- Application: 1000 req/sec (shared across user's webhooks)
- Endpoint: 100 req/sec (per individual webhook)

### Security Considerations

**Webhook Security:**
- Svix auto-generates signing secrets for each endpoint
- Users access secrets via App Portal
- Signatures validate webhook authenticity

**Data Privacy:**
- Svix stores event data for 90 days
- Portal URLs are time-limited (1 hour default)
- Full email content sent in webhook payloads

**Access Control:**
- User can only manage their own endpoints
- Svix Application ID tied to userId
- Portal access scoped to user's application

### Performance Optimizations

**Database:**
- Indexes on `endpoints.userId`, `endpoints.type`, `endpoints.isActive`
- Compound index on `endpointDeliveries.emailId + status`
- Unique constraint: `endpointDeliveries.emailId + endpointId`

**Svix Operations:**
- Batch event sending when possible
- Cache Svix Application IDs (one per user)
- Reuse Svix client instances

### Known Limitations

**Svix Constraints:**
- Endpoint URLs must be HTTPS (HTTP allowed in development)
- Maximum payload size: 512 KB
- Event retention: 90 days
- Maximum retries: configurable (recommended: 3)

**Email Group Constraints:**
- Maximum 100 emails per group (schema enforced)
- No de-duplication of email addresses
- All recipients receive individual forwards

### Testing Strategy

**Unit Tests:**
- Svix client wrapper functions
- Config validation for each endpoint type
- Event payload schema validation

**Integration Tests:**
- Create webhook → verify Svix application + endpoint
- Update webhook → verify Svix sync
- Delete webhook → verify Svix cleanup
- Send test event → verify delivery
- List events → verify Svix query
- Portal URL generation → verify time-limited URL
- V2 migration → verify v3 endpoint creation

**Test Coverage Goals:**
- Svix integration: 90%+ coverage
- ORPC handlers: 100% coverage
- Error scenarios: All error codes tested

### Monitoring & Observability

**Key Metrics:**
- Endpoint creation/update/delete success rates
- Webhook delivery success rates (from Svix)
- Event processing latency
- Svix API error rates

**Logging:**
- All Svix API calls with request/response
- Endpoint lifecycle events (create/update/delete)
- Failed deliveries with error details
- Portal URL generation events

**Alerts:**
- Svix API errors > threshold
- Endpoint delivery failures > threshold
- Application creation failures
- Portal URL generation failures

### Migration Plan (V2 → V3)

**Trigger:**
- User's first interaction with v3 endpoints API
- Or explicit migration endpoint call

**Process:**
1. List all v2 webhooks for user
2. For each v2 webhook:
   - Create Svix Application (if first webhook)
   - Create Svix Endpoint
   - Create v3 endpoint record
   - Link email addresses to new endpoint
   - Mark v2 webhook as migrated (don't delete)
3. Return migration summary

**Rollback:**
- Keep v2 webhooks intact during migration
- Allow dual operation (v2 + v3) temporarily
- Provide explicit "delete v2 data" endpoint

### API Versioning

**Backward Compatibility:**
- v2 API remains functional indefinitely
- v3 endpoints are additive (not breaking)
- Clients can use both APIs simultaneously

**Deprecation Strategy:**
- v2 marked deprecated after v3 stable
- 6-month sunset period for v2
- Automated migration notices

### Future Enhancements

**Planned:**
- Webhook format transformations (Discord, Slack, custom)
- Event filtering rules (beyond event type)
- Webhook retries with custom schedules
- Bulk endpoint operations
- Endpoint templates

**Under Consideration:**
- Webhook batching (multiple events in one request)
- Conditional delivery (rules engine)
- Custom event types
- Webhook analytics dashboard
- A/B testing for webhook endpoints

### Dependencies

**NPM Packages:**
- `svix` - Official Svix SDK for Node.js
- `zod` - Runtime validation (already used)
- `drizzle-orm` - Database ORM (already used)

**Environment Variables:**
```bash
SVIX_API_KEY=your_svix_api_key  # Required for Svix integration
SVIX_ENVIRONMENT=production     # Optional: 'development' or 'production'
```

**External Services:**
- Svix API (https://api.svix.com)
- Svix App Portal (https://app.svix.com)

### References

- [Svix Documentation](https://docs.svix.com/)
- [Svix SDK Documentation](./lib/svix/README.md)
- [Event Types Reference](./lib/svix/event-types.ts)
- [Type Definitions](./lib/svix/types.ts)
- [Endpoint Schemas](./app/api/v3/endpoints/_schemas.ts)

