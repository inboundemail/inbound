CREATE TABLE "mailbox_activity" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"credential_id" varchar(255) NOT NULL,
	"occurred_at" timestamp DEFAULT now() NOT NULL,
	"last_occurred_at" timestamp DEFAULT now() NOT NULL,
	"protocol" varchar(10) NOT NULL,
	"event" varchar(40) NOT NULL,
	"reason" varchar(64),
	"client_ip" text,
	"client" varchar(100),
	"count" integer DEFAULT 1 NOT NULL,
	"detail" jsonb,
	"dedupe_key" varchar(255),
	CONSTRAINT "mailbox_activity_credential_dedupe_unique" UNIQUE("credential_id","dedupe_key")
);
--> statement-breakpoint
ALTER TABLE "mailbox_activity" ADD CONSTRAINT "mailbox_activity_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mailbox_activity" ADD CONSTRAINT "mailbox_activity_credential_id_imap_credentials_id_fk" FOREIGN KEY ("credential_id") REFERENCES "public"."imap_credentials"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mailbox_activity_user_credential_occurred_idx" ON "mailbox_activity" USING btree ("user_id","credential_id","occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "mailbox_activity_user_occurred_idx" ON "mailbox_activity" USING btree ("user_id","occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "mailbox_activity_occurred_idx" ON "mailbox_activity" USING btree ("occurred_at");