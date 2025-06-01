# Inbound Email API v1

This API provides programmatic access to manage your email domains, email addresses, and webhooks using API keys.

## Authentication

All API endpoints require authentication using an API key. Include your API key in the `Authorization` header:

```
Authorization: Bearer your_api_key_here
```

Or simply:

```
Authorization: your_api_key_here
```

## Base URL

```
https://your-domain.com/api/v1
```

## Endpoints

### Domains

#### List Domains
Get all domains for the authenticated user.

```http
GET /api/v1/domains
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "indm_abc123",
      "domain": "example.com",
      "status": "verified",
      "canReceiveEmails": true,
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

#### Create Email Address on Domain
Create a new email address on an existing domain.

```http
POST /api/v1/domains
```

**Request Body:**
```json
{
  "domain": "example.com",
  "email": "hello@example.com",
  "webhookId": "webhook_id_optional"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "email_abc123",
    "address": "hello@example.com",
    "domainId": "indm_abc123",
    "webhookId": "webhook_id",
    "isActive": true,
    "createdAt": "2024-01-01T00:00:00.000Z"
  }
}
```

### Domain-Specific Email Management

#### List Emails on Domain
Get all email addresses for a specific domain.

```http
GET /api/v1/domains/{domain}/emails
```

**Response:**
```json
{
  "success": true,
  "data": {
    "domain": "example.com",
    "emails": [
      {
        "id": "email_abc123",
        "address": "hello@example.com",
        "webhookId": "webhook_id",
        "isActive": true,
        "isReceiptRuleConfigured": true,
        "createdAt": "2024-01-01T00:00:00.000Z",
        "updatedAt": "2024-01-01T00:00:00.000Z"
      }
    ]
  }
}
```

#### Remove Email from Domain
Remove an email address from a domain.

```http
DELETE /api/v1/domains/{domain}/emails
```

**Request Body:**
```json
{
  "email": "hello@example.com"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Email address hello@example.com removed from domain example.com"
}
```

### Webhooks

#### List Webhooks
Get all webhooks for the authenticated user.

```http
GET /api/v1/webhooks
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "webhook_abc123",
      "name": "My Webhook",
      "url": "https://api.example.com/webhook",
      "description": "Webhook for processing emails",
      "isActive": true,
      "timeout": 30,
      "retryAttempts": 3,
      "totalDeliveries": 150,
      "successfulDeliveries": 145,
      "failedDeliveries": 5,
      "lastUsed": "2024-01-01T00:00:00.000Z",
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

#### Create Webhook
Create a new webhook endpoint.

```http
POST /api/v1/webhooks
```

**Request Body:**
```json
{
  "name": "My Webhook",
  "description": "Webhook for processing emails",
  "endpoint": "https://api.example.com/webhook",
  "retry": 3,
  "timeout": 30
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "webhook_abc123",
    "name": "My Webhook",
    "url": "https://api.example.com/webhook",
    "secret": "webhook_secret_for_verification",
    "description": "Webhook for processing emails",
    "isActive": true,
    "timeout": 30,
    "retryAttempts": 3,
    "createdAt": "2024-01-01T00:00:00.000Z"
  }
}
```

#### Remove Webhook
Remove a webhook by name.

```http
DELETE /api/v1/webhooks
```

**Request Body:**
```json
{
  "name": "My Webhook"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Webhook 'My Webhook' has been removed"
}
```

## Error Responses

All endpoints return consistent error responses:

```json
{
  "error": "Error message describing what went wrong"
}
```

### Common HTTP Status Codes

- `200` - Success
- `201` - Created
- `400` - Bad Request (invalid parameters)
- `401` - Unauthorized (invalid or missing API key)
- `404` - Not Found (resource doesn't exist)
- `409` - Conflict (resource already exists)
- `500` - Internal Server Error

## API Key Management

API keys can be created and managed through the web interface at `/settings`. Each API key:

- Has an optional name for identification
- Can have an optional prefix for organization
- Can be enabled/disabled
- Has usage tracking and rate limiting capabilities
- Can expire at a specified date

## Rate Limiting

API keys have built-in rate limiting capabilities. When you create an API key, you can specify:

- `rateLimitMax`: Maximum requests per time window
- `rateLimitTimeWindow`: Time window in milliseconds
- `remaining`: Total number of requests allowed (if not unlimited)

## Webhook Security

When creating webhooks, a secret is automatically generated. Use this secret to verify webhook authenticity by checking the signature in the webhook payload headers.

## Examples

### Creating a Complete Email Setup

1. **Create a webhook:**
```bash
curl -X POST https://your-domain.com/api/v1/webhooks \
  -H "Authorization: Bearer your_api_key" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Email Processor",
    "endpoint": "https://api.example.com/process-email",
    "description": "Processes incoming emails"
  }'
```

2. **Create an email address:**
```bash
curl -X POST https://your-domain.com/api/v1/domains \
  -H "Authorization: Bearer your_api_key" \
  -H "Content-Type: application/json" \
  -d '{
    "domain": "example.com",
    "email": "support@example.com",
    "webhookId": "webhook_abc123"
  }'
```

3. **List emails on domain:**
```bash
curl -X GET https://your-domain.com/api/v1/domains/example.com/emails \
  -H "Authorization: Bearer your_api_key"
```

### Cleaning Up

1. **Remove email address:**
```bash
curl -X DELETE https://your-domain.com/api/v1/domains/example.com/emails \
  -H "Authorization: Bearer your_api_key" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "support@example.com"
  }'
```

2. **Remove webhook:**
```bash
curl -X DELETE https://your-domain.com/api/v1/webhooks \
  -H "Authorization: Bearer your_api_key" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Email Processor"
  }'
```

## Notes

- Domains must be verified before you can create email addresses on them
- Email addresses must belong to domains you own
- Webhooks must be active to be assigned to email addresses
- All timestamps are in ISO 8601 format (UTC)
- API responses include both success and error cases for consistent handling 