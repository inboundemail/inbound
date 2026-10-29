CREATE OR REPLACE FUNCTION imap_authorize(p_user text, p_credential text, p_write boolean DEFAULT false)
RETURNS imap_credentials LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE credential imap_credentials;
BEGIN
  SELECT c.id, c.user_id, c.login_address, c.type, c.access_mode, c.enabled
  INTO credential.id, credential.user_id, credential.login_address, credential.type, credential.access_mode, credential.enabled
  FROM imap_credentials c
  WHERE c.id = p_credential AND c.user_id = p_user AND c.enabled AND c.type = 'mailbox';
  IF NOT FOUND THEN RAISE EXCEPTION 'Mailbox credential not found' USING ERRCODE = '42501'; END IF;
  IF p_write AND credential.access_mode <> 'read_write' THEN
    RAISE EXCEPTION 'Mailbox is read-only' USING ERRCODE = '42501';
  END IF;
  RETURN credential;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION imap_visible(p_user text, p_credential text, p_email text, p_scope text DEFAULT NULL)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM structured_emails se
    JOIN imap_credentials c ON c.id = p_credential AND c.user_id = p_user AND c.enabled AND c.type = 'mailbox'
    JOIN imap_credential_scopes s ON s.credential_id = c.id
    JOIN email_domains d ON d.id = s.domain_id AND d.user_id = p_user AND d.status = 'verified'
    WHERE se.id = p_email AND se.user_id = p_user AND se.guard_blocked IS NOT TRUE
      AND (p_scope IS NULL OR s.id = p_scope)
      AND EXISTS (
        SELECT 1 FROM unnest(array_append(coalesce(se.envelope_recipients, '{}'::text[]), se.recipient)) AS envelope(address)
        WHERE (s.type = 'address' AND lower(envelope.address) = lower(s.address))
           OR (s.type = 'domain' AND split_part(lower(envelope.address), '@', 2) = lower(d.domain)
               AND split_part(lower(envelope.address), '@', 1) <> 'dmarc')
      )
  );
$$;
--> statement-breakpoint
CREATE FUNCTION imap_normalize_flags(p_flags text[])
RETURNS text[] LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE flag text; normalized text; flags text[] := '{}'; seen text[] := '{}';
BEGIN
  FOREACH flag IN ARRAY coalesce(p_flags, '{}'::text[]) LOOP
    IF flag IS NULL OR flag = '' THEN RAISE EXCEPTION 'Invalid message flag'; END IF;
    IF lower(flag) = '\recent' THEN CONTINUE; END IF;
    normalized := CASE lower(flag)
      WHEN '\seen' THEN '\Seen' WHEN '\answered' THEN '\Answered' WHEN '\flagged' THEN '\Flagged'
      WHEN '\deleted' THEN '\Deleted' WHEN '\draft' THEN '\Draft' ELSE NULL END;
    IF normalized IS NULL THEN
      IF EXISTS (SELECT 1 FROM regexp_split_to_table(flag, '') AS chars(ch)
        WHERE ascii(ch) <= 32 OR ascii(ch) = 127 OR strpos('(){}%*"\]', ch) > 0) THEN
        RAISE EXCEPTION 'Invalid message flag';
      END IF;
      normalized := flag;
    END IF;
    IF NOT lower(normalized) = ANY(seen) THEN
      flags := array_append(flags, normalized);
      seen := array_append(seen, lower(normalized));
    END IF;
  END LOOP;
  RETURN ARRAY(SELECT f FROM unnest(flags) AS normalized_flags(f) ORDER BY lower(f));
END;
$$;
--> statement-breakpoint
CREATE FUNCTION imap_normalize_path(p_path text)
RETURNS text LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path = public, pg_temp AS $$
BEGIN
  IF p_path IS NULL OR p_path = '' OR char_length(p_path) > 255
    OR EXISTS (SELECT 1 FROM regexp_split_to_table(p_path, '') AS chars(ch) WHERE ascii(ch) < 32 OR ascii(ch) = 127)
    OR EXISTS (SELECT 1 FROM unnest(string_to_array(p_path, '/')) AS parts(part) WHERE part IN ('', '.', '..')) THEN
    RAISE EXCEPTION 'Invalid mailbox path';
  END IF;
  RETURN CASE WHEN upper(p_path) = 'INBOX' THEN 'INBOX' ELSE p_path END;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION imap_scope_visibility(p_user text, p_credential text)
