CREATE TABLE "email_delivery_events" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"event_type" varchar(50) NOT NULL,
	"bounce_type" varchar(50),
	"bounce_sub_type" varchar(100),
	"status_code" varchar(20),
	"status_class" varchar(10),
	"status_category" varchar(10),
	"diagnostic_code" text,
	"failed_recipient" varchar(255) NOT NULL,
	"failed_recipient_domain" varchar(255),
	"original_message_id" varchar(500),
	"original_sent_email_id" varchar(255),
	"original_from" varchar(500),
	"original_to" text,
	"original_subject" text,
	"original_sent_at" timestamp,
	"dsn_email_id" varchar(255),
	"dsn_received_at" timestamp,
	"reporting_mta" varchar(255),
	"remote_mta" varchar(255),
	"user_id" varchar(255),
	"domain_id" varchar(255),
	"domain_name" varchar(255),
	"tenant_id" varchar(255),
	"tenant_name" varchar(255),
	"action_taken" varchar(50),
	"action_taken_at" timestamp,
	"added_to_blocklist" boolean DEFAULT false,
	"blocklist_id" varchar(255),
	"raw_dsn_content" text,
	"metadata" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX "email_delivery_events_event_type_idx" ON "email_delivery_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "email_delivery_events_bounce_type_idx" ON "email_delivery_events" USING btree ("bounce_type");--> statement-breakpoint
CREATE INDEX "email_delivery_events_failed_recipient_idx" ON "email_delivery_events" USING btree ("failed_recipient");--> statement-breakpoint
CREATE INDEX "email_delivery_events_failed_recipient_domain_idx" ON "email_delivery_events" USING btree ("failed_recipient_domain");--> statement-breakpoint
CREATE INDEX "email_delivery_events_user_id_idx" ON "email_delivery_events" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "email_delivery_events_domain_id_idx" ON "email_delivery_events" USING btree ("domain_id");--> statement-breakpoint
CREATE INDEX "email_delivery_events_tenant_id_idx" ON "email_delivery_events" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "email_delivery_events_status_code_idx" ON "email_delivery_events" USING btree ("status_code");--> statement-breakpoint
CREATE INDEX "email_delivery_events_created_at_idx" ON "email_delivery_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "email_delivery_events_original_message_id_idx" ON "email_delivery_events" USING btree ("original_message_id");