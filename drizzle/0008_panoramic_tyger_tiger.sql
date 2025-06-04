ALTER TABLE "received_emails" ADD COLUMN "is_read" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "received_emails" ADD COLUMN "read_at" timestamp;