RETURNS TABLE(scope_id text, addresses text[], domains text[]) LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public, pg_temp AS $$
  SELECT s.id::text,
    coalesce(array_agg(DISTINCT lower(s.address)) FILTER (WHERE s.type = 'address'), '{}'::text[]),
    coalesce(array_agg(DISTINCT lower(d.domain)) FILTER (WHERE s.type = 'domain'), '{}'::text[])
  FROM imap_credential_scopes s
  JOIN imap_credentials c ON c.id = s.credential_id AND c.user_id = p_user AND c.enabled AND c.type = 'mailbox'
  JOIN email_domains d ON d.id = s.domain_id AND d.user_id = p_user AND d.status = 'verified'
  WHERE s.credential_id = p_credential
  GROUP BY GROUPING SETS ((s.id), ());
$$;
--> statement-breakpoint
CREATE FUNCTION imap_visibility_fingerprint(p_user text, p_credential text)
RETURNS text LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public, pg_temp AS $$
  SELECT md5(jsonb_build_array(c.id, c.user_id, c.login_address, c.type, c.access_mode, c.enabled,
    (SELECT coalesce(jsonb_agg(jsonb_build_array(s.id, s.type, s.address, s.domain_id, d.domain, d.status, d.user_id)
      ORDER BY s.id), '[]'::jsonb)
     FROM imap_credential_scopes s LEFT JOIN email_domains d ON d.id = s.domain_id
     WHERE s.credential_id = c.id))::text)
  FROM imap_credentials c WHERE c.id = p_credential AND c.user_id = p_user;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION imap_ensure(p_user text, p_credential text)
