ALTER TABLE "structured_emails" ADD COLUMN "guard_blocked" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "structured_emails" ADD COLUMN "guard_reason" text;--> statement-breakpoint
ALTER TABLE "structured_emails" ADD COLUMN "guard_rule_id" varchar(255);--> statement-breakpoint
ALTER TABLE "structured_emails" ADD COLUMN "guard_action" varchar(50);--> statement-breakpoint
ALTER TABLE "structured_emails" ADD COLUMN "guard_metadata" text;--> statement-breakpoint
CREATE INDEX "structured_emails_guard_blocked_idx" ON "structured_emails" USING btree ("guard_blocked");