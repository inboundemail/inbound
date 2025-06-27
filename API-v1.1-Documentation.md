# API v1.1 Documentation

## Overview

The v1.1 API provides enhanced email management capabilities with robust endpoint routing, email address management, and delivery tracking. This API builds upon the existing v1 API while adding new features for better email handling and routing.

## Key Features

### 🔄 **Enhanced Endpoints System**
- **Webhooks**: HTTP POST endpoints for real-time email notifications
- **Email Forwarding**: Forward emails to single addresses with customization
- **Email Groups**: Forward emails to multiple recipients simultaneously
- **Unified Management**: All endpoint types managed through one consistent API

### 📧 **Robust Email Address Management**
- **Flexible Routing**: Route emails to endpoints or legacy webhooks
- **Domain Integration**: Full integration with verified domains
- **Catch-All Support**: Domain-level catch-all routing with endpoint support
- **Precedence Logic**: Smart routing with priority system

### 📊 **Advanced Analytics**
- **Delivery Tracking**: Comprehensive delivery statistics for all endpoint types
- **Performance Metrics**: Success rates, response times, and failure analysis
- **Usage Analytics**: Email processing volumes and routing efficiency

### 🔍 **Enhanced Filtering & Pagination**
- **Advanced Filtering**: Filter by type, status, domain, and more
- **Efficient Pagination**: Limit/offset pagination with total counts
- **Metadata**: Rich metadata for better API consumption

## Authentication

All API requests require authentication using an API key in the Authorization header:

```bash
Authorization: Bearer your_api_key_here
```

## Base URL

```
https://your-domain.com/api/v1.1
```

## Core Endpoints

### 1. Endpoints Management

#### List Endpoints
Get all endpoints with enhanced data including delivery stats and group information.

```http
GET /api/v1.1/endpoints
```

