ALTER TABLE "email_domains" ADD COLUMN "is_catch_all_enabled" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "email_domains" ADD COLUMN "catch_all_webhook_id" varchar(255);--> statement-breakpoint
ALTER TABLE "email_domains" ADD COLUMN "catch_all_receipt_rule_name" varchar(255);