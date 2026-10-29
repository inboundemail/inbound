CREATE TABLE "imap_mailbox_expunges" (
	"mailbox_id" varchar(255) NOT NULL,
	"uid" integer NOT NULL,
	"modseq" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "imap_mailbox_expunges_mailbox_id_uid_pk" PRIMARY KEY("mailbox_id","uid")
);
--> statement-breakpoint
CREATE TABLE "imap_source_versions" (
	"user_id" varchar(255) NOT NULL,
	"scope_key" varchar(34) NOT NULL,
	"revision" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "imap_source_versions_user_id_scope_key_pk" PRIMARY KEY("user_id","scope_key")
);
--> statement-breakpoint
ALTER TABLE "imap_mailbox_messages" ADD COLUMN "created_modseq" integer;--> statement-breakpoint
ALTER TABLE "imap_mailboxes" ADD COLUMN "expunge_floor" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "imap_mailboxes" ADD COLUMN "synced_at" timestamp;--> statement-breakpoint
ALTER TABLE "imap_mailboxes" ADD COLUMN "visibility_fingerprint" text;--> statement-breakpoint
ALTER TABLE "imap_mailboxes" ADD COLUMN "source_fingerprint" text;--> statement-breakpoint
ALTER TABLE "imap_mailboxes" ADD COLUMN "source_pending_at" timestamp;--> statement-breakpoint
ALTER TABLE "imap_mailbox_expunges" ADD CONSTRAINT "imap_mailbox_expunges_mailbox_id_imap_mailboxes_id_fk" FOREIGN KEY ("mailbox_id") REFERENCES "public"."imap_mailboxes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "imap_mailbox_expunges_mailbox_modseq_idx" ON "imap_mailbox_expunges" USING btree ("mailbox_id","modseq");