# API Compatibility Test

This document demonstrates that the v2 API endpoints now support both snake_case (legacy) and camelCase (Resend-compatible) field names.

## Send Email API (`POST /api/v2/emails`)

### ✅ Snake_case Format (Legacy - Still Supported)
```json
{
  "from": "test@example.com",
  "to": "user@example.com", 
  "subject": "Test Email",
  "html": "<p>Test</p>",
  "reply_to": ["noreply@example.com"],
  "attachments": [{
    "filename": "test.pdf",
    "content": "base64...",
    "content_type": "application/pdf"
  }]
}
```

### ✅ CamelCase Format (Resend-compatible - New)
```json
{
  "from": "test@example.com",
  "to": "user@example.com",
  "subject": "Test Email", 
  "html": "<p>Test</p>",
  "replyTo": ["noreply@example.com"],
  "attachments": [{
    "filename": "test.pdf",
    "content": "base64...",
    "contentType": "application/pdf"
  }],
  "tags": [{
    "name": "campaign",
    "value": "newsletter"
  }]
}
```

## Reply API (`POST /api/v2/emails/{id}/reply`)

### ✅ Snake_case Format (Legacy - Still Supported)
```json
{
  "from": "support@example.com",
  "text": "Thanks for your message!",
  "reply_to": ["noreply@example.com"],
  "include_original": true,
  "attachments": [{
    "filename": "reply.pdf", 
    "content": "base64...",
    "content_type": "application/pdf"
  }]
}
```

### ✅ CamelCase Format (Resend-compatible - New)  
```json
{
  "from": "support@example.com",
  "text": "Thanks for your message!",
  "replyTo": ["noreply@example.com"], 
  "includeOriginal": true,
  "attachments": [{
    "filename": "reply.pdf",
    "content": "base64...",
    "contentType": "application/pdf"
  }],
  "tags": [{
    "name": "type", 
    "value": "auto-reply"
  }]
}
```

## Field Name Mapping

| Legacy (snake_case) | New (camelCase) | Status |
|---------------------|-----------------|--------|
| `reply_to` | `replyTo` | ✅ Both supported |
| `content_type` | `contentType` | ✅ Both supported |  
| `include_original` | `includeOriginal` | ✅ Both supported |
| N/A | `tags` | ✅ New feature added |

## API Processing Logic

The API now:
1. **Accepts both formats** - You can send either snake_case or camelCase
2. **Prioritizes camelCase** - If both are provided, camelCase takes precedence
3. **Normalizes internally** - All data is stored consistently in the database
4. **Maintains backward compatibility** - Existing integrations continue to work

## Database Changes

- Added `tags` column to `sent_emails` table (migration 0035)
- All field processing updated to handle both formats
- Attachments are normalized before storage

## Testing

The SDK v3.0.0 now sends camelCase fields that are fully compatible with the updated API endpoints.