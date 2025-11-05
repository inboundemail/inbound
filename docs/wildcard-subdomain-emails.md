# Wildcard Subdomain Email Receiving

This document describes the wildcard subdomain email receiving feature that allows users to receive emails at any subdomain of their verified domain.

## Overview

The wildcard subdomain feature enables receiving emails at dynamically created subdomains without having to configure each subdomain individually. Once enabled, any email sent to `*@anything.yourdomain.com` will be received and routed to your configured endpoint.

## Use Cases

- **Multi-tenant Applications**: Automatically receive emails for `customer1@app.yourdomain.com`, `customer2@app.yourdomain.com`, etc.
- **Dynamic Subdomain Email**: Support emails to any subdomain like `support@team1.yourdomain.com`, `sales@team2.yourdomain.com`
- **Testing & Staging**: Receive emails at `test@staging.yourdomain.com`, `qa@dev.yourdomain.com`, etc.

## How It Works

### AWS SES Configuration

The wildcard subdomain feature uses AWS SES receipt rules with a special pattern:

- **Pattern**: `.domain.com` (note the leading period)
- **Matches**: `user@test.domain.com`, `admin@api.domain.com`, etc.
- **Does NOT match**: `user@domain.com` (root domain)

To also receive emails at the root domain, you need to configure either:
1. Individual email addresses (e.g., `hello@domain.com`)
2. Domain catch-all (receives all emails to `*@domain.com`)

### DNS Configuration

Users must add a wildcard MX record to their DNS provider:

```
Type: MX
Name: *.yourdomain.com
Value: 10 inbound-smtp.us-east-2.amazonaws.com
Priority: 10
```

This MX record tells mail servers to route subdomain emails to AWS SES for processing.

## Email Routing Priority

When an email is received, the system checks endpoints in this order:

1. **Specific Email Address**: If the exact email address (e.g., `hello@test.domain.com`) is configured
2. **Wildcard Subdomain Endpoint**: If the root domain has wildcard subdomains enabled
3. **Domain Catch-All Endpoint**: If the domain has catch-all enabled
4. **Legacy Webhook**: Falls back to legacy webhook system if configured

## Database Schema

### Domain Fields

New fields added to `emailDomains` table:

```typescript
supportsWildcardSubdomains: boolean // Whether wildcard receiving is enabled
wildcardEndpointId: varchar(255)    // Endpoint to route wildcard emails to
wildcardReceiptRuleName: varchar(255) // AWS SES receipt rule name
```

## API Endpoints

### Enable/Disable Wildcard Subdomains

**PUT** `/api/v2/domains/{domainId}/wildcard`

Enable or disable wildcard subdomain email receiving for a domain.

#### Request Body

```json
{
  "enabled": true,
  "endpointId": "endp_xxx" // Optional: endpoint to route emails to (uses catch-all if not provided)
}
```

#### Response

```json
{
  "success": true,
  "domain": {
    "id": "indm_xxx",
    "domain": "yourdomain.com",
    "supportsWildcardSubdomains": true,
    "wildcardEndpointId": "endp_xxx",
    "wildcardReceiptRuleName": "yourdomain.com-wildcard-rule"
  },
  "message": "Wildcard subdomain receiving enabled successfully"
}
```

#### Requirements

- Domain must be **verified** before enabling wildcard subdomains
- User must have AWS SES configured
- Wildcard MX record must be added to DNS (shown in domain setup instructions)

### Get Wildcard Configuration

**GET** `/api/v2/domains/{domainId}/wildcard`

Get the current wildcard subdomain configuration for a domain.

#### Response

```json
{
  "domain": {
    "id": "indm_xxx",
    "domain": "yourdomain.com",
    "supportsWildcardSubdomains": true,
    "wildcardEndpointId": "endp_xxx",
    "wildcardReceiptRuleName": "yourdomain.com-wildcard-rule"
  }
}
```

### Domain Details Include Wildcard Info

**GET** `/api/v2/domains/{domainId}`

Domain details now include wildcard configuration:

```json
{
  "id": "indm_xxx",
  "domain": "yourdomain.com",
  "status": "verified",
  "supportsWildcardSubdomains": true,
  "wildcardEndpointId": "endp_xxx",
  "wildcardReceiptRuleName": "yourdomain.com-wildcard-rule",
  "wildcardEndpoint": {
    "id": "endp_xxx",
    "name": "Subdomain Webhook",
    "type": "webhook",
    "isActive": true
  },
  ...
}
```

## Setup Instructions

### 1. Verify Your Domain

First, verify your root domain with AWS SES:

1. Add domain to your account
2. Add required DNS records (TXT, MX, SPF, DMARC)
3. Wait for verification (usually a few minutes)

### 2. Add Wildcard MX Record

Add this DNS record to your domain provider:

```
Type: MX
Name: *.yourdomain.com
Value: 10 inbound-smtp.{aws-region}.amazonaws.com
Priority: 10
```

