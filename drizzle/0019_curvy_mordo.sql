CREATE TABLE "user_onboarding" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"is_completed" boolean DEFAULT false NOT NULL,
	"default_endpoint_created" boolean DEFAULT false NOT NULL,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "user_onboarding_user_id_unique" UNIQUE("user_id")
);
