ALTER TABLE "sent_emails" ADD COLUMN "ses_message_id" varchar(300);--> statement-breakpoint
CREATE INDEX "sent_emails_ses_message_id_idx" ON "sent_emails" USING btree ("ses_message_id");--> statement-breakpoint
COMMENT ON COLUMN "sent_emails"."ses_message_id" IS 'AWS SES Message-ID returned after sending, used for threading incoming replies';