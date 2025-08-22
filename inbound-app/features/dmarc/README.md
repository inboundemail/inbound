# DMARC Capture Feature

## Overview

The DMARC Capture feature prevents DMARC reports from being processed through catch-all domain configurations. This is essential because DMARC reports are automated emails sent to `dmarc@<domain>` that shouldn't trigger webhooks or be forwarded to users.

## How It Works

When a domain has:
1. **Catch-all enabled** (`isCatchAllEnabled: true`)
2. **DMARC capture enabled** (`isDmarcCaptureEnabled: true`, default)

Any email sent to `dmarc@<domain>` will be:
- ✅ **Blocked from catch-all processing** (recommended)
- ❌ **Not delivered to catch-all endpoints/webhooks**
- 📝 **Still stored in the database** for audit purposes

## Database Schema

Added to `emailDomains` table:
```sql
isDmarcCaptureEnabled: boolean('is_dmarc_capture_enabled').default(true)
```

## Implementation Details

### 1. Email Router Logic
Location: `lib/email-management/email-router.ts`

```typescript
// Check for DMARC capture filtering
const localPart = recipient.split('@')[0]?.toLowerCase()
if (isDmarcCaptureEnabled && localPart === 'dmarc') {
  console.log(`🛡️ DMARC capture enabled: blocking dmarc@${domain} from catch-all processing`)
  return null // Don't process DMARC reports through catch-all
}
```

### 2. Database Migration
File: `drizzle/0038_add_dmarc_capture.sql`

```sql
ALTER TABLE "email_domains" ADD COLUMN "is_dmarc_capture_enabled" boolean DEFAULT true;
```

### 3. API Integration
- Added `isDmarcCaptureEnabled` to v2 domain API responses
- Added `isDmarcCaptureEnabled` to PUT request handling
- Updated domain management functions

### 4. UI Controls
Location: `app/(main)/emails/[id]/page.tsx`

- Shows DMARC capture card when catch-all is enabled
- Toggle button to enable/disable DMARC filtering
- Explanatory text about what DMARC capture does
- Success/error toast notifications

## Usage

### For Users
1. Navigate to domain details page
2. Enable catch-all if not already enabled
3. See DMARC Capture card appear
4. Toggle DMARC capture on/off as needed
5. **Recommended**: Keep enabled to filter automated DMARC reports

### For Developers
```typescript
import { useDmarcCaptureToggle } from '@/features/dmarc/hooks'

const dmarcMutation = useDmarcCaptureToggle()

// Toggle DMARC capture
await dmarcMutation.mutateAsync({
  domainId: 'domain-id',
  isDmarcCaptureEnabled: true
})
```

## Benefits

1. **Cleaner Inboxes**: DMARC reports don't clutter user inboxes
2. **Reduced Webhook Noise**: Prevents automated reports from triggering webhooks
3. **Better UX**: Users only receive emails they actually care about
4. **Audit Trail**: DMARC reports are still stored for compliance/debugging
5. **Default Protection**: Enabled by default for new domains

## Technical Notes

- **Default State**: Enabled (`true`) for all new domains
- **Scope**: Only affects catch-all processing, not direct email addresses
- **Case Insensitive**: Matches `dmarc@`, `DMARC@`, `Dmarc@`, etc.
- **Backward Compatible**: Existing domains without the field default to `true`

## Related Files

- `lib/db/schema.ts` - Database schema
- `lib/email-management/email-router.ts` - Email routing logic
- `features/dmarc/` - Feature implementation
- `app/api/v2/domains/[id]/route.ts` - API endpoints
- `app/(main)/emails/[id]/page.tsx` - UI controls