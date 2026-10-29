CREATE OR REPLACE FUNCTION imap_message_state()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_modseq := NEW.modseq;
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    NEW.created_modseq := coalesce(OLD.created_modseq, OLD.modseq);
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
DROP TRIGGER imap_message_state ON imap_mailbox_messages;
--> statement-breakpoint
CREATE TRIGGER imap_message_state BEFORE INSERT OR UPDATE ON imap_mailbox_messages
FOR EACH ROW EXECUTE FUNCTION imap_message_state();
--> statement-breakpoint
CREATE FUNCTION imap_expunge_state()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM mb.id FROM imap_mailboxes mb
  WHERE mb.id IN (SELECT mailbox_id FROM deleted_messages) ORDER BY mb.id FOR UPDATE;
  WITH counts AS MATERIALIZED (
    SELECT mailbox_id, count(*)::integer AS total FROM deleted_messages GROUP BY mailbox_id
  ), bumped AS (
    UPDATE imap_mailboxes mb SET modseq = mb.modseq + counts.total, updated_at = now()
    FROM counts WHERE mb.id = counts.mailbox_id RETURNING mb.id, mb.modseq
  )
  INSERT INTO imap_mailbox_expunges (mailbox_id, uid, modseq)
  SELECT deleted.mailbox_id, deleted.uid,
    bumped.modseq - counts.total + row_number() OVER (PARTITION BY deleted.mailbox_id ORDER BY deleted.uid)::integer
  FROM deleted_messages deleted JOIN counts USING (mailbox_id) JOIN bumped ON bumped.id = deleted.mailbox_id;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER imap_expunge_state AFTER DELETE ON imap_mailbox_messages
REFERENCING OLD TABLE AS deleted_messages FOR EACH STATEMENT EXECUTE FUNCTION imap_expunge_state();
--> statement-breakpoint
DROP TRIGGER imap_notify_state ON imap_mailbox_messages;
--> statement-breakpoint
DROP TRIGGER imap_notify_mailbox_message ON imap_mailbox_messages;
--> statement-breakpoint
CREATE FUNCTION imap_notify_message_state()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE changed record;
BEGIN
  FOR changed IN
    SELECT DISTINCT mb.credential_id, mb.address FROM imap_mailboxes mb
    WHERE mb.id IN (SELECT mailbox_id FROM changed_messages)
  LOOP
    IF changed.credential_id IS NOT NULL THEN PERFORM pg_notify('imap_state_changed', 'cred:' || changed.credential_id); END IF;
    IF changed.address IS NOT NULL THEN PERFORM pg_notify('imap_changed', changed.address); END IF;
  END LOOP;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER imap_notify_message_insert AFTER INSERT ON imap_mailbox_messages
REFERENCING NEW TABLE AS changed_messages FOR EACH STATEMENT EXECUTE FUNCTION imap_notify_message_state();
--> statement-breakpoint
CREATE TRIGGER imap_notify_message_update AFTER UPDATE ON imap_mailbox_messages
REFERENCING NEW TABLE AS changed_messages FOR EACH STATEMENT EXECUTE FUNCTION imap_notify_message_state();
--> statement-breakpoint
CREATE TRIGGER imap_notify_message_delete AFTER DELETE ON imap_mailbox_messages
REFERENCING OLD TABLE AS changed_messages FOR EACH STATEMENT EXECUTE FUNCTION imap_notify_message_state();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION imap_notify_received()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE addresses text[]; payload text;
BEGIN
  addresses := array_append(coalesce(NEW.envelope_recipients, '{}'::text[]), NEW.recipient);
  IF TG_OP = 'UPDATE' THEN
    addresses := addresses || array_append(coalesce(OLD.envelope_recipients, '{}'::text[]), OLD.recipient);
  END IF;
  SELECT coalesce(array_agg(DISTINCT lower(address) ORDER BY lower(address)), '{}'::text[])
    INTO addresses FROM unnest(addresses) AS recipients(address) WHERE address IS NOT NULL;
  payload := json_build_object('userId', NEW.user_id, 'addresses', addresses)::text;
  IF octet_length(payload) >= 8000 THEN payload := json_build_object('userId', NEW.user_id)::text; END IF;
  PERFORM pg_notify('imap_received_changed', payload);
  IF TG_OP = 'UPDATE' AND OLD.user_id IS DISTINCT FROM NEW.user_id THEN
    PERFORM pg_notify('imap_received_changed', json_build_object('userId', OLD.user_id)::text);
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
DROP TRIGGER imap_notify_received ON structured_emails;
--> statement-breakpoint
CREATE TRIGGER imap_notify_received AFTER INSERT OR UPDATE OF recipient, envelope_recipients, raw_content, guard_blocked, is_junk, user_id ON structured_emails
FOR EACH ROW EXECUTE FUNCTION imap_notify_received();
--> statement-breakpoint
CREATE FUNCTION imap_record_received_change()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
BEGIN
  INSERT INTO imap_source_versions (user_id, scope_key, revision)
  SELECT DISTINCT se.user_id, target.scope_key, 1 FROM changed_emails se
  CROSS JOIN LATERAL unnest(array_append(coalesce(se.envelope_recipients, '{}'::text[]), se.recipient)) AS recipients(address)
  CROSS JOIN LATERAL (VALUES ('a:' || md5(lower(address))), ('d:' || md5(split_part(lower(address), '@', 2)))) AS target(scope_key)
  WHERE address IS NOT NULL ORDER BY se.user_id, target.scope_key
  ON CONFLICT (user_id, scope_key) DO UPDATE SET revision = imap_source_versions.revision + 1;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION imap_record_received_update()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