RETURNS SETOF imap_mailboxes LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE credential imap_credentials; wanted record; stale text[]; fingerprint text;
BEGIN
  credential := imap_authorize(p_user, p_credential);
  fingerprint := imap_visibility_fingerprint(p_user, p_credential);
  IF NOT EXISTS (SELECT 1 FROM imap_mailboxes WHERE user_id = p_user AND credential_id = p_credential
    AND path = 'INBOX' AND visibility_fingerprint = fingerprint) OR EXISTS (
    SELECT 1 FROM (
      SELECT path, NULL::text AS scope_id FROM unnest(ARRAY['INBOX','Sent','Drafts','Trash','Junk','Archive']) AS defaults(path)
      UNION ALL
      SELECT 'Scopes/' || CASE WHEN s.type = 'domain' THEN '*@' || lower(d.domain) ELSE lower(s.address) END, s.id
      FROM imap_credential_scopes s JOIN email_domains d ON d.id = s.domain_id AND d.user_id = p_user AND d.status = 'verified'
      WHERE s.credential_id = p_credential
    ) desired WHERE NOT EXISTS (SELECT 1 FROM imap_mailboxes mb WHERE mb.user_id = p_user AND mb.credential_id = p_credential
      AND mb.path = desired.path AND mb.scope_id IS NOT DISTINCT FROM desired.scope_id)
  ) OR EXISTS (
    SELECT 1 FROM imap_mailboxes mb WHERE mb.user_id = p_user AND mb.credential_id = p_credential
      AND (mb.scope_id IS NOT NULL OR mb.path LIKE 'Scopes/%')
      AND NOT EXISTS (SELECT 1 FROM imap_credential_scopes s
        JOIN email_domains d ON d.id = s.domain_id AND d.user_id = p_user AND d.status = 'verified'
        WHERE s.credential_id = p_credential AND s.id = mb.scope_id
          AND mb.path = 'Scopes/' || CASE WHEN s.type = 'domain' THEN '*@' || lower(d.domain) ELSE lower(s.address) END)
  ) THEN
    PERFORM pg_advisory_xact_lock(hashtext('imap_ensure'), hashtext(p_credential));
    PERFORM mb.id FROM imap_mailboxes mb WHERE mb.user_id = p_user
      AND (mb.credential_id = p_credential OR (mb.credential_id IS NULL AND mb.address = lower(credential.login_address)))
      ORDER BY mb.id FOR UPDATE;
    credential := imap_authorize(p_user, p_credential);
    fingerprint := imap_visibility_fingerprint(p_user, p_credential);
    SELECT array_agg(mb.id) INTO stale FROM imap_mailboxes mb
    WHERE mb.user_id = p_user AND mb.credential_id = p_credential AND (mb.scope_id IS NOT NULL OR mb.path LIKE 'Scopes/%')
      AND NOT EXISTS (SELECT 1 FROM imap_credential_scopes s
        JOIN email_domains d ON d.id = s.domain_id AND d.user_id = p_user AND d.status = 'verified'
        WHERE s.credential_id = p_credential AND s.id = mb.scope_id
          AND mb.path = 'Scopes/' || CASE WHEN s.type = 'domain' THEN '*@' || lower(d.domain) ELSE lower(s.address) END);
    WITH visibility AS MATERIALIZED (SELECT * FROM imap_scope_visibility(p_user, p_credential))
    DELETE FROM imap_mailbox_messages mm USING imap_mailboxes mb
    WHERE mm.mailbox_id = mb.id AND mb.user_id = p_user AND mb.credential_id = p_credential
      AND (mb.id = ANY(stale) OR (mm.raw_source = 'structured' AND NOT EXISTS (
        SELECT 1 FROM structured_emails se JOIN visibility v ON v.scope_id IS NOT DISTINCT FROM mb.scope_id
        WHERE se.id = mm.structured_email_id AND se.user_id = p_user AND se.guard_blocked IS NOT TRUE
          AND (lower(se.recipient) = ANY(v.addresses)
            OR (split_part(lower(se.recipient), '@', 2) = ANY(v.domains) AND split_part(lower(se.recipient), '@', 1) <> 'dmarc')
            OR EXISTS (SELECT 1 FROM unnest(se.envelope_recipients) AS envelope(address)
              WHERE lower(envelope.address) = ANY(v.addresses)
                OR (split_part(lower(envelope.address), '@', 2) = ANY(v.domains)
                  AND split_part(lower(envelope.address), '@', 1) <> 'dmarc'))))));
    DELETE FROM imap_mailboxes WHERE id = ANY(stale) AND user_id = p_user AND credential_id = p_credential;
    FOR wanted IN
      SELECT path, NULL::text AS scope_id FROM unnest(ARRAY['INBOX','Sent','Drafts','Trash','Junk','Archive']) AS defaults(path)
      UNION ALL
      SELECT 'Scopes/' || CASE WHEN s.type = 'domain' THEN '*@' || lower(d.domain) ELSE lower(s.address) END, s.id
      FROM imap_credential_scopes s JOIN email_domains d ON d.id = s.domain_id AND d.user_id = p_user AND d.status = 'verified'
      WHERE s.credential_id = p_credential
      ORDER BY path
    LOOP
      IF NOT EXISTS (SELECT 1 FROM imap_mailboxes WHERE user_id = p_user AND credential_id = p_credential AND path = wanted.path) THEN
        UPDATE imap_mailboxes SET credential_id = p_credential, scope_id = wanted.scope_id, updated_at = now()
        WHERE user_id = p_user AND address = lower(credential.login_address) AND path = wanted.path AND credential_id IS NULL;
        INSERT INTO imap_mailboxes (id, user_id, address, path, uid_validity, credential_id, scope_id)
        VALUES (gen_random_uuid()::text, p_user, lower(credential.login_address), wanted.path,
          extract(epoch FROM clock_timestamp())::integer, p_credential, wanted.scope_id)
        ON CONFLICT (credential_id, path) DO NOTHING;
      END IF;
    END LOOP;
    UPDATE imap_mailboxes SET visibility_fingerprint = fingerprint, source_fingerprint = NULL
    WHERE user_id = p_user AND credential_id = p_credential AND visibility_fingerprint IS DISTINCT FROM fingerprint;
  END IF;
  RETURN QUERY SELECT * FROM imap_mailboxes WHERE user_id = p_user AND credential_id = p_credential ORDER BY path;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION imap_flags(p_user text, p_credential text, p_mailbox text, p_uids integer[], p_action text, p_flags text[])
RETURNS SETOF imap_mailbox_messages LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE box imap_mailboxes;
BEGIN
  PERFORM imap_authorize(p_user, p_credential, true);
  IF p_action NOT IN ('set', 'add', 'remove') OR p_action IS NULL THEN RAISE EXCEPTION 'Invalid flag action'; END IF;
  p_flags := imap_normalize_flags(p_flags);
  PERFORM imap_lock(p_user, p_credential, ARRAY[p_mailbox], true);
  PERFORM imap_authorize(p_user, p_credential, true);
  SELECT * INTO box FROM imap_mailboxes WHERE id = p_mailbox AND user_id = p_user AND credential_id = p_credential;
  IF NOT FOUND THEN RAISE EXCEPTION 'Mailbox not found'; END IF;
  IF box.scope_id IS NOT NULL OR box.path = 'Scopes' OR box.path LIKE 'Scopes/%' THEN
    RAISE EXCEPTION 'Scope mailbox is read-only' USING ERRCODE = '42501';
  END IF;
  UPDATE imap_mailbox_messages mm
  SET flags = to_jsonb(CASE p_action
    WHEN 'set' THEN p_flags
    WHEN 'add' THEN imap_normalize_flags(ARRAY(SELECT jsonb_array_elements_text(mm.flags::jsonb)) || p_flags)
    ELSE ARRAY(SELECT flag FROM jsonb_array_elements_text(mm.flags::jsonb) AS existing(flag)
      WHERE NOT lower(flag) = ANY(ARRAY(SELECT lower(flag) FROM unnest(p_flags) AS removed(flag))))
  END)::text
  FROM imap_mailboxes mb
  WHERE mb.id = mm.mailbox_id AND mb.user_id = p_user AND mb.credential_id = p_credential
    AND ((mm.mailbox_id = p_mailbox AND mm.uid = ANY(p_uids))
      OR (box.path = 'INBOX' AND (mb.path = 'INBOX' OR mb.scope_id IS NOT NULL)
        AND mm.raw_source = 'structured' AND EXISTS (
          SELECT 1 FROM imap_mailbox_messages source WHERE source.mailbox_id = p_mailbox AND source.uid = ANY(p_uids)
            AND source.raw_source = 'structured' AND source.structured_email_id = mm.structured_email_id)));
  RETURN QUERY SELECT * FROM imap_mailbox_messages WHERE mailbox_id = p_mailbox AND uid = ANY(p_uids) ORDER BY uid;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION imap_expunge(p_user text, p_credential text, p_mailbox text, p_uids integer[] DEFAULT NULL, p_force boolean DEFAULT false)
