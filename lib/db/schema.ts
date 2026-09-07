import { sql } from "drizzle-orm";
import {
	boolean,
	index,
	integer,
	pgTable,
	text,
	timestamp,
	unique,
	uniqueIndex,
	varchar,
} from "drizzle-orm/pg-core";
import {
	account,
	apikey,
	deviceCode,
	jwks,
	oauthAccessToken,
	oauthClient,
	oauthConsent,
	oauthRefreshToken,
	passkey,
	session,
	user,
	verification,
} from "./auth-schema";

// Additional app-specific tables
export const subscriptions = pgTable("subscriptions", {
	id: varchar("id", { length: 255 }).primaryKey(),
	plan: varchar("plan", { length: 255 }).notNull(),
	referenceId: varchar("reference_id", { length: 255 }).notNull(),
	stripeCustomerId: varchar("stripe_customer_id", { length: 255 }),
	stripeSubscriptionId: varchar("stripe_subscription_id", { length: 255 }),
	status: varchar("status", { length: 255 }).notNull(),
	periodStart: timestamp("period_start"),
	periodEnd: timestamp("period_end"),
	cancelAtPeriodEnd: boolean("cancel_at_period_end").default(false),
	seats: integer("seats"),
	trialStart: timestamp("trial_start"),
	trialEnd: timestamp("trial_end"),
	createdAt: timestamp("created_at").defaultNow(),
	updatedAt: timestamp("updated_at").defaultNow(),
});

export const userAccounts = pgTable("user_accounts", {
	id: varchar("id", { length: 255 }).primaryKey(),
	userId: varchar("user_id", { length: 255 }).notNull(),
	stripeRestrictedKey: text("stripe_restricted_key"),
	createdAt: timestamp("created_at").defaultNow(),
	updatedAt: timestamp("updated_at").defaultNow(),
});

// User onboarding tracking table
export const userOnboarding = pgTable("user_onboarding", {
	id: varchar("id", { length: 255 }).primaryKey(),
	userId: varchar("user_id", { length: 255 }).notNull().unique(),
	isCompleted: boolean("is_completed").default(false).notNull(),
	defaultEndpointCreated: boolean("default_endpoint_created")
		.default(false)
		.notNull(),
	completedAt: timestamp("completed_at"),
	createdAt: timestamp("created_at").defaultNow(),
	updatedAt: timestamp("updated_at").defaultNow(),
});

// Demo email tracking for onboarding
export const onboardingDemoEmails = pgTable("onboarding_demo_emails", {
	id: varchar("id", { length: 255 }).primaryKey(),
	userId: varchar("user_id", { length: 255 }).notNull(),
	emailId: varchar("email_id", { length: 255 }).notNull(), // From the sent email
	messageId: varchar("message_id", { length: 255 }), // SES Message-ID for reply matching
	recipientEmail: varchar("recipient_email", { length: 255 }).notNull(),
	sentAt: timestamp("sent_at").defaultNow(),
	replyReceived: boolean("reply_received").default(false),
	replyFrom: varchar("reply_from", { length: 255 }),
	replySubject: varchar("reply_subject", { length: 500 }),
	replyBody: text("reply_body"),
	replyReceivedAt: timestamp("reply_received_at"),
	createdAt: timestamp("created_at").defaultNow(),
	updatedAt: timestamp("updated_at").defaultNow(),
});

// You can add more app-specific tables here
// SES Tenants table - manages AWS SES tenant isolation for users
export const sesTenants = pgTable("ses_tenants", {
	id: varchar("id", { length: 255 }).primaryKey(),
	userId: varchar("user_id", { length: 255 }).notNull().unique(), // 1:1 relationship with users
	awsTenantId: varchar("aws_tenant_id", { length: 255 }).notNull().unique(), // AWS SES tenant ID
	tenantName: varchar("tenant_name", { length: 255 }).notNull(), // Human-readable name
	configurationSetName: varchar("configuration_set_name", { length: 255 }), // AWS SES configuration set for tenant-level tracking
	status: varchar("status", { length: 50 }).notNull().default("active"), // 'active', 'paused', 'suspended'
	reputationPolicy: varchar("reputation_policy", { length: 20 })
		.notNull()
		.default("strict"), // 'standard', 'strict', 'none'
	createdAt: timestamp("created_at").defaultNow(),
	updatedAt: timestamp("updated_at").defaultNow(),
});

// Rate limit overrides - allows custom hourly sending limits per user
// A null hourlyLimit means unlimited (no hourly cap)
export const rateLimitOverrides = pgTable("rate_limit_overrides", {
	id: varchar("id", { length: 255 }).primaryKey(),
	userId: varchar("user_id", { length: 255 }).notNull().unique(),
	hourlyLimit: integer("hourly_limit"), // null = unlimited
	isActive: boolean("is_active").notNull().default(true),
	reason: text("reason"), // why this override exists
	createdBy: varchar("created_by", { length: 255 }), // admin who set it
	expiresAt: timestamp("expires_at"), // optional expiry
	createdAt: timestamp("created_at").defaultNow(),
	updatedAt: timestamp("updated_at").defaultNow(),
});

export const emailDomains = pgTable("email_domains", {
	id: varchar("id", { length: 255 }).primaryKey(),
	domain: varchar("domain", { length: 255 }).notNull().unique(),
	status: varchar("status", { length: 50 }).notNull(), // 'pending', 'verified', 'failed'
	verificationToken: varchar("verification_token", { length: 255 }),
	canReceiveEmails: boolean("can_receive_emails").default(false),
	hasMxRecords: boolean("has_mx_records").default(false),
	domainProvider: varchar("domain_provider", { length: 100 }),
	providerConfidence: varchar("provider_confidence", { length: 20 }), // 'high', 'medium', 'low'
	lastDnsCheck: timestamp("last_dns_check"),
	lastSesCheck: timestamp("last_ses_check"),
	// MAIL FROM domain configuration for removing "via amazonses.com"
	mailFromDomain: varchar("mail_from_domain", { length: 255 }), // e.g., "mail.example.com"
	mailFromDomainStatus: varchar("mail_from_domain_status", { length: 50 }), // 'pending', 'verified', 'failed', 'not_set'
	mailFromDomainVerifiedAt: timestamp("mail_from_domain_verified_at"),
	// Catch-all configuration
	isCatchAllEnabled: boolean("is_catch_all_enabled").default(false),
	catchAllWebhookId: varchar("catch_all_webhook_id", { length: 255 }), // Link to webhooks table for catch-all emails (legacy)
	catchAllEndpointId: varchar("catch_all_endpoint_id", { length: 255 }), // Link to endpoints table for catch-all emails (new unified system)
	catchAllReceiptRuleName: varchar("catch_all_receipt_rule_name", {
		length: 255,
	}),
	// DMARC email configuration
	receiveDmarcEmails: boolean("receive_dmarc_emails").default(false), // Whether to receive DMARC report emails (dmarc@domain)
	// Tenant association (NEW)
	tenantId: varchar("tenant_id", { length: 255 }), // References sesTenants.id
	createdAt: timestamp("created_at").defaultNow(),
	updatedAt: timestamp("updated_at").defaultNow(),
	userId: varchar("user_id", { length: 255 }).notNull(),
});

