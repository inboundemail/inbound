ALTER TABLE "imap_credentials" ADD COLUMN "type" varchar(20) DEFAULT 'mailbox' NOT NULL;--> statement-breakpoint
ALTER TABLE "imap_credentials" ADD COLUMN "sending_mode" varchar(20) DEFAULT 'scoped_domains' NOT NULL;--> statement-breakpoint
ALTER TABLE "imap_credentials" ADD COLUMN "sending_name" varchar(255);--> statement-breakpoint
ALTER TABLE "imap_credentials" ADD COLUMN "sending_address" varchar(255);
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
