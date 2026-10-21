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
	"stripe_restricted_key" text,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "vip_configs_email_address_id_unique" UNIQUE("email_address_id")
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
ALTER TABLE "email_addresses" ADD COLUMN "is_vip_enabled" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "email_addresses" ADD COLUMN "vip_config_id" varchar(255);