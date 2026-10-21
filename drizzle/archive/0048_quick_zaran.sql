DROP INDEX "structured_emails_aws_ses_message_id_recipient_unique";--> statement-breakpoint
ALTER TABLE "structured_emails" ALTER COLUMN "recipient" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "structured_emails" DROP COLUMN "aws_ses_message_id";--> statement-breakpoint
ALTER TABLE "endpoint_deliveries" ADD CONSTRAINT "endpoint_deliveries_email_endpoint_unique" UNIQUE("email_id","endpoint_id");