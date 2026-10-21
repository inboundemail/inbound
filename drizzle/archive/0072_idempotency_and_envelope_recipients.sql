CREATE TABLE "structured_email_aliases" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"canonical_id" varchar(255) NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"recipient" varchar(255),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "structured_emails" ADD COLUMN "envelope_recipients" text[];--> statement-breakpoint
CREATE INDEX "structured_email_aliases_canonical_idx" ON "structured_email_aliases" USING btree ("canonical_id");--> statement-breakpoint
CREATE UNIQUE INDEX "structured_emails_user_message_unique" ON "structured_emails" USING btree ("user_id","message_id") WHERE "structured_emails"."envelope_recipients" is not null;--> statement-breakpoint
ALTER TABLE "sent_emails" ADD CONSTRAINT "sent_emails_user_idempotency_key_unique" UNIQUE("user_id","idempotency_key");