ALTER TABLE "email_domains" ADD COLUMN "mail_from_domain" varchar(255);--> statement-breakpoint
ALTER TABLE "email_domains" ADD COLUMN "mail_from_domain_status" varchar(50);--> statement-breakpoint
ALTER TABLE "email_domains" ADD COLUMN "mail_from_domain_verified_at" timestamp;