export const inboundOAuthGrants = pgTable(
	"inbound_oauth_grants",
	{
		id: varchar("id", { length: 255 }).primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		sessionId: text("session_id").references(() => session.id, {
			onDelete: "set null",
		}),
		clientId: text("client_id")
			.notNull()
			.references(() => oauthClient.clientId, { onDelete: "cascade" }),
		mode: varchar("mode", { length: 20 }).notNull(),
		domainIds: text("domain_ids").array().notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		revokedAt: timestamp("revoked_at"),
	},
	(table) => [
		index("inbound_oauth_grants_user_id_idx").on(table.userId),
		index("inbound_oauth_grants_session_client_idx").on(
			table.sessionId,
			table.clientId,
		),
	],
);

// SES Receipt Rules table - tracks batch catch-all rules for load balancing domains
export const sesReceiptRules = pgTable("ses_receipt_rules", {
	id: varchar("id", { length: 255 }).primaryKey(),
	ruleName: varchar("rule_name", { length: 255 }).notNull().unique(),
	ruleSetName: varchar("rule_set_name", { length: 255 }).notNull(),
	domainCount: integer("domain_count").notNull().default(0),
	maxCapacity: integer("max_capacity").notNull().default(500),
	isActive: boolean("is_active").notNull().default(true),
	createdAt: timestamp("created_at").defaultNow(),
	updatedAt: timestamp("updated_at").defaultNow(),
});

export const emailAddresses = pgTable("email_addresses", {
	id: varchar("id", { length: 255 }).primaryKey(),
	address: varchar("address", { length: 255 }).notNull().unique(),
	domainId: varchar("domain_id", { length: 255 }).notNull(),
	webhookId: varchar("webhook_id", { length: 255 }), // Link to webhooks table (kept for backward compatibility)
	endpointId: varchar("endpoint_id", { length: 255 }), // Link to endpoints table (new unified system)
	isActive: boolean("is_active").default(true),
	isReceiptRuleConfigured: boolean("is_receipt_rule_configured").default(false),
	receiptRuleName: varchar("receipt_rule_name", { length: 255 }),
	// Tenant association (NEW)
	tenantId: varchar("tenant_id", { length: 255 }), // References sesTenants.id
	createdAt: timestamp("created_at").defaultNow(),
	updatedAt: timestamp("updated_at").defaultNow(),
	userId: varchar("user_id", { length: 255 }).notNull(),
});

// Webhooks table - stores webhook configurations
export const webhooks = pgTable("webhooks", {
	id: varchar("id", { length: 255 }).primaryKey(),
	name: varchar("name", { length: 255 }).notNull(), // User-friendly name
	url: text("url").notNull(), // Webhook URL
	secret: varchar("secret", { length: 255 }), // For webhook verification
	isActive: boolean("is_active").default(true),
	description: text("description"), // Optional description
	headers: text("headers"), // JSON string for custom headers
	timeout: integer("timeout").default(30), // Timeout in seconds
	retryAttempts: integer("retry_attempts").default(3),
	lastUsed: timestamp("last_used"),
	totalDeliveries: integer("total_deliveries").default(0),
	successfulDeliveries: integer("successful_deliveries").default(0),
	failedDeliveries: integer("failed_deliveries").default(0),
	createdAt: timestamp("created_at").defaultNow(),
	updatedAt: timestamp("updated_at").defaultNow(),
	userId: varchar("user_id", { length: 255 }).notNull(),
});

// SES Events table - stores raw SES event data
export const sesEvents = pgTable("ses_events", {
	id: varchar("id", { length: 255 }).primaryKey(),
	eventSource: varchar("event_source", { length: 100 }).notNull(),
	eventVersion: varchar("event_version", { length: 50 }).notNull(),
	messageId: varchar("message_id", { length: 255 }).notNull(),
	source: varchar("source", { length: 255 }).notNull(),
	destination: text("destination").notNull(), // JSON array of recipients
	subject: text("subject"),
	timestamp: timestamp("timestamp").notNull(),
	receiptTimestamp: timestamp("receipt_timestamp").notNull(),
	processingTimeMillis: integer("processing_time_millis"),
	recipients: text("recipients").notNull(), // JSON array
	spamVerdict: varchar("spam_verdict", { length: 50 }),
	virusVerdict: varchar("virus_verdict", { length: 50 }),
	spfVerdict: varchar("spf_verdict", { length: 50 }),
	dkimVerdict: varchar("dkim_verdict", { length: 50 }),
	dmarcVerdict: varchar("dmarc_verdict", { length: 50 }),
	actionType: varchar("action_type", { length: 50 }),
	s3BucketName: varchar("s3_bucket_name", { length: 255 }),
	s3ObjectKey: varchar("s3_object_key", { length: 500 }),
	emailContent: text("email_content"), // Full email content from S3
	s3ContentFetched: boolean("s3_content_fetched").default(false),
	s3ContentSize: integer("s3_content_size"),
	s3Error: text("s3_error"),
	commonHeaders: text("common_headers"), // JSON object
	rawSesEvent: text("raw_ses_event").notNull(), // Complete SES event JSON
	lambdaContext: text("lambda_context"), // Lambda execution context
	webhookPayload: text("webhook_payload"), // Complete webhook payload
	createdAt: timestamp("created_at").defaultNow(),
	updatedAt: timestamp("updated_at").defaultNow(),
});

export const receivedEmails = pgTable("received_emails", {
	// deprecating.... use structuredEmails instead
	id: varchar("id", { length: 255 }).primaryKey(),
	sesEventId: varchar("ses_event_id", { length: 255 }).notNull(), // Reference to sesEvents table
	messageId: varchar("message_id", { length: 255 }).notNull(),

	// Basic email fields
	from: varchar("from", { length: 255 }).notNull(),
	to: text("to").notNull(), // JSON string for multiple recipients
	recipient: varchar("recipient", { length: 255 }).notNull(), // Specific recipient for this record
	subject: text("subject"),

	// Parsed email data from parseEmail function
	fromParsed: text("from_parsed"), // JSON: { text: string, addresses: Array<{name: string|null, address: string|null}> }
	toParsed: text("to_parsed"), // JSON: same structure as fromParsed
	ccParsed: text("cc_parsed"), // JSON: same structure as fromParsed
	bccParsed: text("bcc_parsed"), // JSON: same structure as fromParsed
	replyToParsed: text("reply_to_parsed"), // JSON: same structure as fromParsed

	// Email content
	textBody: text("text_body"), // Plain text body
	htmlBody: text("html_body"), // HTML body
	rawEmailContent: text("raw_email_content"), // Full raw email content

	// Email metadata
	inReplyTo: varchar("in_reply_to", { length: 255 }), // Message ID this is replying to
	references: text("references"), // JSON array of referenced message IDs
	priority: varchar("priority", { length: 50 }), // Email priority

	// Attachments and headers
	attachments: text("attachments"), // JSON array of attachment metadata
	headers: text("headers"), // JSON object of all email headers

	// Timestamps
	emailDate: timestamp("email_date"), // Date from email headers
	receivedAt: timestamp("received_at").notNull(),
	processedAt: timestamp("processed_at"),

	// Status and tracking
	status: varchar("status", { length: 50 }).notNull(), // 'received', 'processing', 'forwarded', 'failed'
	isRead: boolean("is_read").default(false), // Track read/unread status
	readAt: timestamp("read_at"), // When the email was marked as read

	// Legacy metadata field for backward compatibility
	metadata: text("metadata"), // JSON string

	userId: varchar("user_id", { length: 255 }).notNull(),
	createdAt: timestamp("created_at").defaultNow(),
	updatedAt: timestamp("updated_at").defaultNow(),
});

