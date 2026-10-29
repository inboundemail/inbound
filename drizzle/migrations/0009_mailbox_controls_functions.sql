ALTER TABLE mailbox_message_state ADD COLUMN spam_revision text;
--> statement-breakpoint
ALTER TABLE mailbox_message_state ADD COLUMN effective_junk boolean;
--> statement-breakpoint
ALTER TABLE mailbox_message_state ADD COLUMN spam_source_updated_at timestamp;
--> statement-breakpoint
CREATE FUNCTION imap_filter_text(p_text text)
RETURNS text LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE low integer := 0; high integer; middle integer;
BEGIN
  p_text := left(p_text, 65536);
  IF octet_length(p_text) <= 65536 OR p_text IS NULL THEN RETURN p_text; END IF;
  high := char_length(p_text);
  WHILE low < high LOOP
    middle := (low + high + 1) / 2;
    IF octet_length(left(p_text, middle)) <= 65536 THEN low := middle; ELSE high := middle - 1; END IF;
  END LOOP;
  RETURN left(p_text, low);
END;
$$;
--> statement-breakpoint
CREATE FUNCTION imap_filter_json(p_text text)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path = public, pg_temp AS $$
BEGIN
  IF p_text IS NULL OR octet_length(p_text) > 65536 THEN RETURN NULL; END IF;
  RETURN p_text::jsonb;
