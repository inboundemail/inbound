CREATE TABLE "email_groups" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"endpoint_id" varchar(255) NOT NULL,
	"email_address" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "endpoint_deliveries" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"email_id" varchar(255),
	"endpoint_id" varchar(255) NOT NULL,
	"delivery_type" varchar(50) NOT NULL,
	"status" varchar(50) NOT NULL,
	"attempts" integer DEFAULT 0,
	"last_attempt_at" timestamp,
	"response_data" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "email_addresses" ADD COLUMN "endpoint_id" varchar(255);