RETURNS TABLE(uid integer) LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE box imap_mailboxes; removed integer[]; received text[]; appended text[];
BEGIN
  PERFORM imap_authorize(p_user, p_credential, true);
  IF p_force AND p_uids IS NULL THEN RAISE EXCEPTION 'Forced expunge requires explicit UIDs'; END IF;
  PERFORM imap_lock(p_user, p_credential, ARRAY[p_mailbox], true);
  PERFORM imap_authorize(p_user, p_credential, true);
  SELECT * INTO box FROM imap_mailboxes WHERE id = p_mailbox AND user_id = p_user AND credential_id = p_credential;
  IF NOT FOUND THEN RAISE EXCEPTION 'Mailbox not found'; END IF;
  IF box.scope_id IS NOT NULL OR box.path = 'Scopes' OR box.path LIKE 'Scopes/%' THEN
    RAISE EXCEPTION 'Scope mailbox is read-only' USING ERRCODE = '42501';
  END IF;
  WITH deleted AS (
    DELETE FROM imap_mailbox_messages mm WHERE mm.mailbox_id = p_mailbox
      AND (p_uids IS NULL OR mm.uid = ANY(p_uids)) AND (p_force OR mm.flags::jsonb ? '\Deleted')
    RETURNING mm.uid, mm.structured_email_id, mm.raw_source
  ) SELECT array_agg(d.uid), array_agg(d.structured_email_id) FILTER (WHERE d.raw_source = 'structured'),
      array_agg(d.structured_email_id) FILTER (WHERE d.raw_source = 'appended')
    INTO removed, received, appended FROM deleted d;
  IF box.path IN ('INBOX', 'Junk') THEN
    INSERT INTO imap_mailbox_removals (credential_id, structured_email_id)
    SELECT p_credential, r.id FROM unnest(received) AS r(id)
    WHERE NOT EXISTS (
      SELECT 1 FROM imap_mailbox_messages mm JOIN imap_mailboxes mb ON mb.id = mm.mailbox_id
      WHERE mb.user_id = p_user AND mb.credential_id = p_credential AND mm.raw_source = 'structured' AND mm.structured_email_id = r.id
        AND CASE WHEN box.path = 'Junk' THEN mb.path = 'INBOX' OR mb.scope_id IS NOT NULL
          ELSE mb.path = 'Junk' AND mb.scope_id IS NULL END
    ) ON CONFLICT DO NOTHING;
    IF box.path = 'INBOX' THEN
      DELETE FROM imap_mailbox_messages mm USING imap_mailboxes mb
      WHERE mm.mailbox_id = mb.id AND mb.user_id = p_user AND mb.credential_id = p_credential
        AND (mb.path = 'INBOX' OR mb.scope_id IS NOT NULL) AND mm.raw_source = 'structured' AND mm.structured_email_id = ANY(received);
    END IF;
  END IF;
  DELETE FROM imap_appended_messages am WHERE am.user_id = p_user AND am.id = ANY(appended)
    AND NOT EXISTS (SELECT 1 FROM imap_mailbox_messages mm WHERE mm.raw_source = 'appended' AND mm.structured_email_id = am.id);
  RETURN QUERY SELECT r.uid FROM unnest(removed) AS r(uid) ORDER BY r.uid;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION imap_append(p_user text, p_credential text, p_mailbox text, p_raw text, p_flags text[], p_date timestamp, p_max_bytes bigint, p_max_messages integer)
