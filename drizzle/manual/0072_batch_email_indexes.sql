DO $$
DECLARE
	dup_count INTEGER;
BEGIN
	SELECT COUNT(*) INTO dup_count
	FROM (
		SELECT batch_id, batch_index
		FROM sent_emails
		WHERE batch_id IS NOT NULL
		GROUP BY batch_id, batch_index
		HAVING COUNT(*) > 1
	) duplicates;

	IF dup_count > 0 THEN
		RAISE EXCEPTION 'Cannot create unique index: % duplicate batch_id/batch_index pairs exist in sent_emails', dup_count;
	END IF;
END $$;

DO $$
DECLARE
	idx_rec RECORD;
BEGIN
	FOR idx_rec IN
		SELECT indexrelid::regclass AS idx_name
		FROM pg_index
		JOIN pg_class ON pg_class.oid = pg_index.indexrelid
		WHERE pg_class.relname IN ('sent_emails_user_batch_idx', 'sent_emails_batch_idx_unique')
		  AND NOT pg_index.indisvalid
	LOOP
		EXECUTE format('DROP INDEX IF EXISTS %s', idx_rec.idx_name);
		RAISE NOTICE 'Dropped invalid index: %', idx_rec.idx_name;
	END LOOP;
END $$;

CREATE INDEX CONCURRENTLY IF NOT EXISTS "sent_emails_user_batch_idx"
	ON "sent_emails" USING btree ("user_id", "batch_id", "batch_index");

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "sent_emails_batch_idx_unique"
	ON "sent_emails" ("batch_id", "batch_index");
