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
	"name" text,
	"start" text,
	"prefix" text,
	"key" text NOT NULL,
	"user_id" text NOT NULL,
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
CREATE TABLE "dub_integrations" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"access_token" text NOT NULL,
	"refresh_token" text NOT NULL,
	"token_type" varchar(50) DEFAULT 'Bearer' NOT NULL,
	"expires_at" timestamp NOT NULL,
	"scope" varchar(500) NOT NULL,
	"status" varchar(50) DEFAULT 'active' NOT NULL,
	"dub_workspace_id" varchar(255),
	"dub_workspace_name" varchar(255),
	"default_dub_domain_id" varchar(255),
	"default_dub_domain_slug" varchar(255),
	"default_dub_folder_id" varchar(255),
	"default_dub_folder_name" varchar(255),
	"enable_dub_links_for_emails" boolean DEFAULT false,
	"last_used" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "dub_integrations_user_id_unique" UNIQUE("user_id")
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
	"is_vip_enabled" boolean DEFAULT false,
	"vip_config_id" varchar(255),
	"tenant_id" varchar(255),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"user_id" varchar(255) NOT NULL,
	CONSTRAINT "email_addresses_address_unique" UNIQUE("address")
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
	"updated_at" timestamp DEFAULT now()
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
	"provider" varchar(50) DEFAULT 'ses',
	"provider_response" text,
	"sent_at" timestamp,
	"failure_reason" text,
	"idempotency_key" varchar(256),
	"user_id" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
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
CREATE TABLE "ses_tenants" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"aws_tenant_id" varchar(255) NOT NULL,
	"tenant_name" varchar(255) NOT NULL,
	"status" varchar(50) DEFAULT 'active' NOT NULL,
	"reputation_policy" varchar(20) DEFAULT 'standard' NOT NULL,
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
CREATE TABLE "structured_emails" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"email_id" varchar(255) NOT NULL,
	"ses_event_id" varchar(255) NOT NULL,
	"message_id" varchar(255),
	"date" timestamp,
	"subject" text,
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
	"user_id" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
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
CREATE TABLE "vip_allowed_senders" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"vip_config_id" varchar(255) NOT NULL,
	"sender_email" varchar(255) NOT NULL,
	"allowed_at" timestamp DEFAULT now(),
	"allowed_until" timestamp,
	"payment_session_id" varchar(255),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "vip_configs" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"email_address_id" varchar(255) NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"price_in_cents" integer DEFAULT 100 NOT NULL,
	"allow_after_payment" boolean DEFAULT false,
	"custom_message" text,
	"payment_link_expiration_hours" integer DEFAULT 24,
	"destination_email" varchar(255),
	"endpoint_id" varchar(255),
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "vip_configs_email_address_id_unique" UNIQUE("email_address_id")
);
--> statement-breakpoint
CREATE TABLE "vip_email_attempts" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"vip_config_id" varchar(255) NOT NULL,
	"sender_email" varchar(255) NOT NULL,
	"recipient_email" varchar(255) NOT NULL,
	"original_email_id" varchar(255) NOT NULL,
	"email_subject" text,
	"status" varchar(50) DEFAULT 'payment_required' NOT NULL,
	"payment_session_id" varchar(255),
	"allowed_reason" varchar(100),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "vip_payment_sessions" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"vip_config_id" varchar(255) NOT NULL,
	"sender_email" varchar(255) NOT NULL,
	"original_email_id" varchar(255) NOT NULL,
	"stripe_payment_link_id" varchar(255),
	"stripe_payment_link_url" text,
	"stripe_session_id" varchar(255),
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"paid_at" timestamp,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
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
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;