BEGIN
  WITH changed AS MATERIALIZED (
    SELECT old_row.user_id AS old_user_id, old_row.recipient AS old_recipient, old_row.envelope_recipients AS old_envelope,
      new_row.user_id, new_row.recipient, new_row.envelope_recipients
    FROM old_emails old_row FULL JOIN new_emails new_row USING (id)
    WHERE (old_row.user_id, old_row.recipient, old_row.envelope_recipients, old_row.raw_content IS NULL, old_row.guard_blocked, old_row.is_junk, old_row.created_at)
      IS DISTINCT FROM
      (new_row.user_id, new_row.recipient, new_row.envelope_recipients, new_row.raw_content IS NULL, new_row.guard_blocked, new_row.is_junk, new_row.created_at)
  ), recipients AS (
    SELECT old_user_id AS user_id, unnest(array_append(coalesce(old_envelope, '{}'::text[]), old_recipient)) AS address FROM changed
    UNION ALL
    SELECT user_id, unnest(array_append(coalesce(envelope_recipients, '{}'::text[]), recipient)) FROM changed
  )
  INSERT INTO imap_source_versions (user_id, scope_key, revision)
  SELECT DISTINCT recipients.user_id, target.scope_key, 1 FROM recipients
  CROSS JOIN LATERAL (VALUES ('a:' || md5(lower(address))), ('d:' || md5(split_part(lower(address), '@', 2)))) AS target(scope_key)
  WHERE address IS NOT NULL ORDER BY recipients.user_id, target.scope_key
  ON CONFLICT (user_id, scope_key) DO UPDATE SET revision = imap_source_versions.revision + 1;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER imap_record_received_insert AFTER INSERT ON structured_emails
REFERENCING NEW TABLE AS changed_emails FOR EACH STATEMENT EXECUTE FUNCTION imap_record_received_change();
--> statement-breakpoint
CREATE TRIGGER imap_record_received_delete AFTER DELETE ON structured_emails
REFERENCING OLD TABLE AS changed_emails FOR EACH STATEMENT EXECUTE FUNCTION imap_record_received_change();
--> statement-breakpoint
CREATE TRIGGER imap_record_received_update AFTER UPDATE ON structured_emails
REFERENCING OLD TABLE AS old_emails NEW TABLE AS new_emails FOR EACH STATEMENT EXECUTE FUNCTION imap_record_received_update();
--> statement-breakpoint
CREATE FUNCTION imap_invalidate_removals()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM mb.id FROM imap_mailboxes mb
  WHERE mb.credential_id IN (SELECT credential_id FROM changed_removals)
    AND (mb.path IN ('INBOX', 'Junk') OR mb.scope_id IS NOT NULL) ORDER BY mb.id FOR UPDATE;
  UPDATE imap_mailboxes mb SET source_fingerprint = NULL
  WHERE mb.credential_id IN (SELECT credential_id FROM changed_removals)
    AND (mb.path IN ('INBOX', 'Junk') OR mb.scope_id IS NOT NULL) AND mb.source_fingerprint IS NOT NULL;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER imap_invalidate_removals_insert AFTER INSERT ON imap_mailbox_removals
