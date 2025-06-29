CREATE TABLE "blocked_emails" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"email_address" varchar(255) NOT NULL,
	"domain_id" varchar(255) NOT NULL,
	"reason" text,
	"blocked_by" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "blocked_emails_email_address_unique" UNIQUE("email_address")
);