**Query Parameters:**
- `type` (optional): Filter by endpoint type (`webhook`, `email`, `email_group`)
- `active` (optional): Filter by active status (`true`, `false`)
- `limit` (optional): Number of results per page (max 100, default 50)
- `offset` (optional): Pagination offset (default 0)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "ep_abc123",
      "name": "Customer Support Webhook",
      "type": "webhook",
      "config": {
        "url": "https://api.company.com/webhooks/email",
        "timeout": 30,
        "retryAttempts": 3,
        "headers": { "X-Source": "inbound-email" }
      },
      "isActive": true,
      "description": "Processes customer support emails",
      "groupEmails": null,
      "deliveryStats": {
        "total": 245,
        "successful": 240,
        "failed": 5,
        "lastDelivery": "2024-01-15T10:30:00Z"
      },
      "createdAt": "2024-01-01T00:00:00Z",
      "updatedAt": "2024-01-15T10:30:00Z"
    },
    {
      "id": "ep_def456",
      "name": "Admin Team",
      "type": "email_group",
      "config": {
        "emails": ["admin1@company.com", "admin2@company.com"],
        "includeAttachments": true,
        "subjectPrefix": "[ADMIN]"
      },
      "isActive": true,
      "description": "Forward to admin team",
      "groupEmails": ["admin1@company.com", "admin2@company.com"],
      "deliveryStats": {
        "total": 89,
        "successful": 89,
        "failed": 0,
        "lastDelivery": "2024-01-15T09:15:00Z"
      },
      "createdAt": "2024-01-05T00:00:00Z",
      "updatedAt": "2024-01-10T00:00:00Z"
    }
  ],
  "pagination": {
    "limit": 50,
    "offset": 0,
    "total": 12,
    "hasMore": false
  },
  "meta": {
    "totalCount": 12,
    "activeCount": 11,
    "typeBreakdown": {
      "webhook": 5,
      "email": 4,
      "email_group": 3
    }
  }
}
```

#### Create Endpoint
Create a new endpoint with type-specific configuration.

```http
POST /api/v1.1/endpoints
```

**Request Body Examples:**

**Webhook Endpoint:**
```json
{
  "name": "Order Processing Webhook",
  "type": "webhook",
  "description": "Processes order confirmation emails",
  "config": {
    "url": "https://api.ecommerce.com/orders/email",
    "secret": "webhook_secret_key",
    "timeout": 30,
    "retryAttempts": 3,
    "headers": {
      "X-Source": "email-processor",
      "Authorization": "Bearer api_token"
    }
  }
}
```

**Email Forward Endpoint:**
```json
{
  "name": "CEO Forward",
  "type": "email",
  "description": "Forward important emails to CEO",
  "config": {
    "forwardTo": "ceo@company.com",
    "includeAttachments": true,
    "subjectPrefix": "[IMPORTANT]",
    "fromAddress": "noreply@company.com"
  }
}
```

**Email Group Endpoint:**
```json
{
  "name": "Development Team",
  "type": "email_group",
  "description": "Forward to all developers",
  "config": {
    "emails": [
      "dev1@company.com",
      "dev2@company.com",
      "dev3@company.com",
      "lead@company.com"
    ],
    "includeAttachments": false,
    "subjectPrefix": "[DEV]",
    "fromAddress": "devteam@company.com"
  }
}
```

**Validation Rules:**
- **Webhook**: `url` (required, valid URL), `timeout` (1-300 seconds), `retryAttempts` (0-10)
- **Email**: `forwardTo` (required, valid email)
- **Email Group**: `emails` (required array, 1-50 valid emails, no duplicates)

#### Get Individual Endpoint
Get detailed information about a specific endpoint including usage statistics.

```http
GET /api/v1.1/endpoints/{id}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "ep_abc123",
    "name": "Customer Support Webhook",
    "type": "webhook",
    "config": {
      "url": "https://api.company.com/webhooks/email",
      "timeout": 30,
      "retryAttempts": 3
    },
    "isActive": true,
    "description": "Processes customer support emails",
    "groupEmails": null,
    "deliveryStats": {
      "total": 245,
      "successful": 240,
      "failed": 5,
      "successRate": 98
    },
    "recentDeliveries": [
      {
        "id": "del_xyz789",
        "emailId": "email_123",
        "deliveryType": "webhook",
        "status": "success",
        "attempts": 1,
        "lastAttemptAt": "2024-01-15T10:30:00Z",
        "responseData": {
          "statusCode": 200,
          "responseTime": 234
        },
        "createdAt": "2024-01-15T10:30:00Z"
      }
    ],
    "associatedEmails": [
      {
        "id": "email_addr_456",
        "address": "support@company.com",
        "isActive": true,
        "createdAt": "2024-01-01T00:00:00Z"
      }
    ],
    "catchAllDomains": [
      {
        "id": "domain_789",
        "domain": "company.com",
        "status": "verified"
      }
    ],
    "usage": {
      "emailAddressCount": 3,
      "catchAllDomainCount": 1,
      "totalEmailsProcessed": 245
    },
    "createdAt": "2024-01-01T00:00:00Z",
    "updatedAt": "2024-01-15T10:30:00Z"
  }
}
```

#### Update Endpoint
Update an existing endpoint's configuration or settings.

```http
PUT /api/v1.1/endpoints/{id}
```

**Request Body:**
```json
{
  "name": "Updated Customer Support",
  "description": "Updated description",
  "isActive": true,
  "config": {
    "url": "https://new-api.company.com/webhooks/email",
    "timeout": 45,
    "retryAttempts": 5
  }
}
```

#### Delete Endpoint
Delete an endpoint. Will fail if the endpoint has active dependencies.

```http
DELETE /api/v1.1/endpoints/{id}
```

**Error Response (if dependencies exist):**
```json
{
  "success": false,
  "error": "Cannot delete endpoint with active dependencies",
  "dependencies": {
    "emailAddresses": 3,
    "catchAllDomains": 1
  },
  "message": "Please remove all email addresses and catch-all domain configurations using this endpoint before deleting."
}
```

### 2. Email Addresses Management

#### List Email Addresses
Get all email addresses with enhanced routing information.

```http
GET /api/v1.1/email-addresses
```

**Query Parameters:**
- `domainId` (optional): Filter by domain ID
- `active` (optional): Filter by active status (`true`, `false`)
- `limit` (optional): Number of results per page (max 100, default 50)
- `offset` (optional): Pagination offset (default 0)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "email_abc123",
      "address": "support@company.com",
      "isActive": true,
      "isReceiptRuleConfigured": true,
      "receiptRuleName": "support-rule",
      "domain": {
        "id": "domain_456",
        "name": "company.com",
        "status": "verified"
      },
      "routing": {
        "type": "endpoint",
        "id": "ep_789",
        "name": "Customer Support Webhook",
        "endpointType": "webhook",
        "isActive": true
      },
      "createdAt": "2024-01-01T00:00:00Z",
      "updatedAt": "2024-01-01T00:00:00Z"
    },
    {
      "id": "email_def456",
      "address": "admin@company.com",
      "isActive": true,
      "isReceiptRuleConfigured": false,
      "receiptRuleName": null,
      "domain": {
        "id": "domain_456",
        "name": "company.com",
        "status": "verified"
      },
      "routing": {
        "type": "webhook",
        "id": "webhook_123",
        "name": "Legacy Admin Webhook",
        "url": "https://old-api.company.com/admin",
        "isActive": true
      },
      "createdAt": "2024-01-02T00:00:00Z",
      "updatedAt": "2024-01-02T00:00:00Z"
    }
  ],
  "pagination": {
    "limit": 50,
    "offset": 0,
    "total": 25,
    "hasMore": false
  },
  "meta": {
    "totalCount": 25,
    "activeCount": 24,
    "routingBreakdown": {
      "endpoint": 15,
      "webhook": 8,
      "none": 2
    }
  }
}
```

