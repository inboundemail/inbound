CREATE TABLE "mailbox_filters" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"credential_id" varchar(255) NOT NULL,
	"name" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"match" text DEFAULT 'all' NOT NULL,
	"conditions" jsonb NOT NULL,
	"actions" jsonb NOT NULL,
	"stop_processing" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mailbox_message_state" (
	"credential_id" varchar(255) NOT NULL,
	"structured_email_id" varchar(255) NOT NULL,
	"junk_override" boolean,
	"filter_versions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"filter_mailbox_id" varchar(255),
	"filter_flags" text[] DEFAULT '{}'::text[] NOT NULL,
	"initialized" boolean DEFAULT false NOT NULL,
	CONSTRAINT "mailbox_message_state_credential_id_structured_email_id_pk" PRIMARY KEY("credential_id","structured_email_id")
);
--> statement-breakpoint
CREATE TABLE "mailbox_send_usage" (
	"credential_id" varchar(255) NOT NULL,
	"day" text NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "mailbox_send_usage_credential_id_day_pk" PRIMARY KEY("credential_id","day")
);
--> statement-breakpoint
ALTER TABLE "imap_credentials" ADD COLUMN "protocols" jsonb;--> statement-breakpoint
ALTER TABLE "imap_credentials" ADD COLUMN "allowed_ips" text[];--> statement-breakpoint
ALTER TABLE "imap_credentials" ADD COLUMN "storage_quota_bytes" bigint;--> statement-breakpoint
ALTER TABLE "imap_credentials" ADD COLUMN "daily_send_limit" integer;--> statement-breakpoint
ALTER TABLE "imap_credentials" ADD COLUMN "self_service" jsonb;--> statement-breakpoint
ALTER TABLE "imap_credentials" ADD COLUMN "spam_level" text;--> statement-breakpoint
ALTER TABLE "imap_credentials" ADD COLUMN "spam_allow" text[];--> statement-breakpoint
ALTER TABLE "imap_credentials" ADD COLUMN "spam_block" text[];--> statement-breakpoint
ALTER TABLE "mailbox_filters" ADD CONSTRAINT "mailbox_filters_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mailbox_filters" ADD CONSTRAINT "mailbox_filters_credential_id_imap_credentials_id_fk" FOREIGN KEY ("credential_id") REFERENCES "public"."imap_credentials"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mailbox_message_state" ADD CONSTRAINT "mailbox_message_state_credential_id_imap_credentials_id_fk" FOREIGN KEY ("credential_id") REFERENCES "public"."imap_credentials"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mailbox_message_state" ADD CONSTRAINT "mailbox_message_state_structured_email_id_structured_emails_id_fk" FOREIGN KEY ("structured_email_id") REFERENCES "public"."structured_emails"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mailbox_message_state" ADD CONSTRAINT "mailbox_message_state_filter_mailbox_id_imap_mailboxes_id_fk" FOREIGN KEY ("filter_mailbox_id") REFERENCES "public"."imap_mailboxes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mailbox_send_usage" ADD CONSTRAINT "mailbox_send_usage_credential_id_imap_credentials_id_fk" FOREIGN KEY ("credential_id") REFERENCES "public"."imap_credentials"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mailbox_filters_credential_position_idx" ON "mailbox_filters" USING btree ("credential_id","position","id");--> statement-breakpoint
CREATE INDEX "mailbox_message_state_email_idx" ON "mailbox_message_state" USING btree ("structured_email_id");--> statement-breakpoint
CREATE INDEX "mailbox_message_state_mailbox_idx" ON "mailbox_message_state" USING btree ("filter_mailbox_id");