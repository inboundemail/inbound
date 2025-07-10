# API v2 Endpoints Specification

Following the API management rules, each endpoint must have a 3-4 line description and support GET (retrieve), POST (create), DELETE (delete), and PUT (update) operations where applicable.

## Authentication Pattern
All endpoints support dual authentication:
1. **Session-based**: For web app users
2. **API Key-based**: Via `Authorization` header for programmatic access

## Common Libraries

The API endpoints are designed to be thin wrappers around reusable library functions. Each major operation should have a corresponding library function that handles the complete process including database operations, SES management, and cleanup.

### Domain Management Libraries (`lib/domain-management.ts`)
- `getDomainDetails(id)` - Comprehensive domain info with DNS records

### Email Address Management Libraries (`lib/email-address-management.ts`)
- `createEmailAddress(domainId, localPart, endpointId)` - Create email with SES rules
- `updateEmailAddress(id, data)` - Update routing and SES configuration
- `deleteEmailAddress(id)` - Remove from database, SES rules, and cleanup
- `bulkUpdateEmailAddresses(ids, data)` - Batch operations with SES sync
- `bulkDeleteEmailAddresses(ids)` - Batch deletion with complete cleanup
- `getEmailAddressDetails(id)` - Full email address info with routing
- `listEmailAddresses(domainId, filters)` - Domain-scoped email listing

### Catch-All Management Libraries (`lib/catch-all-management.ts`)
- `enableCatchAll(domainId, endpointId)` - Setup catch-all with SES rules and a new endpoint
- `updateCatchAll(domainId, endpointId)` - Update catch-all routing with a new endpoint
- `disableCatchAll(domainId)` - Remove catch-all and restore specific rules
- `getCatchAllStatus(domainId)` - Current catch-all configuration

### Endpoint Management Libraries (`lib/endpoint-management.ts`)
- `createEndpoint(data)` - Create endpoint with validation and testing
- `updateEndpoint(id, data)` - Update configuration and test connectivity
- `deleteEndpoint(id)` - Remove endpoint and cleanup all associations
- `testEndpoint(id, payload?)` - Send test payload and validate response
- `bulkDeleteEndpoints(ids)` - Batch deletion with association cleanup
- `getEndpointDetails(id)` - Full endpoint info with delivery stats
- `listEndpoints(filters, pagination)` - Filtered endpoint listing

### Email/Message Management Libraries (`lib/email-management.ts`)
- `updateEmailStatus(id, status)` - Update read/unread, archived status
- `deleteEmail(id)` - Remove email with retention policy checks
- `bulkUpdateEmails(ids, data)` - Batch email status updates
- `bulkDeleteEmails(ids)` - Batch deletion with retention validation
- `searchEmails(criteria)` - Advanced search with full-text and filters
- `getEmailDetails(id)` - Complete email with parsed content
- `listEmails(filters, pagination)` - Filtered email listing

### Email Operations Libraries (`lib/email-operations.ts`)
- `replyToEmail(emailId, replyData)` - Handle email replies with threading
- `forwardEmail(emailId, recipients, options)` - Forward with custom headers
- `getEmailAttachments(emailId)` - List email attachments with metadata
- `downloadAttachment(emailId, attachmentId)` - Secure attachment access

## Domain Management

### `/api/v2/domains`
**Description**: Comprehensive domain management endpoint for email domains. Handles domain registration, verification, DNS configuration, and catch-all settings. Supports filtering by verification status and email receiving capabilities.

- **GET**: `listDomains(filters, pagination)` - List all domains with filtering, pagination, and enhanced metadata
- **PUT**: `updateDomain(id, data)` - Update domain settings (catch-all, provider info, verification retry)

### `/api/v2/domains/{id}`
**Description**: Individual domain management with detailed information. Provides comprehensive domain status, DNS records, email addresses, and catch-all configuration. Includes domain verification and provider detection.

- **GET**: `getDomainDetails(id)` - Fetch detailed domain information with DNS records and email addresses

### `/api/v2/domains/{id}/email-addresses`
**Description**: Email address management within a specific domain. Handles creation, listing, and bulk operations for email addresses. Includes routing configuration and receipt rule management.

