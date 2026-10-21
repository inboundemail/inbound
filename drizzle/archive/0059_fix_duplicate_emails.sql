-- Fix duplicate email ingestion by adding a partial unique index on (message_id, recipient).
-- This prevents the same email (same RFC 2822 Message-ID) from being stored twice for the same recipient.
-- The WHERE clause excludes NULLs since some emails lack a Message-ID header.
-- A similar constraint (structured_emails_aws_ses_message_id_recipient_unique) existed previously
-- but was dropped in migration 0048 when the aws_ses_message_id column was removed.

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "structured_emails_message_id_recipient_unique"
  ON "structured_emails" ("message_id", "recipient")
  WHERE "message_id" IS NOT NULL AND "recipient" IS NOT NULL;
