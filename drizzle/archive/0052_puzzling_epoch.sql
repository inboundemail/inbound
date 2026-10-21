ALTER TABLE "sent_emails" ADD COLUMN "batch_id" varchar(255);--> statement-breakpoint
ALTER TABLE "sent_emails" ADD COLUMN "batch_index" integer;