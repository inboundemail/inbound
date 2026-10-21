CREATE TABLE "email_threads" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"root_message_id" varchar(255) NOT NULL,
	"normalized_subject" text,
	"participant_emails" text,
	"message_count" integer DEFAULT 1,
	"last_message_at" timestamp NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "sent_emails" ADD COLUMN "thread_id" varchar(255);--> statement-breakpoint
ALTER TABLE "sent_emails" ADD COLUMN "thread_position" integer;--> statement-breakpoint
ALTER TABLE "structured_emails" ADD COLUMN "thread_id" varchar(255);--> statement-breakpoint
ALTER TABLE "structured_emails" ADD COLUMN "thread_position" integer;--> statement-breakpoint
CREATE INDEX "email_threads_root_message_id_idx" ON "email_threads" USING btree ("root_message_id");--> statement-breakpoint
CREATE INDEX "email_threads_user_id_idx" ON "email_threads" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "email_threads_last_message_at_idx" ON "email_threads" USING btree ("last_message_at");--> statement-breakpoint
CREATE INDEX "sent_emails_thread_id_idx" ON "sent_emails" USING btree ("thread_id");--> statement-breakpoint
CREATE INDEX "structured_emails_message_id_idx" ON "structured_emails" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "structured_emails_thread_id_idx" ON "structured_emails" USING btree ("thread_id");