// Parsed Emails table - stores structured parsed email data with individual columns
export const parsedEmails = pgTable("parsed_emails", {
	// deprecating.... use structuredEmails insteadc
	id: varchar("id", { length: 255 }).primaryKey(),
	emailId: varchar("email_id", { length: 255 }).notNull(), // Reference to receivedEmails table
	messageId: varchar("message_id", { length: 255 }), // Parsed message ID from email headers

	// Email addresses - storing as text for the full address info, and separate columns for quick queries
	fromText: text("from_text"), // Full "Name <email@domain.com>" format
	fromAddress: varchar("from_address", { length: 255 }), // Just the email address for indexing
	fromName: varchar("from_name", { length: 255 }), // Just the display name

	toText: text("to_text"), // Full to addresses text
	toAddresses: text("to_addresses"), // JSON array of {name, address} objects

	ccText: text("cc_text"), // Full CC addresses text
	ccAddresses: text("cc_addresses"), // JSON array of {name, address} objects

	bccText: text("bcc_text"), // Full BCC addresses text
	bccAddresses: text("bcc_addresses"), // JSON array of {name, address} objects

	replyToText: text("reply_to_text"), // Full reply-to text
	replyToAddresses: text("reply_to_addresses"), // JSON array of {name, address} objects

	// Email content
	subject: text("subject"), // Parsed subject
	textBody: text("text_body"), // Plain text body
	htmlBody: text("html_body"), // HTML body

	// Email threading and references
	inReplyTo: varchar("in_reply_to", { length: 255 }), // Message ID this is replying to
	references: text("references"), // JSON array of referenced message IDs

	// Email metadata
	priority: varchar("priority", { length: 50 }), // Email priority (high, normal, low)
	emailDate: timestamp("email_date"), // Date from email headers

	// Attachments and headers
	attachments: text("attachments"), // JSON array of attachment metadata
	attachmentCount: integer("attachment_count").default(0), // Quick count for queries
	hasAttachments: boolean("has_attachments").default(false), // Quick boolean for queries

	headers: text("headers"), // JSON object of all email headers

	// Content flags for quick queries
	hasTextBody: boolean("has_text_body").default(false),
	hasHtmlBody: boolean("has_html_body").default(false),

	// Parsing metadata
	parseSuccess: boolean("parse_success").default(true), // Whether parsing was successful
	parseError: text("parse_error"), // Any parsing errors encountered

	// Timestamps
	createdAt: timestamp("created_at").defaultNow(),
	updatedAt: timestamp("updated_at").defaultNow(),
});

export const structuredEmails = pgTable(
	"structured_emails",
	{
		id: varchar("id", { length: 255 }).primaryKey(),
		emailId: varchar("email_id", { length: 255 }).notNull(), // Self-referencing (same as id) - kept for backward compatibility with existing queries
		sesEventId: varchar("ses_event_id", { length: 255 }).notNull(), // Reference to sesEvents table

		// Core email fields matching ParsedEmailData
		messageId: varchar("message_id", { length: 255 }), // string | undefined
		date: timestamp("date"), // Date | undefined
		subject: text("subject"), // string | undefined
		recipient: varchar("recipient", { length: 255 }), // Specific recipient for this email record

		// Address fields - stored as JSON matching ParsedEmailAddress structure
		fromData: text("from_data"), // ParsedEmailAddress | null - JSON: { text: string, addresses: Array<{name: string|null, address: string|null}> }
		toData: text("to_data"), // ParsedEmailAddress | null
		ccData: text("cc_data"), // ParsedEmailAddress | null
		bccData: text("bcc_data"), // ParsedEmailAddress | null
		replyToData: text("reply_to_data"), // ParsedEmailAddress | null

		// Threading fields
		inReplyTo: varchar("in_reply_to", { length: 255 }), // string | undefined
		references: text("references"), // string[] | undefined - stored as JSON array

		// Content fields
		textBody: text("text_body"), // string | undefined
		htmlBody: text("html_body"), // string | undefined
		rawContent: text("raw_content"), // string | undefined (raw field from ParsedEmailData)

		// Attachments - stored as JSON array matching ParsedEmailData structure
		attachments: text("attachments"), // Array<{filename: string | undefined, contentType: string | undefined, size: number | undefined, contentId: string | undefined, contentDisposition: string | undefined}>

		// Headers - stored as JSON object matching enhanced headers structure
		headers: text("headers"), // Record<string, any> with specific typed properties

		// Priority field
		priority: varchar("priority", { length: 50 }), // string | false | undefined

		// Processing metadata
		parseSuccess: boolean("parse_success").default(true),
		parseError: text("parse_error"),
		isRead: boolean("is_read").default(false),
		readAt: timestamp("read_at"), // When the email was marked as read
		isArchived: boolean("is_archived").default(false),
		archivedAt: timestamp("archived_at"), // When the email was archived

		// Guard-related fields
		guardBlocked: boolean("guard_blocked").default(false), // Whether this email was blocked by Guard rules
		guardReason: text("guard_reason"), // Reason why the email was blocked or flagged
		guardRuleId: varchar("guard_rule_id", { length: 255 }), // ID of the guard rule that triggered
		guardAction: varchar("guard_action", { length: 50 }), // 'block', 'flag', 'label'
		guardMetadata: text("guard_metadata"), // Additional Guard metadata as JSON

		// User and timestamps
		userId: varchar("user_id", { length: 255 }).notNull(),
		createdAt: timestamp("created_at").defaultNow(),
		updatedAt: timestamp("updated_at").defaultNow(),
		// Threading fields
		threadId: varchar("thread_id", { length: 255 }), // Reference to emailThreads.id
		threadPosition: integer("thread_position"), // Position in thread (1 = first, 2 = second, etc.)
	},
	(table) => ({
		uniqueUserMessageRecipient: unique(
			"structured_emails_user_message_recipient_unique",
		).on(table.userId, table.messageId, table.recipient),
		messageIdIdx: index("structured_emails_message_id_idx").on(table.messageId),
		threadIdIdx: index("structured_emails_thread_id_idx").on(table.threadId),
		userCreatedIdx: index("structured_emails_user_created_idx").on(
			table.userId,
			table.createdAt,
		),
		userIdIdx: index("structured_emails_user_id_idx").on(table.userId),
		guardBlockedIdx: index("structured_emails_guard_blocked_idx").on(
			table.guardBlocked,
		),
	}),
);

export const webhookDeliveries = pgTable("webhook_deliveries", {
	id: varchar("id", { length: 255 }).primaryKey(),
	emailId: varchar("email_id", { length: 255 }),
	webhookId: varchar("webhook_id", { length: 255 }).notNull(), // Reference to webhooks table
	endpoint: varchar("endpoint", { length: 500 }).notNull(), // Keep for backward compatibility
	payload: text("payload"), // JSON payload sent
	status: varchar("status", { length: 50 }).notNull(), // 'pending', 'success', 'failed'
	attempts: integer("attempts").default(0),
	lastAttemptAt: timestamp("last_attempt_at"),
	responseCode: integer("response_code"),
	responseBody: text("response_body"),
	error: text("error"),
	deliveryTime: integer("delivery_time"), // Time in milliseconds
	createdAt: timestamp("created_at").defaultNow(),
	updatedAt: timestamp("updated_at").defaultNow(),
});