EXCEPTION WHEN invalid_text_representation THEN RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION imap_classification_summary(p_classification jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE summary jsonb := p_classification -> 'summary'; answers jsonb := p_classification -> 'answers';
  facts jsonb := coalesce(p_classification -> 'facts', '{}'); name text; answer jsonb; item jsonb; current boolean := true;
  level numeric; confidence numeric; probability numeric; total numeric; ge2 numeric; ge3 numeric; eq4 numeric; auth_failed boolean;
BEGIN
  IF jsonb_typeof(answers) IS DISTINCT FROM 'object' THEN RETURN summary; END IF;
  FOREACH name IN ARRAY ARRAY['spam','phishing','fraud','impersonation','malware','prompt_injection'] LOOP
    answer := answers -> name;
    IF NOT coalesce((summary -> name) ? 'base_level', false) THEN current := false; EXIT; END IF;
    IF answer ? 'score' THEN
      SELECT sum(value::numeric) INTO total FROM jsonb_each_text(coalesce(nullif(answer -> 'probabilities', 'null'), '{}'))
      WHERE btrim(key) ~ '^[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)([eE][+-]?[0-9]+)?$' OR btrim(key) = '';
      IF total > 0 AND NOT coalesce((summary -> name) ? 'p_ge3', false) THEN current := false; EXIT; END IF;
    END IF;
  END LOOP;
  IF current THEN RETURN summary; END IF;
  summary := '{}';
  FOREACH name IN ARRAY ARRAY['spam','phishing','fraud','impersonation','malware','prompt_injection'] LOOP
    answer := answers -> name;
    IF answer ? 'score' THEN
      level := least(4, greatest(0, floor((answer ->> 'score')::numeric + 0.5)));
      confidence := (answer ->> 'confidence')::numeric;
      item := jsonb_build_object('level', level, 'base_level', level, 'confidence', confidence);
      SELECT sum(value::numeric), sum(value::numeric) FILTER (WHERE coalesce(nullif(btrim(key), ''), '0')::numeric >= 2),
        sum(value::numeric) FILTER (WHERE coalesce(nullif(btrim(key), ''), '0')::numeric >= 3),
        sum(value::numeric) FILTER (WHERE coalesce(nullif(btrim(key), ''), '0')::numeric >= 4)
        INTO total, ge2, ge3, eq4 FROM jsonb_each_text(coalesce(nullif(answer -> 'probabilities', 'null'), '{}'))
        WHERE btrim(key) ~ '^[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)([eE][+-]?[0-9]+)?$' OR btrim(key) = '';
      IF total > 0 THEN item := item || jsonb_build_object('p_ge2', coalesce(ge2, 0) / total,
        'p_ge3', coalesce(ge3, 0) / total, 'p_eq4', coalesce(eq4, 0) / total); END IF;
    ELSE
      probability := (answer ->> 'noul')::numeric;
      level := CASE WHEN probability >= 0.9 THEN 4 WHEN probability >= 0.6 THEN 3 WHEN probability >= 0.4 THEN 2 WHEN probability >= 0.2 THEN 1 ELSE 0 END;
      item := jsonb_build_object('level', level, 'base_level', level, 'confidence', coalesce(abs(2 * probability - 1), 0));
    END IF;
    summary := summary || jsonb_build_object(name, item);
  END LOOP;
  auth_failed := facts ->> 'dmarc' = 'FAIL' OR (facts ->> 'spf' = 'FAIL' AND facts ->> 'dkim' = 'FAIL');
  FOREACH name IN ARRAY ARRAY['spam','phishing','fraud','impersonation','malware','prompt_injection'] LOOP
    item := summary -> name; level := (item ->> 'level')::numeric;
    IF name = 'phishing' THEN
      IF auth_failed AND (facts ->> 'reply_to_differs_from_sender')::boolean THEN level := level + 1; END IF;
      IF auth_failed AND (facts ->> 'display_name_contains_other_address')::boolean THEN level := level + 1; END IF;
    ELSIF name = 'impersonation' THEN
      IF auth_failed AND (facts ->> 'display_name_contains_other_address')::boolean THEN level := level + 1; END IF;
      IF auth_failed AND level >= 2 THEN level := level + 1; END IF;
    ELSIF name = 'fraud' AND (facts ->> 'reply_to_differs_from_sender')::boolean AND level >= 2 THEN level := level + 1;
    ELSIF name = 'malware' AND facts ->> 'ses_virus' = 'FAIL' THEN
      level := 4; item := item || '{"base_level":4,"confidence":1}'::jsonb;
    ELSIF name = 'spam' AND facts ->> 'ses_spam' = 'FAIL' THEN level := greatest(level, 3);
    END IF;
    summary := jsonb_set(summary, ARRAY[name], item || jsonb_build_object('level', least(4, greatest(0, level))));
  END LOOP;
  RETURN summary || jsonb_build_object('risk', greatest((summary #>> '{phishing,level}')::numeric,
    (summary #>> '{fraud,level}')::numeric, (summary #>> '{impersonation,level}')::numeric,
    (summary #>> '{malware,level}')::numeric, (summary #>> '{prompt_injection,level}')::numeric,
    least((summary #>> '{spam,level}')::numeric, 2)));
EXCEPTION WHEN OTHERS THEN RETURN p_classification -> 'summary';
END;
$$;
--> statement-breakpoint
CREATE FUNCTION imap_spam_policy(p_user text, p_credential text)
RETURNS TABLE(revision text, level text, default_policy boolean, allow_addresses text[], allow_domains text[], block_addresses text[], block_domains text[])
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public, pg_temp AS $$
  WITH credential AS MATERIALIZED (
    SELECT spam_level, spam_allow, spam_block FROM imap_credentials WHERE id = p_credential AND user_id = p_user
  ), patterns AS MATERIALIZED (
    SELECT lower(value) AS pattern, true AS allowed FROM credential, unnest(spam_allow[1:1000]) AS entries(value)
    UNION ALL SELECT lower(value), false FROM credential, unnest(spam_block[1:1000]) AS entries(value)
  )
  SELECT md5(jsonb_build_array(spam_level, spam_allow, spam_block)::text), spam_level,
    spam_level IS NULL AND coalesce(cardinality(spam_allow), 0) = 0 AND coalesce(cardinality(spam_block), 0) = 0,
    ARRAY(SELECT pattern FROM patterns WHERE allowed AND strpos(pattern, '@') > 1),
    ARRAY(SELECT ltrim(pattern, '@') FROM patterns WHERE allowed AND strpos(pattern, '@') <= 1),
    ARRAY(SELECT pattern FROM patterns WHERE NOT allowed AND strpos(pattern, '@') > 1),
    ARRAY(SELECT ltrim(pattern, '@') FROM patterns WHERE NOT allowed AND strpos(pattern, '@') <= 1)
  FROM credential;
$$;
--> statement-breakpoint
CREATE FUNCTION imap_mailbox_junk_prepared(p_default boolean, p_reason text, p_from text, p_classification text,
  p_level text, p_allow_addresses text[], p_allow_domains text[], p_block_addresses text[], p_block_domains text[], p_override boolean)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE sender text; classification jsonb; summary jsonb; dimension jsonb; confident boolean; junk boolean;
  ses_spam text; ses_virus text;
BEGIN
  IF p_override IS NOT NULL THEN RETURN p_override; END IF;
  IF cardinality(p_allow_addresses) > 0 OR cardinality(p_allow_domains) > 0 OR cardinality(p_block_addresses) > 0 OR cardinality(p_block_domains) > 0 THEN
    sender := lower(imap_filter_json(p_from) #>> '{addresses,0,address}');
    IF sender = ANY(p_allow_addresses) OR split_part(sender, '@', 2) = ANY(p_allow_domains) THEN RETURN false; END IF;
    IF sender = ANY(p_block_addresses) OR split_part(sender, '@', 2) = ANY(p_block_domains) THEN RETURN true; END IF;
  END IF;
  IF p_reason IN ('user', 'guard_rule') THEN RETURN p_default; END IF;
  IF p_level IS NULL THEN RETURN p_default; END IF;
  IF p_level = 'off' THEN RETURN false; END IF;
  IF p_level NOT IN ('lenient', 'standard', 'strict') THEN RETURN p_default; END IF;
  classification := imap_filter_json(p_classification);
  ses_spam := upper(classification #>> '{facts,ses_spam}');
  ses_virus := upper(classification #>> '{facts,ses_virus}');
  IF ses_spam = 'FAIL' THEN RETURN true; END IF;
  IF p_reason = 'ses_spam' AND ses_spam IS NULL THEN RETURN p_default; END IF;
  summary := imap_classification_summary(classification);
  IF summary IS NULL OR jsonb_typeof(summary) <> 'object' THEN
    IF ses_virus = 'FAIL' THEN RETURN true; END IF;
    RETURN p_default;
  END IF;
  FOR dimension IN SELECT value FROM jsonb_each(summary)
    WHERE key IN ('spam', 'phishing', 'fraud', 'malware', 'impersonation')
  LOOP
    confident := (dimension ->> 'confidence')::numeric >= 0.6
      AND coalesce(dimension ->> 'base_level', dimension ->> 'level')::numeric >= 2;
    IF dimension ?& ARRAY['p_ge2', 'p_ge3', 'p_eq4'] THEN
      junk := CASE p_level WHEN 'lenient' THEN (dimension ->> 'p_eq4')::numeric >= 0.7
        WHEN 'standard' THEN (dimension ->> 'p_ge3')::numeric >= 0.7
        ELSE (dimension ->> 'level')::numeric >= 3 OR (dimension ->> 'p_ge3')::numeric >= 0.5
          OR (dimension ->> 'p_ge2')::numeric >= 0.7 END;
    ELSE
      junk := CASE p_level WHEN 'lenient' THEN (dimension ->> 'level')::numeric >= 4 AND confident
        WHEN 'standard' THEN (dimension ->> 'level')::numeric >= 3 AND confident
        ELSE (dimension ->> 'level')::numeric >= 3 OR ((dimension ->> 'level')::numeric >= 2 AND confident) END;
    END IF;
    IF junk THEN RETURN true; END IF;
  END LOOP;
  RETURN false;
EXCEPTION WHEN OTHERS THEN RETURN p_default;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION imap_mailbox_junk(p_default boolean, p_reason text, p_from text, p_classification text,
  p_level text, p_allow text[], p_block text[], p_override boolean)
RETURNS boolean LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path = public, pg_temp AS $$
  WITH patterns AS MATERIALIZED (
    SELECT lower(value) AS pattern, true AS allowed FROM unnest(p_allow[1:1000]) AS entries(value)
    UNION ALL SELECT lower(value), false FROM unnest(p_block[1:1000]) AS entries(value)
  )
  SELECT imap_mailbox_junk_prepared(p_default, p_reason, p_from, p_classification, p_level,
    ARRAY(SELECT pattern FROM patterns WHERE allowed AND strpos(pattern, '@') > 1),
    ARRAY(SELECT ltrim(pattern, '@') FROM patterns WHERE allowed AND strpos(pattern, '@') <= 1),
    ARRAY(SELECT pattern FROM patterns WHERE NOT allowed AND strpos(pattern, '@') > 1),
    ARRAY(SELECT ltrim(pattern, '@') FROM patterns WHERE NOT allowed AND strpos(pattern, '@') <= 1), p_override);
$$;
--> statement-breakpoint
CREATE FUNCTION imap_filter_condition(p_email jsonb, p_condition jsonb, p_junk boolean)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE field text := p_condition ->> 'field'; operation text := p_condition ->> 'operator';
  wanted text := lower(p_condition ->> 'value'); values text[]; candidate text; hit boolean; matched boolean := false;
BEGIN
  CASE field
    WHEN 'from', 'to', 'cc' THEN
      SELECT array_agg(lower(a ->> 'address')) INTO values
      FROM jsonb_array_elements(coalesce(p_email -> field -> 'addresses', '[]'::jsonb)) a;
    WHEN 'recipient' THEN
      SELECT array_agg(lower(value)) INTO values FROM jsonb_array_elements_text(p_email -> 'recipient') AS v(value);
    WHEN 'subject', 'body' THEN values := ARRAY[lower(p_email ->> field)];
    WHEN 'header' THEN
      SELECT array_agg(lower(CASE WHEN jsonb_typeof(value) = 'string' THEN value #>> '{}' ELSE value::text END)) INTO values
      FROM jsonb_each(coalesce(p_email -> 'headers', '{}'::jsonb)) WHERE lower(key) = lower(p_condition ->> 'header');
    WHEN 'has_attachment' THEN values := ARRAY[p_email ->> 'has_attachment'];
    WHEN 'size' THEN values := ARRAY[p_email ->> 'size'];
    WHEN 'junk' THEN values := ARRAY[coalesce(p_junk, false)::text];
    WHEN 'jev' THEN values := ARRAY[p_email -> 'jev' -> (p_condition ->> 'label') ->> 'level'];
    ELSE RAISE EXCEPTION 'Invalid filter field';
  END CASE;
  IF operation NOT IN ('contains', 'not_contains', 'equals', 'not_equals', 'starts_with', 'ends_with', 'domain_is', 'greater_than', 'less_than', 'gte', 'exists')
    OR operation IS NULL OR (operation <> 'exists' AND wanted IS NULL) THEN RAISE EXCEPTION 'Invalid filter operator'; END IF;
  FOREACH candidate IN ARRAY coalesce(values, '{}') LOOP
    hit := coalesce(CASE operation
      WHEN 'exists' THEN candidate IS NOT NULL AND candidate <> ''
      WHEN 'contains' THEN strpos(candidate, wanted) > 0
      WHEN 'not_contains' THEN strpos(candidate, wanted) > 0
      WHEN 'equals' THEN candidate = wanted
      WHEN 'not_equals' THEN candidate = wanted
      WHEN 'starts_with' THEN left(candidate, char_length(wanted)) = wanted
      WHEN 'ends_with' THEN right(candidate, char_length(wanted)) = wanted
      WHEN 'domain_is' THEN split_part(candidate, '@', 2) = ltrim(wanted, '@')
      WHEN 'greater_than' THEN candidate::numeric > wanted::numeric
      WHEN 'less_than' THEN candidate::numeric < wanted::numeric
      WHEN 'gte' THEN candidate::numeric >= wanted::numeric END, false);
    matched := matched OR hit;
  END LOOP;
  IF operation = 'exists' THEN RETURN matched = coalesce(wanted::boolean, true); END IF;
  RETURN CASE WHEN operation IN ('not_contains', 'not_equals') THEN NOT matched ELSE matched END;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION imap_filter_rules(p_user text, p_credential text, p_filter text DEFAULT NULL)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public, pg_temp AS $$
  WITH rules AS MATERIALIZED (
    SELECT f.id, f.position, f.match, f.conditions, f.actions, f.stop_processing, f.updated_at
    FROM mailbox_filters f WHERE f.user_id = p_user AND f.credential_id = p_credential AND f.enabled
    ORDER BY f.position, f.id LIMIT 100
  ), revision AS MATERIALIZED (
    SELECT md5(coalesce(jsonb_agg(to_jsonb(rules) ORDER BY position, id), '[]'::jsonb)::text) AS value FROM rules
  )
  SELECT coalesce(jsonb_agg(to_jsonb(rules) || jsonb_build_object('revision', revision.value) ORDER BY rules.position, rules.id), '[]'::jsonb)
  FROM rules CROSS JOIN revision WHERE p_filter IS NULL OR rules.id = p_filter;
$$;
--> statement-breakpoint
CREATE FUNCTION imap_evaluate_filters(p_email jsonb, p_rules jsonb, p_folders jsonb, p_junk boolean,
  p_override boolean, p_flags text[], p_destination text, p_versions jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE rule jsonb; condition jsonb; action jsonb; matched boolean; hit boolean; stop boolean := false;
  rule_index integer; condition_index integer; action_index integer; current_versions jsonb;
  flags text[] := coalesce(p_flags, '{}'); destination text := p_destination; junk boolean := p_junk;
  override boolean := p_override; versions jsonb := coalesce(p_versions, '{}'); target text;
  moved boolean := false; seen boolean; old_flags text[]; old_destination text; old_junk boolean;
  old_override boolean; old_stop boolean; old_moved boolean;
BEGIN
  IF jsonb_array_length(p_rules) > 100 THEN RAISE EXCEPTION 'Too many filters'; END IF;
  SELECT coalesce(jsonb_object_agg(value ->> 'id', value ->> 'revision'), '{}') INTO current_versions FROM jsonb_array_elements(p_rules);
  IF versions @> current_versions THEN
    RETURN jsonb_build_object('flags', flags, 'destination', destination, 'junk', override, 'versions', versions, 'move', false);
  END IF;
  FOR rule_index IN 0..jsonb_array_length(p_rules) - 1 LOOP
    rule := p_rules -> rule_index;
    IF stop THEN CONTINUE; END IF;
    seen := coalesce(versions ->> (rule ->> 'id') = rule ->> 'revision', false);
    old_flags := flags; old_destination := destination; old_junk := junk;
    old_override := override; old_stop := stop; old_moved := moved;
    BEGIN
    IF jsonb_array_length(rule -> 'conditions') NOT BETWEEN 1 AND 20
      OR jsonb_array_length(rule -> 'actions') NOT BETWEEN 1 AND 20
      OR rule ->> 'match' NOT IN ('all', 'any') THEN RAISE EXCEPTION 'Invalid filter'; END IF;
    matched := rule ->> 'match' = 'all';
    FOR condition_index IN 0..jsonb_array_length(rule -> 'conditions') - 1 LOOP
      condition := rule -> 'conditions' -> condition_index;
      hit := imap_filter_condition(p_email, condition, junk);
      IF rule ->> 'match' = 'all' THEN matched := matched AND hit; ELSE matched := matched OR hit; END IF;
    END LOOP;
    IF NOT matched THEN CONTINUE; END IF;
    FOR action_index IN 0..jsonb_array_length(rule -> 'actions') - 1 LOOP
      action := rule -> 'actions' -> action_index;
      CASE action ->> 'type'
        WHEN 'mark_read' THEN flags := array_append(flags, '\Seen');
        WHEN 'flag' THEN flags := array_append(flags, '\Flagged');
        WHEN 'add_keyword' THEN
          IF left(action ->> 'value', 1) = '\' OR char_length(action ->> 'value') > 255 THEN RAISE EXCEPTION 'Invalid keyword'; END IF;
          flags := array_append(flags, action ->> 'value');
        WHEN 'mark_junk' THEN override := true; junk := true; destination := NULL; moved := true;
        WHEN 'mark_not_junk' THEN override := false; junk := false; destination := NULL; moved := true;
        WHEN 'move_to', 'move_to_trash' THEN
          target := CASE WHEN action ->> 'type' = 'move_to_trash' THEN 'Trash' ELSE action ->> 'value' END;
          destination := p_folders ->> target;
          IF destination IS NULL THEN RAISE EXCEPTION 'Filter destination not found'; END IF;
          moved := true;
          IF destination = p_folders ->> 'Junk' THEN override := true; junk := true; destination := NULL;
          ELSIF destination = p_folders ->> 'INBOX' THEN override := false; junk := false; destination := NULL; END IF;
        WHEN 'stop' THEN stop := true; EXIT;
        ELSE RAISE EXCEPTION 'Invalid filter action';
      END CASE;
    END LOOP;
    flags := imap_normalize_flags(flags);
    stop := stop OR coalesce((rule ->> 'stop_processing')::boolean, false);
    IF seen THEN
      flags := old_flags; destination := old_destination; junk := old_junk; override := old_override; moved := old_moved;
    END IF;
    EXCEPTION WHEN OTHERS THEN
      flags := old_flags; destination := old_destination; junk := old_junk;
      override := old_override; stop := old_stop; moved := old_moved;
    END;
  END LOOP;
  RETURN jsonb_build_object('flags', flags, 'destination', destination, 'junk', override, 'versions', versions || current_versions, 'move', moved);
EXCEPTION WHEN OTHERS THEN
  SELECT coalesce(p_versions, '{}') || coalesce(jsonb_object_agg(value ->> 'id', value ->> 'revision'), '{}')
    INTO versions FROM jsonb_array_elements(p_rules);
  RETURN jsonb_build_object('flags', coalesce(p_flags, '{}'), 'destination', p_destination, 'junk', p_override, 'versions', versions, 'move', false);
END;
$$;
--> statement-breakpoint
CREATE FUNCTION imap_filter_email(p_from text, p_to text, p_cc text, p_recipients text[], p_subject text,
  p_headers text, p_body text, p_attachments text, p_size integer, p_classification text)
RETURNS jsonb LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path = public, pg_temp AS $$
  SELECT jsonb_build_object('from', imap_filter_json(p_from), 'to', imap_filter_json(p_to), 'cc', imap_filter_json(p_cc),
    'recipient', to_jsonb(coalesce(p_recipients, '{}')), 'subject', imap_filter_text(p_subject),
    'headers', coalesce(imap_filter_json(p_headers), '{}'::jsonb), 'body', imap_filter_text(p_body),
    'has_attachment', coalesce(imap_filter_json(p_attachments) <> '[]'::jsonb, false), 'size', p_size,
    'jev', imap_classification_summary(imap_filter_json(p_classification)));
$$;
--> statement-breakpoint
CREATE FUNCTION imap_invalidate_spam_settings()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
BEGIN
  IF (NEW.spam_level, NEW.spam_allow, NEW.spam_block) IS DISTINCT FROM (OLD.spam_level, OLD.spam_allow, OLD.spam_block) THEN
    PERFORM pg_notify('imap_state_changed', 'cred:' || NEW.id);
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER imap_invalidate_spam_settings AFTER UPDATE OF spam_level, spam_allow, spam_block ON imap_credentials
FOR EACH ROW EXECUTE FUNCTION imap_invalidate_spam_settings();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION imap_lock(p_user text, p_credential text, p_mailboxes text[], p_views boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM imap_authorize(p_user, p_credential);
  PERFORM mb.id FROM imap_mailboxes mb
  WHERE mb.user_id = p_user AND mb.credential_id = p_credential AND (mb.id = ANY(p_mailboxes)
    OR (p_views AND (mb.path IN ('INBOX', 'Junk') OR mb.scope_id IS NOT NULL
      OR EXISTS (SELECT 1 FROM mailbox_filters f CROSS JOIN LATERAL jsonb_array_elements(f.actions) a
        WHERE f.user_id = p_user AND f.credential_id = p_credential AND f.enabled
          AND ((a ->> 'type' = 'move_to' AND a ->> 'value' IN (mb.id, mb.path))
            OR (a ->> 'type' = 'move_to_trash' AND mb.path = 'Trash')))
      OR EXISTS (SELECT 1 FROM mailbox_message_state state
        WHERE state.credential_id = p_credential AND state.filter_mailbox_id = mb.id))))
  ORDER BY mb.id FOR UPDATE;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION imap_reconcile_filters(p_user text, p_credential text, p_ids text[], p_source text)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp SET plan_cache_mode = force_custom_plan AS $$
DECLARE addresses text[]; domains text[];
BEGIN
  PERFORM imap_lock(p_user, p_credential, ARRAY[p_source], true);
  SELECT v.addresses, v.domains INTO addresses, domains FROM imap_scope_visibility(p_user, p_credential) v WHERE v.scope_id IS NULL;
  WITH misplaced AS MATERIALIZED (
    SELECT mm.*, destination.id AS destination_id
    FROM imap_mailboxes mb JOIN imap_mailbox_messages mm ON mm.mailbox_id = mb.id
    JOIN mailbox_message_state state ON state.credential_id = p_credential AND state.structured_email_id = mm.structured_email_id
    JOIN imap_mailboxes destination ON destination.user_id = p_user AND destination.credential_id = p_credential
      AND destination.scope_id IS NULL AND destination.path NOT LIKE 'Scopes/%'
      AND CASE WHEN state.filter_mailbox_id IS NOT NULL THEN destination.id = state.filter_mailbox_id
        ELSE destination.path = CASE WHEN coalesce(state.effective_junk, (SELECT se.is_junk FROM structured_emails se
          WHERE se.id = state.structured_email_id AND se.user_id = p_user)) IS TRUE THEN 'Junk' ELSE 'INBOX' END END
    WHERE mb.user_id = p_user AND mb.credential_id = p_credential AND mb.scope_id IS NULL
      AND (mb.path IN ('INBOX', 'Junk') OR mb.id = p_source) AND mm.raw_source = 'structured'
      AND (p_ids IS NULL OR mm.structured_email_id = ANY(p_ids)) AND state.spam_revision IS NOT NULL
      AND destination.id <> mb.id
  ), proposed AS MATERIALIZED (
    SELECT misplaced.* FROM misplaced JOIN structured_emails se ON se.id = misplaced.structured_email_id AND se.user_id = p_user
    WHERE se.guard_blocked IS NOT TRUE
      AND (lower(se.recipient) = ANY(addresses)
        OR (cardinality(domains) > 0 AND split_part(lower(se.recipient), '@', 2) = ANY(domains) AND split_part(lower(se.recipient), '@', 1) <> 'dmarc')
        OR (se.envelope_recipients IS DISTINCT FROM ARRAY[se.recipient::text]
          AND EXISTS (SELECT 1 FROM unnest(se.envelope_recipients) AS envelope(address) WHERE lower(envelope.address) = ANY(addresses)
            OR (cardinality(domains) > 0 AND split_part(lower(envelope.address), '@', 2) = ANY(domains) AND split_part(lower(envelope.address), '@', 1) <> 'dmarc'))))
  ), removed AS (
    DELETE FROM imap_mailbox_messages mm USING proposed WHERE mm.id = proposed.id RETURNING mm.id
  ), candidates AS MATERIALIZED (
    SELECT DISTINCT ON (p.destination_id, p.structured_email_id) p.* FROM proposed p JOIN removed USING (id)
    WHERE NOT EXISTS (SELECT 1 FROM imap_mailbox_messages target
      WHERE target.mailbox_id = p.destination_id AND target.structured_email_id = p.structured_email_id)
    ORDER BY p.destination_id, p.structured_email_id, (p.mailbox_id = p_source) DESC NULLS LAST, p.uid, p.id
  ), numbered AS (
    SELECT candidates.*, row_number() OVER (PARTITION BY destination_id ORDER BY internal_date, structured_email_id)::integer AS rn
    FROM candidates
  ), bumped AS (
    UPDATE imap_mailboxes mb SET uid_next = mb.uid_next + counts.total, modseq = mb.modseq + counts.total, updated_at = now()
    FROM (SELECT destination_id, count(*)::integer AS total FROM candidates GROUP BY destination_id) counts
    WHERE mb.id = counts.destination_id RETURNING mb.id, mb.uid_next - counts.total AS first_uid, mb.modseq - counts.total AS first_modseq
  )
  INSERT INTO imap_mailbox_messages (id, mailbox_id, structured_email_id, raw_source, uid, flags, internal_date, size, modseq)
  SELECT b.id || ':' || (b.first_uid + n.rn - 1), b.id, n.structured_email_id, n.raw_source,
    b.first_uid + n.rn - 1, n.flags, n.internal_date, n.size, b.first_modseq + n.rn
  FROM numbered n JOIN bumped b ON b.id = n.destination_id;
  WITH hidden AS (
    SELECT mm.id FROM imap_mailboxes mb JOIN imap_mailbox_messages mm ON mm.mailbox_id = mb.id
    JOIN structured_emails se ON se.id = mm.structured_email_id AND se.user_id = p_user
    LEFT JOIN mailbox_message_state state ON state.credential_id = p_credential AND state.structured_email_id = se.id
    WHERE mb.user_id = p_user AND mb.credential_id = p_credential AND mb.scope_id IS NOT NULL AND mm.raw_source = 'structured'
      AND (p_ids IS NULL OR se.id = ANY(p_ids)) AND state.spam_revision IS NOT NULL
      AND (state.filter_mailbox_id IS NOT NULL OR coalesce(state.effective_junk, se.is_junk) IS TRUE)
  )
  DELETE FROM imap_mailbox_messages mm USING hidden WHERE mm.id = hidden.id;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION imap_reconcile(p_user text, p_credential text, p_ids text[] DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM imap_reconcile_filters(p_user, p_credential, p_ids, NULL);
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION imap_sync(p_user text, p_credential text, p_mailbox text)
RETURNS SETOF imap_mailboxes LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp SET plan_cache_mode = force_custom_plan SET jit = off AS $$
DECLARE box imap_mailboxes; checkpoint imap_mailboxes; floor integer; addresses text[]; domains text[]; fingerprint text; scanned_fingerprint text; pending_at timestamp;
  rules jsonb; folders jsonb; policy record; pending_ids text[]; backlog boolean; hidden_ids text[]; hidden_mailboxes text[];
BEGIN
  PERFORM imap_authorize(p_user, p_credential);
  PERFORM imap_ensure(p_user, p_credential);
  SELECT * INTO box FROM imap_mailboxes WHERE id = p_mailbox AND user_id = p_user AND credential_id = p_credential;
  IF NOT FOUND THEN RAISE EXCEPTION 'Mailbox not found'; END IF;
  SELECT * INTO checkpoint FROM imap_mailboxes WHERE user_id = p_user AND credential_id = p_credential AND path = 'INBOX';
  SELECT v.addresses, v.domains INTO addresses, domains FROM imap_scope_visibility(p_user, p_credential) v WHERE v.scope_id IS NULL;
  SELECT md5(jsonb_build_array(spam_level, spam_allow, spam_block)::text) INTO fingerprint
    FROM imap_credentials WHERE id = p_credential AND user_id = p_user;
  SELECT md5(fingerprint || ':' || coalesce(string_agg(v.scope_key || ':' || v.revision, ',' ORDER BY v.scope_key), '')) INTO fingerprint
  FROM imap_source_versions v WHERE v.user_id = p_user AND v.scope_key = ANY(ARRAY(
    SELECT 'a:' || md5(address) FROM unnest(addresses) AS scopes(address)
    UNION ALL SELECT 'd:' || md5(domain) FROM unnest(domains) AS scopes(domain)));
  scanned_fingerprint := fingerprint;
  IF checkpoint.source_fingerprint IS DISTINCT FROM fingerprint OR checkpoint.source_pending_at <= now() THEN
    SELECT array_agg(mm.id), array_agg(DISTINCT mb.id) INTO hidden_ids, hidden_mailboxes
    FROM imap_mailbox_messages mm JOIN imap_mailboxes mb ON mm.mailbox_id = mb.id
    WHERE mb.user_id = p_user AND mb.credential_id = p_credential AND mm.raw_source = 'structured'
      AND NOT EXISTS (SELECT 1 FROM structured_emails se WHERE se.id = mm.structured_email_id AND se.user_id = p_user
        AND se.guard_blocked IS NOT TRUE AND (lower(se.recipient) = ANY(addresses)
          OR (split_part(lower(se.recipient), '@', 2) = ANY(domains) AND split_part(lower(se.recipient), '@', 1) <> 'dmarc')
          OR EXISTS (SELECT 1 FROM unnest(se.envelope_recipients) AS envelope(address) WHERE lower(envelope.address) = ANY(addresses)
            OR (split_part(lower(envelope.address), '@', 2) = ANY(domains) AND split_part(lower(envelope.address), '@', 1) <> 'dmarc'))));
  END IF;
  PERFORM imap_lock(p_user, p_credential, ARRAY[p_mailbox] || coalesce(hidden_mailboxes, '{}'), true);
  PERFORM imap_authorize(p_user, p_credential);
  SELECT * INTO box FROM imap_mailboxes WHERE id = p_mailbox AND user_id = p_user AND credential_id = p_credential;
  IF NOT FOUND THEN RAISE EXCEPTION 'Mailbox not found'; END IF;
  SELECT * INTO checkpoint FROM imap_mailboxes WHERE user_id = p_user AND credential_id = p_credential AND path = 'INBOX';
  SELECT * INTO policy FROM imap_spam_policy(p_user, p_credential);
  SELECT v.addresses, v.domains INTO addresses, domains FROM imap_scope_visibility(p_user, p_credential) v WHERE v.scope_id IS NULL;
  SELECT md5(policy.revision || ':' || coalesce(string_agg(v.scope_key || ':' || v.revision, ',' ORDER BY v.scope_key), '')) INTO fingerprint
  FROM imap_source_versions v WHERE v.user_id = p_user AND v.scope_key = ANY(ARRAY(
    SELECT 'a:' || md5(address) FROM unnest(addresses) AS scopes(address)
    UNION ALL SELECT 'd:' || md5(domain) FROM unnest(domains) AS scopes(domain)));
  SELECT max(e.modseq) INTO floor FROM imap_mailbox_expunges e WHERE e.mailbox_id = p_mailbox AND e.created_at < now() - interval '7 days';
  IF floor IS NOT NULL THEN
    UPDATE imap_mailboxes SET expunge_floor = greatest(expunge_floor, floor) WHERE id = p_mailbox;
    DELETE FROM imap_mailbox_expunges WHERE mailbox_id = p_mailbox AND created_at < now() - interval '7 days';
  END IF;
  IF checkpoint.source_fingerprint = fingerprint AND (checkpoint.source_pending_at IS NULL OR checkpoint.source_pending_at > now()) THEN
    RETURN QUERY SELECT * FROM imap_mailboxes WHERE id = p_mailbox AND user_id = p_user AND credential_id = p_credential;
    RETURN;
  END IF;
  rules := imap_filter_rules(p_user, p_credential);
  SELECT coalesce(jsonb_object_agg(key, id), '{}') INTO folders FROM (
    SELECT mb.id::text, unnest(ARRAY[mb.id::text, mb.path::text]) AS key FROM imap_mailboxes mb
    WHERE mb.user_id = p_user AND mb.credential_id = p_credential AND mb.scope_id IS NULL AND mb.path <> 'Scopes' AND mb.path NOT LIKE 'Scopes/%'
  ) targets;
  DELETE FROM imap_mailbox_messages mm WHERE mm.id = ANY(hidden_ids)
    AND NOT EXISTS (SELECT 1 FROM structured_emails se WHERE se.id = mm.structured_email_id AND se.user_id = p_user
      AND se.guard_blocked IS NOT TRUE AND (lower(se.recipient) = ANY(addresses)
        OR (split_part(lower(se.recipient), '@', 2) = ANY(domains) AND split_part(lower(se.recipient), '@', 1) <> 'dmarc')
        OR EXISTS (SELECT 1 FROM unnest(se.envelope_recipients) AS envelope(address) WHERE lower(envelope.address) = ANY(addresses)
          OR (split_part(lower(envelope.address), '@', 2) = ANY(domains) AND split_part(lower(envelope.address), '@', 1) <> 'dmarc'))));
  SELECT array_agg(pending.id ORDER BY pending.created_at DESC, pending.id) INTO pending_ids FROM (
    SELECT se.id, se.created_at
    FROM structured_emails se LEFT JOIN mailbox_message_state state
      ON state.credential_id = p_credential AND state.structured_email_id = se.id
    WHERE se.user_id = p_user AND se.raw_content IS NOT NULL AND se.guard_blocked IS NOT TRUE
      AND (state.initialized IS NOT TRUE OR state.spam_revision IS DISTINCT FROM policy.revision
        OR (NOT policy.default_policy AND state.junk_override IS NULL AND state.spam_source_updated_at IS DISTINCT FROM se.junk_updated_at))
      AND (lower(se.recipient) = ANY(addresses)
        OR (cardinality(domains) > 0 AND split_part(lower(se.recipient), '@', 2) = ANY(domains) AND split_part(lower(se.recipient), '@', 1) <> 'dmarc')
        OR (se.envelope_recipients IS DISTINCT FROM ARRAY[se.recipient::text]
          AND EXISTS (SELECT 1 FROM unnest(se.envelope_recipients) AS envelope(address) WHERE lower(envelope.address) = ANY(addresses)
            OR (cardinality(domains) > 0 AND split_part(lower(envelope.address), '@', 2) = ANY(domains) AND split_part(lower(envelope.address), '@', 1) <> 'dmarc'))))
      AND NOT EXISTS (SELECT 1 FROM imap_mailbox_removals r WHERE r.credential_id = p_credential AND r.structured_email_id = se.id)
      AND (state.initialized OR se.created_at < now() - interval '2 minutes' OR se.is_junk IS NOT NULL
        OR state.junk_override IS NOT NULL OR policy.level = 'off' OR se.jev_classification IS NOT NULL
        OR cardinality(policy.allow_addresses) > 0 OR cardinality(policy.allow_domains) > 0
        OR cardinality(policy.block_addresses) > 0 OR cardinality(policy.block_domains) > 0)
    ORDER BY se.created_at DESC, se.id LIMIT 501
  ) pending;
  backlog := coalesce(cardinality(pending_ids), 0) > 500;
  WITH candidates AS MATERIALIZED (
    SELECT se.id, se.created_at, se.junk_updated_at, state.initialized, state.junk_override, state.filter_versions, state.filter_flags, state.filter_mailbox_id,
      se.from_data, se.to_data, se.cc_data, se.envelope_recipients, se.recipient, se.subject, se.headers,
      coalesce(se.text_body, se.html_body) AS body, se.attachments, octet_length(se.raw_content) AS size, se.jev_classification,
      CASE WHEN policy.default_policy THEN coalesce(state.junk_override, se.is_junk)
        ELSE imap_mailbox_junk_prepared(se.is_junk, se.junk_reason, se.from_data, se.jev_classification,
          policy.level, policy.allow_addresses, policy.allow_domains, policy.block_addresses, policy.block_domains, state.junk_override) END AS effective_junk
    FROM structured_emails se LEFT JOIN mailbox_message_state state
      ON state.credential_id = p_credential AND state.structured_email_id = se.id
    WHERE se.user_id = p_user AND se.id = ANY(pending_ids[1:500]) AND se.raw_content IS NOT NULL AND se.guard_blocked IS NOT TRUE
  ), evaluated AS MATERIALIZED (
    SELECT se.id, se.junk_updated_at, se.effective_junk, CASE WHEN se.initialized OR rules = '[]'::jsonb OR EXISTS (
      SELECT 1 FROM imap_mailboxes mb JOIN imap_mailbox_messages mm ON mm.mailbox_id = mb.id
      WHERE mb.user_id = p_user AND mb.credential_id = p_credential AND mm.raw_source = 'structured' AND mm.structured_email_id = se.id)
      THEN jsonb_build_object('junk', se.junk_override, 'versions', coalesce(se.filter_versions, '{}'),
        'flags', coalesce(se.filter_flags, '{}'), 'destination', se.filter_mailbox_id)
      ELSE imap_evaluate_filters(imap_filter_email(se.from_data, se.to_data, se.cc_data,
        array_append(coalesce(se.envelope_recipients, '{}'), se.recipient), se.subject, se.headers,
        se.body, se.attachments, se.size, se.jev_classification), rules, folders, se.effective_junk,
        se.junk_override, se.filter_flags, se.filter_mailbox_id, se.filter_versions) END AS result
    FROM candidates se WHERE se.initialized OR se.effective_junk IS NOT NULL OR se.created_at < now() - interval '2 minutes'
  )
  INSERT INTO mailbox_message_state (credential_id, structured_email_id, junk_override, filter_versions, filter_flags, filter_mailbox_id, initialized,
    spam_revision, effective_junk, spam_source_updated_at)
  SELECT p_credential, id, (result ->> 'junk')::boolean, result -> 'versions',
    ARRAY(SELECT jsonb_array_elements_text(result -> 'flags')), result ->> 'destination', true, policy.revision,
    coalesce((result ->> 'junk')::boolean, CASE WHEN policy.default_policy THEN NULL ELSE effective_junk END), junk_updated_at FROM evaluated
  ON CONFLICT (credential_id, structured_email_id) DO UPDATE SET junk_override = excluded.junk_override,
    filter_versions = excluded.filter_versions, filter_flags = excluded.filter_flags, filter_mailbox_id = excluded.filter_mailbox_id, initialized = true,
    spam_revision = excluded.spam_revision, effective_junk = excluded.effective_junk, spam_source_updated_at = excluded.spam_source_updated_at;
  PERFORM imap_reconcile(p_user, p_credential);
  WITH visibility AS MATERIALIZED (SELECT * FROM imap_scope_visibility(p_user, p_credential)),
  placements AS MATERIALIZED (
    SELECT mb.id AS mailbox_id, mb.scope_id, state.structured_email_id, state.filter_flags
    FROM mailbox_message_state state JOIN imap_mailboxes mb ON mb.user_id = p_user AND mb.credential_id = p_credential
      AND CASE WHEN state.filter_mailbox_id IS NOT NULL THEN mb.id = state.filter_mailbox_id
        WHEN coalesce(state.effective_junk, (SELECT se.is_junk FROM structured_emails se
          WHERE se.id = state.structured_email_id AND se.user_id = p_user)) IS TRUE THEN mb.path = 'Junk' AND mb.scope_id IS NULL
        ELSE mb.path = 'INBOX' OR mb.scope_id IS NOT NULL END
    WHERE state.credential_id = p_credential AND state.initialized AND state.spam_revision IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM imap_mailbox_messages mm WHERE mm.mailbox_id = mb.id AND mm.structured_email_id = state.structured_email_id)
      AND NOT EXISTS (SELECT 1 FROM imap_mailbox_removals r WHERE r.credential_id = p_credential AND r.structured_email_id = state.structured_email_id)
  ), candidates AS MATERIALIZED (
    SELECT mb.id AS mailbox_id, se.id, se.created_at, octet_length(se.raw_content) AS size,
      coalesce(canonical.flags, to_jsonb(state.filter_flags)::text, '[]') AS flags
    FROM placements state JOIN structured_emails se ON se.id = state.structured_email_id AND se.user_id = p_user
    JOIN imap_mailboxes mb ON mb.id = state.mailbox_id
    JOIN visibility v ON v.scope_id IS NOT DISTINCT FROM mb.scope_id
    LEFT JOIN imap_mailboxes inbox ON mb.scope_id IS NOT NULL AND inbox.credential_id = p_credential AND inbox.path = 'INBOX'
    LEFT JOIN imap_mailbox_messages canonical ON canonical.mailbox_id = inbox.id AND canonical.raw_source = 'structured' AND canonical.structured_email_id = se.id
    WHERE se.raw_content IS NOT NULL AND se.guard_blocked IS NOT TRUE
      AND (lower(se.recipient) = ANY(v.addresses)
        OR (split_part(lower(se.recipient), '@', 2) = ANY(v.domains) AND split_part(lower(se.recipient), '@', 1) <> 'dmarc')
        OR EXISTS (SELECT 1 FROM unnest(se.envelope_recipients) AS envelope(address) WHERE lower(envelope.address) = ANY(v.addresses)
          OR (split_part(lower(envelope.address), '@', 2) = ANY(v.domains) AND split_part(lower(envelope.address), '@', 1) <> 'dmarc')))
  ), numbered AS (
    SELECT candidates.*, row_number() OVER (PARTITION BY mailbox_id ORDER BY created_at, id)::integer AS rn FROM candidates
  ), bumped AS (
    UPDATE imap_mailboxes mb SET uid_next = mb.uid_next + counts.total, modseq = mb.modseq + counts.total, updated_at = now()
    FROM (SELECT mailbox_id, count(*)::integer AS total FROM candidates GROUP BY mailbox_id) counts
    WHERE mb.id = counts.mailbox_id RETURNING mb.id, mb.uid_next - counts.total AS first_uid, mb.modseq - counts.total AS first_modseq
  )
  INSERT INTO imap_mailbox_messages (id, mailbox_id, structured_email_id, uid, flags, internal_date, size, modseq)
  SELECT b.id || ':' || (b.first_uid + n.rn - 1), b.id, n.id, b.first_uid + n.rn - 1, n.flags, n.created_at, n.size, b.first_modseq + n.rn
  FROM numbered n JOIN bumped b ON b.id = n.mailbox_id;
  SELECT min(se.created_at) + interval '2 minutes' INTO pending_at FROM structured_emails se
  WHERE se.user_id = p_user AND se.created_at >= now() - interval '2 minutes' AND se.raw_content IS NOT NULL
    AND se.guard_blocked IS NOT TRUE AND se.is_junk IS NULL
    AND (lower(se.recipient) = ANY(addresses)
      OR (split_part(lower(se.recipient), '@', 2) = ANY(domains) AND split_part(lower(se.recipient), '@', 1) <> 'dmarc')
      OR EXISTS (SELECT 1 FROM unnest(se.envelope_recipients) AS envelope(address) WHERE lower(envelope.address) = ANY(addresses)
        OR (split_part(lower(envelope.address), '@', 2) = ANY(domains) AND split_part(lower(envelope.address), '@', 1) <> 'dmarc')))
    AND NOT EXISTS (SELECT 1 FROM mailbox_message_state state WHERE state.credential_id = p_credential AND state.structured_email_id = se.id AND state.initialized)
    AND NOT EXISTS (SELECT 1 FROM imap_mailbox_removals r WHERE r.credential_id = p_credential AND r.structured_email_id = se.id);
  UPDATE imap_mailboxes SET source_fingerprint = CASE WHEN backlog OR scanned_fingerprint IS DISTINCT FROM fingerprint THEN NULL ELSE fingerprint END, source_pending_at = pending_at
  WHERE id = checkpoint.id;
  RETURN QUERY SELECT * FROM imap_mailboxes WHERE id = p_mailbox AND user_id = p_user AND credential_id = p_credential;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION imap_apply_filters(p_user text, p_credential text, p_mailbox text, p_after_uid integer, p_limit integer, p_filter text DEFAULT NULL)
RETURNS TABLE(processed integer, last_uid integer) LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp SET plan_cache_mode = force_custom_plan AS $$
DECLARE box imap_mailboxes; ids text[]; move_ids text[]; rules jsonb; current_versions jsonb; folders jsonb;
  policy record;
BEGIN
  PERFORM imap_authorize(p_user, p_credential, true);
  IF p_after_uid IS NULL OR p_after_uid < 0 OR p_limit IS NULL OR p_limit < 1 THEN RAISE EXCEPTION 'Invalid filter batch'; END IF;
  PERFORM imap_ensure(p_user, p_credential);
  PERFORM imap_lock(p_user, p_credential, ARRAY[p_mailbox], true);
  PERFORM imap_authorize(p_user, p_credential, true);
  SELECT * INTO box FROM imap_mailboxes WHERE id = p_mailbox AND user_id = p_user AND credential_id = p_credential;
  IF NOT FOUND THEN RAISE EXCEPTION 'Mailbox not found'; END IF;
  IF box.scope_id IS NOT NULL OR box.path = 'Scopes' OR box.path LIKE 'Scopes/%' THEN RAISE EXCEPTION 'Scope mailbox is read-only' USING ERRCODE = '42501'; END IF;
  IF p_filter IS NOT NULL AND NOT EXISTS (SELECT 1 FROM mailbox_filters WHERE id = p_filter AND user_id = p_user AND credential_id = p_credential) THEN
    RAISE EXCEPTION 'Filter not found';
  END IF;
  SELECT array_agg(batch.structured_email_id) FILTER (WHERE batch.raw_source = 'structured'),
    count(*)::integer, coalesce(max(batch.uid), p_after_uid) INTO ids, processed, last_uid
  FROM (SELECT mm.structured_email_id, mm.uid, mm.raw_source FROM imap_mailbox_messages mm
    WHERE mm.mailbox_id = p_mailbox AND mm.uid > p_after_uid ORDER BY mm.uid LIMIT least(p_limit, 500)) batch;
  IF processed = 0 THEN RETURN NEXT; RETURN; END IF;
  rules := imap_filter_rules(p_user, p_credential, p_filter);
  SELECT coalesce(jsonb_object_agg(value ->> 'id', value ->> 'revision'), '{}') INTO current_versions FROM jsonb_array_elements(rules);
  IF current_versions = '{}'::jsonb THEN RETURN NEXT; RETURN; END IF;
  SELECT array_agg(batch.id) INTO ids FROM unnest(ids) AS batch(id)
  LEFT JOIN mailbox_message_state state ON state.credential_id = p_credential AND state.structured_email_id = batch.id
  WHERE NOT coalesce(state.filter_versions @> current_versions, false);
  IF ids IS NULL THEN RETURN NEXT; RETURN; END IF;
  SELECT * INTO policy FROM imap_spam_policy(p_user, p_credential);
  SELECT coalesce(jsonb_object_agg(key, id), '{}') INTO folders FROM (
    SELECT mb.id::text, unnest(ARRAY[mb.id::text, mb.path::text]) AS key FROM imap_mailboxes mb
    WHERE mb.user_id = p_user AND mb.credential_id = p_credential AND mb.scope_id IS NULL AND mb.path <> 'Scopes' AND mb.path NOT LIKE 'Scopes/%'
  ) targets;
  WITH candidates AS MATERIALIZED (
    SELECT se.*, state.junk_override, state.filter_mailbox_id, state.filter_versions, mm.flags,
      CASE WHEN policy.default_policy THEN coalesce(state.junk_override, se.is_junk)
        ELSE imap_mailbox_junk_prepared(se.is_junk, se.junk_reason, se.from_data, se.jev_classification,
          policy.level, policy.allow_addresses, policy.allow_domains, policy.block_addresses, policy.block_domains, state.junk_override) END AS effective_junk
    FROM imap_mailbox_messages mm JOIN structured_emails se ON se.id = mm.structured_email_id AND se.user_id = p_user
    LEFT JOIN mailbox_message_state state ON state.credential_id = p_credential AND state.structured_email_id = se.id
    WHERE mm.mailbox_id = p_mailbox AND mm.structured_email_id = ANY(ids) AND mm.raw_source = 'structured'
      AND imap_visible(p_user, p_credential, se.id)
  ), evaluated AS MATERIALIZED (
    SELECT se.id, se.junk_updated_at, se.effective_junk, imap_evaluate_filters(imap_filter_email(se.from_data, se.to_data, se.cc_data,
      array_append(coalesce(se.envelope_recipients, '{}'), se.recipient), se.subject, se.headers,
      coalesce(se.text_body, se.html_body), se.attachments, octet_length(se.raw_content), se.jev_classification), rules, folders,
      se.effective_junk, se.junk_override, ARRAY(SELECT jsonb_array_elements_text(se.flags::jsonb)),
      se.filter_mailbox_id, se.filter_versions) AS result FROM candidates se
  ), written AS (
    INSERT INTO mailbox_message_state (credential_id, structured_email_id, junk_override, filter_versions, filter_flags, filter_mailbox_id, initialized,
      spam_revision, effective_junk, spam_source_updated_at)
    SELECT p_credential, id, (result ->> 'junk')::boolean, result -> 'versions',
      ARRAY(SELECT jsonb_array_elements_text(result -> 'flags')), result ->> 'destination', true, policy.revision,
      coalesce((result ->> 'junk')::boolean, CASE WHEN policy.default_policy THEN NULL ELSE effective_junk END), junk_updated_at FROM evaluated
    ON CONFLICT (credential_id, structured_email_id) DO UPDATE SET junk_override = excluded.junk_override,
      filter_versions = excluded.filter_versions, filter_flags = excluded.filter_flags, filter_mailbox_id = excluded.filter_mailbox_id, initialized = true,
      spam_revision = excluded.spam_revision, effective_junk = excluded.effective_junk, spam_source_updated_at = excluded.spam_source_updated_at
    RETURNING structured_email_id
  )
  SELECT array_agg(written.structured_email_id), array_agg(evaluated.id) FILTER (WHERE (evaluated.result ->> 'move')::boolean) INTO ids, move_ids
  FROM evaluated JOIN written ON written.structured_email_id = evaluated.id;
  WITH changed AS MATERIALIZED (
    SELECT mm.id, mm.mailbox_id, mm.uid, to_jsonb(state.filter_flags)::text AS flags,
      row_number() OVER (PARTITION BY mm.mailbox_id ORDER BY mm.uid)::integer AS rn
    FROM imap_mailboxes mb JOIN imap_mailbox_messages mm ON mm.mailbox_id = mb.id
    JOIN mailbox_message_state state ON state.credential_id = p_credential AND state.structured_email_id = mm.structured_email_id
    WHERE mb.user_id = p_user AND mb.credential_id = p_credential
      AND (mb.id = p_mailbox OR (box.path = 'INBOX' AND mb.scope_id IS NOT NULL))
      AND mm.raw_source = 'structured' AND mm.structured_email_id = ANY(ids) AND mm.flags::jsonb IS DISTINCT FROM to_jsonb(state.filter_flags)
  ), bumped AS (
    UPDATE imap_mailboxes mb SET modseq = mb.modseq + counts.total, updated_at = now()
    FROM (SELECT mailbox_id, count(*)::integer AS total FROM changed GROUP BY mailbox_id) counts
    WHERE mb.id = counts.mailbox_id RETURNING mb.id, mb.modseq - counts.total AS first_modseq
  )
  UPDATE imap_mailbox_messages mm SET flags = changed.flags, modseq = bumped.first_modseq + changed.rn
  FROM changed JOIN bumped ON bumped.id = changed.mailbox_id WHERE mm.id = changed.id;
  IF move_ids IS NOT NULL THEN PERFORM imap_reconcile_filters(p_user, p_credential, move_ids, p_mailbox); END IF;
  UPDATE imap_mailboxes SET source_fingerprint = NULL WHERE user_id = p_user AND credential_id = p_credential
    AND (path IN ('INBOX', 'Junk') OR scope_id IS NOT NULL OR id = p_mailbox);
  RETURN NEXT;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION imap_transfer(p_user text, p_credential text, p_source text, p_destination text, p_uids integer[], p_move boolean)
RETURNS TABLE(source_uid integer, destination_uid integer) LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE source imap_mailboxes; destination imap_mailboxes; received text[]; copied_source integer[]; copied_destination integer[]; inserted integer; policy record;
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
  IF received IS NOT NULL AND (p_move OR destination.path IN ('INBOX', 'Junk')) THEN
    SELECT * INTO policy FROM imap_spam_policy(p_user, p_credential);
    INSERT INTO mailbox_message_state (credential_id, structured_email_id, junk_override, filter_mailbox_id, spam_revision, effective_junk, spam_source_updated_at)
    SELECT p_credential, r.id, CASE WHEN destination.path IN ('INBOX', 'Junk') THEN destination.path = 'Junk' END,
      CASE WHEN destination.path NOT IN ('INBOX', 'Junk') THEN destination.id END, policy.revision,
      CASE WHEN destination.path IN ('INBOX', 'Junk') THEN destination.path = 'Junk'
        WHEN policy.default_policy THEN state.junk_override
        ELSE imap_mailbox_junk_prepared(se.is_junk, se.junk_reason, se.from_data, se.jev_classification,
          policy.level, policy.allow_addresses, policy.allow_domains, policy.block_addresses, policy.block_domains, state.junk_override) END,
      se.junk_updated_at FROM unnest(received) AS r(id) JOIN structured_emails se ON se.id = r.id AND se.user_id = p_user
      LEFT JOIN mailbox_message_state state ON state.credential_id = p_credential AND state.structured_email_id = r.id
    ON CONFLICT (credential_id, structured_email_id) DO UPDATE SET
      junk_override = CASE WHEN destination.path IN ('INBOX', 'Junk') THEN excluded.junk_override ELSE mailbox_message_state.junk_override END,
      filter_mailbox_id = excluded.filter_mailbox_id, spam_revision = excluded.spam_revision,
      effective_junk = excluded.effective_junk, spam_source_updated_at = excluded.spam_source_updated_at;
    UPDATE imap_mailboxes SET source_fingerprint = NULL WHERE user_id = p_user AND credential_id = p_credential
      AND (path IN ('INBOX', 'Junk') OR scope_id IS NOT NULL OR id IN (p_source, p_destination));
    IF destination.path IN ('INBOX', 'Junk') THEN
      DELETE FROM imap_mailbox_removals WHERE credential_id = p_credential AND structured_email_id = ANY(received);
    END IF;
  END IF;
  WITH selected AS (
    SELECT mm.* FROM imap_mailbox_messages mm WHERE mm.mailbox_id = p_source AND mm.uid = ANY(p_uids)
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
    SELECT uid, structured_email_id FROM copied UNION ALL
    SELECT mm.uid, mm.structured_email_id FROM imap_mailbox_messages mm WHERE mm.mailbox_id = p_destination
      AND mm.structured_email_id IN (SELECT structured_email_id FROM selected)
  ) SELECT array_agg(c.uid ORDER BY c.uid), array_agg(d.uid ORDER BY c.uid), (SELECT count(*)::integer FROM copied)
    INTO copied_source, copied_destination, inserted FROM selected c JOIN targets d ON d.structured_email_id = c.structured_email_id;
  IF inserted > 0 THEN
    UPDATE imap_mailboxes SET uid_next = destination.uid_next + inserted, modseq = destination.modseq + inserted, updated_at = now() WHERE id = p_destination;
  END IF;
  IF p_move THEN PERFORM * FROM imap_expunge(p_user, p_credential, p_source, coalesce(p_uids, '{}'::integer[]), true); END IF;
  IF destination.path IN ('INBOX', 'Junk') AND received IS NOT NULL THEN PERFORM imap_reconcile(p_user, p_credential, received); END IF;
  RETURN QUERY SELECT s.uid, d.uid FROM unnest(copied_source) WITH ORDINALITY AS s(uid, n)
    JOIN unnest(copied_destination) WITH ORDINALITY AS d(uid, n) USING (n) ORDER BY s.uid;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION imap_append(p_user text, p_credential text, p_mailbox text, p_raw text, p_flags text[], p_date timestamp, p_max_bytes bigint, p_max_messages integer)
RETURNS TABLE(uid integer, uid_validity integer) LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE box imap_mailboxes; appended text; incoming_message_id text; existing integer; total_bytes bigint; total_messages bigint; incoming integer;
  mailbox_quota bigint; mailbox_bytes bigint;
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
  SELECT storage_quota_bytes INTO mailbox_quota FROM imap_credentials WHERE id = p_credential AND user_id = p_user;
  IF mailbox_quota IS NOT NULL THEN
    SELECT coalesce(sum(am.size), 0) INTO mailbox_bytes FROM imap_appended_messages am
    WHERE am.user_id = p_user AND EXISTS (
      SELECT 1 FROM imap_mailboxes mb JOIN imap_mailbox_messages mm ON mm.mailbox_id = mb.id
      WHERE mb.user_id = p_user AND mb.credential_id = p_credential AND mm.raw_source = 'appended' AND mm.structured_email_id = am.id);
    IF mailbox_bytes + incoming > mailbox_quota THEN RAISE EXCEPTION 'APPEND mailbox quota exceeded' USING ERRCODE = 'P0001'; END IF;
  END IF;
  IF total_messages >= p_max_messages OR total_bytes + incoming > p_max_bytes THEN RAISE EXCEPTION 'APPEND quota exceeded' USING ERRCODE = 'P0001'; END IF;
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
  INSERT INTO imap_mailbox_removals (credential_id, structured_email_id)
  SELECT p_credential, r.id FROM unnest(received) AS r(id)
  WHERE (box.path IN ('INBOX', 'Junk') AND NOT EXISTS (
    SELECT 1 FROM imap_mailbox_messages mm JOIN imap_mailboxes mb ON mb.id = mm.mailbox_id
    WHERE mb.user_id = p_user AND mb.credential_id = p_credential AND mm.raw_source = 'structured' AND mm.structured_email_id = r.id
      AND CASE WHEN box.path = 'Junk' THEN mb.path = 'INBOX' OR mb.scope_id IS NOT NULL ELSE mb.path = 'Junk' AND mb.scope_id IS NULL END
  )) OR EXISTS (SELECT 1 FROM mailbox_message_state state
    WHERE state.credential_id = p_credential AND state.structured_email_id = r.id AND state.filter_mailbox_id = p_mailbox)
  ON CONFLICT DO NOTHING;
  IF box.path = 'INBOX' THEN
    DELETE FROM imap_mailbox_messages mm USING imap_mailboxes mb
    WHERE mm.mailbox_id = mb.id AND mb.user_id = p_user AND mb.credential_id = p_credential
      AND (mb.path = 'INBOX' OR mb.scope_id IS NOT NULL) AND mm.raw_source = 'structured' AND mm.structured_email_id = ANY(received);
  END IF;
  DELETE FROM imap_appended_messages am WHERE am.user_id = p_user AND am.id = ANY(appended)
    AND NOT EXISTS (SELECT 1 FROM imap_mailbox_messages mm WHERE mm.raw_source = 'appended' AND mm.structured_email_id = am.id);
  RETURN QUERY SELECT r.uid FROM unnest(removed) AS r(uid) ORDER BY r.uid;
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
  IF p_operation = 'delete' THEN
    PERFORM imap_lock(p_user, p_credential, ARRAY(SELECT id::text FROM imap_mailboxes
      WHERE user_id = p_user AND credential_id = p_credential AND path = p_path), true);
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
    INSERT INTO imap_mailbox_removals (credential_id, structured_email_id)
    SELECT p_credential, state.structured_email_id FROM mailbox_message_state state
    WHERE state.credential_id = p_credential AND state.filter_mailbox_id = box.id ON CONFLICT DO NOTHING;
    WITH deleted AS (DELETE FROM imap_mailbox_messages WHERE mailbox_id = box.id RETURNING structured_email_id, raw_source)
    SELECT array_agg(structured_email_id) FILTER (WHERE raw_source = 'appended') INTO appended FROM deleted;
    RETURN QUERY DELETE FROM imap_mailboxes WHERE id = box.id RETURNING *;
    DELETE FROM imap_appended_messages am WHERE am.user_id = p_user AND am.id = ANY(appended)
      AND NOT EXISTS (SELECT 1 FROM imap_mailbox_messages mm WHERE mm.raw_source = 'appended' AND mm.structured_email_id = am.id);
  END IF;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION imap_stamp_verdict()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
BEGIN
  IF (NEW.is_junk, NEW.junk_reason, NEW.from_data, NEW.jev_classification)
    IS DISTINCT FROM (OLD.is_junk, OLD.junk_reason, OLD.from_data, OLD.jev_classification) THEN
    NEW.junk_updated_at := clock_timestamp();
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
DROP TRIGGER imap_stamp_verdict ON structured_emails;
--> statement-breakpoint
CREATE TRIGGER imap_stamp_verdict BEFORE UPDATE OF is_junk, junk_reason, from_data, jev_classification ON structured_emails
FOR EACH ROW EXECUTE FUNCTION imap_stamp_verdict();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION imap_notify_credential_changed()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM pg_notify('imap_credential_changed', OLD.id);
    RETURN OLD;
  END IF;
  IF (OLD.api_key_id, OLD.login_address, OLD.type, OLD.access_mode, OLD.sending_mode,
    OLD.sending_name, OLD.sending_address, OLD.enabled, OLD.protocols, OLD.allowed_ips, OLD.self_service)
    IS DISTINCT FROM (NEW.api_key_id, NEW.login_address, NEW.type, NEW.access_mode, NEW.sending_mode,
    NEW.sending_name, NEW.sending_address, NEW.enabled, NEW.protocols, NEW.allowed_ips, NEW.self_service) THEN
    PERFORM pg_notify('imap_credential_changed', NEW.id);
  END IF;
  RETURN NEW;
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
  SELECT * INTO box FROM imap_mailboxes WHERE id = p_mailbox AND user_id = p_user AND credential_id = p_credential;
  IF NOT FOUND THEN RAISE EXCEPTION 'Mailbox not found'; END IF;
  PERFORM imap_lock(p_user, p_credential, ARRAY[p_mailbox], box.path = 'INBOX');
  PERFORM imap_authorize(p_user, p_credential, true);
  SELECT * INTO box FROM imap_mailboxes WHERE id = p_mailbox AND user_id = p_user AND credential_id = p_credential;
  IF NOT FOUND THEN RAISE EXCEPTION 'Mailbox not found'; END IF;
  IF box.scope_id IS NOT NULL OR box.path = 'Scopes' OR box.path LIKE 'Scopes/%' THEN
    RAISE EXCEPTION 'Scope mailbox is read-only' USING ERRCODE = '42501';
  END IF;
  WITH selected AS MATERIALIZED (
    SELECT mm.* FROM imap_mailbox_messages mm WHERE mm.mailbox_id = p_mailbox AND mm.uid = ANY(p_uids)
  ), targets AS MATERIALIZED (
    SELECT * FROM selected
    UNION ALL
    SELECT mm.* FROM selected source JOIN imap_mailbox_messages mm ON mm.structured_email_id = source.structured_email_id
    JOIN imap_mailboxes mb ON mb.id = mm.mailbox_id
    WHERE box.path = 'INBOX' AND mb.user_id = p_user AND mb.credential_id = p_credential AND mb.scope_id IS NOT NULL
      AND source.raw_source = 'structured' AND mm.raw_source = 'structured'
  ), proposed AS MATERIALIZED (
    SELECT mm.id, mm.mailbox_id, mm.uid, mm.flags::jsonb AS old_flags,
      to_jsonb(CASE p_action
        WHEN 'set' THEN p_flags
        WHEN 'add' THEN imap_normalize_flags(ARRAY(SELECT jsonb_array_elements_text(mm.flags::jsonb)) || p_flags)
        ELSE ARRAY(SELECT flag FROM jsonb_array_elements_text(mm.flags::jsonb) AS existing(flag)
          WHERE NOT lower(flag) = ANY(ARRAY(SELECT lower(flag) FROM unnest(p_flags) AS removed(flag))))
      END) AS new_flags FROM targets mm
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
CREATE OR REPLACE FUNCTION imap_record_received_update()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
BEGIN
  WITH changed AS MATERIALIZED (
    SELECT old_row.user_id AS old_user_id, old_row.recipient AS old_recipient, old_row.envelope_recipients AS old_envelope,
      new_row.user_id, new_row.recipient, new_row.envelope_recipients
    FROM old_emails old_row FULL JOIN new_emails new_row USING (id)
    WHERE (old_row.user_id, old_row.recipient, old_row.envelope_recipients, old_row.raw_content IS NULL,
      old_row.guard_blocked, old_row.is_junk, old_row.created_at)
      IS DISTINCT FROM
      (new_row.user_id, new_row.recipient, new_row.envelope_recipients, new_row.raw_content IS NULL,
      new_row.guard_blocked, new_row.is_junk, new_row.created_at)
      OR ((old_row.jev_classification, old_row.from_data, old_row.junk_reason)
        IS DISTINCT FROM (new_row.jev_classification, new_row.from_data, new_row.junk_reason)
        AND EXISTS (SELECT 1 FROM imap_credentials c WHERE c.user_id = new_row.user_id
          AND (c.spam_level IS NOT NULL OR cardinality(c.spam_allow) > 0 OR cardinality(c.spam_block) > 0)))
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
DROP TRIGGER imap_notify_received ON structured_emails;
--> statement-breakpoint
CREATE TRIGGER imap_notify_received AFTER INSERT OR UPDATE OF recipient, envelope_recipients, raw_content, guard_blocked,
  is_junk, user_id, jev_classification, from_data, junk_reason ON structured_emails FOR EACH ROW EXECUTE FUNCTION imap_notify_received();
--> statement-breakpoint
REVOKE ALL ON FUNCTION imap_filter_text(text), imap_filter_json(text),
  imap_classification_summary(jsonb), imap_spam_policy(text, text),
  imap_mailbox_junk_prepared(boolean, text, text, text, text, text[], text[], text[], text[], boolean),
  imap_mailbox_junk(boolean, text, text, text, text, text[], text[], boolean), imap_filter_condition(jsonb, jsonb, boolean),
  imap_filter_rules(text, text, text), imap_evaluate_filters(jsonb, jsonb, jsonb, boolean, boolean, text[], text, jsonb),
  imap_filter_email(text, text, text, text[], text, text, text, text, integer, text), imap_invalidate_spam_settings(),
  imap_reconcile_filters(text, text, text[], text), imap_apply_filters(text, text, text, integer, integer, text) FROM PUBLIC;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'imap_gateway') THEN
    REVOKE UPDATE (is_junk, junk_reason, junk_updated_at) ON structured_emails FROM imap_gateway;
    GRANT SELECT (storage_quota_bytes, spam_level, spam_allow, spam_block) ON imap_credentials TO imap_gateway;
    GRANT SELECT ON mailbox_filters TO imap_gateway;
    GRANT SELECT, INSERT, UPDATE ON mailbox_message_state TO imap_gateway;
    GRANT EXECUTE ON FUNCTION imap_filter_text(text), imap_filter_json(text),
      imap_classification_summary(jsonb), imap_spam_policy(text, text),
      imap_mailbox_junk_prepared(boolean, text, text, text, text, text[], text[], text[], text[], boolean),
      imap_mailbox_junk(boolean, text, text, text, text, text[], text[], boolean), imap_filter_condition(jsonb, jsonb, boolean),
      imap_filter_rules(text, text, text), imap_evaluate_filters(jsonb, jsonb, jsonb, boolean, boolean, text[], text, jsonb),
      imap_filter_email(text, text, text, text[], text, text, text, text, integer, text),
      imap_reconcile_filters(text, text, text[], text), imap_apply_filters(text, text, text, integer, integer, text) TO imap_gateway;
  END IF;
END;
$$;
