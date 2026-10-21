CREATE TABLE "guard_rules" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"type" varchar(50) NOT NULL,
	"config" text NOT NULL,
	"is_active" boolean DEFAULT true,
	"priority" integer DEFAULT 0,
	"last_triggered_at" timestamp,
	"trigger_count" integer DEFAULT 0,
	"actions" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
DROP INDEX "structured_emails_aws_ses_message_id_recipient_unique";--> statement-breakpoint
ALTER TABLE "structured_emails" ALTER COLUMN "recipient" DROP NOT NULL;--> statement-breakpoint
CREATE INDEX "guard_rules_user_id_idx" ON "guard_rules" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "guard_rules_priority_idx" ON "guard_rules" USING btree ("priority");--> statement-breakpoint
ALTER TABLE "structured_emails" DROP COLUMN "aws_ses_message_id";