RETURNS TABLE(uid integer, uid_validity integer) LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE box imap_mailboxes; appended text; message_id text; existing integer; total_bytes bigint; total_messages bigint; incoming integer;
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
  message_id := imap_message_id(p_raw);
  IF box.path = 'Sent' AND message_id IS NOT NULL THEN
    SELECT mm.uid INTO existing FROM imap_mailbox_messages mm
    LEFT JOIN imap_appended_messages am ON mm.raw_source = 'appended' AND am.id = mm.structured_email_id AND am.user_id = p_user
    LEFT JOIN structured_emails se ON mm.raw_source = 'structured' AND se.id = mm.structured_email_id AND se.user_id = p_user
    WHERE mm.mailbox_id = p_mailbox AND imap_message_id(coalesce(am.raw_content, se.raw_content)) = message_id
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
CREATE OR REPLACE FUNCTION imap_transfer(p_user text, p_credential text, p_source text, p_destination text, p_uids integer[], p_move boolean)
RETURNS TABLE(source_uid integer, destination_uid integer) LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE source imap_mailboxes; destination imap_mailboxes; received text[]; copied_source integer[]; copied_destination integer[]; inserted integer;
BEGIN
  PERFORM imap_authorize(p_user, p_credential, true);
  PERFORM imap_lock(p_user, p_credential, ARRAY[p_source, p_destination], true);
  PERFORM imap_authorize(p_user, p_credential, true);
  SELECT * INTO source FROM imap_mailboxes WHERE id = p_source AND user_id = p_user AND credential_id = p_credential;
  IF NOT FOUND THEN RAISE EXCEPTION 'Source mailbox not found'; END IF;
  SELECT * INTO destination FROM imap_mailboxes WHERE id = p_destination AND user_id = p_user AND credential_id = p_credential;
  IF NOT FOUND THEN RAISE EXCEPTION 'Destination mailbox not found'; END IF;
  IF destination.scope_id IS NOT NULL OR destination.path = 'Scopes' OR destination.path LIKE 'Scopes/%' THEN
    RAISE EXCEPTION 'Scope mailbox is read-only' USING ERRCODE = '42501';
  END IF;
  IF p_move AND (source.scope_id IS NOT NULL OR source.path = 'Scopes' OR source.path LIKE 'Scopes/%') THEN
    RAISE EXCEPTION 'Scope mailbox is read-only' USING ERRCODE = '42501';
  END IF;
  IF p_move AND p_source = p_destination THEN RAISE EXCEPTION 'Cannot move a mailbox into itself'; END IF;
  SELECT array_agg(mm.structured_email_id) INTO received FROM imap_mailbox_messages mm
  WHERE mm.mailbox_id = p_source AND mm.uid = ANY(p_uids) AND mm.raw_source = 'structured'
    AND imap_visible(p_user, p_credential, mm.structured_email_id, source.scope_id);
  IF destination.path IN ('INBOX', 'Junk') AND received IS NOT NULL THEN
    DELETE FROM imap_mailbox_removals WHERE credential_id = p_credential AND structured_email_id = ANY(received);
    PERFORM se.id FROM structured_emails se WHERE se.user_id = p_user AND se.id = ANY(received) ORDER BY se.id FOR UPDATE;
    UPDATE structured_emails SET is_junk = (destination.path = 'Junk'), junk_reason = 'user', junk_updated_at = now()
    WHERE user_id = p_user AND id = ANY(received) AND is_junk IS DISTINCT FROM (destination.path = 'Junk');
  END IF;
  WITH selected AS (
    SELECT mm.* FROM imap_mailbox_messages mm
    WHERE mm.mailbox_id = p_source AND mm.uid = ANY(p_uids)
      AND (mm.raw_source <> 'structured' OR imap_visible(p_user, p_credential, mm.structured_email_id, source.scope_id))
  ), candidates AS (
    SELECT selected.*, row_number() OVER (ORDER BY selected.uid) AS rn FROM selected
    WHERE NOT EXISTS (SELECT 1 FROM imap_mailbox_messages target WHERE target.mailbox_id = p_destination AND target.structured_email_id = selected.structured_email_id)
  ), copied AS (
    INSERT INTO imap_mailbox_messages (id, mailbox_id, structured_email_id, raw_source, uid, flags, internal_date, size, modseq)
    SELECT p_destination || ':' || (destination.uid_next + rn - 1), p_destination, structured_email_id, raw_source,
      destination.uid_next + rn - 1, flags, internal_date, size, destination.modseq + rn FROM candidates
    RETURNING uid, structured_email_id
  ), targets AS (
    SELECT uid, structured_email_id FROM copied
    UNION ALL
    SELECT mm.uid, mm.structured_email_id FROM imap_mailbox_messages mm WHERE mm.mailbox_id = p_destination
      AND mm.structured_email_id IN (SELECT structured_email_id FROM selected)
  ) SELECT array_agg(c.uid ORDER BY c.uid), array_agg(d.uid ORDER BY c.uid), (SELECT count(*)::integer FROM copied)
    INTO copied_source, copied_destination, inserted FROM selected c JOIN targets d ON d.structured_email_id = c.structured_email_id;
  IF inserted > 0 THEN
    UPDATE imap_mailboxes SET uid_next = destination.uid_next + inserted, modseq = destination.modseq + inserted, updated_at = now() WHERE id = p_destination;
  END IF;
  IF p_move THEN PERFORM * FROM imap_expunge(p_user, p_credential, p_source, coalesce(p_uids, '{}'::integer[]), true); END IF;
  IF destination.path IN ('INBOX', 'Junk') AND received IS NOT NULL THEN
    PERFORM imap_reconcile(p_user, p_credential, received);
  END IF;
  RETURN QUERY SELECT s.uid, d.uid FROM unnest(copied_source) WITH ORDINALITY AS s(uid, n)
    JOIN unnest(copied_destination) WITH ORDINALITY AS d(uid, n) USING (n) ORDER BY s.uid;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION imap_folder(p_user text, p_credential text, p_operation text, p_path text, p_new_path text DEFAULT NULL, p_subscribed boolean DEFAULT NULL)
