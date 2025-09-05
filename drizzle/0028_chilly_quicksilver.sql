CREATE TABLE "feature_flags" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"is_enabled" boolean DEFAULT false,
	"enabled_for_roles" text,
	"enabled_for_users" text,
	"disabled_for_users" text,
	"enabled_percentage" integer DEFAULT 0,
	"conditions" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"created_by" varchar(255),
	CONSTRAINT "feature_flags_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "user_feature_flags" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"flag_name" varchar(255) NOT NULL,
	"is_enabled" boolean NOT NULL,
	"reason" text,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"created_by" varchar(255)
);