export const domainDnsRecords = pgTable("domain_dns_records", {
	id: varchar("id", { length: 255 }).primaryKey(),
	domainId: varchar("domain_id", { length: 255 }).notNull(),
	recordType: varchar("record_type", { length: 10 }).notNull(), // 'TXT', 'MX', etc.
	name: varchar("name", { length: 255 }).notNull(),
	value: text("value").notNull(),
	isRequired: boolean("is_required").default(true),
	isVerified: boolean("is_verified").default(false),
	lastChecked: timestamp("last_checked"),
	createdAt: timestamp("created_at").defaultNow(),
	priority: integer("priority"), // For MX records
	description: text("description"), // Human-readable description of the record purpose
});

// Endpoints table - unified system for webhooks, email forwards, and email groups
export const endpoints = pgTable("endpoints", {
	id: varchar("id", { length: 255 }).primaryKey(),
	name: varchar("name", { length: 255 }).notNull(), // User-friendly name
	type: varchar("type", { length: 50 }).notNull(), // 'webhook', 'email', 'email_group'
	webhookFormat: varchar("webhook_format", { length: 50 }).default("inbound"), // 'inbound', 'discord', 'slack', etc.
	config: text("config").notNull(), // JSON configuration based on type
	isActive: boolean("is_active").default(true),
	description: text("description"), // Optional description
	userId: varchar("user_id", { length: 255 }).notNull(),
	createdAt: timestamp("created_at").defaultNow(),
	updatedAt: timestamp("updated_at").defaultNow(),
});

// Email Groups table - stores individual email addresses for email group endpoints
export const emailGroups = pgTable("email_groups", {
	id: varchar("id", { length: 255 }).primaryKey(),
	endpointId: varchar("endpoint_id", { length: 255 }).notNull(), // Reference to endpoints table
	emailAddress: varchar("email_address", { length: 255 }).notNull(),
	createdAt: timestamp("created_at").defaultNow(),
});

// Endpoint Deliveries table - tracks deliveries for all endpoint types (extends webhook deliveries)
export const endpointDeliveries = pgTable(
	"endpoint_deliveries",
	{
		id: varchar("id", { length: 255 }).primaryKey(),
		emailId: varchar("email_id", { length: 255 }), // Reference to structured_emails table
		endpointId: varchar("endpoint_id", { length: 255 }).notNull(), // Reference to endpoints table
		deliveryType: varchar("delivery_type", { length: 50 }).notNull(), // 'webhook', 'email_forward'
		status: varchar("status", { length: 50 }).notNull(), // 'pending', 'success', 'failed'
		attempts: integer("attempts").default(0),
		lastAttemptAt: timestamp("last_attempt_at"),
		responseData: text("response_data"), // JSON response/error data
		createdAt: timestamp("created_at").defaultNow(),
		updatedAt: timestamp("updated_at").defaultNow(),
	},
	(table) => ({
		emailStatusIdx: index("endpoint_deliveries_email_status_idx").on(
			table.emailId,
			table.status,
		),
		emailIdIdx: index("endpoint_deliveries_email_id_idx").on(table.emailId),
		// Unique constraint to prevent duplicate deliveries of same email to same endpoint
		uniqueEmailEndpoint: unique("endpoint_deliveries_email_endpoint_unique").on(
			table.emailId,
			table.endpointId,
		),
	}),
);

// Blocked Emails table - stores email addresses that should be blocked from processing
export const blockedEmails = pgTable("blocked_emails", {
	id: varchar("id", { length: 255 }).primaryKey(),
	emailAddress: varchar("email_address", { length: 255 }).notNull().unique(),
	domainId: varchar("domain_id", { length: 255 }).notNull(), // Reference to emailDomains table
	reason: text("reason"), // Optional reason for blocking
	blockedBy: varchar("blocked_by", { length: 255 }).notNull(), // User who blocked this email
	createdAt: timestamp("created_at").defaultNow(),
	updatedAt: timestamp("updated_at").defaultNow(),
});

export const blockedSignupDomains = pgTable(
	"blocked_signup_domains",
	{
		id: varchar("id", { length: 255 }).primaryKey(),
		domain: varchar("domain", { length: 255 }).notNull().unique(),
		reason: text("reason"),
		isActive: boolean("is_active").notNull().default(true),
		blockedBy: varchar("blocked_by", { length: 255 }),
		createdAt: timestamp("created_at").defaultNow(),
		updatedAt: timestamp("updated_at").defaultNow(),
	},
	(table) => ({
		activeIdx: index("blocked_signup_domains_active_idx").on(table.isActive),
	}),
);

// Sent Emails table - stores emails sent through the API
export const sentEmails = pgTable(
	"sent_emails",
	{
		id: varchar("id", { length: 255 }).primaryKey(),

		// Sender and recipient information
		from: varchar("from", { length: 500 }).notNull(), // Full "Name <email@domain.com>" format
		fromAddress: varchar("from_address", { length: 255 }).notNull(), // Just the email address for validation
		fromDomain: varchar("from_domain", { length: 255 }).notNull(), // Domain part for validation
		to: text("to").notNull(), // JSON array of email addresses
		cc: text("cc"), // JSON array of email addresses
		bcc: text("bcc"), // JSON array of email addresses
		replyTo: text("reply_to"), // JSON array of email addresses

		// Email content
		subject: text("subject").notNull(),
		textBody: text("text_body"),
		htmlBody: text("html_body"),

		// Headers and metadata
		headers: text("headers"), // JSON object of custom headers
		attachments: text("attachments"), // JSON array of attachment metadata
		tags: text("tags"), // JSON array of email tags (Resend-compatible)

		// Delivery status
		status: varchar("status", { length: 50 }).notNull().default("pending"), // 'pending', 'sent', 'failed'
		messageId: varchar("message_id", { length: 255 }), // Internal message ID for email headers
		sesMessageId: varchar("ses_message_id", { length: 300 }), // AWS SES Message-ID (returned after sending, used for threading)
		provider: varchar("provider", { length: 50 }).default("ses"), // Email provider used
		providerResponse: text("provider_response"), // Full response from provider
		sentAt: timestamp("sent_at"), // When the email was actually sent
		failureReason: text("failure_reason"), // If failed, why
		firstOpenedAt: timestamp("first_opened_at"),
		lastOpenedAt: timestamp("last_opened_at"),

		// Idempotency
		idempotencyKey: varchar("idempotency_key", { length: 256 }), // For preventing duplicates

		// Threading fields
		threadId: varchar("thread_id", { length: 255 }), // Reference to emailThreads.id
		threadPosition: integer("thread_position"), // Position in thread

		// Batch sending fields
		batchId: varchar("batch_id", { length: 255 }), // For grouping batch sends
		batchIndex: integer("batch_index"), // Order within batch

		// User and timestamps
		userId: varchar("user_id", { length: 255 }).notNull(),
		createdAt: timestamp("created_at").defaultNow(),
		updatedAt: timestamp("updated_at").defaultNow(),
	},
	(table) => ({
		threadIdIdx: index("sent_emails_thread_id_idx").on(table.threadId),
		userCreatedIdx: index("sent_emails_user_created_idx").on(
			table.userId,
			table.createdAt,
		),
		userStatusCreatedIdx: index("sent_emails_user_status_created_idx").on(
			table.userId,
			table.status,
			table.createdAt,
		),
		userFirstOpenedIdx: index("sent_emails_user_first_opened_idx").on(
			table.userId,
			table.firstOpenedAt,
		),
		// Partial unique index: guarantees one row per (batch, position) and
		// its batch_id prefix also serves batch lookups, so no separate
		// batch_id index is needed. WHERE clause keeps the ~4.3GB table's
		// non-batch rows (batch_id IS NULL) out of the index entirely.
		batchIdIndexUnique: uniqueIndex("sent_emails_batch_id_batch_index_unique")
			.on(table.batchId, table.batchIndex)
			.where(sql`${table.batchId} IS NOT NULL`),
	}),
);

