# Inbound API 2.0 Specification

## Base URL
```
https://inbound.new/api/v2
```

## Authentication
All endpoints either need an API key authentication via the `Authorization` header
```
Authorization: Bearer {api_key}
```

OR they can be validated via the session function via better-auth.

## Route Categories

### 🔐 Authentication & Users

#### User Management
- `GET /users/me` - Get current user profile *(Internal)*
- `PUT /users/me` - Update user profile *(Internal)*
- `GET /users/me/onboarding` - Get onboarding status *(Internal)*
- `PUT /users/me/onboarding` - Update onboarding status *(Internal)*

#### API Keys
- `GET /api-keys` - List user's API keys *(Internal)*
- `POST /api-keys` - Create new API key *(Internal)*
- `PUT /api-keys/{id}` - Update API key *(Internal)*
- `DELETE /api-keys/{id}` - Delete API key *(Internal)*


### 📧 Email Management

#### Email Retrieval
- `GET /emails` - List emails with filtering *(Public)*
- `GET /emails/{id}` - Get email details *(Public)*
- `GET /emails/{id}/content` - Get full email content *(Public)*
- `GET /emails/{id}/attachments` - List email attachments *(Public)*
- `GET /emails/{id}/attachments/{attachmentId}` - Download attachment *(Public)*

#### Email Actions
- `PUT /emails/{id}/read` - Mark email as read *(Internal)*
- `PUT /emails/{id}/unread` - Mark email as unread *(Internal)*
- `POST /emails/{id}/forward` - Forward email *(Internal)*
- `DELETE /emails/{id}` - Delete email *(Internal)*

#### Bulk Operations
- `POST /emails/bulk/read` - Mark multiple emails as read *(Internal)*
- `POST /emails/bulk/delete` - Delete multiple emails *(Internal)*

### 🌐 Domain Management

#### Domain Operations
- `GET /domains` - List domains *(Public)*
- `POST /domains` - Add new domain *(Public)*
- `GET /domains/{id}` - Get domain details *(Public)*
- `PUT /domains/{id}` - Update domain settings *(Public)*
- `DELETE /domains/{id}` - Delete domain *(Public)*

#### Domain Verification
- `POST /domains/{id}/verify` - Initiate domain verification *(Public)*
- `GET /domains/{id}/verification` - Check verification status *(Public)*
- `POST /domains/{id}/dns-check` - Check DNS records *(Public)*
- `GET /domains/{id}/dns-records` - Get required DNS records *(Public)*

#### Domain Configuration
- `POST /domains/{id}/catch-all/enable` - Enable catch-all *(Public)*
- `POST /domains/{id}/catch-all/disable` - Disable catch-all *(Public)*
- `GET /domains/{id}/catch-all/status` - Get catch-all status *(Public)*

#### Domain Analytics
- `GET /domains/{id}/stats` - Get domain statistics *(Public)*
- `GET /domains/{id}/emails/stats` - Get email statistics for domain *(Public)*

### 📮 Email Address Management

#### Email Address Operations
- `GET /email-addresses` - List email addresses *(Public)*
- `POST /email-addresses` - Create email address *(Public)*
- `GET /email-addresses/{id}` - Get email address details *(Public)*
- `PUT /email-addresses/{id}` - Update email address *(Public)*
- `DELETE /email-addresses/{id}` - Delete email address *(Public)*

#### Email Address Configuration
- `PUT /email-addresses/{id}/endpoint` - Set routing endpoint *(Public)*
- `DELETE /email-addresses/{id}/endpoint` - Remove routing endpoint *(Public)*
- `POST /email-addresses/{id}/test` - Test email address configuration *(Public)*

### 🔗 Endpoint Management (Unified Routing System)

#### Endpoint Operations
- `GET /endpoints` - List endpoints *(Public)*
- `POST /endpoints` - Create endpoint *(Public)*
- `GET /endpoints/{id}` - Get endpoint details *(Public)*
- `PUT /endpoints/{id}` - Update endpoint *(Public)*
- `DELETE /endpoints/{id}` - Delete endpoint *(Public)*

#### Endpoint Analytics
- `GET /endpoints/{id}/deliveries` - Get delivery statistics *(Public)*
- `GET /endpoints/{id}/deliveries/{deliveryId}` - Get delivery details *(Public)*

### 🚫 Email Blocking

#### Blocking Management
- `GET /blocked-emails` - List blocked emails *(Internal)*
- `POST /blocked-emails` - Block email address *(Internal)*
- `DELETE /blocked-emails/{id}` - Unblock email address *(Internal)*
- `POST /blocked-emails/check` - Check if email is blocked *(Internal)*

### 📊 Analytics & Reporting

#### General Analytics
- `GET /analytics/overview` - Get analytics overview *(Internal)*
- `GET /analytics/emails` - Get email analytics *(Internal)*
- `GET /analytics/domains` - Get domain analytics *(Internal)*
- `GET /analytics/endpoints` - Get endpoint analytics *(Internal)*

### 💳 Billing & Subscriptions

#### Billing Management
- `GET /billing/customer` - Get customer information *(Internal)*
- `POST /billing/portal` - Generate billing portal URL *(Internal)*
- `GET /billing/usage` - Get usage statistics *(Internal)*

#### Subscription Management
- `GET /subscriptions` - Get subscription details *(Internal)*
- `POST /subscriptions/upgrade` - Upgrade subscription *(Internal)*
- `POST /subscriptions/downgrade` - Downgrade subscription *(Internal)*

### 🔧 Admin Operations

#### User Administration
- `GET /admin/users` - List all users *(Internal)*

#### Domain Administration
- `GET /admin/domains` - List all domains *(Internal)*
- `GET /admin/domains/{id}/emails` - Get domain email addresses *(Internal)*

