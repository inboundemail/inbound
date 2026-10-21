ALTER TABLE "email_domains" ADD COLUMN "include_subdomains" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "email_domains" ADD COLUMN "subdomain_receipt_rule_name" varchar(255);