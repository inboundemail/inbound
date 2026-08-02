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
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE imap_mailboxes TO imap_gateway;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE imap_mailbox_messages TO imap_gateway;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE imap_appended_messages TO imap_gateway;
GRANT EXECUTE ON FUNCTION imap_notify_mailbox_message() TO imap_gateway;

ALTER ROLE imap_gateway SET statement_timeout = '30s';
ALTER ROLE imap_gateway SET lock_timeout = '5s';
ALTER ROLE imap_gateway SET idle_in_transaction_session_timeout = '30s';
