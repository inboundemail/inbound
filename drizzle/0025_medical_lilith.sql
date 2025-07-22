DROP TABLE "vip_allowed_senders" CASCADE;--> statement-breakpoint
DROP TABLE "vip_configs" CASCADE;--> statement-breakpoint
DROP TABLE "vip_payment_sessions" CASCADE;--> statement-breakpoint
ALTER TABLE "email_addresses" DROP COLUMN "destination_type";--> statement-breakpoint
ALTER TABLE "user" DROP COLUMN "stripe_restricted_key";