# Intern Technical On-Boarding: API v2 Unification

---

## 1. High-Level Architecture

1. **Frontend / Dashboard** ↔ **Next.js `/app` routes**
2. **API Layer** – all REST endpoints live under `app/api/*` (v1, v1.1 and **v2**) and are implemented as **server actions** or **route handlers**.
3. **Reusable Libraries** under `lib/` implement all business logic (DB, SES, forwarding, etc.).  API routes call these libs – the route files are intentionally thin wrappers.
4. **Background Processing**
   • AWS **SES** receives the e-mail.
   • SES stores the raw message in **S3** and invokes a **Lambda** (`aws/cdk/lib/lambda/email-processor.ts`).
   • Lambda calls your `/api/inbound/webhook` endpoint which persists data to Postgres via the same libs used by the dashboard.
5. **Database** – Postgres accessed through **Drizzle ORM** (`lib/db/schema.ts`).
6. **Infrastructure-as-Code** – AWS CDK project in `aws/cdk` deploys bucket, lambda, receipt rules, alarms, etc.


## 2. Repository Map (↑ = entry file to open first)

```
aws/
 └─ cdk/                ↑  – CDK stack + Lambda source
app/
 ├─ api/
 │   ├─ v2/             ↑  – Route handlers for the new API
 │   └─ inbound/        ↑  – Webhook endpoint hit by the SES Lambda
 └─ actions/primary.ts  ↑  – Monolithic legacy action file (will be split into libs)
features/               – React features, follows “Types Rule” convention
lib/
 ├─ aws-ses/            ↑  – SES helpers & receipt-rule manager
 ├─ db/                 ↑  – Drizzle schema & generated types
 ├─ email-management/   ↑  – Parsing, routing, forwarding utilities
 ├─ domains-and-dns/    – DNS lookup & verification helpers
 ├─ webhooks/           – Webhook formats + migrations
 ├─ auth/               – Next-Auth thin wrappers
 └─ openapi/            – Existing v1 OpenAPI spec (reference only)
```

> Tip: start any deep-dive by opening the ↑ entries.


## 3. Key Libraries & Where They Are Used

### 3.1 `lib/aws-ses`
*Primary classes*: `AWSSESReceiptRuleManager`, `AWSSESEmailProcessor`.
* Responsibilities:
  • Create/update/remove SES **receipt rules** (individual + catch-all).
  • Fetch & parse e-mails from S3.
  • Bounce spam/virus messages.

*Referenced from*
```
9:9:app/actions/primary.ts          import { AWSSESReceiptRuleManager } from '@/lib/aws-ses/aws-ses-rules'
6:2:app/api/inbound/configure-email/route.ts …
10:10:app/api/inbound/webhook/route.ts        import { type SESEvent } from '@/lib/aws-ses/aws-ses'
```  
Lambda uses the same helper:
```1:80:aws/cdk/lib/lambda/email-processor.ts
import { S3Client,… } from '@aws-sdk/client-s3'; // direct SDK calls
```

### 3.2 `lib/email-management`
Functions: `parseEmail`, `emailRouter`, `emailForwarder`, etc.  Central place for everything MIME/SMTP-related.
Used by dashboard actions (`app/actions/primary.ts`) and by inbound webhook to normalise incoming messages.

### 3.3 `lib/domains-and-dns`
`dns.ts` + `domain-verification.ts` perform MX/TXT look-ups and verify SES + DNS status.
Called from actions when user adds a domain.

### 3.4 `lib/webhooks`
Defines outbound payload formats (`webhook-formats.ts`) and utilities to migrate legacy webhook rows to the new unified **endpoints** table.

### 3.5 `lib/db`
Single **source-of-truth** for all relational data.  Tables are defined with Drizzle; types are inferred via `$inferSelect` / `$inferInsert` – see the always-applied “Types Rule”.
Important new table:
```227:260:lib/db/schema.ts
export const structuredEmails = pgTable('structured_emails', { … })
```
`structuredEmails` supersedes the deprecated `receivedEmails` + `parsedEmails`.