**Common DNS Providers:**

- **Cloudflare**: DNS → Add Record → Select MX → Name: `*` → Mail server: `inbound-smtp.us-east-2.amazonaws.com` → Priority: 10
- **Namecheap**: Advanced DNS → Add New Record → Type: MX Record → Host: `*` → Value: `10 inbound-smtp.us-east-2.amazonaws.com`
- **Route 53**: Create Record → Record type: MX → Name: `*.yourdomain.com` → Value: `10 inbound-smtp.us-east-2.amazonaws.com`

### 3. Enable Wildcard Subdomains

Use the API to enable wildcard subdomain receiving:

```bash
curl -X PUT https://inbound.new/api/v2/domains/{domainId}/wildcard \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "enabled": true,
    "endpointId": "endp_xxx"
  }'
```

### 4. Test It

Send a test email to any subdomain:

```
test@anything.yourdomain.com
hello@api.yourdomain.com
support@app.yourdomain.com
```

All emails will be routed to your configured endpoint!

## AWS SES Implementation Details

### Receipt Rule Configuration

When wildcard subdomains are enabled, the system creates an AWS SES receipt rule with:

- **Rule Name**: `{domain}-wildcard-rule`
- **Recipients**: [`.domain.com`] (leading period matches all subdomains)
- **Actions**:
  1. **S3 Action**: Store email in S3 bucket at `emails/{domain}/wildcard/`
  2. **Lambda Action**: Invoke email processor Lambda function

### S3 Storage Path

Wildcard subdomain emails are stored at:

```
s3://inbound-emails-bucket/emails/yourdomain.com/wildcard/
```

This is separate from:
- Individual emails: `emails/yourdomain.com/`
- Catch-all emails: `emails/yourdomain.com/catchall/`

## Code References

### Database Functions

- `enableDomainWildcardSubdomains()` - Enable wildcard for a domain (lib/db/domains.ts:375)
- `disableDomainWildcardSubdomains()` - Disable wildcard for a domain (lib/db/domains.ts:401)

### AWS SES Functions

- `configureWildcardSubdomainRule()` - Create/update wildcard receipt rule (lib/aws-ses/aws-ses-rules.ts:466)
- `removeWildcardSubdomainRule()` - Remove wildcard receipt rule (lib/aws-ses/aws-ses-rules.ts:558)
- `isWildcardSubdomainConfigured()` - Check if wildcard is configured (lib/aws-ses/aws-ses-rules.ts:579)

### Email Routing

- `findEndpointForEmail()` - Routes emails with wildcard subdomain priority (lib/email-management/email-router.ts:398)

### API Endpoints

- **PUT** `/api/v2/domains/{id}/wildcard` - Configure wildcard (app/api/v2/domains/[id]/wildcard/route.ts)
- **GET** `/api/v2/domains/{id}/wildcard` - Get wildcard status (app/api/v2/domains/[id]/wildcard/route.ts)
- **GET** `/api/v2/domains/{id}` - Domain details include wildcard info (app/api/v2/domains/[id]/route.ts)

## Best Practices

### 1. Use Wildcard with Catch-All

For maximum flexibility, enable both:
- **Wildcard Subdomains**: Catches `*@subdomain.domain.com`
- **Catch-All**: Catches `*@domain.com`

Both can route to the same endpoint or different endpoints.

### 2. Route by Subdomain in Your Application

Parse the subdomain from the recipient email to determine routing:

```javascript
// Webhook payload
{
  "email": {
    "recipient": "user@team1.yourdomain.com",
    ...
  }
}

// Extract subdomain
const subdomain = email.recipient.split('@')[1].split('.')[0] // "team1"

// Route based on subdomain
if (subdomain === 'team1') {
  // Handle team1 emails
} else if (subdomain === 'team2') {
  // Handle team2 emails
}
```

### 3. Validate Subdomains

In your webhook handler, validate that the subdomain is expected:

```javascript
const validSubdomains = ['api', 'app', 'support', 'sales']
if (!validSubdomains.includes(subdomain)) {
  // Reject or handle unknown subdomain
}
```

### 4. Monitor Wildcard Usage

Track which subdomains are receiving emails to detect:
- Spam or abuse patterns
- Unused subdomains
- Popular subdomains that might need dedicated configuration

## Troubleshooting

### Emails Not Being Received

1. **Check DNS**: Verify wildcard MX record is correctly set
   ```bash
   dig MX test.yourdomain.com
   ```
   Should return: `10 inbound-smtp.us-east-2.amazonaws.com`

2. **Check Domain Verification**: Domain must be verified in AWS SES
   ```bash
   curl https://inbound.new/api/v2/domains/{domainId}
   ```
   Check `status: "verified"`

3. **Check Wildcard is Enabled**:
   ```bash
   curl https://inbound.new/api/v2/domains/{domainId}/wildcard
   ```
   Check `supportsWildcardSubdomains: true`

