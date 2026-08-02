CREATE TYPE "public"."mailbox_selection_mode" AS ENUM('all', 'selected');--> statement-breakpoint
CREATE TABLE "mail_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inbound_user_id" text NOT NULL,
	"onboarding_version" integer DEFAULT 0 NOT NULL,
	"onboarded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mail_sync_states" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"scope_key" text NOT NULL,
	"cursor" text,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mailbox_addresses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mailbox_config_id" uuid NOT NULL,
	"address" text NOT NULL,
	"display_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mailbox_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"inbound_domain_id" text NOT NULL,
	"domain" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"selection_mode" "mailbox_selection_mode" DEFAULT 'all' NOT NULL,
	"default_from_address" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mail_sync_states" ADD CONSTRAINT "mail_sync_states_account_id_mail_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."mail_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mailbox_addresses" ADD CONSTRAINT "mailbox_addresses_mailbox_config_id_mailbox_configs_id_fk" FOREIGN KEY ("mailbox_config_id") REFERENCES "public"."mailbox_configs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mailbox_configs" ADD CONSTRAINT "mailbox_configs_account_id_mail_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."mail_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "mail_accounts_inbound_user_id_unique" ON "mail_accounts" USING btree ("inbound_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "mail_sync_states_account_scope_unique" ON "mail_sync_states" USING btree ("account_id","scope_key");--> statement-breakpoint
CREATE INDEX "mail_sync_states_account_id_idx" ON "mail_sync_states" USING btree ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "mailbox_addresses_config_address_unique" ON "mailbox_addresses" USING btree ("mailbox_config_id","address");--> statement-breakpoint
CREATE INDEX "mailbox_addresses_config_id_idx" ON "mailbox_addresses" USING btree ("mailbox_config_id");--> statement-breakpoint
CREATE UNIQUE INDEX "mailbox_configs_account_domain_unique" ON "mailbox_configs" USING btree ("account_id","inbound_domain_id");--> statement-breakpoint
CREATE INDEX "mailbox_configs_account_id_idx" ON "mailbox_configs" USING btree ("account_id");