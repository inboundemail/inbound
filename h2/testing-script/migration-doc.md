# Inbound v2 API → Hono Migration Tracker

This document tracks the migration of Next.js API routes to Hono for the v2 API.

**Migration Status Legend:**
- ❌ Not migrated
- 🚧 In progress
- ✅ Migrated and tested

---

## 📎 Attachments

- ❌ GET /api/v2/attachments/[id]/[filename]

## 🌐 Domains

### Base Routes
- ❌ GET /api/v2/domains
- ❌ POST /api/v2/domains

### Domain by ID
- ❌ GET /api/v2/domains/[id]
- ❌ PUT /api/v2/domains/[id]
- ❌ DELETE /api/v2/domains/[id]
- ❌ PATCH /api/v2/domains/[id]

### Domain Authentication
- ❌ POST /api/v2/domains/[id]/auth
- ❌ PATCH /api/v2/domains/[id]/auth

### Domain DNS Records
- ❌ GET /api/v2/domains/[id]/dns-records

## 📧 Email Addresses

### Base Routes
- ❌ GET /api/v2/email-addresses
- ❌ POST /api/v2/email-addresses

### Email Address by ID
- ❌ GET /api/v2/email-addresses/[id]
- ❌ PUT /api/v2/email-addresses/[id]
- ❌ DELETE /api/v2/email-addresses/[id]

## 📨 Emails (Sending)

### Base Routes
- ❌ POST /api/v2/emails

### Email by ID
- ❌ GET /api/v2/emails/[id]

### Email Actions
- ❌ POST /api/v2/emails/[id]/reply
- ❌ POST /api/v2/emails/[id]/resend _(Note: Can replace `/retry-delivery` - more flexible, use `endpointId` instead of `deliveryId`)_
- ❌ POST /api/v2/emails/[id]/retry-delivery _(⚠️ Deprecate: Use `/resend` instead)_

### Email Scheduling
- ❌ POST /api/v2/emails/schedule
- ❌ GET /api/v2/emails/schedule
- ❌ GET /api/v2/emails/schedule/[id]
- ❌ DELETE /api/v2/emails/schedule/[id]

## 🔗 Endpoints

### Base Routes
- ❌ GET /api/v2/endpoints
- ❌ POST /api/v2/endpoints

### Endpoint by ID
- ❌ GET /api/v2/endpoints/[id]
- ❌ PUT /api/v2/endpoints/[id]
- ❌ DELETE /api/v2/endpoints/[id]

### Endpoint Actions
- ❌ POST /api/v2/endpoints/[id]/test

## 🧵 Threads

### Base Routes
- ❌ GET /api/v2/threads
- ❌ GET /api/v2/threads/stats

### Thread by ID
- ❌ GET /api/v2/threads/[id]
- ❌ POST /api/v2/threads/[id]/actions


Located in `/app/api/v2/helper/`:
- `main.ts` - `validateRequest()`
- `attachment-processor.ts` - Attachment handling
- `email-builder.ts` - Raw email construction
- `webhook-tester.ts` - Testing utilities