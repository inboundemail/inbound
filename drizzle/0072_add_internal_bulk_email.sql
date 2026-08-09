CREATE TABLE IF NOT EXISTS "email_batches" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"status" varchar(50) DEFAULT 'queued' NOT NULL,
	"total" integer NOT NULL,
	"sent_count" integer DEFAULT 0 NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"cancelled_count" integer DEFAULT 0 NOT NULL,
	"scheduled_at" timestamp,
	"timezone" varchar(50),
	"idempotency_key" varchar(256),
	"qstash_message_ids" text,
	"last_error" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "email_batches_user_idempotency_key_unique" ON "email_batches" USING btree ("user_id","idempotency_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "email_batches_user_created_idx" ON "email_batches" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "sent_emails_batch_id_batch_index_unique"
	ON "sent_emails" USING btree ("batch_id","batch_index")
	WHERE "sent_emails"."batch_id" IS NOT NULL;