// Email Threads table - stores conversation thread metadata
export const emailThreads = pgTable(
	"email_threads",
	{
		id: varchar("id", { length: 255 }).primaryKey(), // Thread ID (nanoid)

		// Thread identification
		rootMessageId: varchar("root_message_id", { length: 255 }).notNull(), // The first message in the thread
		normalizedSubject: text("normalized_subject"), // Cleaned subject for fallback matching

		// Thread metadata
		participantEmails: text("participant_emails"), // JSON array of all email addresses in thread
		messageCount: integer("message_count").default(1), // Total messages in thread
		lastMessageAt: timestamp("last_message_at").notNull(), // When thread was last active

		// User context
		userId: varchar("user_id", { length: 255 }).notNull(),

		// Timestamps
		createdAt: timestamp("created_at").defaultNow(),
		updatedAt: timestamp("updated_at").defaultNow(),
	},
	(table) => ({
		rootMessageIdIdx: index("email_threads_root_message_id_idx").on(
			table.rootMessageId,
		),
		userIdIdx: index("email_threads_user_id_idx").on(table.userId),
		lastMessageAtIdx: index("email_threads_last_message_at_idx").on(
			table.lastMessageAt,
		),
	}),
);

// Scheduled Emails table - stores emails to be sent at a future time
export const scheduledEmails = pgTable("scheduled_emails", {
	id: varchar("id", { length: 255 }).primaryKey(),
	userId: varchar("user_id", { length: 255 }).notNull(),

	// Scheduling information
	scheduledAt: timestamp("scheduled_at").notNull(), // When to send the email
	timezone: varchar("timezone", { length: 50 }).default("UTC"), // User's timezone for natural language parsing
	status: varchar("status", { length: 50 }).notNull().default("scheduled"), // 'scheduled', 'processing', 'sent', 'failed', 'cancelled'

	// Email content (same structure as sentEmails but for future sending)
	fromAddress: varchar("from_address", { length: 500 }).notNull(), // Full "Name <email@domain.com>" format
	fromDomain: varchar("from_domain", { length: 255 }).notNull(), // Domain part for validation
	toAddresses: text("to_addresses").notNull(), // JSON array of email addresses
	ccAddresses: text("cc_addresses"), // JSON array of email addresses
	bccAddresses: text("bcc_addresses"), // JSON array of email addresses
	replyToAddresses: text("reply_to_addresses"), // JSON array of email addresses

	// Email content
	subject: text("subject").notNull(),
	textBody: text("text_body"),
	htmlBody: text("html_body"),

	// Headers and metadata
	headers: text("headers"), // JSON object of custom headers
	attachments: text("attachments"), // JSON array of attachment data (base64 or S3 references)
	tags: text("tags"), // JSON array of email tags (Resend-compatible)

	// Processing metadata
	attempts: integer("attempts").default(0), // Number of send attempts (managed by QStash retries)
	maxAttempts: integer("max_attempts").default(3), // Maximum retry attempts (legacy, QStash handles this now)
	nextRetryAt: timestamp("next_retry_at"), // When to retry if failed (legacy, QStash handles this now)
	lastError: text("last_error"), // Last error message if failed

	// Idempotency
	idempotencyKey: varchar("idempotency_key", { length: 256 }), // For preventing duplicates

	// QStash integration fields (active - replaces cron-based scheduling)
	qstashScheduleId: varchar("qstash_schedule_id", { length: 255 }), // QStash message ID for scheduled delivery
	qstashDlqId: varchar("qstash_dlq_id", { length: 255 }), // Dead Letter Queue ID from QStash (future use)

	// Audit and tracking
	createdAt: timestamp("created_at").defaultNow(),
	updatedAt: timestamp("updated_at").defaultNow(),
	sentAt: timestamp("sent_at"), // When the email was actually sent
	sentEmailId: varchar("sent_email_id", { length: 255 }), // Reference to sentEmails after successful sending
});

// Email Batches table - durable parent record for bulk sends (items live in sentEmails via batchId/batchIndex)
export const emailBatches = pgTable(
	"email_batches",
	{
		id: varchar("id", { length: 255 }).primaryKey(),
		userId: varchar("user_id", { length: 255 }).notNull(),

		// Lifecycle: 'queued', 'partially_queued', 'completed', 'cancelled'
		status: varchar("status", { length: 50 }).notNull().default("queued"),

		// Item accounting (counters are advisory; item rows are the source of truth)
		total: integer("total").notNull(),
		sentCount: integer("sent_count").notNull().default(0),
		failedCount: integer("failed_count").notNull().default(0),
		cancelledCount: integer("cancelled_count").notNull().default(0),

		// Batch-level scheduling (null = immediate)
		scheduledAt: timestamp("scheduled_at"),
		timezone: varchar("timezone", { length: 50 }),

		// Idempotency (unique per user via index below)
		idempotencyKey: varchar("idempotency_key", { length: 256 }),

		// JSON object mapping item id -> QStash message id (for cancellation)
		qstashMessageIds: text("qstash_message_ids"),
		lastError: text("last_error"),

		createdAt: timestamp("created_at").defaultNow(),
		updatedAt: timestamp("updated_at").defaultNow(),
		completedAt: timestamp("completed_at"),
	},
	(table) => ({
		userIdempotencyUnique: uniqueIndex(
			"email_batches_user_idempotency_key_unique",
		).on(table.userId, table.idempotencyKey),
		userCreatedIdx: index("email_batches_user_created_idx").on(
			table.userId,
			table.createdAt,
		),
	}),
);

export const EMAIL_BATCH_STATUS = {
	QUEUED: "queued",
	PARTIALLY_QUEUED: "partially_queued",
	COMPLETED: "completed",
	CANCELLED: "cancelled",
} as const;

// Per-item lifecycle for bulk items stored in sentEmails.status
// ('sent'/'failed' intentionally overlap with SENT_EMAIL_STATUS)
export const BULK_EMAIL_ITEM_STATUS = {
	QUEUED: "queued",
	PROCESSING: "processing",
	SENT: "sent",
	FAILED: "failed",
	CANCELLED: "cancelled",
} as const;

