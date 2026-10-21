ALTER TABLE "email_addresses" ALTER COLUMN "domain_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "email_addresses" ADD COLUMN "is_receipt_rule_configured" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "email_addresses" ADD COLUMN "receipt_rule_name" varchar(255);--> statement-breakpoint
ALTER TABLE "email_addresses" ADD COLUMN "updated_at" timestamp DEFAULT now();