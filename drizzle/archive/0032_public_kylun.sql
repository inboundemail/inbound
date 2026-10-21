CREATE TABLE "onboarding_demo_emails" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"email_id" varchar(255) NOT NULL,
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
ALTER TABLE "domain_dns_records" DROP COLUMN "priority";--> statement-breakpoint
ALTER TABLE "domain_dns_records" DROP COLUMN "description";