CREATE TABLE "ses_receipt_rules" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"rule_name" varchar(255) NOT NULL,
	"rule_set_name" varchar(255) NOT NULL,
	"domain_count" integer DEFAULT 0 NOT NULL,
	"max_capacity" integer DEFAULT 500 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "ses_receipt_rules_rule_name_unique" UNIQUE("rule_name")
);