// Email Sending Evaluations table - stores AI evaluations of sent emails for fraud monitoring
export const emailSendingEvaluations = pgTable(
	"email_sending_evaluations",
	{
		id: varchar("id", { length: 255 }).primaryKey(),
		emailId: varchar("email_id", { length: 255 }).notNull(), // Reference to sentEmails.id
		userId: varchar("user_id", { length: 255 }).notNull(), // Reference to user.id
		evaluationResult: text("evaluation_result"), // JSON - stores full AI output
		riskScore: integer("risk_score"), // 0-100 risk score
		flags: text("flags"), // JSON array of flags like "malicious", "spam", "phishing"
		aiModel: varchar("ai_model", { length: 255 }), // Model used for evaluation
		evaluationTime: integer("evaluation_time"), // Milliseconds taken
		promptTokens: integer("prompt_tokens"), // Optional token count
		completionTokens: integer("completion_tokens"), // Optional token count
		createdAt: timestamp("created_at").defaultNow(),
		updatedAt: timestamp("updated_at").defaultNow(),
	},
	(table) => ({
		emailIdIdx: index("email_sending_evaluations_email_id_idx").on(
			table.emailId,
		),
		userIdIdx: index("email_sending_evaluations_user_id_idx").on(table.userId),
		createdAtIdx: index("email_sending_evaluations_created_at_idx").on(
			table.createdAt,
		),
	}),
);

// Scheduled email status constants
export const SCHEDULED_EMAIL_STATUS = {
	SCHEDULED: "scheduled",
	PROCESSING: "processing",
	SENT: "sent",
	FAILED: "failed",
	CANCELLED: "cancelled",
	PAUSED: "paused",
} as const;

// Export types for Better Auth tables (using the imported tables)
export {
	user,
	session,
	account,
	verification,
	apikey,
	passkey,
	deviceCode,
	jwks,
	oauthClient,
	oauthRefreshToken,
	oauthAccessToken,
	oauthConsent,
};

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
export type InboundOAuthGrant = typeof inboundOAuthGrants.$inferSelect;
export type NewInboundOAuthGrant = typeof inboundOAuthGrants.$inferInsert;
export type SesReceiptRule = typeof sesReceiptRules.$inferSelect;
export type NewSesReceiptRule = typeof sesReceiptRules.$inferInsert;
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
export type BlockedSignupDomain = typeof blockedSignupDomains.$inferSelect;
export type NewBlockedSignupDomain = typeof blockedSignupDomains.$inferInsert;
export type SentEmail = typeof sentEmails.$inferSelect;
export type NewSentEmail = typeof sentEmails.$inferInsert;
export type EmailBatch = typeof emailBatches.$inferSelect;
export type NewEmailBatch = typeof emailBatches.$inferInsert;
export type EmailSendingEvaluation =
	typeof emailSendingEvaluations.$inferSelect;
export type NewEmailSendingEvaluation =
	typeof emailSendingEvaluations.$inferInsert;

// Domain status enums
export const DOMAIN_STATUS = {
	PENDING: "pending",
	VERIFIED: "verified",
	FAILED: "failed",
} as const;

export const SES_VERIFICATION_STATUS = {
	PENDING: "Pending",
	SUCCESS: "Success",
	FAILED: "Failed",
} as const;

export const PROVIDER_CONFIDENCE = {
	HIGH: "high",
	MEDIUM: "medium",
	LOW: "low",
} as const;

export const EMAIL_STATUS = {
	RECEIVED: "received",
	PROCESSING: "processing",
	FORWARDED: "forwarded",
	FAILED: "failed",
	BLOCKED: "blocked",
} as const;

export const WEBHOOK_STATUS = {
	PENDING: "pending",
	SUCCESS: "success",
	FAILED: "failed",
} as const;

export const ENDPOINT_TYPES = {
	WEBHOOK: "webhook",
	EMAIL: "email",
	EMAIL_GROUP: "email_group",
} as const;

export const WEBHOOK_FORMATS = {
	INBOUND: "inbound",
	DISCORD: "discord",
	SLACK: "slack",
} as const;

export const DELIVERY_TYPES = {
	WEBHOOK: "webhook",
	EMAIL: "email",
	EMAILGROUP: "emailgroup",
} as const;

export const DELIVERY_STATUS = {
	PENDING: "pending",
	SUCCESS: "success",
	FAILED: "failed",
} as const;

export const SENT_EMAIL_STATUS = {
	PENDING: "pending",
	SENT: "sent",
	FAILED: "failed",
} as const;

// Email Delivery Events table - tracks bounces, complaints, and delivery failures from DSNs
export const emailDeliveryEvents = pgTable(
	"email_delivery_events",
	{
		id: varchar("id", { length: 255 }).primaryKey(),

		// Event classification
		eventType: varchar("event_type", { length: 50 }).notNull(), // 'bounce', 'complaint', 'delivery_delay', 'delivery_failure'
		bounceType: varchar("bounce_type", { length: 50 }), // 'hard', 'soft', 'transient'
		bounceSubType: varchar("bounce_sub_type", { length: 100 }), // More specific: 'invalid_domain', 'user_unknown', 'mailbox_full', etc.

		// Status code info (RFC 3463 enhanced status codes)
		statusCode: varchar("status_code", { length: 20 }), // e.g., '5.4.4', '5.1.1', '4.4.7'
		statusClass: varchar("status_class", { length: 10 }), // '2' (success), '4' (temp), '5' (perm)
		statusCategory: varchar("status_category", { length: 10 }), // '0'-'7' per RFC 3463
		diagnosticCode: text("diagnostic_code"), // Full SMTP diagnostic message

		// Failed recipient info
		failedRecipient: varchar("failed_recipient", { length: 255 }).notNull(), // The email address that bounced
		failedRecipientDomain: varchar("failed_recipient_domain", { length: 255 }), // Domain part for grouping

		// Original email info (the email we sent that bounced)
		originalMessageId: varchar("original_message_id", { length: 500 }), // Message-ID of the email that bounced
		originalSentEmailId: varchar("original_sent_email_id", { length: 255 }), // Reference to sent_emails.id
		originalFrom: varchar("original_from", { length: 500 }), // Who sent the original email
		originalTo: text("original_to"), // Who it was sent to
		originalSubject: text("original_subject"), // Subject of original email
		originalSentAt: timestamp("original_sent_at"), // When original was sent

		// DSN source info
		dsnEmailId: varchar("dsn_email_id", { length: 255 }), // Reference to structured_emails.id (the DSN itself)
		dsnReceivedAt: timestamp("dsn_received_at"), // When we received the DSN
		reportingMta: varchar("reporting_mta", { length: 255 }), // MTA that reported the failure
		remoteMta: varchar("remote_mta", { length: 255 }), // Remote MTA that rejected

		// User/domain/tenant attribution
		userId: varchar("user_id", { length: 255 }), // User who sent the original email
		domainId: varchar("domain_id", { length: 255 }), // Domain used to send
		domainName: varchar("domain_name", { length: 255 }), // Domain name for quick access
		tenantId: varchar("tenant_id", { length: 255 }), // SES tenant
		tenantName: varchar("tenant_name", { length: 255 }), // Tenant name for quick access

		// Action tracking
		actionTaken: varchar("action_taken", { length: 50 }), // 'none', 'added_to_blocklist', 'notified_user', 'suppressed'
		actionTakenAt: timestamp("action_taken_at"),
		addedToBlocklist: boolean("added_to_blocklist").default(false),
		blocklistId: varchar("blocklist_id", { length: 255 }), // Reference to blocked_emails.id if added

		// Metadata
		rawDsnContent: text("raw_dsn_content"), // Full DSN for debugging (optional, could be large)
		metadata: text("metadata"), // JSON for any additional data

		// Timestamps
		createdAt: timestamp("created_at").defaultNow(),
		updatedAt: timestamp("updated_at").defaultNow(),
	},
	(table) => ({
		eventTypeIdx: index("email_delivery_events_event_type_idx").on(
			table.eventType,
		),
		bounceTypeIdx: index("email_delivery_events_bounce_type_idx").on(
			table.bounceType,
		),
		failedRecipientIdx: index("email_delivery_events_failed_recipient_idx").on(
			table.failedRecipient,
		),
		failedRecipientDomainIdx: index(
			"email_delivery_events_failed_recipient_domain_idx",
		).on(table.failedRecipientDomain),
		userIdIdx: index("email_delivery_events_user_id_idx").on(table.userId),
		domainIdIdx: index("email_delivery_events_domain_id_idx").on(
			table.domainId,
		),
		tenantIdIdx: index("email_delivery_events_tenant_id_idx").on(
			table.tenantId,
		),
		statusCodeIdx: index("email_delivery_events_status_code_idx").on(
			table.statusCode,
		),
		createdAtIdx: index("email_delivery_events_created_at_idx").on(
			table.createdAt,
		),
		originalMessageIdIdx: index(
			"email_delivery_events_original_message_id_idx",
		).on(table.originalMessageId),
	}),
);

