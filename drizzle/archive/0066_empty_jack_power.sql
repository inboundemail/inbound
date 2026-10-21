CREATE TABLE "campaign_links" (
	"token" varchar(64) PRIMARY KEY NOT NULL,
	"campaign" varchar(255) NOT NULL,
	"customer_id" varchar(255) NOT NULL,
	"email" varchar(255) NOT NULL,
	"variant" varchar(50) NOT NULL,
	"home_clicks" integer DEFAULT 0 NOT NULL,
	"checkout_clicks" integer DEFAULT 0 NOT NULL,
	"first_clicked_at" timestamp,
	"last_clicked_at" timestamp,
	"sent_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX "campaign_links_campaign_idx" ON "campaign_links" USING btree ("campaign");--> statement-breakpoint
CREATE INDEX "campaign_links_customer_id_idx" ON "campaign_links" USING btree ("customer_id");