## 4. AWS Email Stack (CDK)

`aws/cdk/lib/inbound-email-stack.ts` provisions:
* **S3 Bucket** – stores raw messages using `emails/<domain>[/catchall]/<messageId>` prefix.
* **Lambda** – `aws/cdk/lib/lambda/email-processor.ts` (Node 18). Reads from S3, calls your API webhook.
* **SES Receipt Rule Set** – created & activated so that **SES → S3 + Lambda**.
* **SQS DLQ** – captures failed Lambda invocations.
* **CloudWatch Alarms** – errors, duration, throttles.

The Lambda searches two prefixes to support both individual rules and catch-all rules:
```120:150:aws/cdk/lib/lambda/email-processor.ts
const possibleKeys = [
  `emails/${domain}/${messageId}`,
  `emails/${domain}/catchall/${messageId}`
]
```


## 5. Email Lifecycle

1. **Inbound**: MX points to SES → SES stores in S3 + triggers Lambda.
2. **Lambda**: Fetches raw MIME, packages original SES record + content, POSTs to `/api/inbound/webhook` with API-key auth.
3. **Webhook Route** (`app/api/inbound/webhook/route.ts`):
   * Uses `lib/email-management/parseEmail` to transform MIME into **ParsedEmailData**.
   * Persists **sesEvents** + **structuredEmails** rows via Drizzle.
   * Dispatches deliveries to endpoints (webhook, forward, group) asynchronously.
4. **Dashboard / API v2**: Reads from `structuredEmails` only – no direct S3 access required.


## 6. Database Cheat-Sheet
| Table | Purpose |
|-------|---------|
| `email_domains` | User-owned domains & SES/DNS status |
| `email_addresses` | Individual aliases (user@domain) |
| `structured_emails` | Canonical parsed e-mail records |
| `endpoints` | Unified destinations (webhook, forward, group) |
| `endpoint_deliveries` | Async delivery attempts |
| `ses_events` | Raw SES event JSON + S3 pointers |

_All tables & types live in_ `lib/db/schema.ts`.


## 7. API v2 Route Specification
Full spec lives in [`app/api/v2/endpoints.md`](app/api/v2/endpoints.md).  Highlights:

```
GET  /api/v2/domains              listDomains
POST /api/v2/domains/{id}/catch-all  enableCatchAll
GET  /api/v2/emails/{id}          getEmailDetails
POST /api/v2/endpoints            createEndpoint
… (see file for complete matrix)
```
All endpoints share these traits:
1. Dual-auth: **NextAuth session** _or_ `Authorization: Bearer <API-Key>`.
2. Thin handler → delegates to a library (see §3) to enforce single business-logic path.
3. Response envelope `{ success: boolean, data?: any, error?: string }`.

> When implementing a new route start by adding a function to the relevant lib, then import that into `app/api/v2/.../route.ts`.


## 8. Development Guidelines

1. **Type Safety** – never re-declare DB-derived types; import from feature-level `types/index.ts` (see “Types Rule”).
2. **Package Manager** – use **bun** (`bun install`, etc.).
3. **Do _not_** run `bun run dev` or `bun run build` in CI without approval (heavy stack).
4. **AWS Credentials** – local testing uses `.env` values emitted by the CDK stack outputs.
5. **Icons** – always import from `react-icons/hi`.


## 9. Implementation Roadmap for API v2

Phase 1 – core CRUD:
* Port `createEmailAddress`, `createEndpoint`, `enableCatchAll` into new libs.
* Scaffold `/api/v2/*` route handlers that simply call the new libs + return JSON.

Phase 2 – migrations:
* Replace all dashboard reads of `receivedEmails`/`parsedEmails` with `structuredEmails`.
* Migrate legacy webhooks to unified `endpoints`.

Phase 3 – advanced features & cleanup:
* Delivery retry queue, analytics endpoints, OAuth integrations.


---
_You’re now ready to deep-dive – happy coding!_