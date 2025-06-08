ALTER TABLE "received_emails" ADD COLUMN "from_parsed" text;--> statement-breakpoint
ALTER TABLE "received_emails" ADD COLUMN "to_parsed" text;--> statement-breakpoint
ALTER TABLE "received_emails" ADD COLUMN "cc_parsed" text;--> statement-breakpoint
ALTER TABLE "received_emails" ADD COLUMN "bcc_parsed" text;--> statement-breakpoint
ALTER TABLE "received_emails" ADD COLUMN "reply_to_parsed" text;--> statement-breakpoint
ALTER TABLE "received_emails" ADD COLUMN "text_body" text;--> statement-breakpoint
ALTER TABLE "received_emails" ADD COLUMN "html_body" text;--> statement-breakpoint
ALTER TABLE "received_emails" ADD COLUMN "raw_email_content" text;--> statement-breakpoint
ALTER TABLE "received_emails" ADD COLUMN "in_reply_to" varchar(255);--> statement-breakpoint
ALTER TABLE "received_emails" ADD COLUMN "references" text;--> statement-breakpoint
ALTER TABLE "received_emails" ADD COLUMN "priority" varchar(50);--> statement-breakpoint
ALTER TABLE "received_emails" ADD COLUMN "attachments" text;--> statement-breakpoint
ALTER TABLE "received_emails" ADD COLUMN "headers" text;--> statement-breakpoint
ALTER TABLE "received_emails" ADD COLUMN "email_date" timestamp;