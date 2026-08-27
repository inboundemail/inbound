CREATE TABLE IF NOT EXISTS "email_batches" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"status" varchar(50) DEFAULT 'creating' NOT NULL,
	"idempotency_key" varchar(256),
	"request_hash" varchar(64) NOT NULL,
	"total_count" integer NOT NULL,
	"published_count" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"completed_at" timestamp,
	CONSTRAINT "email_batches_user_idempotency_unique" UNIQUE("user_id", "idempotency_key")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "email_batches_user_created_idx" ON "email_batches" USING btree ("user_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "email_batches_user_status_idx" ON "email_batches" USING btree ("user_id","status");
--> statement-breakpoint
ALTER TABLE "sent_emails" ADD COLUMN IF NOT EXISTS "qstash_message_id" varchar(255);
--> statement-breakpoint
ALTER TABLE "sent_emails" ADD COLUMN IF NOT EXISTS "qstash_publish_attempt" integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "sent_emails" ADD COLUMN IF NOT EXISTS "processing_token" varchar(255);
--> statement-breakpoint
ALTER TABLE "sent_emails" ADD COLUMN IF NOT EXISTS "processing_started_at" timestamp;
--> statement-breakpoint
ALTER TABLE "sent_emails" ADD COLUMN IF NOT EXISTS "provider_submitted_at" timestamp;
--> statement-breakpoint
ALTER TABLE "sent_emails" ADD COLUMN IF NOT EXISTS "usage_tracked_at" timestamp;
--> statement-breakpoint
ALTER TABLE "sent_emails" ADD COLUMN IF NOT EXISTS "usage_tracking_error" text;
