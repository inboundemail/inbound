CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "apikey" (
	"id" text PRIMARY KEY NOT NULL,
	"config_id" text DEFAULT 'default' NOT NULL,
	"name" text,
	"start" text,
	"reference_id" text NOT NULL,
	"prefix" text,
	"key" text NOT NULL,
	"user_id" text,
	"refill_interval" integer,
	"refill_amount" integer,
	"last_refill_at" timestamp,
	"enabled" boolean DEFAULT true,
	"rate_limit_enabled" boolean DEFAULT true,
	"rate_limit_time_window" integer DEFAULT 86400000,
	"rate_limit_max" integer DEFAULT 10,
	"request_count" integer,
	"remaining" integer,
	"last_request" timestamp,
	"expires_at" timestamp,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	"permissions" text,
	"metadata" text
);
--> statement-breakpoint
CREATE TABLE "blocked_emails" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"email_address" varchar(255) NOT NULL,
	"domain_id" varchar(255) NOT NULL,
	"reason" text,
	"blocked_by" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "blocked_emails_email_address_unique" UNIQUE("email_address")
);
--> statement-breakpoint
CREATE TABLE "blocked_signup_domains" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"domain" varchar(255) NOT NULL,
	"reason" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"blocked_by" varchar(255),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "blocked_signup_domains_domain_unique" UNIQUE("domain")
);
--> statement-breakpoint
CREATE TABLE "campaign_links" (
	"token" varchar(64) PRIMARY KEY NOT NULL,
	"campaign" varchar(255) NOT NULL,
	"customer_id" varchar(255) NOT NULL,
	"email" varchar(255) NOT NULL,
	"variant" varchar(50) NOT NULL,
	"home_clicks" integer DEFAULT 0 NOT NULL,
	"checkout_clicks" integer DEFAULT 0 NOT NULL,
	"first_clicked_at" timestamp,
	"last_clicked_at" timestamp,
	"sent_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "device_code" (
	"id" text PRIMARY KEY NOT NULL,
	"device_code" text NOT NULL,
	"user_code" text NOT NULL,
	"user_id" text,
	"expires_at" timestamp NOT NULL,
	"status" text NOT NULL,
	"last_polled_at" timestamp,
	"polling_interval" integer,
	"client_id" text,
	"scope" text
);
--> statement-breakpoint
CREATE TABLE "domain_dns_records" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"domain_id" varchar(255) NOT NULL,
	"record_type" varchar(10) NOT NULL,
	"name" varchar(255) NOT NULL,
	"value" text NOT NULL,
	"is_required" boolean DEFAULT true,
	"is_verified" boolean DEFAULT false,
	"last_checked" timestamp,
	"created_at" timestamp DEFAULT now(),
	"priority" integer,
	"description" text
);
--> statement-breakpoint
CREATE TABLE "email_addresses" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"address" varchar(255) NOT NULL,
	"domain_id" varchar(255) NOT NULL,
	"webhook_id" varchar(255),
	"endpoint_id" varchar(255),
	"is_active" boolean DEFAULT true,
	"is_receipt_rule_configured" boolean DEFAULT false,
	"receipt_rule_name" varchar(255),
	"tenant_id" varchar(255),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"user_id" varchar(255) NOT NULL,
	CONSTRAINT "email_addresses_address_unique" UNIQUE("address")
);
--> statement-breakpoint
CREATE TABLE "email_delivery_events" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"event_type" varchar(50) NOT NULL,
	"bounce_type" varchar(50),
	"bounce_sub_type" varchar(100),
	"status_code" varchar(20),
	"status_class" varchar(10),
	"status_category" varchar(10),
	"diagnostic_code" text,
	"failed_recipient" varchar(255) NOT NULL,
	"failed_recipient_domain" varchar(255),
	"original_message_id" varchar(500),
	"original_sent_email_id" varchar(255),
	"original_from" varchar(500),
	"original_to" text,
	"original_subject" text,
	"original_sent_at" timestamp,
	"dsn_email_id" varchar(255),
	"dsn_received_at" timestamp,
	"reporting_mta" varchar(255),
	"remote_mta" varchar(255),
	"user_id" varchar(255),
	"domain_id" varchar(255),
	"domain_name" varchar(255),
	"tenant_id" varchar(255),
	"tenant_name" varchar(255),
	"action_taken" varchar(50),
	"action_taken_at" timestamp,
	"added_to_blocklist" boolean DEFAULT false,
	"blocklist_id" varchar(255),
	"raw_dsn_content" text,
	"metadata" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "email_domains" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"domain" varchar(255) NOT NULL,
	"status" varchar(50) NOT NULL,
	"verification_token" varchar(255),
	"can_receive_emails" boolean DEFAULT false,
	"has_mx_records" boolean DEFAULT false,
	"domain_provider" varchar(100),
	"provider_confidence" varchar(20),
	"last_dns_check" timestamp,
	"last_ses_check" timestamp,
	"mail_from_domain" varchar(255),
	"mail_from_domain_status" varchar(50),
	"mail_from_domain_verified_at" timestamp,
	"is_catch_all_enabled" boolean DEFAULT false,
	"catch_all_webhook_id" varchar(255),
	"catch_all_endpoint_id" varchar(255),
	"catch_all_receipt_rule_name" varchar(255),
	"receive_dmarc_emails" boolean DEFAULT false,
	"tenant_id" varchar(255),
	"kind" varchar(20) DEFAULT 'custom' NOT NULL,
	"include_subdomains" boolean DEFAULT false NOT NULL,
	"subdomain_receipt_rule_name" varchar(255),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"user_id" varchar(255) NOT NULL,
	CONSTRAINT "email_domains_domain_unique" UNIQUE("domain")
);
--> statement-breakpoint
CREATE TABLE "email_groups" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"endpoint_id" varchar(255) NOT NULL,
	"email_address" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "email_sending_evaluations" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"email_id" varchar(255) NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"evaluation_result" text,
	"risk_score" integer,
	"flags" text,
	"ai_model" varchar(255),
	"evaluation_time" integer,
	"prompt_tokens" integer,
	"completion_tokens" integer,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "email_threads" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"root_message_id" varchar(255) NOT NULL,
	"normalized_subject" text,
	"participant_emails" text,
	"message_count" integer DEFAULT 1,
	"last_message_at" timestamp NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "endpoint_deliveries" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"email_id" varchar(255),
	"endpoint_id" varchar(255) NOT NULL,
	"delivery_type" varchar(50) NOT NULL,
	"status" varchar(50) NOT NULL,
	"attempts" integer DEFAULT 0,
	"last_attempt_at" timestamp,
	"response_data" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "endpoint_deliveries_email_endpoint_unique" UNIQUE("email_id","endpoint_id")
);
--> statement-breakpoint
CREATE TABLE "endpoints" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"type" varchar(50) NOT NULL,
	"webhook_format" varchar(50) DEFAULT 'inbound',
	"config" text NOT NULL,
	"is_active" boolean DEFAULT true,
	"description" text,
	"user_id" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "guard_rules" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"type" varchar(50) NOT NULL,
	"config" text NOT NULL,
	"is_active" boolean DEFAULT true,
	"priority" integer DEFAULT 0,
	"last_triggered_at" timestamp,
	"trigger_count" integer DEFAULT 0,
	"actions" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "imap_appended_messages" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"raw_content" text NOT NULL,
	"size" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "imap_credential_scopes" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"credential_id" varchar(255) NOT NULL,
	"type" varchar(20) NOT NULL,
	"domain_id" varchar(255) NOT NULL,
	"address" varchar(255),
	"scope_key" varchar(512) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "imap_credential_scopes_credential_scope_key_unique" UNIQUE("credential_id","scope_key")
);
--> statement-breakpoint
CREATE TABLE "imap_credentials" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"api_key_id" text NOT NULL,
	"name" varchar(255) NOT NULL,
	"login_address" varchar(255) NOT NULL,
	"type" varchar(20) DEFAULT 'mailbox' NOT NULL,
	"access_mode" varchar(20) NOT NULL,
	"sending_mode" varchar(20) DEFAULT 'scoped_domains' NOT NULL,
	"sending_name" varchar(255),
	"sending_address" varchar(255),
	"enabled" boolean DEFAULT true NOT NULL,
	"last_used_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "imap_credentials_api_key_id_unique" UNIQUE("api_key_id"),
	CONSTRAINT "imap_credentials_user_login_address_unique" UNIQUE("user_id","login_address")
);
--> statement-breakpoint
CREATE TABLE "imap_mailbox_messages" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"mailbox_id" varchar(255) NOT NULL,
	"structured_email_id" varchar(255) NOT NULL,
	"uid" integer NOT NULL,
	"raw_source" varchar(20) DEFAULT 'structured' NOT NULL,
	"flags" text DEFAULT '[]' NOT NULL,
	"internal_date" timestamp NOT NULL,
	"size" integer,
	"modseq" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "imap_mailbox_messages_mailbox_uid_unique" UNIQUE("mailbox_id","uid"),
	CONSTRAINT "imap_mailbox_messages_mailbox_email_unique" UNIQUE("mailbox_id","structured_email_id")
);
--> statement-breakpoint
CREATE TABLE "imap_mailbox_removals" (
	"credential_id" varchar(255) NOT NULL,
	"structured_email_id" varchar(255) NOT NULL,
	"removed_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "imap_mailbox_removals_credential_id_structured_email_id_pk" PRIMARY KEY("credential_id","structured_email_id")
);
--> statement-breakpoint
CREATE TABLE "imap_mailboxes" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"credential_id" varchar(255),
	"scope_id" varchar(255),
	"address" varchar(255) NOT NULL,
	"path" varchar(255) DEFAULT 'INBOX' NOT NULL,
	"uid_validity" integer NOT NULL,
	"uid_next" integer DEFAULT 1 NOT NULL,
	"modseq" integer DEFAULT 0 NOT NULL,
	"subscribed" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "imap_mailboxes_user_address_path_unique" UNIQUE("user_id","address","path"),
	CONSTRAINT "imap_mailboxes_credential_path_unique" UNIQUE("credential_id","path")
);
--> statement-breakpoint
CREATE TABLE "inbound_oauth_grants" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"session_id" text,
	"client_id" text NOT NULL,
	"mode" varchar(20) NOT NULL,
	"domain_ids" text[] NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"revoked_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "jwks" (
	"id" text PRIMARY KEY NOT NULL,
	"public_key" text NOT NULL,
	"private_key" text NOT NULL,
	"created_at" timestamp NOT NULL,
	"expires_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "oauth_access_token" (
	"id" text PRIMARY KEY NOT NULL,
	"token" text NOT NULL,
	"client_id" text NOT NULL,
	"session_id" text,
	"user_id" text,
	"reference_id" text,
	"refresh_id" text,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp NOT NULL,
	"scopes" text[] NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauth_client" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"client_secret" text,
	"disabled" boolean DEFAULT false,
	"skip_consent" boolean,
	"enable_end_session" boolean,
	"subject_type" text,
	"scopes" text[],
	"user_id" text,
	"created_at" timestamp,
	"updated_at" timestamp,
	"name" text,
	"uri" text,
	"icon" text,
	"contacts" text[],
	"tos" text,
	"policy" text,
	"software_id" text,
	"software_version" text,
	"software_statement" text,
	"redirect_uris" text[] NOT NULL,
	"post_logout_redirect_uris" text[],
	"token_endpoint_auth_method" text,
	"grant_types" text[],
	"response_types" text[],
	"public" boolean,
	"type" text,
	"require_pkce" boolean,
	"reference_id" text,
	"metadata" jsonb,
	CONSTRAINT "oauth_client_client_id_unique" UNIQUE("client_id")
);
--> statement-breakpoint
CREATE TABLE "oauth_consent" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"user_id" text,
	"reference_id" text,
	"scopes" text[] NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauth_refresh_token" (
	"id" text PRIMARY KEY NOT NULL,
	"token" text NOT NULL,
	"client_id" text NOT NULL,
	"session_id" text,
	"user_id" text NOT NULL,
	"reference_id" text,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp NOT NULL,
	"revoked" timestamp,
	"auth_time" timestamp,
	"scopes" text[] NOT NULL
);
--> statement-breakpoint
CREATE TABLE "onboarding_demo_emails" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"email_id" varchar(255) NOT NULL,
	"message_id" varchar(255),
	"recipient_email" varchar(255) NOT NULL,
	"sent_at" timestamp DEFAULT now(),
	"reply_received" boolean DEFAULT false,
	"reply_from" varchar(255),
	"reply_subject" varchar(500),
	"reply_body" text,
	"reply_received_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "parsed_emails" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"email_id" varchar(255) NOT NULL,
	"message_id" varchar(255),
	"from_text" text,
	"from_address" varchar(255),
	"from_name" varchar(255),
	"to_text" text,
	"to_addresses" text,
	"cc_text" text,
	"cc_addresses" text,
	"bcc_text" text,
	"bcc_addresses" text,
	"reply_to_text" text,
	"reply_to_addresses" text,
	"subject" text,
	"text_body" text,
	"html_body" text,
	"in_reply_to" varchar(255),
	"references" text,
	"priority" varchar(50),
	"email_date" timestamp,
	"attachments" text,
	"attachment_count" integer DEFAULT 0,
	"has_attachments" boolean DEFAULT false,
	"headers" text,
	"has_text_body" boolean DEFAULT false,
	"has_html_body" boolean DEFAULT false,
	"parse_success" boolean DEFAULT true,
	"parse_error" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "passkey" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"public_key" text NOT NULL,
	"user_id" text NOT NULL,
	"credential_id" text NOT NULL,
	"counter" integer NOT NULL,
	"device_type" text NOT NULL,
	"backed_up" boolean NOT NULL,
	"transports" text,
	"created_at" timestamp,
	"aaguid" text
);
--> statement-breakpoint
CREATE TABLE "rate_limit_overrides" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"hourly_limit" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"reason" text,
	"created_by" varchar(255),
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "rate_limit_overrides_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "received_emails" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"ses_event_id" varchar(255) NOT NULL,
	"message_id" varchar(255) NOT NULL,
	"from" varchar(255) NOT NULL,
	"to" text NOT NULL,
	"recipient" varchar(255) NOT NULL,
	"subject" text,
	"from_parsed" text,
	"to_parsed" text,
	"cc_parsed" text,
	"bcc_parsed" text,
	"reply_to_parsed" text,
	"text_body" text,
	"html_body" text,
	"raw_email_content" text,
	"in_reply_to" varchar(255),
	"references" text,
	"priority" varchar(50),
	"attachments" text,
	"headers" text,
	"email_date" timestamp,
	"received_at" timestamp NOT NULL,
	"processed_at" timestamp,
	"status" varchar(50) NOT NULL,
	"is_read" boolean DEFAULT false,
	"read_at" timestamp,
	"metadata" text,
	"user_id" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "scheduled_emails" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"scheduled_at" timestamp NOT NULL,
	"timezone" varchar(50) DEFAULT 'UTC',
	"status" varchar(50) DEFAULT 'scheduled' NOT NULL,
	"from_address" varchar(500) NOT NULL,
	"from_domain" varchar(255) NOT NULL,
	"to_addresses" text NOT NULL,
	"cc_addresses" text,
	"bcc_addresses" text,
	"reply_to_addresses" text,
	"subject" text NOT NULL,
	"text_body" text,
	"html_body" text,
	"headers" text,
	"attachments" text,
	"tags" text,
	"attempts" integer DEFAULT 0,
	"max_attempts" integer DEFAULT 3,
	"next_retry_at" timestamp,
	"last_error" text,
	"idempotency_key" varchar(256),
	"qstash_schedule_id" varchar(255),
	"qstash_dlq_id" varchar(255),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"sent_at" timestamp,
	"sent_email_id" varchar(255)
);
--> statement-breakpoint
CREATE TABLE "sent_emails" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"from" varchar(500) NOT NULL,
	"from_address" varchar(255) NOT NULL,
	"from_domain" varchar(255) NOT NULL,
	"to" text NOT NULL,
	"cc" text,
	"bcc" text,
	"reply_to" text,
	"subject" text NOT NULL,
	"text_body" text,
	"html_body" text,
	"headers" text,
	"attachments" text,
	"tags" text,
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"message_id" varchar(255),
	"ses_message_id" varchar(300),
	"provider" varchar(50) DEFAULT 'ses',
	"provider_response" text,
	"sent_at" timestamp,
	"failure_reason" text,
	"first_opened_at" timestamp,
	"last_opened_at" timestamp,
	"idempotency_key" varchar(256),
	"thread_id" varchar(255),
	"thread_position" integer,
	"batch_id" varchar(255),
	"batch_index" integer,
	"user_id" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "sent_emails_user_idempotency_key_unique" UNIQUE("user_id","idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "ses_events" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"event_source" varchar(100) NOT NULL,
	"event_version" varchar(50) NOT NULL,
	"message_id" varchar(255) NOT NULL,
	"source" varchar(255) NOT NULL,
	"destination" text NOT NULL,
	"subject" text,
	"timestamp" timestamp NOT NULL,
	"receipt_timestamp" timestamp NOT NULL,
	"processing_time_millis" integer,
	"recipients" text NOT NULL,
	"spam_verdict" varchar(50),
	"virus_verdict" varchar(50),
	"spf_verdict" varchar(50),
	"dkim_verdict" varchar(50),
	"dmarc_verdict" varchar(50),
	"action_type" varchar(50),
	"s3_bucket_name" varchar(255),
	"s3_object_key" varchar(500),
	"email_content" text,
	"s3_content_fetched" boolean DEFAULT false,
	"s3_content_size" integer,
	"s3_error" text,
	"common_headers" text,
	"raw_ses_event" text NOT NULL,
	"lambda_context" text,
	"webhook_payload" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ses_receipt_rules" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"rule_name" varchar(255) NOT NULL,
	"rule_set_name" varchar(255) NOT NULL,
	"domain_count" integer DEFAULT 0 NOT NULL,
	"max_capacity" integer DEFAULT 500 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "ses_receipt_rules_rule_name_unique" UNIQUE("rule_name")
);
--> statement-breakpoint
CREATE TABLE "ses_tenants" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"aws_tenant_id" varchar(255) NOT NULL,
	"tenant_name" varchar(255) NOT NULL,
	"configuration_set_name" varchar(255),
	"status" varchar(50) DEFAULT 'active' NOT NULL,
	"reputation_policy" varchar(20) DEFAULT 'strict' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "ses_tenants_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "ses_tenants_aws_tenant_id_unique" UNIQUE("aws_tenant_id")
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"impersonated_by" text,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "structured_email_aliases" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"canonical_id" varchar(255) NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"recipient" varchar(255),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "structured_emails" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"email_id" varchar(255) NOT NULL,
	"ses_event_id" varchar(255) NOT NULL,
	"message_id" varchar(255),
	"date" timestamp,
	"subject" text,
	"recipient" varchar(255),
	"envelope_recipients" text[],
	"from_data" text,
	"to_data" text,
	"cc_data" text,
	"bcc_data" text,
	"reply_to_data" text,
	"in_reply_to" varchar(255),
	"references" text,
	"text_body" text,
	"html_body" text,
	"raw_content" text,
	"attachments" text,
	"headers" text,
	"priority" varchar(50),
	"parse_success" boolean DEFAULT true,
	"parse_error" text,
	"is_read" boolean DEFAULT false,
	"read_at" timestamp,
	"is_archived" boolean DEFAULT false,
	"archived_at" timestamp,
	"guard_blocked" boolean DEFAULT false,
	"guard_reason" text,
	"guard_rule_id" varchar(255),
	"guard_action" varchar(50),
	"guard_metadata" text,
	"user_id" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"thread_id" varchar(255),
	"thread_position" integer,
	CONSTRAINT "structured_emails_user_message_recipient_unique" UNIQUE("user_id","message_id","recipient")
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"plan" varchar(255) NOT NULL,
	"reference_id" varchar(255) NOT NULL,
	"stripe_customer_id" varchar(255),
	"stripe_subscription_id" varchar(255),
	"status" varchar(255) NOT NULL,
	"period_start" timestamp,
	"period_end" timestamp,
	"cancel_at_period_end" boolean DEFAULT false,
	"seats" integer,
	"trial_start" timestamp,
	"trial_end" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean NOT NULL,
	"image" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	"role" text,
	"banned" boolean,
	"ban_reason" text,
	"ban_expires" timestamp,
	"stripe_customer_id" text,
	"webhooks_to_endpoints_migrated" boolean DEFAULT false,
	"feature_flags" text,
	"svix_app_id" text,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "user_accounts" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"stripe_restricted_key" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "user_onboarding" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"is_completed" boolean DEFAULT false NOT NULL,
	"default_endpoint_created" boolean DEFAULT false NOT NULL,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "user_onboarding_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp,
	"updated_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "webhook_deliveries" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"email_id" varchar(255),
	"webhook_id" varchar(255) NOT NULL,
	"endpoint" varchar(500) NOT NULL,
	"payload" text,
	"status" varchar(50) NOT NULL,
	"attempts" integer DEFAULT 0,
	"last_attempt_at" timestamp,
	"response_code" integer,
	"response_body" text,
	"error" text,
	"delivery_time" integer,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "webhooks" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"url" text NOT NULL,
	"secret" varchar(255),
	"is_active" boolean DEFAULT true,
	"description" text,
	"headers" text,
	"timeout" integer DEFAULT 30,
	"retry_attempts" integer DEFAULT 3,
	"last_used" timestamp,
	"total_deliveries" integer DEFAULT 0,
	"successful_deliveries" integer DEFAULT 0,
	"failed_deliveries" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"user_id" varchar(255) NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "apikey" ADD CONSTRAINT "apikey_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_code" ADD CONSTRAINT "device_code_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imap_appended_messages" ADD CONSTRAINT "imap_appended_messages_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imap_credential_scopes" ADD CONSTRAINT "imap_credential_scopes_credential_id_imap_credentials_id_fk" FOREIGN KEY ("credential_id") REFERENCES "public"."imap_credentials"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imap_credential_scopes" ADD CONSTRAINT "imap_credential_scopes_domain_id_email_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."email_domains"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imap_credentials" ADD CONSTRAINT "imap_credentials_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imap_credentials" ADD CONSTRAINT "imap_credentials_api_key_id_apikey_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."apikey"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imap_mailbox_messages" ADD CONSTRAINT "imap_mailbox_messages_mailbox_id_imap_mailboxes_id_fk" FOREIGN KEY ("mailbox_id") REFERENCES "public"."imap_mailboxes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imap_mailbox_removals" ADD CONSTRAINT "imap_mailbox_removals_credential_id_imap_credentials_id_fk" FOREIGN KEY ("credential_id") REFERENCES "public"."imap_credentials"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imap_mailboxes" ADD CONSTRAINT "imap_mailboxes_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imap_mailboxes" ADD CONSTRAINT "imap_mailboxes_credential_id_imap_credentials_id_fk" FOREIGN KEY ("credential_id") REFERENCES "public"."imap_credentials"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imap_mailboxes" ADD CONSTRAINT "imap_mailboxes_scope_id_imap_credential_scopes_id_fk" FOREIGN KEY ("scope_id") REFERENCES "public"."imap_credential_scopes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbound_oauth_grants" ADD CONSTRAINT "inbound_oauth_grants_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbound_oauth_grants" ADD CONSTRAINT "inbound_oauth_grants_session_id_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."session"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbound_oauth_grants" ADD CONSTRAINT "inbound_oauth_grants_client_id_oauth_client_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."oauth_client"("client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_access_token" ADD CONSTRAINT "oauth_access_token_client_id_oauth_client_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."oauth_client"("client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_access_token" ADD CONSTRAINT "oauth_access_token_session_id_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."session"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_access_token" ADD CONSTRAINT "oauth_access_token_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_access_token" ADD CONSTRAINT "oauth_access_token_refresh_id_oauth_refresh_token_id_fk" FOREIGN KEY ("refresh_id") REFERENCES "public"."oauth_refresh_token"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_client" ADD CONSTRAINT "oauth_client_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_consent" ADD CONSTRAINT "oauth_consent_client_id_oauth_client_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."oauth_client"("client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_consent" ADD CONSTRAINT "oauth_consent_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_refresh_token" ADD CONSTRAINT "oauth_refresh_token_client_id_oauth_client_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."oauth_client"("client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_refresh_token" ADD CONSTRAINT "oauth_refresh_token_session_id_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."session"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_refresh_token" ADD CONSTRAINT "oauth_refresh_token_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passkey" ADD CONSTRAINT "passkey_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "apikey_config_id_idx" ON "apikey" USING btree ("config_id");--> statement-breakpoint
CREATE INDEX "apikey_reference_id_idx" ON "apikey" USING btree ("reference_id");--> statement-breakpoint
CREATE INDEX "apikey_key_idx" ON "apikey" USING btree ("key");--> statement-breakpoint
CREATE INDEX "blocked_signup_domains_active_idx" ON "blocked_signup_domains" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "campaign_links_campaign_idx" ON "campaign_links" USING btree ("campaign");--> statement-breakpoint
CREATE INDEX "campaign_links_customer_id_idx" ON "campaign_links" USING btree ("customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "device_code_device_code_idx" ON "device_code" USING btree ("device_code");--> statement-breakpoint
CREATE UNIQUE INDEX "device_code_user_code_idx" ON "device_code" USING btree ("user_code");--> statement-breakpoint
CREATE INDEX "device_code_user_id_idx" ON "device_code" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "device_code_expires_at_idx" ON "device_code" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "email_delivery_events_event_type_idx" ON "email_delivery_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "email_delivery_events_bounce_type_idx" ON "email_delivery_events" USING btree ("bounce_type");--> statement-breakpoint
CREATE INDEX "email_delivery_events_failed_recipient_idx" ON "email_delivery_events" USING btree ("failed_recipient");--> statement-breakpoint
CREATE INDEX "email_delivery_events_failed_recipient_domain_idx" ON "email_delivery_events" USING btree ("failed_recipient_domain");--> statement-breakpoint
CREATE INDEX "email_delivery_events_user_id_idx" ON "email_delivery_events" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "email_delivery_events_domain_id_idx" ON "email_delivery_events" USING btree ("domain_id");--> statement-breakpoint
CREATE INDEX "email_delivery_events_tenant_id_idx" ON "email_delivery_events" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "email_delivery_events_status_code_idx" ON "email_delivery_events" USING btree ("status_code");--> statement-breakpoint
CREATE INDEX "email_delivery_events_created_at_idx" ON "email_delivery_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "email_delivery_events_original_message_id_idx" ON "email_delivery_events" USING btree ("original_message_id");--> statement-breakpoint
CREATE UNIQUE INDEX "email_domains_one_managed_per_user" ON "email_domains" USING btree ("user_id") WHERE "email_domains"."kind" = 'managed';--> statement-breakpoint
CREATE INDEX "email_sending_evaluations_email_id_idx" ON "email_sending_evaluations" USING btree ("email_id");--> statement-breakpoint
CREATE INDEX "email_sending_evaluations_user_id_idx" ON "email_sending_evaluations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "email_sending_evaluations_created_at_idx" ON "email_sending_evaluations" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "email_threads_root_message_id_idx" ON "email_threads" USING btree ("root_message_id");--> statement-breakpoint
CREATE INDEX "email_threads_user_id_idx" ON "email_threads" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "email_threads_last_message_at_idx" ON "email_threads" USING btree ("last_message_at");--> statement-breakpoint
CREATE INDEX "endpoint_deliveries_email_status_idx" ON "endpoint_deliveries" USING btree ("email_id","status");--> statement-breakpoint
CREATE INDEX "endpoint_deliveries_email_id_idx" ON "endpoint_deliveries" USING btree ("email_id");--> statement-breakpoint
CREATE INDEX "guard_rules_user_id_idx" ON "guard_rules" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "guard_rules_priority_idx" ON "guard_rules" USING btree ("priority");--> statement-breakpoint
CREATE INDEX "imap_appended_messages_user_id_idx" ON "imap_appended_messages" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "imap_credential_scopes_credential_id_idx" ON "imap_credential_scopes" USING btree ("credential_id");--> statement-breakpoint
CREATE INDEX "imap_credential_scopes_domain_id_idx" ON "imap_credential_scopes" USING btree ("domain_id");--> statement-breakpoint
CREATE INDEX "imap_credentials_user_id_idx" ON "imap_credentials" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "imap_mailbox_messages_mailbox_uid_idx" ON "imap_mailbox_messages" USING btree ("mailbox_id","uid");--> statement-breakpoint
CREATE INDEX "imap_mailbox_messages_appended_reference_idx" ON "imap_mailbox_messages" USING btree ("raw_source","structured_email_id");--> statement-breakpoint
CREATE INDEX "imap_mailbox_messages_mailbox_modseq_idx" ON "imap_mailbox_messages" USING btree ("mailbox_id","modseq");--> statement-breakpoint
CREATE INDEX "imap_mailboxes_user_id_idx" ON "imap_mailboxes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "imap_mailboxes_credential_id_idx" ON "imap_mailboxes" USING btree ("credential_id");--> statement-breakpoint
CREATE INDEX "inbound_oauth_grants_user_id_idx" ON "inbound_oauth_grants" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "inbound_oauth_grants_session_client_idx" ON "inbound_oauth_grants" USING btree ("session_id","client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "oauth_access_token_token_idx" ON "oauth_access_token" USING btree ("token");--> statement-breakpoint
CREATE INDEX "oauth_access_token_client_id_idx" ON "oauth_access_token" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "oauth_access_token_session_id_idx" ON "oauth_access_token" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "oauth_access_token_user_id_idx" ON "oauth_access_token" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "oauth_access_token_refresh_id_idx" ON "oauth_access_token" USING btree ("refresh_id");--> statement-breakpoint
CREATE INDEX "oauth_client_user_id_idx" ON "oauth_client" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "oauth_consent_client_id_idx" ON "oauth_consent" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "oauth_consent_user_id_idx" ON "oauth_consent" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "oauth_refresh_token_token_idx" ON "oauth_refresh_token" USING btree ("token");--> statement-breakpoint
CREATE INDEX "oauth_refresh_token_client_id_idx" ON "oauth_refresh_token" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "oauth_refresh_token_session_id_idx" ON "oauth_refresh_token" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "oauth_refresh_token_user_id_idx" ON "oauth_refresh_token" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "passkey_user_id_idx" ON "passkey" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "passkey_credential_id_idx" ON "passkey" USING btree ("credential_id");--> statement-breakpoint
CREATE INDEX "sent_emails_thread_id_idx" ON "sent_emails" USING btree ("thread_id");--> statement-breakpoint
CREATE INDEX "sent_emails_user_created_idx" ON "sent_emails" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "sent_emails_user_status_created_idx" ON "sent_emails" USING btree ("user_id","status","created_at");--> statement-breakpoint
CREATE INDEX "sent_emails_user_first_opened_idx" ON "sent_emails" USING btree ("user_id","first_opened_at");--> statement-breakpoint
CREATE INDEX "structured_email_aliases_canonical_idx" ON "structured_email_aliases" USING btree ("canonical_id");--> statement-breakpoint
CREATE UNIQUE INDEX "structured_emails_user_message_unique" ON "structured_emails" USING btree ("user_id","message_id") WHERE "structured_emails"."envelope_recipients" is not null;--> statement-breakpoint
CREATE INDEX "structured_emails_message_id_idx" ON "structured_emails" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "structured_emails_thread_id_idx" ON "structured_emails" USING btree ("thread_id");--> statement-breakpoint
CREATE INDEX "structured_emails_user_created_idx" ON "structured_emails" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "structured_emails_user_id_idx" ON "structured_emails" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "structured_emails_guard_blocked_idx" ON "structured_emails" USING btree ("guard_blocked");--> statement-breakpoint
CREATE INDEX "structured_emails_lower_recipient_idx" ON "structured_emails" USING btree (lower("recipient"),"created_at") WHERE "structured_emails"."raw_content" is not null;