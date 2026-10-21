CREATE TABLE "imap_appended_messages" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"raw_content" text NOT NULL,
	"size" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "imap_mailbox_messages" ADD COLUMN "raw_source" varchar(20) DEFAULT 'structured' NOT NULL;