// Email Delivery Event types
export const EMAIL_DELIVERY_EVENT_TYPES = {
	BOUNCE: "bounce",
	COMPLAINT: "complaint",
	DELIVERY_DELAY: "delivery_delay",
	DELIVERY_FAILURE: "delivery_failure",
} as const;

export const BOUNCE_TYPES = {
	HARD: "hard", // Permanent failure - should suppress
	SOFT: "soft", // Temporary issue that might resolve
	TRANSIENT: "transient", // Temporary, will retry
} as const;

export const BOUNCE_SUB_TYPES = {
	// Hard bounce reasons (5.x.x)
	INVALID_DOMAIN: "invalid_domain", // 5.4.4
	USER_UNKNOWN: "user_unknown", // 5.1.1
	MAILBOX_DISABLED: "mailbox_disabled", // 5.2.1
	BAD_DESTINATION: "bad_destination", // 5.1.2
	POLICY_REJECTION: "policy_rejection", // 5.7.x

	// Soft bounce reasons
	MAILBOX_FULL: "mailbox_full", // 5.2.2 or 4.2.2
	MESSAGE_TOO_LARGE: "message_too_large", // 5.3.4
	CONTENT_REJECTED: "content_rejected", // 5.6.x

	// Transient reasons (4.x.x)
	DNS_FAILURE: "dns_failure", // 4.4.4
	DELIVERY_TIMEOUT: "delivery_timeout", // 4.4.7
	CONNECTION_FAILED: "connection_failed", // 4.4.1

	// Other
	SUPPRESSION_LIST: "suppression_list", // On SES suppression list
	GENERAL_FAILURE: "general_failure",
	UNKNOWN: "unknown",
} as const;

export const DELIVERY_EVENT_ACTIONS = {
	NONE: "none",
	ADDED_TO_BLOCKLIST: "added_to_blocklist",
	NOTIFIED_USER: "notified_user",
	SUPPRESSED: "suppressed",
} as const;

// Guard Rules table - stores email filtering rules
export const guardRules = pgTable(
	"guard_rules",
	{
		id: varchar("id", { length: 255 }).primaryKey(),
		userId: varchar("user_id", { length: 255 }).notNull(),
		name: varchar("name", { length: 255 }).notNull(),
		description: text("description"),
		type: varchar("type", { length: 50 }).notNull(), // 'explicit' | 'ai_prompt'
		config: text("config").notNull(), // JSON configuration
		isActive: boolean("is_active").default(true),
		priority: integer("priority").default(0), // Higher priority rules evaluated first
		lastTriggeredAt: timestamp("last_triggered_at"),
		triggerCount: integer("trigger_count").default(0),
		actions: text("actions"), // JSON: block/flag/label actions
		createdAt: timestamp("created_at").defaultNow(),
		updatedAt: timestamp("updated_at").defaultNow(),
	},
	(table) => ({
		userIdIdx: index("guard_rules_user_id_idx").on(table.userId),
		priorityIdx: index("guard_rules_priority_idx").on(table.priority),
	}),
);

// Campaign links - per-recipient tokenized redirect links for email campaigns
export const campaignLinks = pgTable(
	"campaign_links",
	{
		token: varchar("token", { length: 64 }).primaryKey(),
		campaign: varchar("campaign", { length: 255 }).notNull(),
		customerId: varchar("customer_id", { length: 255 }).notNull(), // Autumn customer id (= user id)
		email: varchar("email", { length: 255 }).notNull(),
		variant: varchar("variant", { length: 50 }).notNull(), // e.g. 'custom-domain' | 'generic'
		homeClicks: integer("home_clicks").default(0).notNull(),
		checkoutClicks: integer("checkout_clicks").default(0).notNull(),
		firstClickedAt: timestamp("first_clicked_at"),
		lastClickedAt: timestamp("last_clicked_at"),
		sentAt: timestamp("sent_at"),
		createdAt: timestamp("created_at").defaultNow(),
	},
	(table) => ({
		campaignIdx: index("campaign_links_campaign_idx").on(table.campaign),
		customerIdIdx: index("campaign_links_customer_id_idx").on(table.customerId),
	}),
);

export type CampaignLink = typeof campaignLinks.$inferSelect;
export type NewCampaignLink = typeof campaignLinks.$inferInsert;

// Type definitions
export type DomainStatus = (typeof DOMAIN_STATUS)[keyof typeof DOMAIN_STATUS];
export type SesVerificationStatus =
	(typeof SES_VERIFICATION_STATUS)[keyof typeof SES_VERIFICATION_STATUS];
export type ProviderConfidence =
	(typeof PROVIDER_CONFIDENCE)[keyof typeof PROVIDER_CONFIDENCE];
export type EmailStatus = (typeof EMAIL_STATUS)[keyof typeof EMAIL_STATUS];
export type WebhookStatus =
	(typeof WEBHOOK_STATUS)[keyof typeof WEBHOOK_STATUS];
// Type exports
export type SESTenantsSchema = typeof sesTenants.$inferSelect;
export type NewSESTenant = typeof sesTenants.$inferInsert;
export type RateLimitOverride = typeof rateLimitOverrides.$inferSelect;
export type NewRateLimitOverride = typeof rateLimitOverrides.$inferInsert;

export type EndpointType = (typeof ENDPOINT_TYPES)[keyof typeof ENDPOINT_TYPES];
export type WebhookFormat =
	(typeof WEBHOOK_FORMATS)[keyof typeof WEBHOOK_FORMATS];
export type DeliveryType = (typeof DELIVERY_TYPES)[keyof typeof DELIVERY_TYPES];
export type DeliveryStatus =
	(typeof DELIVERY_STATUS)[keyof typeof DELIVERY_STATUS];
export type SentEmailStatus =
	(typeof SENT_EMAIL_STATUS)[keyof typeof SENT_EMAIL_STATUS];

// Guard Rules types
export type GuardRule = typeof guardRules.$inferSelect;
export type NewGuardRule = typeof guardRules.$inferInsert;

