-- IMAP gateway change notifications (LISTEN imap_changed / imap_credential_changed).
-- Function bodies match production as of 2026-10-21.
CREATE OR REPLACE FUNCTION public.imap_notify_new_structured_email()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.recipient IS NOT NULL AND NEW.raw_content IS NOT NULL THEN
    PERFORM pg_notify('imap_changed', lower(NEW.recipient));
  END IF;
  RETURN NEW;
END;
$function$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.imap_notify_mailbox_message()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE addr varchar;
BEGIN
  SELECT address INTO addr FROM imap_mailboxes WHERE id = NEW.mailbox_id;
  IF addr IS NOT NULL THEN
    PERFORM pg_notify('imap_changed', addr);
  END IF;
  RETURN NEW;
END;
$function$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.imap_notify_credential_changed()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
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
$function$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.imap_notify_scope_changed()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
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
$function$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS imap_notify_structured_email ON public.structured_emails;
--> statement-breakpoint
CREATE TRIGGER imap_notify_structured_email AFTER INSERT ON public.structured_emails FOR EACH ROW EXECUTE FUNCTION imap_notify_new_structured_email();
--> statement-breakpoint
DROP TRIGGER IF EXISTS imap_notify_mailbox_message ON public.imap_mailbox_messages;
--> statement-breakpoint
CREATE TRIGGER imap_notify_mailbox_message AFTER INSERT ON public.imap_mailbox_messages FOR EACH ROW EXECUTE FUNCTION imap_notify_mailbox_message();
--> statement-breakpoint
DROP TRIGGER IF EXISTS imap_notify_credential_changed ON public.imap_credentials;
--> statement-breakpoint
CREATE TRIGGER imap_notify_credential_changed AFTER DELETE OR UPDATE ON public.imap_credentials FOR EACH ROW EXECUTE FUNCTION imap_notify_credential_changed();
--> statement-breakpoint
DROP TRIGGER IF EXISTS imap_notify_scope_changed ON public.imap_credential_scopes;
--> statement-breakpoint
CREATE TRIGGER imap_notify_scope_changed AFTER INSERT OR DELETE OR UPDATE ON public.imap_credential_scopes FOR EACH ROW EXECUTE FUNCTION imap_notify_scope_changed();