#### Create Email Address
Create a new email address with routing configuration.

```http
POST /api/v1.1/email-addresses
```

**Request Body:**
```json
{
  "address": "sales@company.com",
  "domainId": "domain_456",
  "endpointId": "ep_789",
  "isActive": true
}
```

**Alternative with Legacy Webhook:**
```json
{
  "address": "legacy@company.com", 
  "domainId": "domain_456",
  "webhookId": "webhook_123",
  "isActive": true
}
```

### 3. Email Routing Logic

The v1.1 API implements a sophisticated routing precedence system:

1. **Email-specific endpoint** (highest priority)
2. **Email-specific webhook** (legacy support)
3. **Domain catch-all endpoint**
4. **Domain catch-all webhook** (legacy support)
5. **No routing configured** (lowest priority)

#### Routing Configuration Examples

**Example 1: Mixed Routing Setup**
```bash
# Domain: company.com with catch-all endpoint
# Specific routing: support@company.com → Support Webhook
# Specific routing: admin@company.com → Admin Team (email group)
# Catch-all: *@company.com → General Processing Endpoint

# Email routing results:
# support@company.com → Support Webhook (specific endpoint)
# admin@company.com → Admin Team email group (specific endpoint)
# random@company.com → General Processing Endpoint (catch-all)
# unknown@company.com → General Processing Endpoint (catch-all)
```

**Example 2: Gradual Migration from Webhooks**
```bash
# Legacy webhook: support@company.com → Support Webhook
# New endpoint: sales@company.com → Sales Team (email group)
# Catch-all webhook: *@company.com → Legacy Catch-All Webhook

# Migration strategy:
# 1. Create new endpoints for new email addresses
# 2. Gradually migrate existing webhook-based emails to endpoints
# 3. Update catch-all configuration to use endpoints
# 4. Phase out legacy webhooks when ready
```

## Configuration Examples

### Complete API Integration Example