REFERENCING NEW TABLE AS changed_removals FOR EACH STATEMENT EXECUTE FUNCTION imap_invalidate_removals();
--> statement-breakpoint
CREATE TRIGGER imap_invalidate_removals_delete AFTER DELETE ON imap_mailbox_removals
REFERENCING OLD TABLE AS changed_removals FOR EACH STATEMENT EXECUTE FUNCTION imap_invalidate_removals();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION imap_flags(p_user text, p_credential text, p_mailbox text, p_uids integer[], p_action text, p_flags text[])
RETURNS SETOF imap_mailbox_messages LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE box imap_mailboxes;
BEGIN
  PERFORM imap_authorize(p_user, p_credential, true);
  IF p_action NOT IN ('set', 'add', 'remove') OR p_action IS NULL THEN RAISE EXCEPTION 'Invalid flag action'; END IF;
  p_flags := imap_normalize_flags(p_flags);
  SELECT * INTO box FROM imap_mailboxes WHERE id = p_mailbox AND user_id = p_user AND credential_id = p_credential;
  IF NOT FOUND THEN RAISE EXCEPTION 'Mailbox not found'; END IF;
  PERFORM imap_lock(p_user, p_credential, ARRAY[p_mailbox], box.path = 'INBOX');
  PERFORM imap_authorize(p_user, p_credential, true);
  SELECT * INTO box FROM imap_mailboxes WHERE id = p_mailbox AND user_id = p_user AND credential_id = p_credential;
  IF NOT FOUND THEN RAISE EXCEPTION 'Mailbox not found'; END IF;
  IF box.scope_id IS NOT NULL OR box.path = 'Scopes' OR box.path LIKE 'Scopes/%' THEN
    RAISE EXCEPTION 'Scope mailbox is read-only' USING ERRCODE = '42501';
  END IF;
  WITH proposed AS MATERIALIZED (
    SELECT mm.id, mm.mailbox_id, mm.uid, mm.flags::jsonb AS old_flags,
      to_jsonb(CASE p_action
        WHEN 'set' THEN p_flags
        WHEN 'add' THEN imap_normalize_flags(ARRAY(SELECT jsonb_array_elements_text(mm.flags::jsonb)) || p_flags)
        ELSE ARRAY(SELECT flag FROM jsonb_array_elements_text(mm.flags::jsonb) AS existing(flag)
          WHERE NOT lower(flag) = ANY(ARRAY(SELECT lower(flag) FROM unnest(p_flags) AS removed(flag))))
      END) AS new_flags
    FROM imap_mailbox_messages mm JOIN imap_mailboxes mb ON mb.id = mm.mailbox_id
    WHERE mb.user_id = p_user AND mb.credential_id = p_credential
      AND ((mm.mailbox_id = p_mailbox AND mm.uid = ANY(p_uids))
        OR (box.path = 'INBOX' AND (mb.path = 'INBOX' OR mb.scope_id IS NOT NULL)
          AND mm.raw_source = 'structured' AND EXISTS (
            SELECT 1 FROM imap_mailbox_messages source WHERE source.mailbox_id = p_mailbox AND source.uid = ANY(p_uids)
              AND source.raw_source = 'structured' AND source.structured_email_id = mm.structured_email_id)))
  ), changed AS MATERIALIZED (
    SELECT proposed.*, row_number() OVER (PARTITION BY mailbox_id ORDER BY uid)::integer AS ordinal,
      count(*) OVER (PARTITION BY mailbox_id)::integer AS total
    FROM proposed WHERE
      ARRAY(SELECT DISTINCT lower(flag) FROM jsonb_array_elements_text(new_flags) AS f(flag) ORDER BY lower(flag))
      IS DISTINCT FROM
      ARRAY(SELECT DISTINCT lower(flag) FROM jsonb_array_elements_text(old_flags) AS f(flag) ORDER BY lower(flag))
  ), bumped AS (
    UPDATE imap_mailboxes mb SET modseq = mb.modseq + counts.total, updated_at = now()
    FROM (SELECT mailbox_id, count(*)::integer AS total FROM changed GROUP BY mailbox_id) counts
    WHERE mb.id = counts.mailbox_id RETURNING mb.id, mb.modseq
  )
  UPDATE imap_mailbox_messages mm SET flags = changed.new_flags::text,
    modseq = bumped.modseq - changed.total + changed.ordinal
  FROM changed JOIN bumped ON bumped.id = changed.mailbox_id WHERE mm.id = changed.id;
  RETURN QUERY SELECT * FROM imap_mailbox_messages WHERE mailbox_id = p_mailbox AND uid = ANY(p_uids) ORDER BY uid;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION imap_append(p_user text, p_credential text, p_mailbox text, p_raw text, p_flags text[], p_date timestamp, p_max_bytes bigint, p_max_messages integer)
