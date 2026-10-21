CREATE TABLE "rate_limit_overrides" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"hourly_limit" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"reason" text,
	"created_by" varchar(255),
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "rate_limit_overrides_user_id_unique" UNIQUE("user_id")
);