```javascript
class InboundEmailAPI {
  constructor(apiKey, baseUrl = 'https://inbound.new') {
    this.apiKey = apiKey
    this.baseUrl = baseUrl
  }

  async request(path, options = {}) {
    const response = await fetch(`${this.baseUrl}/api/v1.1${path}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        ...options.headers
      }
    })
    return response.json()
  }

  // Create a comprehensive email processing setup
  async setupEmailProcessing(domain) {
    // 1. Create webhook endpoint for immediate processing
    const webhook = await this.request('/endpoints', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Real-time Email Processor',
        type: 'webhook',
        description: 'Processes emails in real-time',
        config: {
          url: 'https://api.company.com/email/webhook',
          timeout: 30,
          retryAttempts: 3,
          headers: { 'X-Source': 'inbound-email' }
        }
      })
    })

    // 2. Create email group for admin notifications
    const adminGroup = await this.request('/endpoints', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Admin Team',
        type: 'email_group',
        description: 'Admin team notifications',
        config: {
          emails: ['admin1@company.com', 'admin2@company.com'],
          includeAttachments: true,
          subjectPrefix: '[ADMIN]'
        }
      })
    })

    // 3. Create email forwarding for CEO
    const ceoForward = await this.request('/endpoints', {
      method: 'POST',
      body: JSON.stringify({
        name: 'CEO Forward',
        type: 'email',
        description: 'Important emails to CEO',
        config: {
          forwardTo: 'ceo@company.com',
          includeAttachments: true,
          subjectPrefix: '[URGENT]'
        }
      })
    })

    return { webhook, adminGroup, ceoForward }
  }

  // Monitor endpoint performance
  async getEndpointStats(endpointId) {
    const response = await this.request(`/endpoints/${endpointId}`)
    if (response.success) {
      const stats = response.data.deliveryStats
      return {
        totalEmails: stats.total,
        successRate: stats.successRate,
        lastDelivery: stats.lastDelivery,
        recentFailures: response.data.recentDeliveries
          .filter(d => d.status === 'failed')
          .slice(0, 5)
      }
    }
    throw new Error(response.error)
  }

  // List all email addresses with routing info
  async getEmailAddresses(filters = {}) {
    const params = new URLSearchParams(filters)
    const response = await this.request(`/email-addresses?${params}`)
    return response.data
  }
}

// Usage
const api = new InboundEmailAPI('your_api_key')

// Set up email processing
const endpoints = await api.setupEmailProcessing('company.com')
console.log('Created endpoints:', endpoints)

// Monitor performance
const stats = await api.getEndpointStats(endpoints.webhook.data.id)
console.log('Webhook performance:', stats)

// List email addresses
const addresses = await api.getEmailAddresses({ active: 'true', limit: 20 })
console.log('Active email addresses:', addresses)
```

### Advanced Routing Setup

```bash
# Create different endpoint types for different use cases

# 1. High-priority webhook for critical emails
curl -X POST https://inbound.new/api/v1.1/endpoints \
  -H "Authorization: Bearer your_api_key" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Critical Alerts",
    "type": "webhook",
    "description": "Critical system alerts and notifications",
    "config": {
      "url": "https://alerts.company.com/webhook",
      "timeout": 10,
      "retryAttempts": 5,
      "headers": {"X-Priority": "critical"}
    }
  }'

# 2. Support team email group
curl -X POST https://inbound.new/api/v1.1/endpoints \
  -H "Authorization: Bearer your_api_key" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Support Team",
    "type": "email_group",
    "description": "Customer support team distribution",
    "config": {
      "emails": [
        "support1@company.com",
        "support2@company.com", 
        "support-manager@company.com"
      ],
      "includeAttachments": true,
      "subjectPrefix": "[SUPPORT]"
    }
  }'

# 3. Executive email forwarding
curl -X POST https://inbound.new/api/v1.1/endpoints \
  -H "Authorization: Bearer your_api_key" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Executive Assistant",
    "type": "email",
    "description": "Forward to executive assistant",
    "config": {
      "forwardTo": "assistant@company.com",
      "includeAttachments": true,
      "subjectPrefix": "[EXEC]"
    }
  }'
