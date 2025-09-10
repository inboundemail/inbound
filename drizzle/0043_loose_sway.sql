ALTER TABLE "scheduled_emails" ADD COLUMN "qstash_schedule_id" varchar(255);--> statement-breakpoint
ALTER TABLE "scheduled_emails" ADD COLUMN "qstash_dlq_id" varchar(255);