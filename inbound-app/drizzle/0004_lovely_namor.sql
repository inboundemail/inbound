CREATE TABLE "ses_events" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"event_source" varchar(100) NOT NULL,
	"event_version" varchar(50) NOT NULL,
	"message_id" varchar(255) NOT NULL,
	"source" varchar(255) NOT NULL,
	"destination" text NOT NULL,
	"subject" text,
	"timestamp" timestamp NOT NULL,
	"receipt_timestamp" timestamp NOT NULL,
	"processing_time_millis" integer,
	"recipients" text NOT NULL,
	"spam_verdict" varchar(50),
	"virus_verdict" varchar(50),
	"spf_verdict" varchar(50),
	"dkim_verdict" varchar(50),
	"dmarc_verdict" varchar(50),
	"action_type" varchar(50),
	"s3_bucket_name" varchar(255),
	"s3_object_key" varchar(500),
	"email_content" text,
	"s3_content_fetched" boolean DEFAULT false,
	"s3_content_size" integer,
	"s3_error" text,
	"common_headers" text,
	"raw_ses_event" text NOT NULL,
	"lambda_context" text,
	"webhook_payload" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "received_emails" DROP CONSTRAINT "received_emails_message_id_unique";--> statement-breakpoint
ALTER TABLE "received_emails" ADD COLUMN "ses_event_id" varchar(255) NOT NULL;--> statement-breakpoint
ALTER TABLE "received_emails" ADD COLUMN "recipient" varchar(255) NOT NULL;--> statement-breakpoint
ALTER TABLE "received_emails" ADD COLUMN "created_at" timestamp DEFAULT now();--> statement-breakpoint
ALTER TABLE "received_emails" ADD COLUMN "updated_at" timestamp DEFAULT now();