// Email Delivery Events types
export type EmailDeliveryEvent = typeof emailDeliveryEvents.$inferSelect;
export type NewEmailDeliveryEvent = typeof emailDeliveryEvents.$inferInsert;
export type EmailDeliveryEventType =
	(typeof EMAIL_DELIVERY_EVENT_TYPES)[keyof typeof EMAIL_DELIVERY_EVENT_TYPES];
export type BounceType = (typeof BOUNCE_TYPES)[keyof typeof BOUNCE_TYPES];
export type BounceSubType =
	(typeof BOUNCE_SUB_TYPES)[keyof typeof BOUNCE_SUB_TYPES];
export type DeliveryEventAction =
	(typeof DELIVERY_EVENT_ACTIONS)[keyof typeof DELIVERY_EVENT_ACTIONS];

// IMAP gateway tables
export const imapCredentials = pgTable(
	"imap_credentials",
	{
		id: varchar("id", { length: 255 }).primaryKey(),
		userId: varchar("user_id", { length: 255 })
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		apiKeyId: text("api_key_id")
			.notNull()
			.unique()
			.references(() => apikey.id, { onDelete: "cascade" }),
		name: varchar("name", { length: 255 }).notNull(),
		loginAddress: varchar("login_address", { length: 255 }).notNull(),
		type: varchar("type", { length: 20 }).notNull().default("mailbox"),
		accessMode: varchar("access_mode", { length: 20 }).notNull(),
		sendingMode: varchar("sending_mode", { length: 20 })
			.notNull()
			.default("scoped_domains"),
		sendingName: varchar("sending_name", { length: 255 }),
		sendingAddress: varchar("sending_address", { length: 255 }),
		enabled: boolean("enabled").notNull().default(true),
		lastUsedAt: timestamp("last_used_at"),
		createdAt: timestamp("created_at").notNull().defaultNow(),
		updatedAt: timestamp("updated_at").notNull().defaultNow(),
	},
	(table) => ({
		uniqueUserLoginAddress: unique(
			"imap_credentials_user_login_address_unique",
		).on(table.userId, table.loginAddress),
		userIdIdx: index("imap_credentials_user_id_idx").on(table.userId),
	}),
);

export const imapCredentialScopes = pgTable(
	"imap_credential_scopes",
	{
		id: varchar("id", { length: 255 }).primaryKey(),
		credentialId: varchar("credential_id", { length: 255 })
			.notNull()
			.references(() => imapCredentials.id, { onDelete: "cascade" }),
		type: varchar("type", { length: 20 }).notNull(),
		domainId: varchar("domain_id", { length: 255 })
			.notNull()
			.references(() => emailDomains.id, { onDelete: "cascade" }),
		address: varchar("address", { length: 255 }),
		scopeKey: varchar("scope_key", { length: 512 }).notNull(),
		createdAt: timestamp("created_at").notNull().defaultNow(),
	},
	(table) => ({
		uniqueCredentialScope: unique(
			"imap_credential_scopes_credential_scope_key_unique",
		).on(table.credentialId, table.scopeKey),
		credentialIdIdx: index("imap_credential_scopes_credential_id_idx").on(
			table.credentialId,
		),
		domainIdIdx: index("imap_credential_scopes_domain_id_idx").on(
			table.domainId,
		),
	}),
);

export const imapMailboxes = pgTable(
	"imap_mailboxes",
	{
		id: varchar("id", { length: 255 }).primaryKey(),
		userId: varchar("user_id", { length: 255 })
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		credentialId: varchar("credential_id", { length: 255 }).references(
			() => imapCredentials.id,
			{ onDelete: "cascade" },
		),
		scopeId: varchar("scope_id", { length: 255 }).references(
			() => imapCredentialScopes.id,
			{ onDelete: "cascade" },
		),
		address: varchar("address", { length: 255 }).notNull(),
		path: varchar("path", { length: 255 }).notNull().default("INBOX"),
		uidValidity: integer("uid_validity").notNull(),
		uidNext: integer("uid_next").notNull().default(1),
		modseq: integer("modseq").notNull().default(0),
		subscribed: boolean("subscribed").notNull().default(true),
		createdAt: timestamp("created_at").defaultNow(),
		updatedAt: timestamp("updated_at").defaultNow(),
	},
	(table) => ({
		uniqueUserAddressPath: unique("imap_mailboxes_user_address_path_unique").on(
			table.userId,
			table.address,
			table.path,
		),
		uniqueCredentialPath: unique("imap_mailboxes_credential_path_unique").on(
			table.credentialId,
			table.path,
		),
		userIdIdx: index("imap_mailboxes_user_id_idx").on(table.userId),
		credentialIdIdx: index("imap_mailboxes_credential_id_idx").on(
			table.credentialId,
		),
	}),
);

export const imapMailboxMessages = pgTable(
	"imap_mailbox_messages",
	{
		id: varchar("id", { length: 255 }).primaryKey(),
		mailboxId: varchar("mailbox_id", { length: 255 })
			.notNull()
			.references(() => imapMailboxes.id, { onDelete: "cascade" }),
		structuredEmailId: varchar("structured_email_id", {
			length: 255,
		}).notNull(),
		uid: integer("uid").notNull(),
		rawSource: varchar("raw_source", { length: 20 })
			.notNull()
			.default("structured"),
		flags: text("flags").notNull().default("[]"),
		internalDate: timestamp("internal_date").notNull(),
		size: integer("size"),
		modseq: integer("modseq").notNull().default(0),
		createdAt: timestamp("created_at").defaultNow(),
	},
	(table) => ({
		uniqueMailboxUid: unique("imap_mailbox_messages_mailbox_uid_unique").on(
			table.mailboxId,
			table.uid,
		),
		uniqueMailboxEmail: unique("imap_mailbox_messages_mailbox_email_unique").on(
			table.mailboxId,
			table.structuredEmailId,
		),
		mailboxUidIdx: index("imap_mailbox_messages_mailbox_uid_idx").on(
			table.mailboxId,
			table.uid,
		),
		appendedReferenceIdx: index(
			"imap_mailbox_messages_appended_reference_idx",
		).on(table.rawSource, table.structuredEmailId),
	}),
);

export type ImapMailbox = typeof imapMailboxes.$inferSelect;
export type NewImapMailbox = typeof imapMailboxes.$inferInsert;
export type ImapCredential = typeof imapCredentials.$inferSelect;
export type NewImapCredential = typeof imapCredentials.$inferInsert;
export type ImapCredentialScope = typeof imapCredentialScopes.$inferSelect;
export type NewImapCredentialScope = typeof imapCredentialScopes.$inferInsert;
export type ImapMailboxMessage = typeof imapMailboxMessages.$inferSelect;
export type NewImapMailboxMessage = typeof imapMailboxMessages.$inferInsert;

export const imapAppendedMessages = pgTable(
	"imap_appended_messages",
	{
		id: varchar("id", { length: 255 }).primaryKey(),
		userId: varchar("user_id", { length: 255 })
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		rawContent: text("raw_content").notNull(),
		size: integer("size"),
		createdAt: timestamp("created_at").defaultNow(),
	},
	(table) => ({
		userIdIdx: index("imap_appended_messages_user_id_idx").on(table.userId),
	}),
);

export type ImapAppendedMessage = typeof imapAppendedMessages.$inferSelect;
