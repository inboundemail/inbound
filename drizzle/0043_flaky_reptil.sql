CREATE TABLE "ses_tenants" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"aws_tenant_id" varchar(255) NOT NULL,
	"tenant_name" varchar(255) NOT NULL,
	"status" varchar(50) DEFAULT 'active' NOT NULL,
	"reputation_policy" varchar(20) DEFAULT 'standard' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "ses_tenants_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "ses_tenants_aws_tenant_id_unique" UNIQUE("aws_tenant_id")
);
--> statement-breakpoint
ALTER TABLE "email_addresses" ADD COLUMN "tenant_id" varchar(255);--> statement-breakpoint
ALTER TABLE "email_domains" ADD COLUMN "tenant_id" varchar(255);