RETURNS SETOF imap_mailboxes LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE credential imap_credentials; box imap_mailboxes; appended text[];
BEGIN
  credential := imap_authorize(p_user, p_credential, true);
  p_path := imap_normalize_path(p_path);
  IF p_operation NOT IN ('create', 'rename', 'delete', 'subscribe') OR p_operation IS NULL THEN RAISE EXCEPTION 'Invalid folder operation'; END IF;
  IF p_operation <> 'subscribe' AND (p_path = 'Scopes' OR p_path LIKE 'Scopes/%') THEN RAISE EXCEPTION 'Scope mailboxes are managed'; END IF;
  IF p_operation IN ('create', 'rename', 'delete') AND p_path IN ('INBOX', 'Sent', 'Drafts', 'Trash', 'Junk', 'Archive') THEN RAISE EXCEPTION 'Special mailboxes are managed'; END IF;
  IF p_operation = 'rename' THEN
    p_new_path := imap_normalize_path(p_new_path);
    IF p_new_path = 'Scopes' OR p_new_path LIKE 'Scopes/%'
      OR p_new_path IN ('INBOX', 'Sent', 'Drafts', 'Trash', 'Junk', 'Archive') THEN RAISE EXCEPTION 'Invalid destination path'; END IF;
  END IF;
  IF p_operation = 'create' THEN
    RETURN QUERY INSERT INTO imap_mailboxes (id, user_id, address, path, uid_validity, credential_id)
      VALUES (gen_random_uuid()::text, p_user, lower(credential.login_address), p_path, extract(epoch FROM clock_timestamp())::integer, p_credential)
      ON CONFLICT (credential_id, path) DO NOTHING RETURNING *;
    RETURN;
  END IF;
  PERFORM mb.id FROM imap_mailboxes mb WHERE mb.user_id = p_user AND mb.credential_id = p_credential
    AND (mb.path = p_path OR (p_operation = 'rename' AND left(mb.path, char_length(p_path) + 1) = p_path || '/'))
    ORDER BY mb.id FOR UPDATE;
  PERFORM imap_authorize(p_user, p_credential, true);
  SELECT * INTO box FROM imap_mailboxes WHERE user_id = p_user AND credential_id = p_credential AND path = p_path;
  IF NOT FOUND AND p_operation <> 'rename' THEN RETURN; END IF;
  IF box.scope_id IS NOT NULL AND p_operation <> 'subscribe' THEN RAISE EXCEPTION 'Scope mailbox is read-only' USING ERRCODE = '42501'; END IF;
  IF p_operation = 'rename' THEN
    IF EXISTS (SELECT 1 FROM imap_mailboxes WHERE user_id = p_user AND credential_id = p_credential
      AND (path = p_path OR left(path, char_length(p_path) + 1) = p_path || '/')
      AND char_length(p_new_path || substr(path, char_length(p_path) + 1)) > 255) THEN RAISE EXCEPTION 'Invalid destination path'; END IF;
    RETURN QUERY UPDATE imap_mailboxes SET path = p_new_path || substr(path, char_length(p_path) + 1), updated_at = now()
      WHERE user_id = p_user AND credential_id = p_credential AND scope_id IS NULL
        AND (path = p_path OR left(path, char_length(p_path) + 1) = p_path || '/') RETURNING *;
  ELSIF p_operation = 'subscribe' THEN
    IF p_subscribed IS NULL THEN RAISE EXCEPTION 'Subscription value required'; END IF;
    RETURN QUERY UPDATE imap_mailboxes SET subscribed = p_subscribed, updated_at = now() WHERE id = box.id RETURNING *;
  ELSE
    WITH deleted AS (DELETE FROM imap_mailbox_messages WHERE mailbox_id = box.id RETURNING structured_email_id, raw_source)
    SELECT array_agg(structured_email_id) FILTER (WHERE raw_source = 'appended') INTO appended FROM deleted;
    RETURN QUERY DELETE FROM imap_mailboxes WHERE id = box.id RETURNING *;
    DELETE FROM imap_appended_messages am WHERE am.user_id = p_user AND am.id = ANY(appended)
      AND NOT EXISTS (SELECT 1 FROM imap_mailbox_messages mm WHERE mm.raw_source = 'appended' AND mm.structured_email_id = am.id);
  END IF;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION imap_sync(p_user text, p_credential text, p_mailbox text)
