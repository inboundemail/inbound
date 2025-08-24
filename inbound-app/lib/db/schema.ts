import { pgTable, varchar, text, timestamp, boolean, integer } from 'drizzle-orm/pg-core';
import { user, session, account, verification, apikey } from './auth-schema';

// Additional app-specific tables
export const subscriptions = pgTable('subscriptions', {
  id: varchar('id', { length: 255 }).primaryKey(),
  plan: varchar('plan', { length: 255 }).notNull(),
  referenceId: varchar('reference_id', { length: 255 }).notNull(),
  stripeCustomerId: varchar('stripe_customer_id', { length: 255 }),
  stripeSubscriptionId: varchar('stripe_subscription_id', { length: 255 }),
  status: varchar('status', { length: 255 }).notNull(),
  periodStart: timestamp('period_start'),
  periodEnd: timestamp('period_end'),
  cancelAtPeriodEnd: boolean('cancel_at_period_end').default(false),
  seats: integer('seats'),
  trialStart: timestamp('trial_start'),
  trialEnd: timestamp('trial_end'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const userAccounts = pgTable('user_accounts', {
  id: varchar('id', { length: 255 }).primaryKey(),
  userId: varchar('user_id', { length: 255 }).notNull(),
  stripeRestrictedKey: text('stripe_restricted_key'), // Account-level Stripe key for VIP BYOK
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// User onboarding tracking table
export const userOnboarding = pgTable('user_onboarding', {
  id: varchar('id', { length: 255 }).primaryKey(),
  userId: varchar('user_id', { length: 255 }).notNull().unique(),
  isCompleted: boolean('is_completed').default(false).notNull(),
  defaultEndpointCreated: boolean('default_endpoint_created').default(false).notNull(),
  completedAt: timestamp('completed_at'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Demo email tracking for onboarding
export const onboardingDemoEmails = pgTable('onboarding_demo_emails', {
  id: varchar('id', { length: 255 }).primaryKey(),
  userId: varchar('user_id', { length: 255 }).notNull(),
  emailId: varchar('email_id', { length: 255 }).notNull(), // From the sent email
  messageId: varchar('message_id', { length: 255 }), // SES Message-ID for reply matching
  recipientEmail: varchar('recipient_email', { length: 255 }).notNull(),
  sentAt: timestamp('sent_at').defaultNow(),
  replyReceived: boolean('reply_received').default(false),
  replyFrom: varchar('reply_from', { length: 255 }),
  replySubject: varchar('reply_subject', { length: 500 }),
  replyBody: text('reply_body'),
  replyReceivedAt: timestamp('reply_received_at'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// You can add more app-specific tables here
export const emailDomains = pgTable('email_domains', {
  id: varchar('id', { length: 255 }).primaryKey(),
  domain: varchar('domain', { length: 255 }).notNull().unique(),
  status: varchar('status', { length: 50 }).notNull(), // 'pending', 'verified', 'failed'
  verificationToken: varchar('verification_token', { length: 255 }),
  canReceiveEmails: boolean('can_receive_emails').default(false),
  hasMxRecords: boolean('has_mx_records').default(false),
  domainProvider: varchar('domain_provider', { length: 100 }),
  providerConfidence: varchar('provider_confidence', { length: 20 }), // 'high', 'medium', 'low'
  lastDnsCheck: timestamp('last_dns_check'),
  lastSesCheck: timestamp('last_ses_check'),
  // MAIL FROM domain configuration for removing "via amazonses.com"
  mailFromDomain: varchar('mail_from_domain', { length: 255 }), // e.g., "mail.example.com"
  mailFromDomainStatus: varchar('mail_from_domain_status', { length: 50 }), // 'pending', 'verified', 'failed', 'not_set'
  mailFromDomainVerifiedAt: timestamp('mail_from_domain_verified_at'),
  // Catch-all configuration
  isCatchAllEnabled: boolean('is_catch_all_enabled').default(false),
  catchAllWebhookId: varchar('catch_all_webhook_id', { length: 255 }), // Link to webhooks table for catch-all emails (legacy)
  catchAllEndpointId: varchar('catch_all_endpoint_id', { length: 255 }), // Link to endpoints table for catch-all emails (new unified system)
  catchAllReceiptRuleName: varchar('catch_all_receipt_rule_name', { length: 255 }),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
  userId: varchar('user_id', { length: 255 }).notNull(),
});

export const emailAddresses = pgTable('email_addresses', {
  id: varchar('id', { length: 255 }).primaryKey(),
  address: varchar('address', { length: 255 }).notNull().unique(),
  domainId: varchar('domain_id', { length: 255 }).notNull(),
  webhookId: varchar('webhook_id', { length: 255 }), // Link to webhooks table (kept for backward compatibility)
  endpointId: varchar('endpoint_id', { length: 255 }), // Link to endpoints table (new unified system)
  isActive: boolean('is_active').default(true),
  isReceiptRuleConfigured: boolean('is_receipt_rule_configured').default(false),
  receiptRuleName: varchar('receipt_rule_name', { length: 255 }),
  // VIP fields
  isVipEnabled: boolean('is_vip_enabled').default(false),
  vipConfigId: varchar('vip_config_id', { length: 255 }), // Link to vipConfigs table
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
  userId: varchar('user_id', { length: 255 }).notNull(),
});

// Webhooks table - stores webhook configurations
export const webhooks = pgTable('webhooks', {
  id: varchar('id', { length: 255 }).primaryKey(),
  name: varchar('name', { length: 255 }).notNull(), // User-friendly name
  url: text('url').notNull(), // Webhook URL
  secret: varchar('secret', { length: 255 }), // For webhook verification
  isActive: boolean('is_active').default(true),
  description: text('description'), // Optional description
  headers: text('headers'), // JSON string for custom headers
  timeout: integer('timeout').default(30), // Timeout in seconds
  retryAttempts: integer('retry_attempts').default(3),
  lastUsed: timestamp('last_used'),
  totalDeliveries: integer('total_deliveries').default(0),
  successfulDeliveries: integer('successful_deliveries').default(0),
  failedDeliveries: integer('failed_deliveries').default(0),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
  userId: varchar('user_id', { length: 255 }).notNull(),
});

// SES Events table - stores raw SES event data
export const sesEvents = pgTable('ses_events', {
  id: varchar('id', { length: 255 }).primaryKey(),
  eventSource: varchar('event_source', { length: 100 }).notNull(),
  eventVersion: varchar('event_version', { length: 50 }).notNull(),
  messageId: varchar('message_id', { length: 255 }).notNull(),
  source: varchar('source', { length: 255 }).notNull(),
  destination: text('destination').notNull(), // JSON array of recipients
  subject: text('subject'),
  timestamp: timestamp('timestamp').notNull(),
  receiptTimestamp: timestamp('receipt_timestamp').notNull(),
  processingTimeMillis: integer('processing_time_millis'),
  recipients: text('recipients').notNull(), // JSON array
  spamVerdict: varchar('spam_verdict', { length: 50 }),
  virusVerdict: varchar('virus_verdict', { length: 50 }),
  spfVerdict: varchar('spf_verdict', { length: 50 }),
  dkimVerdict: varchar('dkim_verdict', { length: 50 }),
  dmarcVerdict: varchar('dmarc_verdict', { length: 50 }),
  actionType: varchar('action_type', { length: 50 }),
  s3BucketName: varchar('s3_bucket_name', { length: 255 }),
  s3ObjectKey: varchar('s3_object_key', { length: 500 }),
  emailContent: text('email_content'), // Full email content from S3
  s3ContentFetched: boolean('s3_content_fetched').default(false),
  s3ContentSize: integer('s3_content_size'),
  s3Error: text('s3_error'),
  commonHeaders: text('common_headers'), // JSON object
  rawSesEvent: text('raw_ses_event').notNull(), // Complete SES event JSON
  lambdaContext: text('lambda_context'), // Lambda execution context
  webhookPayload: text('webhook_payload'), // Complete webhook payload
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const receivedEmails = pgTable('received_emails', { // deprecating.... use structuredEmails instead
  id: varchar('id', { length: 255 }).primaryKey(),
  sesEventId: varchar('ses_event_id', { length: 255 }).notNull(), // Reference to sesEvents table
  messageId: varchar('message_id', { length: 255 }).notNull(),
  
  // Basic email fields
  from: varchar('from', { length: 255 }).notNull(),
  to: text('to').notNull(), // JSON string for multiple recipients
  recipient: varchar('recipient', { length: 255 }).notNull(), // Specific recipient for this record
  subject: text('subject'),
  
  // Parsed email data from parseEmail function
  fromParsed: text('from_parsed'), // JSON: { text: string, addresses: Array<{name: string|null, address: string|null}> }
  toParsed: text('to_parsed'), // JSON: same structure as fromParsed
  ccParsed: text('cc_parsed'), // JSON: same structure as fromParsed
  bccParsed: text('bcc_parsed'), // JSON: same structure as fromParsed
  replyToParsed: text('reply_to_parsed'), // JSON: same structure as fromParsed
  
  // Email content
  textBody: text('text_body'), // Plain text body
  htmlBody: text('html_body'), // HTML body
  rawEmailContent: text('raw_email_content'), // Full raw email content
  
  // Email metadata
  inReplyTo: varchar('in_reply_to', { length: 255 }), // Message ID this is replying to
  references: text('references'), // JSON array of referenced message IDs
  priority: varchar('priority', { length: 50 }), // Email priority
  
  // Attachments and headers
  attachments: text('attachments'), // JSON array of attachment metadata
  headers: text('headers'), // JSON object of all email headers
  
  // Timestamps
  emailDate: timestamp('email_date'), // Date from email headers
  receivedAt: timestamp('received_at').notNull(),
  processedAt: timestamp('processed_at'),
  
  // Status and tracking
  status: varchar('status', { length: 50 }).notNull(), // 'received', 'processing', 'forwarded', 'failed'
  isRead: boolean('is_read').default(false), // Track read/unread status
  readAt: timestamp('read_at'), // When the email was marked as read
  
  // Legacy metadata field for backward compatibility
  metadata: text('metadata'), // JSON string
  
  userId: varchar('user_id', { length: 255 }).notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Parsed Emails table - stores structured parsed email data with individual columns
export const parsedEmails = pgTable('parsed_emails', { // deprecating.... use structuredEmails insteadc
  id: varchar('id', { length: 255 }).primaryKey(),
  emailId: varchar('email_id', { length: 255 }).notNull(), // Reference to receivedEmails table
  messageId: varchar('message_id', { length: 255 }), // Parsed message ID from email headers
  
  // Email addresses - storing as text for the full address info, and separate columns for quick queries
  fromText: text('from_text'), // Full "Name <email@domain.com>" format
  fromAddress: varchar('from_address', { length: 255 }), // Just the email address for indexing
  fromName: varchar('from_name', { length: 255 }), // Just the display name
  
  toText: text('to_text'), // Full to addresses text
  toAddresses: text('to_addresses'), // JSON array of {name, address} objects
  
  ccText: text('cc_text'), // Full CC addresses text  
  ccAddresses: text('cc_addresses'), // JSON array of {name, address} objects
  
  bccText: text('bcc_text'), // Full BCC addresses text
  bccAddresses: text('bcc_addresses'), // JSON array of {name, address} objects
  
  replyToText: text('reply_to_text'), // Full reply-to text
  replyToAddresses: text('reply_to_addresses'), // JSON array of {name, address} objects
  
  // Email content
  subject: text('subject'), // Parsed subject
  textBody: text('text_body'), // Plain text body
  htmlBody: text('html_body'), // HTML body
  
  // Email threading and references
  inReplyTo: varchar('in_reply_to', { length: 255 }), // Message ID this is replying to
  references: text('references'), // JSON array of referenced message IDs
  
  // Email metadata
  priority: varchar('priority', { length: 50 }), // Email priority (high, normal, low)
  emailDate: timestamp('email_date'), // Date from email headers
  
  // Attachments and headers
  attachments: text('attachments'), // JSON array of attachment metadata
  attachmentCount: integer('attachment_count').default(0), // Quick count for queries
  hasAttachments: boolean('has_attachments').default(false), // Quick boolean for queries
  
  headers: text('headers'), // JSON object of all email headers
  
  // Content flags for quick queries
  hasTextBody: boolean('has_text_body').default(false),
  hasHtmlBody: boolean('has_html_body').default(false),
  
  // Parsing metadata
  parseSuccess: boolean('parse_success').default(true), // Whether parsing was successful
  parseError: text('parse_error'), // Any parsing errors encountered
  
  // Timestamps
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const structuredEmails = pgTable('structured_emails', {
  id: varchar('id', { length: 255 }).primaryKey(),
  emailId: varchar('email_id', { length: 255 }).notNull(), // Reference to receivedEmails table
  sesEventId: varchar('ses_event_id', { length: 255 }).notNull(), // Reference to sesEvents table
  
  // Core email fields matching ParsedEmailData
  messageId: varchar('message_id', { length: 255 }), // string | undefined
  date: timestamp('date'), // Date | undefined  
  subject: text('subject'), // string | undefined
  
  // Address fields - stored as JSON matching ParsedEmailAddress structure
  fromData: text('from_data'), // ParsedEmailAddress | null - JSON: { text: string, addresses: Array<{name: string|null, address: string|null}> }
  toData: text('to_data'), // ParsedEmailAddress | null
  ccData: text('cc_data'), // ParsedEmailAddress | null
  bccData: text('bcc_data'), // ParsedEmailAddress | null
  replyToData: text('reply_to_data'), // ParsedEmailAddress | null
  
  // Threading fields
  inReplyTo: varchar('in_reply_to', { length: 255 }), // string | undefined
  references: text('references'), // string[] | undefined - stored as JSON array
  
  // Content fields
  textBody: text('text_body'), // string | undefined
  htmlBody: text('html_body'), // string | undefined
  rawContent: text('raw_content'), // string | undefined (raw field from ParsedEmailData)
  
  // Attachments - stored as JSON array matching ParsedEmailData structure
  attachments: text('attachments'), // Array<{filename: string | undefined, contentType: string | undefined, size: number | undefined, contentId: string | undefined, contentDisposition: string | undefined}>
  
  // Headers - stored as JSON object matching enhanced headers structure
  headers: text('headers'), // Record<string, any> with specific typed properties
  
  // Priority field
  priority: varchar('priority', { length: 50 }), // string | false | undefined
  
  // Processing metadata
  parseSuccess: boolean('parse_success').default(true),
  parseError: text('parse_error'),
  isRead: boolean('is_read').default(false),
  readAt: timestamp('read_at'), // When the email was marked as read
  isArchived: boolean('is_archived').default(false),
  archivedAt: timestamp('archived_at'), // When the email was archived
  
  // User and timestamps
  userId: varchar('user_id', { length: 255 }).notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const webhookDeliveries = pgTable('webhook_deliveries', {
  id: varchar('id', { length: 255 }).primaryKey(),
  emailId: varchar('email_id', { length: 255 }),
  webhookId: varchar('webhook_id', { length: 255 }).notNull(), // Reference to webhooks table
  endpoint: varchar('endpoint', { length: 500 }).notNull(), // Keep for backward compatibility
  payload: text('payload'), // JSON payload sent
  status: varchar('status', { length: 50 }).notNull(), // 'pending', 'success', 'failed'
  attempts: integer('attempts').default(0),
  lastAttemptAt: timestamp('last_attempt_at'),
  responseCode: integer('response_code'),
  responseBody: text('response_body'),
  error: text('error'),
  deliveryTime: integer('delivery_time'), // Time in milliseconds
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const domainDnsRecords = pgTable('domain_dns_records', {
  id: varchar('id', { length: 255 }).primaryKey(),
  domainId: varchar('domain_id', { length: 255 }).notNull(),
  recordType: varchar('record_type', { length: 10 }).notNull(), // 'TXT', 'MX', etc.
  name: varchar('name', { length: 255 }).notNull(),
  value: text('value').notNull(),
  isRequired: boolean('is_required').default(true),
  isVerified: boolean('is_verified').default(false),
  lastChecked: timestamp('last_checked'),
  createdAt: timestamp('created_at').defaultNow(),
  priority: integer('priority'), // For MX records
  description: text('description'), // Human-readable description of the record purpose
});

// Endpoints table - unified system for webhooks, email forwards, and email groups
export const endpoints = pgTable('endpoints', {
  id: varchar('id', { length: 255 }).primaryKey(),
  name: varchar('name', { length: 255 }).notNull(), // User-friendly name
  type: varchar('type', { length: 50 }).notNull(), // 'webhook', 'email', 'email_group'
  webhookFormat: varchar('webhook_format', { length: 50 }).default('inbound'), // 'inbound', 'discord', 'slack', etc.
  config: text('config').notNull(), // JSON configuration based on type
  isActive: boolean('is_active').default(true),
  description: text('description'), // Optional description
  userId: varchar('user_id', { length: 255 }).notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Email Groups table - stores individual email addresses for email group endpoints
export const emailGroups = pgTable('email_groups', {
  id: varchar('id', { length: 255 }).primaryKey(),
  endpointId: varchar('endpoint_id', { length: 255 }).notNull(), // Reference to endpoints table
  emailAddress: varchar('email_address', { length: 255 }).notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

// Endpoint Deliveries table - tracks deliveries for all endpoint types (extends webhook deliveries)
export const endpointDeliveries = pgTable('endpoint_deliveries', {
  id: varchar('id', { length: 255 }).primaryKey(),
  emailId: varchar('email_id', { length: 255 }), // Reference to structured_emails table
  endpointId: varchar('endpoint_id', { length: 255 }).notNull(), // Reference to endpoints table
  deliveryType: varchar('delivery_type', { length: 50 }).notNull(), // 'webhook', 'email_forward'
  status: varchar('status', { length: 50 }).notNull(), // 'pending', 'success', 'failed'
  attempts: integer('attempts').default(0),
  lastAttemptAt: timestamp('last_attempt_at'),
  responseData: text('response_data'), // JSON response/error data
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Blocked Emails table - stores email addresses that should be blocked from processing
export const blockedEmails = pgTable('blocked_emails', {
  id: varchar('id', { length: 255 }).primaryKey(),
  emailAddress: varchar('email_address', { length: 255 }).notNull().unique(),
  domainId: varchar('domain_id', { length: 255 }).notNull(), // Reference to emailDomains table
  reason: text('reason'), // Optional reason for blocking
  blockedBy: varchar('blocked_by', { length: 255 }).notNull(), // User who blocked this email
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Sent Emails table - stores emails sent through the API
export const sentEmails = pgTable('sent_emails', {
  id: varchar('id', { length: 255 }).primaryKey(),
  
  // Sender and recipient information
  from: varchar('from', { length: 500 }).notNull(), // Full "Name <email@domain.com>" format
  fromAddress: varchar('from_address', { length: 255 }).notNull(), // Just the email address for validation
  fromDomain: varchar('from_domain', { length: 255 }).notNull(), // Domain part for validation
  to: text('to').notNull(), // JSON array of email addresses
  cc: text('cc'), // JSON array of email addresses
  bcc: text('bcc'), // JSON array of email addresses
  replyTo: text('reply_to'), // JSON array of email addresses
  
  // Email content
  subject: text('subject').notNull(),
  textBody: text('text_body'),
  htmlBody: text('html_body'),
  
  // Headers and metadata
  headers: text('headers'), // JSON object of custom headers
  attachments: text('attachments'), // JSON array of attachment metadata
  tags: text('tags'), // JSON array of email tags (Resend-compatible)
  
  // Delivery status
  status: varchar('status', { length: 50 }).notNull().default('pending'), // 'pending', 'sent', 'failed'
  messageId: varchar('message_id', { length: 255 }), // Provider message ID after sending
  provider: varchar('provider', { length: 50 }).default('ses'), // Email provider used
  providerResponse: text('provider_response'), // Full response from provider
  sentAt: timestamp('sent_at'), // When the email was actually sent
  failureReason: text('failure_reason'), // If failed, why
  
  // Idempotency
  idempotencyKey: varchar('idempotency_key', { length: 256 }), // For preventing duplicates
  
  // User and timestamps
  userId: varchar('user_id', { length: 255 }).notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Scheduled Emails table - stores emails to be sent at a future time
export const scheduledEmails = pgTable('scheduled_emails', {
  id: varchar('id', { length: 255 }).primaryKey(),
  userId: varchar('user_id', { length: 255 }).notNull(),
  
  // Scheduling information
  scheduledAt: timestamp('scheduled_at').notNull(), // When to send the email
  timezone: varchar('timezone', { length: 50 }).default('UTC'), // User's timezone for natural language parsing
  status: varchar('status', { length: 50 }).notNull().default('scheduled'), // 'scheduled', 'processing', 'sent', 'failed', 'cancelled'
  
  // Email content (same structure as sentEmails but for future sending)
  fromAddress: varchar('from_address', { length: 500 }).notNull(), // Full "Name <email@domain.com>" format
  fromDomain: varchar('from_domain', { length: 255 }).notNull(), // Domain part for validation
  toAddresses: text('to_addresses').notNull(), // JSON array of email addresses
  ccAddresses: text('cc_addresses'), // JSON array of email addresses
  bccAddresses: text('bcc_addresses'), // JSON array of email addresses
  replyToAddresses: text('reply_to_addresses'), // JSON array of email addresses
  
  // Email content
  subject: text('subject').notNull(),
  textBody: text('text_body'),
  htmlBody: text('html_body'),
  
  // Headers and metadata
  headers: text('headers'), // JSON object of custom headers
  attachments: text('attachments'), // JSON array of attachment data (base64 or S3 references)
  tags: text('tags'), // JSON array of email tags (Resend-compatible)
  
  // Processing metadata
  attempts: integer('attempts').default(0), // Number of send attempts
  maxAttempts: integer('max_attempts').default(3), // Maximum retry attempts
  nextRetryAt: timestamp('next_retry_at'), // When to retry if failed
  lastError: text('last_error'), // Last error message if failed
  
  // Idempotency
  idempotencyKey: varchar('idempotency_key', { length: 256 }), // For preventing duplicates
  
  // Audit and tracking
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
  sentAt: timestamp('sent_at'), // When the email was actually sent
  sentEmailId: varchar('sent_email_id', { length: 255 }), // Reference to sentEmails after successful sending
});

// Scheduled email status constants
export const SCHEDULED_EMAIL_STATUS = {
  SCHEDULED: 'scheduled',
  PROCESSING: 'processing', 
  SENT: 'sent',
  FAILED: 'failed',
  CANCELLED: 'cancelled'
} as const;

// Export types for Better Auth tables (using the imported tables)
export { user, session, account, verification, apikey };

export type User = typeof user.$inferSelect;
export type NewUser = typeof user.$inferInsert;
export type Session = typeof session.$inferSelect;
export type NewSession = typeof session.$inferInsert;
export type Account = typeof account.$inferSelect;
export type NewAccount = typeof account.$inferInsert;
export type Verification = typeof verification.$inferSelect;
export type NewVerification = typeof verification.$inferInsert;
export type ApiKey = typeof apikey.$inferSelect;
export type NewApiKey = typeof apikey.$inferInsert;

// Export types for app-specific tables
export type Subscription = typeof subscriptions.$inferSelect;
export type NewSubscription = typeof subscriptions.$inferInsert;
export type UserOnboarding = typeof userOnboarding.$inferSelect;
export type NewUserOnboarding = typeof userOnboarding.$inferInsert;
export type EmailDomain = typeof emailDomains.$inferSelect;
export type NewEmailDomain = typeof emailDomains.$inferInsert;
export type EmailAddress = typeof emailAddresses.$inferSelect;
export type NewEmailAddress = typeof emailAddresses.$inferInsert;
export type Webhook = typeof webhooks.$inferSelect;
export type NewWebhook = typeof webhooks.$inferInsert;
export type SesEvent = typeof sesEvents.$inferSelect;
export type NewSesEvent = typeof sesEvents.$inferInsert;
export type ReceivedEmail = typeof receivedEmails.$inferSelect;
export type NewReceivedEmail = typeof receivedEmails.$inferInsert;
export type ParsedEmail = typeof parsedEmails.$inferSelect;
export type NewParsedEmail = typeof parsedEmails.$inferInsert;
export type StructuredEmail = typeof structuredEmails.$inferSelect;
export type NewStructuredEmail = typeof structuredEmails.$inferInsert;
export type WebhookDelivery = typeof webhookDeliveries.$inferSelect;
export type NewWebhookDelivery = typeof webhookDeliveries.$inferInsert;
export type DomainDnsRecord = typeof domainDnsRecords.$inferSelect;
export type NewDomainDnsRecord = typeof domainDnsRecords.$inferInsert;
export type Endpoint = typeof endpoints.$inferSelect;
export type NewEndpoint = typeof endpoints.$inferInsert;
export type EmailGroup = typeof emailGroups.$inferSelect;
export type NewEmailGroup = typeof emailGroups.$inferInsert;
export type EndpointDelivery = typeof endpointDeliveries.$inferSelect;
export type NewEndpointDelivery = typeof endpointDeliveries.$inferInsert;
export type BlockedEmail = typeof blockedEmails.$inferSelect;
export type NewBlockedEmail = typeof blockedEmails.$inferInsert;
export type SentEmail = typeof sentEmails.$inferSelect;
export type NewSentEmail = typeof sentEmails.$inferInsert;

// Domain status enums
export const DOMAIN_STATUS = {
  PENDING: 'pending',
  VERIFIED: 'verified',
  FAILED: 'failed'
} as const;

export const SES_VERIFICATION_STATUS = {
  PENDING: 'Pending',
  SUCCESS: 'Success', 
  FAILED: 'Failed'
} as const;

export const PROVIDER_CONFIDENCE = {
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low'
} as const;

export const EMAIL_STATUS = {
  RECEIVED: 'received',
  PROCESSING: 'processing',
  FORWARDED: 'forwarded',
  FAILED: 'failed',
  BLOCKED: 'blocked'
} as const;

export const WEBHOOK_STATUS = {
  PENDING: 'pending',
  SUCCESS: 'success',
  FAILED: 'failed'
} as const;

export const ENDPOINT_TYPES = {
  WEBHOOK: 'webhook',
  EMAIL: 'email',
  EMAIL_GROUP: 'email_group'
} as const;

export const WEBHOOK_FORMATS = {
  INBOUND: 'inbound',
  DISCORD: 'discord',
  SLACK: 'slack'
} as const;

export const DELIVERY_TYPES = {
  WEBHOOK: 'webhook',
  EMAIL: 'email',
  EMAILGROUP: 'emailgroup'
} as const;

// VIP Configurations table
export const vipConfigs = pgTable('vip_configs', {
  id: varchar('id', { length: 255 }).primaryKey(),
  emailAddressId: varchar('email_address_id', { length: 255 }).notNull().unique(), // Link to emailAddresses
  userId: varchar('user_id', { length: 255 }).notNull(),
  priceInCents: integer('price_in_cents').notNull().default(100), // Default $1.00
  allowAfterPayment: boolean('allow_after_payment').default(false), // false = single email, true = allow all future
  customMessage: text('custom_message'), // Custom message in payment email
  paymentLinkExpirationHours: integer('payment_link_expiration_hours').default(24),
  destinationEmail: varchar('destination_email', { length: 255 }), // Where to forward emails after payment (defaults to account email)
  endpointId: varchar('endpoint_id', { length: 255 }), // Reference to the VIP endpoint in endpoints table
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// VIP Payment Sessions table - tracks payment links and their status
export const vipPaymentSessions = pgTable('vip_payment_sessions', {
  id: varchar('id', { length: 255 }).primaryKey(),
  vipConfigId: varchar('vip_config_id', { length: 255 }).notNull(),
  senderEmail: varchar('sender_email', { length: 255 }).notNull(),
  originalEmailId: varchar('original_email_id', { length: 255 }).notNull(), // Reference to structuredEmails
  stripePaymentLinkId: varchar('stripe_payment_link_id', { length: 255 }),
  stripePaymentLinkUrl: text('stripe_payment_link_url'),
  stripeSessionId: varchar('stripe_session_id', { length: 255 }),
  status: varchar('status', { length: 50 }).notNull().default('pending'), // pending, paid, expired, cancelled
  paidAt: timestamp('paid_at'),
  expiresAt: timestamp('expires_at'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// VIP Allowed Senders - tracks who can send without payment
export const vipAllowedSenders = pgTable('vip_allowed_senders', {
  id: varchar('id', { length: 255 }).primaryKey(),
  vipConfigId: varchar('vip_config_id', { length: 255 }).notNull(),
  senderEmail: varchar('sender_email', { length: 255 }).notNull(),
  allowedAt: timestamp('allowed_at').defaultNow(),
  allowedUntil: timestamp('allowed_until'), // Optional expiration
  paymentSessionId: varchar('payment_session_id', { length: 255 }), // Reference to the payment that allowed them
  createdAt: timestamp('created_at').defaultNow(),
});

// VIP Email Attempts - tracks all emails that hit VIP protection
export const vipEmailAttempts = pgTable('vip_email_attempts', {
  id: varchar('id', { length: 255 }).primaryKey(),
  vipConfigId: varchar('vip_config_id', { length: 255 }).notNull(),
  senderEmail: varchar('sender_email', { length: 255 }).notNull(),
  recipientEmail: varchar('recipient_email', { length: 255 }).notNull(),
  originalEmailId: varchar('original_email_id', { length: 255 }).notNull(), // Reference to structuredEmails
  emailSubject: text('email_subject'),
  status: varchar('status', { length: 50 }).notNull().default('payment_required'), // payment_required, allowed, blocked
  paymentSessionId: varchar('payment_session_id', { length: 255 }), // Reference to payment session if payment required
  allowedReason: varchar('allowed_reason', { length: 100 }), // 'previous_payment', 'whitelisted', etc.
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Create index for faster lookups
// Note: These would be created in migration files
// CREATE INDEX idx_vip_allowed_sender ON vip_allowed_senders(vip_config_id, sender_email);
// CREATE INDEX idx_vip_payment_session_status ON vip_payment_sessions(status);

// VIP Status enum
export const VIP_PAYMENT_STATUS = {
  PENDING: 'pending',
  PAID: 'paid',
  EXPIRED: 'expired',
  CANCELLED: 'cancelled'
} as const;

export const DELIVERY_STATUS = {
  PENDING: 'pending',
  SUCCESS: 'success',
  FAILED: 'failed'
} as const;

export const SENT_EMAIL_STATUS = {
  PENDING: 'pending',
  SENT: 'sent',
  FAILED: 'failed'
} as const;

// Type definitions
export type DomainStatus = typeof DOMAIN_STATUS[keyof typeof DOMAIN_STATUS];
export type SesVerificationStatus = typeof SES_VERIFICATION_STATUS[keyof typeof SES_VERIFICATION_STATUS];
export type ProviderConfidence = typeof PROVIDER_CONFIDENCE[keyof typeof PROVIDER_CONFIDENCE];
export type EmailStatus = typeof EMAIL_STATUS[keyof typeof EMAIL_STATUS];
export type WebhookStatus = typeof WEBHOOK_STATUS[keyof typeof WEBHOOK_STATUS];
export type EndpointType = typeof ENDPOINT_TYPES[keyof typeof ENDPOINT_TYPES];
export type WebhookFormat = typeof WEBHOOK_FORMATS[keyof typeof WEBHOOK_FORMATS];
export type DeliveryType = typeof DELIVERY_TYPES[keyof typeof DELIVERY_TYPES];
export type DeliveryStatus = typeof DELIVERY_STATUS[keyof typeof DELIVERY_STATUS];
export type SentEmailStatus = typeof SENT_EMAIL_STATUS[keyof typeof SENT_EMAIL_STATUS];
export type VipPaymentStatus = typeof VIP_PAYMENT_STATUS[keyof typeof VIP_PAYMENT_STATUS];
