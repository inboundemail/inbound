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
	"access_mode" varchar(20) NOT NULL,
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
CREATE INDEX "imap_mailboxes_credential_id_idx" ON "imap_mailboxes" USING btree ("credential_id");--> statement-breakpoint
ALTER TABLE "imap_mailboxes" ADD CONSTRAINT "imap_mailboxes_user_address_path_unique" UNIQUE("user_id","address","path");--> statement-breakpoint
ALTER TABLE "imap_mailboxes" ADD CONSTRAINT "imap_mailboxes_credential_path_unique" UNIQUE("credential_id","path");
--> statement-breakpoint
CREATE OR REPLACE FUNCTION imap_notify_credential_changed() RETURNS trigger AS $$
DECLARE credential_id varchar;
BEGIN
	IF TG_OP = 'DELETE' THEN
		PERFORM pg_notify('imap_credential_changed', OLD.id);
		RETURN OLD;
	END IF;
	credential_id := NEW.id;
	IF TG_OP = 'UPDATE' AND
		OLD.api_key_id IS NOT DISTINCT FROM NEW.api_key_id AND
		OLD.login_address IS NOT DISTINCT FROM NEW.login_address AND
		OLD.access_mode IS NOT DISTINCT FROM NEW.access_mode AND
		OLD.enabled IS NOT DISTINCT FROM NEW.enabled THEN
		RETURN NEW;
	END IF;
	PERFORM pg_notify('imap_credential_changed', credential_id);
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER imap_notify_credential_changed
	AFTER UPDATE OR DELETE ON imap_credentials
	FOR EACH ROW EXECUTE FUNCTION imap_notify_credential_changed();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION imap_notify_scope_changed() RETURNS trigger AS $$
DECLARE credential_id varchar;
BEGIN
	IF TG_OP = 'DELETE' THEN
		PERFORM pg_notify('imap_credential_changed', OLD.credential_id);
		RETURN OLD;
	END IF;
	credential_id := NEW.credential_id;
	PERFORM pg_notify('imap_credential_changed', credential_id);
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER imap_notify_scope_changed
	AFTER INSERT OR UPDATE OR DELETE ON imap_credential_scopes
	FOR EACH ROW EXECUTE FUNCTION imap_notify_scope_changed();