RETURNS SETOF imap_mailboxes LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp SET plan_cache_mode = force_custom_plan AS $$
DECLARE box imap_mailboxes; inserted integer; floor integer; addresses text[]; domains text[]; fingerprint text; pending_at timestamp;
BEGIN
  PERFORM imap_authorize(p_user, p_credential);
  PERFORM imap_ensure(p_user, p_credential);
  SELECT * INTO box FROM imap_mailboxes WHERE id = p_mailbox AND user_id = p_user AND credential_id = p_credential;
  IF NOT FOUND THEN RAISE EXCEPTION 'Mailbox not found'; END IF;
  PERFORM imap_lock(p_user, p_credential, ARRAY[p_mailbox], box.path IN ('INBOX', 'Junk') OR box.scope_id IS NOT NULL);
  PERFORM imap_authorize(p_user, p_credential);
  SELECT * INTO box FROM imap_mailboxes WHERE id = p_mailbox AND user_id = p_user AND credential_id = p_credential;
  IF NOT FOUND THEN RAISE EXCEPTION 'Mailbox not found'; END IF;
  SELECT max(e.modseq) INTO floor FROM imap_mailbox_expunges e WHERE e.mailbox_id = p_mailbox AND e.created_at < now() - interval '7 days';
  IF floor IS NOT NULL THEN
    UPDATE imap_mailboxes SET expunge_floor = greatest(expunge_floor, floor) WHERE id = p_mailbox;
    DELETE FROM imap_mailbox_expunges WHERE mailbox_id = p_mailbox AND created_at < now() - interval '7 days';
  END IF;
  SELECT v.addresses, v.domains INTO addresses, domains FROM imap_scope_visibility(p_user, p_credential) v
  WHERE v.scope_id IS NOT DISTINCT FROM box.scope_id;
  SELECT md5(coalesce(string_agg(v.scope_key || ':' || v.revision, ',' ORDER BY v.scope_key), '')) INTO fingerprint
  FROM imap_source_versions v WHERE v.user_id = p_user AND v.scope_key = ANY(ARRAY(
    SELECT 'a:' || md5(address) FROM unnest(addresses) AS scopes(address)
    UNION ALL SELECT 'd:' || md5(domain) FROM unnest(domains) AS scopes(domain)));
  IF box.source_fingerprint = fingerprint AND (box.source_pending_at IS NULL OR box.source_pending_at > now()) THEN
    RETURN QUERY SELECT * FROM imap_mailboxes WHERE id = p_mailbox AND user_id = p_user AND credential_id = p_credential;
    RETURN;
  END IF;
  DELETE FROM imap_mailbox_messages mm WHERE mm.mailbox_id = p_mailbox AND mm.raw_source = 'structured'
    AND NOT EXISTS (SELECT 1 FROM structured_emails se WHERE se.id = mm.structured_email_id
      AND se.user_id = p_user AND se.guard_blocked IS NOT TRUE
      AND (lower(se.recipient) = ANY(addresses)
        OR (split_part(lower(se.recipient), '@', 2) = ANY(domains) AND split_part(lower(se.recipient), '@', 1) <> 'dmarc')
        OR EXISTS (SELECT 1 FROM unnest(se.envelope_recipients) AS envelope(address)
          WHERE lower(envelope.address) = ANY(addresses)
            OR (split_part(lower(envelope.address), '@', 2) = ANY(domains)
              AND split_part(lower(envelope.address), '@', 1) <> 'dmarc'))));
  IF box.path IN ('INBOX', 'Junk') OR box.scope_id IS NOT NULL THEN
    PERFORM imap_reconcile(p_user, p_credential);
    SELECT * INTO box FROM imap_mailboxes WHERE id = p_mailbox;
    WITH candidates AS (
      SELECT se.id, se.created_at, octet_length(se.raw_content) AS size,
        row_number() OVER (ORDER BY se.created_at, se.id) AS rn,
        coalesce((SELECT canonical.flags FROM imap_mailbox_messages canonical JOIN imap_mailboxes inbox ON inbox.id = canonical.mailbox_id
          WHERE box.scope_id IS NOT NULL AND inbox.user_id = p_user AND inbox.credential_id = p_credential AND inbox.path = 'INBOX'
            AND canonical.raw_source = 'structured' AND canonical.structured_email_id = se.id), '[]') AS flags
      FROM structured_emails se
      WHERE se.user_id = p_user AND se.raw_content IS NOT NULL AND se.guard_blocked IS NOT TRUE
        AND (lower(se.recipient) = ANY(addresses)
          OR (split_part(lower(se.recipient), '@', 2) = ANY(domains) AND split_part(lower(se.recipient), '@', 1) <> 'dmarc')
          OR EXISTS (SELECT 1 FROM unnest(se.envelope_recipients) AS envelope(address)
            WHERE lower(envelope.address) = ANY(addresses)
              OR (split_part(lower(envelope.address), '@', 2) = ANY(domains)
                AND split_part(lower(envelope.address), '@', 1) <> 'dmarc')))
        AND CASE WHEN box.path = 'Junk' AND box.scope_id IS NULL THEN se.is_junk IS TRUE
          ELSE se.is_junk IS NOT TRUE AND (se.is_junk IS NOT NULL OR se.created_at < now() - interval '2 minutes') END
        AND NOT EXISTS (SELECT 1 FROM imap_mailbox_messages mm WHERE mm.mailbox_id = p_mailbox AND mm.structured_email_id = se.id)
        AND NOT EXISTS (SELECT 1 FROM imap_mailbox_removals r WHERE r.credential_id = p_credential AND r.structured_email_id = se.id)
    )
    INSERT INTO imap_mailbox_messages (id, mailbox_id, structured_email_id, uid, flags, internal_date, size, modseq)
    SELECT p_mailbox || ':' || (box.uid_next + rn - 1), p_mailbox, id, box.uid_next + rn - 1, flags, created_at, size, box.modseq + rn FROM candidates;
    GET DIAGNOSTICS inserted = ROW_COUNT;
    IF inserted > 0 THEN
      UPDATE imap_mailboxes SET uid_next = box.uid_next + inserted, modseq = box.modseq + inserted, updated_at = now() WHERE id = p_mailbox;
    END IF;
    IF box.path <> 'Junk' OR box.scope_id IS NOT NULL THEN
      SELECT min(se.created_at) + interval '2 minutes' INTO pending_at FROM structured_emails se
      WHERE se.user_id = p_user AND se.created_at >= now() - interval '2 minutes'
        AND se.is_junk IS NULL AND se.raw_content IS NOT NULL AND se.guard_blocked IS NOT TRUE
        AND (lower(se.recipient) = ANY(addresses)
          OR (split_part(lower(se.recipient), '@', 2) = ANY(domains) AND split_part(lower(se.recipient), '@', 1) <> 'dmarc')
          OR EXISTS (SELECT 1 FROM unnest(se.envelope_recipients) AS envelope(address)
            WHERE lower(envelope.address) = ANY(addresses)
              OR (split_part(lower(envelope.address), '@', 2) = ANY(domains)
                AND split_part(lower(envelope.address), '@', 1) <> 'dmarc')))
        AND NOT EXISTS (SELECT 1 FROM imap_mailbox_removals r WHERE r.credential_id = p_credential AND r.structured_email_id = se.id);
    END IF;
  END IF;
  UPDATE imap_mailboxes SET source_fingerprint = fingerprint, source_pending_at = pending_at WHERE id = p_mailbox;
  RETURN QUERY SELECT * FROM imap_mailboxes WHERE id = p_mailbox AND user_id = p_user AND credential_id = p_credential;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION imap_normalize_flags(text[]), imap_normalize_path(text) FROM PUBLIC;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'imap_gateway') THEN
    GRANT EXECUTE ON FUNCTION imap_normalize_flags(text[]), imap_normalize_path(text) TO imap_gateway;
  END IF;
END;
$$;
