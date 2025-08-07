CREATE TABLE "domain_dns_records" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"domain_id" varchar(255) NOT NULL,
	"record_type" varchar(10) NOT NULL,
	"name" varchar(255) NOT NULL,
	"value" text NOT NULL,
	"is_required" boolean DEFAULT true,
	"is_verified" boolean DEFAULT false,
	"last_checked" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "email_domains" ALTER COLUMN "status" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "email_domains" ALTER COLUMN "can_receive_emails" SET DEFAULT false;--> statement-breakpoint
ALTER TABLE "email_domains" ALTER COLUMN "has_mx_records" SET DEFAULT false;--> statement-breakpoint
ALTER TABLE "email_domains" ALTER COLUMN "domain_provider" SET DATA TYPE varchar(100);--> statement-breakpoint
ALTER TABLE "email_domains" ADD COLUMN "ses_verification_status" varchar(50);--> statement-breakpoint
ALTER TABLE "email_domains" ADD COLUMN "dns_check_passed" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "email_domains" ADD COLUMN "provider_confidence" varchar(20);--> statement-breakpoint
ALTER TABLE "email_domains" ADD COLUMN "last_dns_check" timestamp;--> statement-breakpoint
ALTER TABLE "email_domains" ADD COLUMN "last_ses_check" timestamp;--> statement-breakpoint
ALTER TABLE "email_domains" DROP COLUMN "mx_records";--> statement-breakpoint
ALTER TABLE "email_domains" DROP COLUMN "dns_error";--> statement-breakpoint
ALTER TABLE "email_domains" DROP COLUMN "dns_checked_at";--> statement-breakpoint
ALTER TABLE "email_domains" DROP COLUMN "ses_status";--> statement-breakpoint
ALTER TABLE "email_domains" DROP COLUMN "required_dns_records";--> statement-breakpoint
ALTER TABLE "email_domains" DROP COLUMN "ses_verified_at";--> statement-breakpoint
ALTER TABLE "email_domains" DROP COLUMN "ses_error";--> statement-breakpoint
ALTER TABLE "email_domains" DROP COLUMN "dns_records_validated";--> statement-breakpoint
ALTER TABLE "email_domains" DROP COLUMN "dns_records_validated_at";