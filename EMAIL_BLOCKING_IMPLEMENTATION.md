# Email Blocking Implementation

## Overview

I've implemented a comprehensive email blocking system that allows users to block email addresses from catch-all domains. This system prevents emails from blocked senders from being processed and routed to webhooks/endpoints.

## Key Features

### 1. Selective Blocking
- ✅ Only emails from **catch-all domains** can be blocked
- ✅ **Manually added email addresses** cannot be blocked (safety feature)
- ✅ Domain must exist in the system and have catch-all enabled

### 2. Database Schema
- ✅ New `blocked_emails` table with proper constraints
- ✅ Unique constraint on email addresses
- ✅ References to domain and blocking user
- ✅ Optional reason field for documentation

### 3. Core Functions

#### `blockEmail(emailAddress, blockedBy, reason?)`
- Validates email format
- Checks if domain exists and is catch-all enabled
- Prevents blocking manually added emails
- Creates blocked email record

#### `isEmailBlocked(emailAddress)`
- Quick check if an email is blocked
- Used by webhook handler for filtering

#### `unblockEmail(emailAddress)`
- Removes email from blocklist

#### `getBlockedEmailsForUser(userId)`
- Returns all blocked emails across user's domains

### 4. Webhook Integration
- ✅ SES webhook checks blocked emails before processing
- ✅ Blocked emails get status: `'blocked'`
- ✅ Blocked emails skip routing to endpoints/webhooks
- ✅ Metadata includes blocking information

### 5. Server Actions
- ✅ `blockEmailAction()` - Frontend-accessible blocking
- ✅ `unblockEmailAction()` - Frontend-accessible unblocking
- ✅ `getBlockedEmailsAction()` - Get user's blocked emails
- ✅ `checkEmailBlockedAction()` - Check if email is blocked

## Usage Examples

### Blocking an Email
```typescript
import { blockEmailAction } from '@/app/actions/blocking'

const result = await blockEmailAction(
  'spam@example.com',
  'Persistent spam emails'
)

if (result.success) {
  console.log(result.message) // "Successfully blocked spam@example.com from catch-all domain example.com"
} else {
  console.error(result.error)
}
```

### Checking if Email is Blocked
```typescript
import { isEmailBlocked } from '@/lib/email-blocking'

const blocked = await isEmailBlocked('spam@example.com')
console.log(`Email is ${blocked ? 'blocked' : 'allowed'}`)
```

### Getting All Blocked Emails
```typescript
import { getBlockedEmailsAction } from '@/app/actions/blocking'

const result = await getBlockedEmailsAction()
if (result.success) {
  result.blockedEmails?.forEach(email => {
    console.log(`${email.emailAddress} - ${email.reason}`)
  })
}
```

## Email Processing Flow

1. **Email Received** → SES processes email
2. **Webhook Handler** → Checks if sender is blocked using `isEmailBlocked()`
3. **Status Assignment**:
   - Blocked emails: `status: 'blocked'`
   - Normal emails: `status: 'received'`
4. **Routing Decision**:
   - Blocked emails: Skip routing, log blocking
   - Normal emails: Route to configured endpoints

## Database Migration

A migration has been generated: `drizzle/0018_clammy_zaran.sql`

```sql
CREATE TABLE "blocked_emails" (
  "id" varchar(255) PRIMARY KEY NOT NULL,
  "email_address" varchar(255) NOT NULL,
  "domain_id" varchar(255) NOT NULL,
  "reason" text,
  "blocked_by" varchar(255) NOT NULL,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now(),
  CONSTRAINT "blocked_emails_email_address_unique" UNIQUE("email_address")
);
```

## Safety Features

### 1. Domain Validation
- Only domains in the system can have blocked emails
- Domain must have catch-all enabled
- Prevents blocking emails from non-catch-all domains

### 2. Manual Email Protection
- Manually added email addresses cannot be blocked
- Prevents accidental blocking of important addresses
- Clear error message when attempted

### 3. User Isolation
- Users can only block emails on their own domains
- Authentication required for all operations
- Proper user session validation

## Error Handling

The system provides detailed error messages:

- `"Invalid email format"` - Malformed email address
- `"Domain not found in the system"` - Domain doesn't exist
- `"Domain does not have catch-all enabled"` - Not a catch-all domain
- `"Cannot block manually added email addresses"` - Safety protection
- `"Email address is already blocked"` - Duplicate blocking attempt

## Testing

A test script is available: `scripts/test-email-blocking.ts`

```bash
bun run scripts/test-email-blocking.ts
```

## Files Created/Modified

### New Files
- `lib/email-blocking.ts` - Core blocking functionality
- `app/actions/blocking.ts` - Server actions for frontend
- `scripts/test-email-blocking.ts` - Test script
- `drizzle/0018_clammy_zaran.sql` - Database migration

### Modified Files
- `lib/db/schema.ts` - Added blocked_emails table and EMAIL_STATUS.BLOCKED
- `app/api/inbound/webhook/route.ts` - Added blocking check in email processing

## Next Steps

To complete the implementation, you would need to:

1. **Run the migration** to create the blocked_emails table
2. **Create a UI interface** for managing blocked emails
3. **Add blocked email management** to the dashboard
4. **Implement bulk blocking** features if needed
5. **Add email pattern blocking** (e.g., block all emails from a domain)

## Security Considerations

- ✅ User authentication required for all operations
- ✅ Users can only manage blocks on their own domains
- ✅ Input validation on all email addresses
- ✅ Protection against blocking critical manually-added emails
- ✅ Proper error handling without information leakage 