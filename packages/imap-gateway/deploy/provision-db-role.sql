\if :{?gateway_password}
\else
\echo 'gateway_password psql variable is required'
\quit
\endif

SELECT format(
	'CREATE ROLE imap_gateway WITH LOGIN PASSWORD %L NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 30',
	:'gateway_password'
)
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'imap_gateway')
\gexec

SELECT format(
	'ALTER ROLE imap_gateway WITH LOGIN PASSWORD %L NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 30',
	:'gateway_password'
)
\gexec

GRANT CONNECT ON DATABASE neondb TO imap_gateway;
GRANT USAGE ON SCHEMA public TO imap_gateway;
GRANT SELECT ON TABLE structured_emails TO imap_gateway;
REVOKE UPDATE (is_junk, junk_reason, junk_updated_at) ON TABLE structured_emails FROM imap_gateway;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE imap_mailboxes TO imap_gateway;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE imap_mailbox_messages TO imap_gateway;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE imap_appended_messages TO imap_gateway;
GRANT SELECT, INSERT, DELETE ON TABLE imap_mailbox_removals TO imap_gateway;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE imap_mailbox_expunges TO imap_gateway;
GRANT SELECT, INSERT, UPDATE ON TABLE imap_source_versions TO imap_gateway;
GRANT SELECT ON TABLE mailbox_filters TO imap_gateway;
GRANT SELECT, INSERT, UPDATE ON TABLE mailbox_message_state TO imap_gateway;
REVOKE SELECT ON TABLE imap_credentials, email_domains FROM imap_gateway;
GRANT SELECT (id, user_id, login_address, type, access_mode, enabled, storage_quota_bytes, spam_level, spam_allow, spam_block) ON TABLE imap_credentials TO imap_gateway;
GRANT SELECT (id, domain, status, user_id) ON TABLE email_domains TO imap_gateway;
GRANT SELECT ON TABLE imap_credential_scopes TO imap_gateway;
REVOKE ALL ON FUNCTION imap_message_state(), imap_notify_state(), imap_notify_received(), imap_stamp_verdict(),
  imap_cleanup_appended(), imap_expunge_state(), imap_notify_message_state(),
  imap_record_received_change(), imap_record_received_update(), imap_invalidate_removals(),
  imap_notify_mailbox_message(), imap_notify_structured_email_junk(), imap_notify_new_structured_email(),
  imap_notify_credential_changed(), imap_notify_scope_changed() FROM imap_gateway;
GRANT EXECUTE ON FUNCTION imap_scope_visibility(text, text), imap_visibility_fingerprint(text, text) TO imap_gateway;
GRANT EXECUTE ON FUNCTION imap_authorize(text, text, boolean) TO imap_gateway;
GRANT EXECUTE ON FUNCTION imap_visible(text, text, text, text) TO imap_gateway;
GRANT EXECUTE ON FUNCTION imap_lock(text, text, text[], boolean) TO imap_gateway;
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
GRANT EXECUTE ON FUNCTION imap_filter_text(text), imap_filter_json(text),
  imap_mailbox_junk(boolean, text, text, text, text, text[], text[], boolean), imap_filter_condition(jsonb, jsonb, boolean),
  imap_filter_rules(text, text, text), imap_evaluate_filters(jsonb, jsonb, jsonb, boolean, boolean, text[], text, jsonb),
  imap_filter_email(text, text, text, text[], text, text, text, text, integer, text),
  imap_reconcile_filters(text, text, text[], text), imap_apply_filters(text, text, text, integer, integer, text) TO imap_gateway;

ALTER ROLE imap_gateway SET statement_timeout = '30s';
ALTER ROLE imap_gateway SET lock_timeout = '5s';
ALTER ROLE imap_gateway SET idle_in_transaction_session_timeout = '30s';
