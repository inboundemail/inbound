-- Align Better Auth API key storage with the current plugin schema.
ALTER TABLE "apikey" ADD COLUMN IF NOT EXISTS "config_id" text;
ALTER TABLE "apikey" ADD COLUMN IF NOT EXISTS "reference_id" text;

UPDATE "apikey"
SET "config_id" = COALESCE("config_id", 'default');

UPDATE "apikey"
SET "reference_id" = COALESCE("reference_id", "user_id");

ALTER TABLE "apikey" ALTER COLUMN "config_id" SET DEFAULT 'default';
ALTER TABLE "apikey" ALTER COLUMN "config_id" SET NOT NULL;
ALTER TABLE "apikey" ALTER COLUMN "reference_id" SET NOT NULL;
ALTER TABLE "apikey" ALTER COLUMN "user_id" DROP NOT NULL;

CREATE INDEX IF NOT EXISTS "apikey_config_id_idx" ON "apikey" USING btree ("config_id");
CREATE INDEX IF NOT EXISTS "apikey_reference_id_idx" ON "apikey" USING btree ("reference_id");
CREATE INDEX IF NOT EXISTS "apikey_key_idx" ON "apikey" USING btree ("key");
