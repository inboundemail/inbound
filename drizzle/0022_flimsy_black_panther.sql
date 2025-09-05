ALTER TABLE "structured_emails" ADD COLUMN "is_archived" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "structured_emails" ADD COLUMN "archived_at" timestamp;