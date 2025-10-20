# Webhook Payload Size Limits

## Overview

Inbound.new automatically optimizes webhook payloads to ensure reliable delivery while maintaining compatibility with most webhook endpoints. This document explains how payload size limits work and what happens when emails are too large.

## Size Limits

- **Maximum payload size**: 5MB (5,000,000 bytes)
- **Preferred optimized size**: 1MB (1,000,000 bytes)
- **Automatic optimization**: Triggered when payloads exceed 1MB

## Automatic Payload Optimization

When an email generates a webhook payload larger than 1MB, the system automatically applies these optimizations in order:

### 1. Attachment Body Removal
- Base64-encoded attachment content is removed from the `raw` field
- Attachment metadata (filename, content type, size) is preserved
- A placeholder message indicates where content was removed

### 2. Header Stripping
- If still too large, email headers are removed from the payload
- Essential fields (subject, from, to, date, etc.) are preserved

### 3. Content Truncation (Last Resort)
- Text and HTML bodies are truncated to 1000 characters
- Attachment content is completely removed, keeping only metadata
- A minimal payload with essential information is created
- `_meta` field indicates optimization was applied

## Error Handling

If a payload is still too large after all optimizations (exceeding 5MB), the webhook delivery will fail with:

```json
{
  "success": false,
  "error": "Webhook payload too large even after optimization",
  "details": {
    "originalSize": 8500000,
    "finalSize": 5200000,
    "maxSize": 5000000,
    "emailId": "inbnd_abc123",
    "suggestion": "Use GET /api/v2/emails/inbnd_abc123 to fetch the full email content"
  }
}
```

## Alternative Solutions for Large Emails

### 1. Use the Email API
Instead of relying on webhook payloads, fetch full email data using the REST API:

```bash
curl -H "Authorization: Bearer YOUR_API_KEY" \
  "https://api.inbound.new/v2/emails/inbnd_abc123"
```

### 2. Webhook + API Hybrid Approach
Configure your webhook to receive notifications, then fetch full data:

```javascript
// Webhook endpoint receives notification
app.post('/webhook', (req, res) => {
  const { email } = req.body;
  
  // Check if payload was optimized
  if (req.body._meta?.payloadOptimized) {
    console.log('Large email detected, fetching full content...');
    fetchFullEmail(email.id);
  } else {
    // Process email directly from webhook
    processEmail(email);
  }
  
  res.json({ success: true });
});

async function fetchFullEmail(emailId) {
  const response = await fetch(`https://api.inbound.new/v2/emails/${emailId}`, {
    headers: { 'Authorization': `Bearer ${process.env.INBOUND_API_KEY}` }
  });
  const fullEmail = await response.json();
  processEmail(fullEmail.email);
}
```

### 3. Attachment API for Large Files
For emails with large attachments, use the dedicated Attachment API:

```bash
# List attachments
curl -H "Authorization: Bearer YOUR_API_KEY" \
  "https://api.inbound.new/v2/emails/inbnd_abc123/attachments"

# Download specific attachment
curl -H "Authorization: Bearer YOUR_API_KEY" \
  "https://api.inbound.new/v2/emails/inbnd_abc123/attachments/att_xyz789/download"
```

## Monitoring Payload Optimization

Webhook payloads that have been optimized include a `_meta` field:

```json
{
  "email": { ... },
  "_meta": {
    "payloadOptimized": true,
    "originalSize": 2500000,
    "optimizedSize": 980000,
    "note": "Payload was too large and has been optimized. Use the email ID to fetch full content via API if needed."
  }
}
```

## Best Practices

1. **Design for optimization**: Always check for the `_meta.payloadOptimized` flag
2. **Implement fallback**: Have a mechanism to fetch full email data when needed
3. **Monitor sizes**: Track payload sizes to understand your email patterns
4. **Use APIs for large data**: Consider using the Email API for emails you know will be large
5. **Handle errors gracefully**: Implement proper error handling for size limit failures

## Common Scenarios

### Large Attachments
- **Issue**: Emails with multiple large attachments (PDFs, images, etc.)
- **Solution**: Use webhook for notification + Attachment API for file access

### Long Email Threads
- **Issue**: Email threads with extensive quoted content
- **Solution**: Webhook optimization handles this automatically

### Rich HTML Content
- **Issue**: Emails with embedded images or complex HTML
- **Solution**: Use the Email API to fetch full HTML content when needed

## Technical Details

### Optimization Algorithm
1. Calculate initial payload size
2. If > 1MB, remove attachment bodies from `raw` field
3. If still > 5MB, also remove headers
4. If still > 5MB, create minimal payload with truncated content
5. If still > 5MB after all optimizations, fail with error

### Size Calculation
Payload size is calculated as the byte length of the JSON-stringified webhook payload, including all nested objects and arrays.

### Performance Impact
- Optimization adds minimal latency (usually < 50ms)
- Large payload reduction significantly improves webhook delivery reliability
- No impact on email storage or API access

## Support

If you consistently encounter issues with large emails, consider:
1. Upgrading your webhook endpoint to handle larger payloads
2. Implementing the hybrid webhook + API approach
3. Contacting support for enterprise-specific solutions

For questions or issues, please contact [support@inbound.new](mailto:support@inbound.new).