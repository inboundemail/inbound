CREATE TABLE "vip_allowed_senders" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"vip_config_id" varchar(255) NOT NULL,
	"sender_email" varchar(255) NOT NULL,
	"payment_session_id" varchar(255) NOT NULL,
	"allowed_at" timestamp DEFAULT now(),
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "vip_configs" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"email_address_id" varchar(255) NOT NULL,
	"price" integer DEFAULT 100 NOT NULL,
	"currency" varchar(3) DEFAULT 'usd' NOT NULL,
	"allow_future_emails" boolean DEFAULT false,
	"custom_message" text,
	"link_expiration_hours" integer DEFAULT 72,
	"is_active" boolean DEFAULT true,
	"total_payments_received" integer DEFAULT 0,
	"total_revenue" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"user_id" varchar(255) NOT NULL,
	CONSTRAINT "vip_configs_email_address_id_unique" UNIQUE("email_address_id")
);
--> statement-breakpoint
CREATE TABLE "vip_payment_sessions" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"vip_config_id" varchar(255) NOT NULL,
	"email_id" varchar(255) NOT NULL,
	"sender_email" varchar(255) NOT NULL,
	"recipient_email" varchar(255) NOT NULL,
	"stripe_session_id" varchar(255) NOT NULL,
	"stripe_payment_link_url" text NOT NULL,
	"amount" integer NOT NULL,
	"currency" varchar(3) NOT NULL,
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"payment_completed_at" timestamp,
	"expires_at" timestamp NOT NULL,
	"metadata" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "vip_payment_sessions_stripe_session_id_unique" UNIQUE("stripe_session_id")
);
--> statement-breakpoint
ALTER TABLE "email_addresses" ADD COLUMN "destination_type" varchar(50);--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "stripe_restricted_key" text;