- **GET**: `listEmailAddresses(domainId, filters)` - List all email addresses for a domain with routing information
- **POST**: `createEmailAddress(domainId, localPart, endpointId)` - Create new email address with endpoint/webhook routing
- **PUT**: `bulkUpdateEmailAddresses(ids, data)` - Bulk update email addresses (activate/deactivate, change routing)
- **DELETE**: `bulkDeleteEmailAddresses(ids)` - Bulk delete email addresses and cleanup SES rules

### `/api/v2/domains/{id}/catch-all`
**Description**: Domain-level catch-all email configuration. Manages routing of all unmatched emails to a specific endpoint. Handles SES receipt rule configuration and fallback routing.

- **GET**: `getCatchAllStatus(domainId)` - Get current catch-all configuration and status
- **POST**: `enableCatchAll(domainId, endpointId)` - Enable catch-all with endpoint routing configuration
- **PUT**: `updateCatchAll(domainId, endpointId)` - Update catch-all routing endpoint or settings
- **DELETE**: `disableCatchAll(domainId)` - Disable catch-all and remove SES rules and restore to just the specific email addresses

## Endpoint Management

### `/api/v2/endpoints`
**Description**: Unified endpoint management for webhooks, email forwarding, and email groups. Provides comprehensive CRUD operations with delivery statistics, filtering, and bulk operations support.

- **GET**: `listEndpoints(filters, pagination)` - List all endpoints with filtering, pagination, and delivery stats
- **POST**: `createEndpoint(data)` - Create new endpoint (webhook, email forward, or email group)
- **PUT**: `bulkUpdateEndpoints(ids, data)` - Bulk update endpoints (activate/deactivate, modify configurations)
- **DELETE**: `bulkDeleteEndpoints(ids)` - Bulk delete endpoints and cleanup associated resources

### `/api/v2/endpoints/{id}`
**Description**: Individual endpoint management with detailed configuration and statistics. Includes delivery history, associated email addresses, and catch-all domain usage. Supports configuration updates and testing.

- **GET**: `getEndpointDetails(id)` - Fetch detailed endpoint information with delivery statistics
- **PUT**: `updateEndpoint(id, data)` - Update endpoint configuration and settings
- **DELETE**: `deleteEndpoint(id)` - Remove endpoint and cleanup all associations

### `/api/v2/endpoints/{id}/test`
**Description**: Endpoint testing functionality to verify webhook URLs, email forwarding, and group delivery. Sends test payloads and validates responses with detailed error reporting.

- **POST**: `testEndpoint(id, payload?)` - Send test payload to endpoint and return delivery results

### `/api/v2/endpoints/{id}/deliveries`
**Description**: Endpoint delivery history and statistics. Provides detailed delivery logs, retry attempts, response data, and performance metrics for monitoring and debugging.

- **GET**: `getDeliveryHistory(endpointId, filters)` - List delivery history with filtering and pagination
- **POST**: `retryFailedDelivery(deliveryId)` - Manually trigger delivery retry for failed attempts
- **DELETE**: `clearDeliveryLogs(endpointId, olderThan)` - Clear old delivery logs (cleanup operation)

## Messages/Emails Management

### `/api/v2/emails`
**Description**: Comprehensive email message management using the structuredEmails table. Provides advanced filtering, search, pagination, and bulk operations. Includes parsed email data with attachments and threading support.

- **GET**: `listEmails(filters, pagination)` - List all received emails with advanced filtering and search
- **POST**: `processEmail(rawEmail)` or `reprocessEmail(id)` - Process/reprocess email (admin operation)
- **PUT**: `bulkUpdateEmails(ids, data)` - Bulk update email status (mark as read/unread, archive)
- **DELETE**: `bulkDeleteEmails(ids)` - Bulk delete emails (with retention policy checks)

### `/api/v2/emails/{id}`
**Description**: Individual email message management with full parsed content. Provides complete email details including headers, attachments, threading information, and delivery status across all endpoints.

