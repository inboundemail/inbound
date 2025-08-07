CREATE TABLE "webhooks" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"url" text NOT NULL,
	"secret" varchar(255),
	"is_active" boolean DEFAULT true,
	"description" text,
	"headers" text,
	"timeout" integer DEFAULT 30,
	"retry_attempts" integer DEFAULT 3,
	"last_used" timestamp,
	"total_deliveries" integer DEFAULT 0,
	"successful_deliveries" integer DEFAULT 0,
	"failed_deliveries" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"user_id" varchar(255) NOT NULL
);
--> statement-breakpoint
ALTER TABLE "email_addresses" ADD COLUMN "webhook_id" varchar(255);--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD COLUMN "webhook_id" varchar(255) NOT NULL;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD COLUMN "payload" text;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD COLUMN "response_body" text;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD COLUMN "delivery_time" integer;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD COLUMN "updated_at" timestamp DEFAULT now();