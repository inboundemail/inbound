ALTER TABLE "email_domains" ALTER COLUMN "status" SET DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE "email_domains" ADD COLUMN "can_receive_emails" boolean;--> statement-breakpoint
ALTER TABLE "email_domains" ADD COLUMN "has_mx_records" boolean;--> statement-breakpoint
ALTER TABLE "email_domains" ADD COLUMN "mx_records" text;--> statement-breakpoint
ALTER TABLE "email_domains" ADD COLUMN "domain_provider" text;--> statement-breakpoint
ALTER TABLE "email_domains" ADD COLUMN "dns_error" text;--> statement-breakpoint
ALTER TABLE "email_domains" ADD COLUMN "dns_checked_at" timestamp;--> statement-breakpoint
ALTER TABLE "email_domains" ADD COLUMN "ses_status" varchar(50);--> statement-breakpoint
ALTER TABLE "email_domains" ADD COLUMN "required_dns_records" text;--> statement-breakpoint
ALTER TABLE "email_domains" ADD COLUMN "ses_verified_at" timestamp;--> statement-breakpoint
ALTER TABLE "email_domains" ADD COLUMN "ses_error" text;--> statement-breakpoint
ALTER TABLE "email_domains" ADD COLUMN "dns_records_validated" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "email_domains" ADD COLUMN "dns_records_validated_at" timestamp;