```

## Error Handling

### Common Error Responses

**400 Bad Request - Validation Error:**
```json
{
  "success": false,
  "error": "Invalid configuration",
  "details": "Webhook URL is required",
  "configRequirements": {
    "required": ["url"],
    "optional": ["secret", "headers", "timeout", "retryAttempts"],
    "description": "Webhook endpoint that receives HTTP POST requests with email data"
  }
}
```

**401 Unauthorized:**
```json
{
  "error": "Invalid API key"
}
```

**404 Not Found:**
```json
{
  "success": false,
  "error": "Endpoint not found"
}
```

**409 Conflict - Dependency Error:**
```json
{
  "success": false,
  "error": "Cannot delete endpoint with active dependencies",
  "dependencies": {
    "emailAddresses": 5,
    "catchAllDomains": 2
  },
  "message": "Please remove all email addresses and catch-all domain configurations using this endpoint before deleting."
}
```

## Rate Limiting

API keys include built-in rate limiting:
- Default: 1000 requests per hour per API key
- Configurable limits available through API key settings
- Rate limit headers included in all responses:
  - `X-RateLimit-Limit`: Maximum requests per window
  - `X-RateLimit-Remaining`: Remaining requests in window
  - `X-RateLimit-Reset`: Window reset time (Unix timestamp)

## Migration from v1 API

### Gradual Migration Strategy

1. **Assessment Phase**
   ```bash
   # List current webhooks
   curl -H "Authorization: Bearer your_api_key" \
     https://inbound.new/api/v1/webhooks
   
   # List current email addresses
   curl -H "Authorization: Bearer your_api_key" \
     https://inbound.new/api/v1/domains
   ```

2. **Create Equivalent Endpoints**
   ```bash
   # Convert webhook to endpoint
   curl -X POST https://inbound.new/api/v1.1/endpoints \
     -H "Authorization: Bearer your_api_key" \
     -d '{
       "name": "Migrated Webhook",
       "type": "webhook", 
       "config": {"url": "existing_webhook_url"}
     }'
   ```

3. **Update Email Routing**
   ```bash
   # Update email addresses to use new endpoints
   # (This would require email address update endpoints)
   ```

4. **Monitor and Validate**
   ```bash
   # Check delivery stats
   curl -H "Authorization: Bearer your_api_key" \
     https://inbound.new/api/v1.1/endpoints/{endpoint_id}
   ```

5. **Phase Out Legacy**
   ```bash
   # Disable old webhooks once migration is complete
   ```

## Best Practices

### 1. Endpoint Configuration
- **Use descriptive names** for easy identification
- **Set appropriate timeouts** (10-30 seconds for most use cases)
- **Configure retry attempts** based on criticality (3-5 for important endpoints)
- **Include custom headers** for webhook authentication

### 2. Email Group Management
- **Keep groups focused** (5-10 members maximum for efficiency)
- **Use consistent naming** for easy management
- **Monitor delivery success** rates for large groups
- **Consider separate endpoints** for different priority levels

### 3. Error Handling
- **Implement robust webhook handling** with proper HTTP status codes
- **Monitor delivery statistics** regularly
- **Set up alerting** for high failure rates
- **Have fallback procedures** for critical email processing

### 4. Security
- **Use webhook secrets** for authentication
- **Validate webhook signatures** in your application
- **Rotate API keys** regularly
- **Monitor API usage** for unusual patterns

### 5. Performance
- **Use filtering and pagination** to reduce API overhead
- **Cache endpoint configurations** where appropriate
- **Monitor response times** and adjust timeouts accordingly
- **Batch operations** when possible

## Testing

Use the provided test suite to validate your API integration:

```bash
# Run comprehensive API tests
bun run test-v1.1-api.ts \
  --api-key=your_api_key \
  --base-url=https://inbound.new \
  --test-domain=your-domain.com
```

The test suite covers:
- ✅ Endpoint creation, reading, updating, deletion
- ✅ Email address management and routing
- ✅ Validation and error handling
- ✅ Delivery statistics and analytics
- ✅ Cleanup and resource management

## Support

For additional help with the v1.1 API:
- 📖 Check the inline API documentation at `/api/v1.1/docs`
- 🔧 Use the test suite to validate your integration
- 📊 Monitor endpoint delivery statistics for performance insights
- 🚀 Leverage the enhanced filtering and pagination for efficient data access