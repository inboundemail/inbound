# Implementation Summary: ENG-11 - Email Endpoint Inbound/Outbound Lookup

## Problem
The `/api/v2/emails/{id}` endpoint only returned results for outbound emails. When receiving an email that was saved in `structured_emails` with an ID starting with `inbnd_`, it could not be retrieved via this route.

## Solution
Updated the endpoint to support both inbound and outbound email lookups with distinct response types for each direction.

## Changes Made

### 1. Updated `/app/api/v2/emails/[id]/route.ts`

#### New Type Definitions
- **`ParsedEmailAddress`**: Interface for parsed email address structure with text and addresses array
- **`BaseEmailResponse`**: Shared properties for both email types (object, id, created_at, direction)
- **`InboundEmailResponse`**: Response type for received emails with full webhook-style payload
- **`OutboundEmailResponse`**: Response type for sent emails with delivery status info
- **`GetEmailByIdResponse`**: Union type that can be either inbound or outbound

#### Updated GET Function Logic
1. **Direction Detection**: Determines if email is inbound by checking if ID starts with `inbnd_`
2. **Inbound Email Handling**:
   - Queries `structuredEmails` table
   - Parses JSON fields (fromData, toData, ccData, etc.)
   - Returns detailed webhook-style payload with:
     - Full parsed email addresses
     - Message ID and threading info
     - Attachments and headers
     - Read status
     - Original body (text/html)

3. **Outbound Email Handling**:
   - Queries `sentEmails` table (existing behavior)
   - Returns sent email details with:
     - Delivery status
     - Send timestamp
     - Recipient lists
     - Last event status

### 2. Created Test Suite
Created `/app/api/v2/emails/[id]/route.test.ts` with comprehensive tests:
- Inbound email retrieval
- Outbound email retrieval
- Authentication validation
- 404 handling for non-existent emails
- Response format validation
- Cross-user access prevention

## Response Format Examples

### Inbound Email Response
```json
{
  "object": "email",
  "id": "inbnd_abc123",
  "direction": "inbound",
  "created_at": "2025-01-15T10:30:00.000Z",
  "messageId": "<message-id@example.com>",
  "from": {
    "text": "Sender Name <sender@example.com>",
    "addresses": [
      { "name": "Sender Name", "address": "sender@example.com" }
    ]
  },
  "to": { /* similar structure */ },
  "subject": "Email Subject",
  "body": {
    "text": "Plain text content",
    "html": "<p>HTML content</p>"
  },
  "attachments": [],
  "headers": { /* all email headers */ },
  "date": "2025-01-15T10:30:00.000Z",
  "in_reply_to": null,
  "references": null,
  "recipient": "you@yourdomain.com",
  "is_read": false,
  "read_at": null
}
```

### Outbound Email Response
```json
{
  "object": "email",
  "id": "outbd_xyz789",
  "direction": "outbound",
  "created_at": "2025-01-15T10:30:00.000Z",
  "to": ["recipient@example.com"],
  "from": "you@yourdomain.com",
  "subject": "Email Subject",
  "html": "<p>HTML content</p>",
  "text": "Plain text content",
  "bcc": [],
  "cc": [],
  "reply_to": [],
  "last_event": "delivered",
  "status": "sent",
  "sent_at": "2025-01-15T10:30:15.000Z"
}
```

## Key Features
1. **Backward Compatible**: Existing outbound email lookups continue to work as before
2. **Type Safety**: Proper TypeScript types for both response formats
3. **Authentication**: Both session-based and API key authentication supported
4. **Logging**: Comprehensive logging for debugging
5. **Error Handling**: Proper 404 responses for missing emails and 401 for unauthorized access

## Usage Examples

### Fetch Inbound Email
```typescript
const response = await fetch('/api/v2/emails/inbnd_abc123', {
  headers: { 'Authorization': 'Bearer YOUR_API_KEY' }
})
const email = await response.json()
// email.direction === 'inbound'
```

### Fetch Outbound Email
```typescript
const response = await fetch('/api/v2/emails/outbd_xyz789', {
  headers: { 'Authorization': 'Bearer YOUR_API_KEY' }
})
const email = await response.json()
// email.direction === 'outbound'
```

### Using with React Query Hook
```typescript
const { data } = useOutboundEmailDetailsV2Query(emailId)
// Automatically handles both inbound and outbound emails
// TypeScript will properly narrow the type based on direction
```

## Testing
Run the test suite with:
```bash
bun test app/api/v2/emails/[id]/route.test.ts
```

## Impact
- ✅ Fixes the issue where inbound emails couldn't be retrieved
- ✅ Provides consistent API for both email directions
- ✅ Maintains backward compatibility with existing code
- ✅ Adds proper TypeScript typing for better DX
- ✅ Includes comprehensive test coverage

## Files Modified
1. `app/api/v2/emails/[id]/route.ts` - Main endpoint implementation
2. `app/api/v2/emails/[id]/route.test.ts` - Test suite (new)

## Files Using This Endpoint
The following files already use this endpoint and will now support inbound emails:
- `features/emails/hooks/useMailV2Hooks.ts` - The `useOutboundEmailDetailsV2Query` hook

## Notes
- Inbound email IDs must start with `inbnd_` prefix
- Outbound emails are identified by any ID that doesn't start with `inbnd_`
- Both email types are properly scoped to the authenticated user
- Response structure differs between directions to match their respective data models
