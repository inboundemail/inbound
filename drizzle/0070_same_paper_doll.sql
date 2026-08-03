CREATE TABLE "imap_credential_scopes" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"credential_id" varchar(255) NOT NULL,
	"type" varchar(20) NOT NULL,
	"domain_id" varchar(255) NOT NULL,
	"address" varchar(255),
	"scope_key" varchar(512) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "imap_credential_scopes_credential_scope_key_unique" UNIQUE("credential_id","scope_key")
);
--> statement-breakpoint
CREATE TABLE "imap_credentials" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"api_key_id" text NOT NULL,
	"name" varchar(255) NOT NULL,
	"login_address" varchar(255) NOT NULL,
	"type" varchar(20) DEFAULT 'mailbox' NOT NULL,
	"access_mode" varchar(20) NOT NULL,
	"sending_mode" varchar(20) DEFAULT 'scoped_domains' NOT NULL,
	"sending_name" varchar(255),
	"sending_address" varchar(255),
	"enabled" boolean DEFAULT true NOT NULL,
	"last_used_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "imap_credentials_api_key_id_unique" UNIQUE("api_key_id"),
	CONSTRAINT "imap_credentials_user_login_address_unique" UNIQUE("user_id","login_address")
);
--> statement-breakpoint
ALTER TABLE "imap_mailboxes" DROP CONSTRAINT "imap_mailboxes_address_path_unique";--> statement-breakpoint
ALTER TABLE "imap_mailboxes" ADD COLUMN "credential_id" varchar(255);--> statement-breakpoint
ALTER TABLE "imap_mailboxes" ADD COLUMN "scope_id" varchar(255);--> statement-breakpoint
ALTER TABLE "imap_credential_scopes" ADD CONSTRAINT "imap_credential_scopes_credential_id_imap_credentials_id_fk" FOREIGN KEY ("credential_id") REFERENCES "public"."imap_credentials"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imap_credential_scopes" ADD CONSTRAINT "imap_credential_scopes_domain_id_email_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."email_domains"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imap_credentials" ADD CONSTRAINT "imap_credentials_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imap_credentials" ADD CONSTRAINT "imap_credentials_api_key_id_apikey_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."apikey"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "imap_credential_scopes_credential_id_idx" ON "imap_credential_scopes" USING btree ("credential_id");--> statement-breakpoint
CREATE INDEX "imap_credential_scopes_domain_id_idx" ON "imap_credential_scopes" USING btree ("domain_id");--> statement-breakpoint
CREATE INDEX "imap_credentials_user_id_idx" ON "imap_credentials" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "imap_appended_messages" ADD CONSTRAINT "imap_appended_messages_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imap_mailbox_messages" ADD CONSTRAINT "imap_mailbox_messages_mailbox_id_imap_mailboxes_id_fk" FOREIGN KEY ("mailbox_id") REFERENCES "public"."imap_mailboxes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imap_mailboxes" ADD CONSTRAINT "imap_mailboxes_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imap_mailboxes" ADD CONSTRAINT "imap_mailboxes_credential_id_imap_credentials_id_fk" FOREIGN KEY ("credential_id") REFERENCES "public"."imap_credentials"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imap_mailboxes" ADD CONSTRAINT "imap_mailboxes_scope_id_imap_credential_scopes_id_fk" FOREIGN KEY ("scope_id") REFERENCES "public"."imap_credential_scopes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "imap_appended_messages_user_id_idx" ON "imap_appended_messages" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "imap_mailbox_messages_appended_reference_idx" ON "imap_mailbox_messages" USING btree ("raw_source","structured_email_id");--> statement-breakpoint
CREATE INDEX "imap_mailboxes_credential_id_idx" ON "imap_mailboxes" USING btree ("credential_id");--> statement-breakpoint
ALTER TABLE "imap_mailboxes" ADD CONSTRAINT "imap_mailboxes_user_address_path_unique" UNIQUE("user_id","address","path");--> statement-breakpoint
ALTER TABLE "imap_mailboxes" ADD CONSTRAINT "imap_mailboxes_credential_path_unique" UNIQUE("credential_id","path");
--> statement-breakpoint
CREATE INDEX "structured_emails_lower_recipient_idx"
	ON "structured_emails" (lower("recipient"), "created_at")
	WHERE "raw_content" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX "imap_mailbox_messages_mailbox_modseq_idx"
	ON "imap_mailbox_messages" ("mailbox_id", "modseq");
--> statement-breakpoint
CREATE OR REPLACE FUNCTION imap_notify_new_structured_email() RETURNS trigger AS $$
BEGIN
	IF NEW.recipient IS NOT NULL AND NEW.raw_content IS NOT NULL THEN
		PERFORM pg_notify('imap_changed', lower(NEW.recipient));
	END IF;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER imap_notify_structured_email
	AFTER INSERT ON structured_emails
	FOR EACH ROW EXECUTE FUNCTION imap_notify_new_structured_email();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION imap_notify_mailbox_message() RETURNS trigger AS $$
DECLARE address varchar;
BEGIN
	SELECT imap_mailboxes.address INTO address
	FROM imap_mailboxes
	WHERE imap_mailboxes.id = NEW.mailbox_id;
	IF address IS NOT NULL THEN
		PERFORM pg_notify('imap_changed', address);
	END IF;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER imap_notify_mailbox_message
	AFTER INSERT ON imap_mailbox_messages
	FOR EACH ROW EXECUTE FUNCTION imap_notify_mailbox_message();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION imap_notify_credential_changed() RETURNS trigger AS $$
BEGIN
	IF TG_OP = 'DELETE' THEN
		PERFORM pg_notify('imap_credential_changed', OLD.id);
		RETURN OLD;
	END IF;
	IF OLD.api_key_id IS NOT DISTINCT FROM NEW.api_key_id AND
		OLD.login_address IS NOT DISTINCT FROM NEW.login_address AND
		OLD.type IS NOT DISTINCT FROM NEW.type AND
		OLD.access_mode IS NOT DISTINCT FROM NEW.access_mode AND
		OLD.sending_mode IS NOT DISTINCT FROM NEW.sending_mode AND
		OLD.sending_name IS NOT DISTINCT FROM NEW.sending_name AND
		OLD.sending_address IS NOT DISTINCT FROM NEW.sending_address AND
		OLD.enabled IS NOT DISTINCT FROM NEW.enabled THEN
		RETURN NEW;
	END IF;
	PERFORM pg_notify('imap_credential_changed', NEW.id);
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER imap_notify_credential_changed
	AFTER UPDATE OR DELETE ON imap_credentials
	FOR EACH ROW EXECUTE FUNCTION imap_notify_credential_changed();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION imap_notify_scope_changed() RETURNS trigger AS $$
BEGIN
	IF TG_OP = 'DELETE' THEN
		PERFORM pg_notify('imap_credential_changed', OLD.credential_id);
		RETURN OLD;
	END IF;
	PERFORM pg_notify('imap_credential_changed', NEW.credential_id);
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER imap_notify_scope_changed
	AFTER INSERT OR UPDATE OR DELETE ON imap_credential_scopes
	FOR EACH ROW EXECUTE FUNCTION imap_notify_scope_changed();