- **GET**: `getEmailDetails(id)` - Fetch complete email details with parsed content
- **PUT**: `updateEmailStatus(id, status)` - Update email status (read/unread, archived, tags)
- **DELETE**: `deleteEmail(id)` - Delete specific email message

### `/api/v2/emails/{id}/reply`
**Description**: Email reply functionality for supported routing configurations. Handles reply-to address resolution, threading maintenance, and delivery through configured endpoints or SMTP.

- **POST**: `replyToEmail(emailId, replyData)` - Send reply to email through configured routing

### `/api/v2/emails/{id}/forward`
**Description**: Manual email forwarding to additional recipients. Supports forwarding with custom headers, subject prefixes, and attachment handling for ad-hoc email distribution.

- **POST**: `forwardEmail(emailId, recipients, options)` - Forward email to additional recipients

### `/api/v2/emails/{id}/attachments`
**Description**: Email attachment management and download. Provides secure access to email attachments with proper content-type handling and access control validation.

- **GET**: `getEmailAttachments(emailId)` - List all attachments for an email
- **GET** `/api/v2/emails/{id}/attachments/{attachmentId}`: `downloadAttachment(emailId, attachmentId)` - Download specific attachment

### `/api/v2/emails/search`
**Description**: Advanced email search functionality with full-text search, date ranges, sender/recipient filtering, and attachment search. Supports complex query syntax and result ranking.

- **POST**: `searchEmails(criteria)` - Perform advanced email search with complex criteria

------------------------------------------------------------------------------------------------

Based on the current system architecture, here are additional endpoints that would enhance the v2 API:
(don't implement yet, just here for reference)

### User & Account Management
- `/api/v2/user/profile` - User profile management
- `/api/v2/user/preferences` - Email handling preferences
- `/api/v2/user/api-keys` - API key management
- `/api/v2/user/usage` - Usage statistics and limits

### Analytics & Reporting
- `/api/v2/analytics/emails` - Email volume and delivery analytics
- `/api/v2/analytics/domains` - Domain performance metrics
- `/api/v2/analytics/endpoints` - Endpoint delivery statistics
- `/api/v2/analytics/export` - Data export functionality

### System Management
- `/api/v2/system/health` - System health checks
- `/api/v2/system/webhooks` - System webhook management
- `/api/v2/system/logs` - System audit logs
- `/api/v2/system/maintenance` - Maintenance operations

### Filtering & Organization
- `/api/v2/filters` - Email filtering rules
- `/api/v2/tags` - Email tagging system
- `/api/v2/folders` - Email organization folders
- `/api/v2/rules` - Automated processing rules

### Integration & Webhooks
- `/api/v2/webhooks/events` - Webhook event types
- `/api/v2/webhooks/logs` - Webhook delivery logs
- `/api/v2/integrations` - Third-party integrations
- `/api/v2/oauth` - OAuth app management

This comprehensive v2 API design provides a robust foundation for email management, domain handling, and endpoint routing while maintaining consistency with the established API management patterns.

## Library Implementation Priority

Based on the endpoint analysis, here are the libraries we need to implement in order of priority:

### Phase 1 (Core Operations)
1. **`lib/email-address-management.ts`** - Most critical for email routing
2. **`lib/endpoint-management.ts`** - Core webhook/forwarding functionality
3. **`lib/ses-integration.ts`** - SES rule management (extract from existing aws-ses.ts)

### Phase 2 (Domain & Email Management)
4. **`lib/domain-management.ts`** - Domain operations (extract from existing domains.ts)
5. **`lib/email-management.ts`** - Email CRUD operations
6. **`lib/catch-all-management.ts`** - Catch-all routing

### Phase 3 (Advanced Features)
7. **`lib/email-operations.ts`** - Reply/forward functionality
8. **`lib/delivery-management.ts`** - Delivery tracking and retry
9. **`lib/validation.ts`** - Input validation and business rules

Each library should:
- Export typed functions that handle complete operations
- Include proper error handling and rollback mechanisms
- Maintain transaction consistency across database and SES
- Provide detailed logging for debugging
- Include comprehensive JSDoc documentation
