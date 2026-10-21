CREATE TABLE "user_accounts" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"stripe_restricted_key" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
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
ALTER TABLE "vip_configs" DROP COLUMN "stripe_restricted_key";