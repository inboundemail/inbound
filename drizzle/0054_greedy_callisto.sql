CREATE TABLE "svix_applications" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"svix_application_id" varchar(255) NOT NULL,
	"svix_application_name" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"last_synced_at" timestamp,
	CONSTRAINT "svix_applications_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "svix_applications_svix_application_id_unique" UNIQUE("svix_application_id")
);
--> statement-breakpoint
ALTER TABLE "endpoints" ADD COLUMN "svix_endpoint_id" varchar(255);--> statement-breakpoint
ALTER TABLE "endpoints" ADD COLUMN "svix_format" varchar(20) DEFAULT 'full';--> statement-breakpoint
ALTER TABLE "webhooks" ADD COLUMN "migrated_to_endpoint_id" varchar(255);--> statement-breakpoint
ALTER TABLE "webhooks" ADD COLUMN "migration_status" varchar(50) DEFAULT 'not_migrated';--> statement-breakpoint
ALTER TABLE "webhooks" ADD COLUMN "migrated_at" timestamp;