4. **Check AWS SES Receipt Rule**: Verify rule exists in AWS console
   - Go to SES → Email receiving → Receipt rules
   - Look for rule: `{domain}-wildcard-rule`
   - Check recipients: [`.domain.com`]

### Root Domain Emails Not Working

Wildcard subdomains **do NOT match root domain emails**. The pattern `.domain.com` only matches subdomains.

To receive emails at the root domain (`hello@domain.com`), you must:
1. Create individual email addresses, OR
2. Enable domain catch-all

### Subdomain Emails Going to Wrong Endpoint

Check routing priority:
1. Specific email address endpoint (highest priority)
2. Wildcard subdomain endpoint
3. Domain catch-all endpoint (lowest priority)

If a specific email address is configured (e.g., `support@api.domain.com`), it will override the wildcard configuration.

## Migration Guide

### Enabling Wildcard for Existing Domains

If you have existing email addresses configured, wildcard subdomains work alongside them:

- **Existing addresses continue working**: `hello@domain.com`, `support@domain.com`
- **New subdomains work automatically**: `anything@test.domain.com`, `user@api.domain.com`

No migration needed - just enable wildcard and add the DNS record!

### Disabling Wildcard

To disable wildcard subdomain receiving:

```bash
curl -X PUT https://inbound.new/api/v2/domains/{domainId}/wildcard \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"enabled": false}'
```

This will:
1. Remove the AWS SES wildcard receipt rule
2. Set `supportsWildcardSubdomains: false` in database
3. Clear `wildcardEndpointId` and `wildcardReceiptRuleName`

Existing email addresses and catch-all continue working.

## Security Considerations

### 1. Wildcard DNS Records

Be aware that wildcard DNS records expose ALL subdomains to email receiving. This means:

- `anything.yourdomain.com` will accept emails
- Make sure your webhook validates expected subdomains
- Monitor for abuse or spam

### 2. Subdomain Spoofing

Since any subdomain works, senders can use:
- `admin@fake.yourdomain.com`
- `ceo@phishing.yourdomain.com`

**Always validate** the subdomain in your application logic.

### 3. Rate Limiting

Consider rate limiting wildcard subdomain emails to prevent abuse:
- Limit emails per subdomain per hour
- Block suspicious subdomain patterns
- Monitor for spam indicators

## Example Implementation

### Full Setup Example

```javascript
// 1. Add domain
const domain = await fetch('https://inbound.new/api/v2/domains', {
  method: 'POST',
  headers: { 'Authorization': 'Bearer YOUR_API_KEY' },
  body: JSON.stringify({ domain: 'yourdomain.com' })
})

// 2. Wait for verification (add DNS records first)
// Check status with GET /api/v2/domains/{domainId}?check=true

// 3. Create webhook endpoint
const endpoint = await fetch('https://inbound.new/api/v2/endpoints', {
  method: 'POST',
  headers: { 'Authorization': 'Bearer YOUR_API_KEY' },
  body: JSON.stringify({
    name: 'Subdomain Handler',
    type: 'webhook',
    config: {
      url: 'https://yourapp.com/webhooks/subdomain-emails'
    }
  })
})

// 4. Enable wildcard subdomains
await fetch(`https://inbound.new/api/v2/domains/${domain.id}/wildcard`, {
  method: 'PUT',
  headers: { 'Authorization': 'Bearer YOUR_API_KEY' },
  body: JSON.stringify({
    enabled: true,
    endpointId: endpoint.id
  })
})

// 5. Test it!
// Send email to: test@anything.yourdomain.com
```

### Webhook Handler Example

```javascript
// Express.js webhook handler
app.post('/webhooks/subdomain-emails', (req, res) => {
  const { email } = req.body

  // Extract subdomain from recipient
  const recipient = email.recipient // e.g., "user@team1.yourdomain.com"
  const [localPart, domain] = recipient.split('@')
  const subdomain = domain.split('.')[0] // "team1"

  // Route based on subdomain
  switch (subdomain) {
    case 'support':
      handleSupportEmail(email)
      break
    case 'sales':
      handleSalesEmail(email)
      break
    case 'api':
      handleApiEmail(email)
      break
    default:
      console.log(`Unknown subdomain: ${subdomain}`)
  }

  res.status(200).send('OK')
})
```

## Summary

The wildcard subdomain feature provides powerful email receiving capabilities for dynamic subdomain use cases. By combining AWS SES receipt rule patterns with intelligent email routing, users can receive emails at any subdomain without manual configuration.

**Key Points:**
- Enable wildcard subdomains for domains after verification
- Add wildcard MX record to DNS: `*.domain.com`
- AWS SES pattern `.domain.com` matches ALL subdomains
- Emails route to configured endpoint (or fall back to catch-all)
- Parse subdomain in your application to handle routing logic
- Root domain emails require separate configuration (individual addresses or catch-all)
