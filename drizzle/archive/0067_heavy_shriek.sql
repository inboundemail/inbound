CREATE TABLE "imap_mailbox_messages" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"mailbox_id" varchar(255) NOT NULL,
	"structured_email_id" varchar(255) NOT NULL,
	"uid" integer NOT NULL,
	"flags" text DEFAULT '[]' NOT NULL,
	"internal_date" timestamp NOT NULL,
	"size" integer,
	"modseq" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "imap_mailbox_messages_mailbox_uid_unique" UNIQUE("mailbox_id","uid"),
	CONSTRAINT "imap_mailbox_messages_mailbox_email_unique" UNIQUE("mailbox_id","structured_email_id")
);
--> statement-breakpoint
CREATE TABLE "imap_mailboxes" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"address" varchar(255) NOT NULL,
	"path" varchar(255) DEFAULT 'INBOX' NOT NULL,
	"uid_validity" integer NOT NULL,
	"uid_next" integer DEFAULT 1 NOT NULL,
	"modseq" integer DEFAULT 0 NOT NULL,
	"subscribed" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "imap_mailboxes_address_path_unique" UNIQUE("address","path")
);
--> statement-breakpoint
CREATE INDEX "imap_mailbox_messages_mailbox_uid_idx" ON "imap_mailbox_messages" USING btree ("mailbox_id","uid");--> statement-breakpoint
CREATE INDEX "imap_mailboxes_user_id_idx" ON "imap_mailboxes" USING btree ("user_id");