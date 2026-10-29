CREATE TABLE "spam_filter_settings" (
	"user_id" varchar(255) PRIMARY KEY NOT NULL,
	"level" varchar(20) DEFAULT 'standard' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "structured_emails" ADD COLUMN "is_junk" boolean;--> statement-breakpoint
ALTER TABLE "structured_emails" ADD COLUMN "junk_reason" text;--> statement-breakpoint
ALTER TABLE "structured_emails" ADD COLUMN "junk_updated_at" timestamp;--> statement-breakpoint
ALTER TABLE "spam_filter_settings" ADD CONSTRAINT "spam_filter_settings_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
UPDATE "structured_emails" SET "is_junk" = true, "junk_reason" = 'user', "junk_updated_at" = now()
WHERE "is_junk" IS NULL AND "id" IN (
	SELECT mm.structured_email_id FROM imap_mailbox_messages mm
	JOIN imap_mailboxes mb ON mb.id = mm.mailbox_id
	WHERE mb.path = 'Junk' AND mb.credential_id IS NOT NULL AND mm.raw_source = 'structured'
);--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.imap_notify_structured_email_junk()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.is_junk IS DISTINCT FROM OLD.is_junk AND NEW.recipient IS NOT NULL AND NEW.raw_content IS NOT NULL THEN
    PERFORM pg_notify('imap_changed', lower(NEW.recipient));
  END IF;
  RETURN NEW;
END;
$function$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS imap_notify_structured_email_junk ON public.structured_emails;
--> statement-breakpoint
CREATE TRIGGER imap_notify_structured_email_junk AFTER UPDATE OF is_junk ON public.structured_emails FOR EACH ROW EXECUTE FUNCTION imap_notify_structured_email_junk();
