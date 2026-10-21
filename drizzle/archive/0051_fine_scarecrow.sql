CREATE TABLE "email_sending_evaluations" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"email_id" varchar(255) NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"evaluation_result" text,
	"risk_score" integer,
	"flags" text,
	"ai_model" varchar(255),
	"evaluation_time" integer,
	"prompt_tokens" integer,
	"completion_tokens" integer,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX "email_sending_evaluations_email_id_idx" ON "email_sending_evaluations" USING btree ("email_id");--> statement-breakpoint
CREATE INDEX "email_sending_evaluations_user_id_idx" ON "email_sending_evaluations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "email_sending_evaluations_created_at_idx" ON "email_sending_evaluations" USING btree ("created_at");