RETURNS TABLE(uid integer, uid_validity integer) LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE box imap_mailboxes; appended text; incoming_message_id text; existing integer; total_bytes bigint; total_messages bigint; incoming integer;
BEGIN
  PERFORM imap_authorize(p_user, p_credential, true);
  p_flags := imap_normalize_flags(p_flags);
  IF p_raw IS NULL OR p_max_bytes IS NULL OR p_max_messages IS NULL OR p_max_bytes < 0 OR p_max_messages < 0 THEN
    RAISE EXCEPTION 'Invalid APPEND input';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext(p_user));
  PERFORM imap_lock(p_user, p_credential, ARRAY[p_mailbox]);
  PERFORM imap_authorize(p_user, p_credential, true);
  SELECT * INTO box FROM imap_mailboxes WHERE id = p_mailbox AND user_id = p_user AND credential_id = p_credential;
  IF NOT FOUND THEN RAISE EXCEPTION 'Mailbox not found'; END IF;
  IF box.scope_id IS NOT NULL OR box.path = 'Scopes' OR box.path LIKE 'Scopes/%' THEN RAISE EXCEPTION 'Scope mailbox is read-only' USING ERRCODE = '42501'; END IF;
  incoming_message_id := imap_message_id(p_raw);
  IF box.path = 'Sent' AND incoming_message_id IS NOT NULL THEN
    SELECT mm.uid INTO existing FROM imap_mailbox_messages mm
    LEFT JOIN imap_appended_messages am ON mm.raw_source = 'appended' AND am.id = mm.structured_email_id AND am.user_id = p_user
    LEFT JOIN structured_emails se ON mm.raw_source = 'structured' AND se.id = mm.structured_email_id AND se.user_id = p_user
    WHERE mm.mailbox_id = p_mailbox AND imap_message_id(coalesce(am.raw_content, se.raw_content)) = incoming_message_id
    ORDER BY mm.uid LIMIT 1;
    IF FOUND THEN RETURN QUERY SELECT existing, box.uid_validity; RETURN; END IF;
  END IF;
  incoming := octet_length(p_raw);
  SELECT count(*), coalesce(sum(am.size), 0) INTO total_messages, total_bytes FROM imap_appended_messages am
  WHERE am.user_id = p_user AND EXISTS (
    SELECT 1 FROM imap_mailbox_messages mm WHERE mm.raw_source = 'appended' AND mm.structured_email_id = am.id);
  IF total_messages >= p_max_messages OR total_bytes + incoming > p_max_bytes THEN
    RAISE EXCEPTION 'APPEND quota exceeded' USING ERRCODE = 'P0001';
  END IF;
  appended := gen_random_uuid()::text;
  INSERT INTO imap_appended_messages (id, user_id, raw_content, size) VALUES (appended, p_user, p_raw, incoming);
  INSERT INTO imap_mailbox_messages (id, mailbox_id, structured_email_id, raw_source, uid, flags, internal_date, size, modseq)
  VALUES (p_mailbox || ':' || box.uid_next, p_mailbox, appended, 'appended', box.uid_next,
    to_jsonb(p_flags)::text, coalesce(p_date, now()), incoming, box.modseq + 1);
  UPDATE imap_mailboxes SET uid_next = box.uid_next + 1, modseq = box.modseq + 1, updated_at = now() WHERE id = p_mailbox;
  RETURN QUERY SELECT box.uid_next, box.uid_validity;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION imap_cleanup_appended()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM am.id FROM imap_appended_messages am
  WHERE EXISTS (SELECT 1 FROM deleted_messages deleted
    WHERE deleted.raw_source = 'appended' AND deleted.structured_email_id = am.id)
  ORDER BY am.id FOR UPDATE;
  DELETE FROM imap_appended_messages am
  WHERE EXISTS (SELECT 1 FROM deleted_messages deleted
      WHERE deleted.raw_source = 'appended' AND deleted.structured_email_id = am.id)
    AND NOT EXISTS (SELECT 1 FROM imap_mailbox_messages mm
      WHERE mm.raw_source = 'appended' AND mm.structured_email_id = am.id);
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER imap_cleanup_appended AFTER DELETE ON imap_mailbox_messages
REFERENCING OLD TABLE AS deleted_messages
FOR EACH STATEMENT EXECUTE FUNCTION imap_cleanup_appended();
--> statement-breakpoint
REVOKE ALL ON FUNCTION imap_cleanup_appended(), imap_expunge_state(), imap_notify_message_state(),
  imap_record_received_change(), imap_record_received_update(), imap_invalidate_removals(),
  imap_scope_visibility(text, text), imap_visibility_fingerprint(text, text),
  imap_notify_mailbox_message(), imap_notify_structured_email_junk(), imap_notify_new_structured_email(),
  imap_notify_credential_changed(), imap_notify_scope_changed() FROM PUBLIC;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'imap_gateway') THEN
    REVOKE SELECT ON TABLE imap_credentials, email_domains FROM imap_gateway;
    GRANT SELECT (id, user_id, login_address, type, access_mode, enabled) ON TABLE imap_credentials TO imap_gateway;
    GRANT SELECT (id, domain, status, user_id) ON TABLE email_domains TO imap_gateway;
    GRANT SELECT ON TABLE imap_credential_scopes TO imap_gateway;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE imap_mailbox_expunges TO imap_gateway;
    GRANT SELECT, INSERT, UPDATE ON TABLE imap_source_versions TO imap_gateway;
    GRANT EXECUTE ON FUNCTION imap_authorize(text, text, boolean) TO imap_gateway;
    GRANT EXECUTE ON FUNCTION imap_visible(text, text, text, text) TO imap_gateway;
    GRANT EXECUTE ON FUNCTION imap_lock(text, text, text[], boolean) TO imap_gateway;
    REVOKE ALL ON FUNCTION imap_message_state(), imap_notify_state(), imap_notify_received(), imap_stamp_verdict(),
      imap_cleanup_appended(), imap_expunge_state(), imap_notify_message_state(),
      imap_record_received_change(), imap_record_received_update(), imap_invalidate_removals(),
      imap_notify_mailbox_message(), imap_notify_structured_email_junk(), imap_notify_new_structured_email(),
      imap_notify_credential_changed(), imap_notify_scope_changed() FROM imap_gateway;
    GRANT EXECUTE ON FUNCTION imap_scope_visibility(text, text), imap_visibility_fingerprint(text, text) TO imap_gateway;
    GRANT EXECUTE ON FUNCTION imap_ensure(text, text) TO imap_gateway;
    GRANT EXECUTE ON FUNCTION imap_flags(text, text, text, integer[], text, text[]) TO imap_gateway;
    GRANT EXECUTE ON FUNCTION imap_expunge(text, text, text, integer[], boolean) TO imap_gateway;
    GRANT EXECUTE ON FUNCTION imap_message_id(text) TO imap_gateway;
    GRANT EXECUTE ON FUNCTION imap_append(text, text, text, text, text[], timestamp, bigint, integer) TO imap_gateway;
    GRANT EXECUTE ON FUNCTION imap_reconcile(text, text, text[]) TO imap_gateway;
    GRANT EXECUTE ON FUNCTION imap_sync(text, text, text) TO imap_gateway;
    GRANT EXECUTE ON FUNCTION imap_transfer(text, text, text, text, integer[], boolean) TO imap_gateway;
    GRANT EXECUTE ON FUNCTION imap_folder(text, text, text, text, text, boolean) TO imap_gateway;
    GRANT EXECUTE ON FUNCTION imap_normalize_flags(text[]) TO imap_gateway;
    GRANT EXECUTE ON FUNCTION imap_normalize_path(text) TO imap_gateway;
  END IF;
END;
$$;
