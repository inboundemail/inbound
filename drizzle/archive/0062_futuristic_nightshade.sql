CREATE TABLE "blocked_signup_domains" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"domain" varchar(255) NOT NULL,
	"reason" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"blocked_by" varchar(255),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "blocked_signup_domains_domain_unique" UNIQUE("domain")
);
--> statement-breakpoint
CREATE INDEX "blocked_signup_domains_active_idx" ON "blocked_signup_domains" USING btree ("is_active");