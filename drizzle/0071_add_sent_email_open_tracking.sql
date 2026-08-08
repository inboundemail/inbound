ALTER TABLE "sent_emails" ADD COLUMN IF NOT EXISTS "first_opened_at" timestamp;--> statement-breakpoint
ALTER TABLE "sent_emails" ADD COLUMN IF NOT EXISTS "last_opened_at" timestamp;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sent_emails_user_first_opened_idx" ON "sent_emails" USING btree ("user_id","first_opened_at");
