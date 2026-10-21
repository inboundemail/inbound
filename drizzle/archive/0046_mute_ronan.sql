CREATE INDEX "endpoint_deliveries_email_status_idx" ON "endpoint_deliveries" USING btree ("email_id","status");--> statement-breakpoint
CREATE INDEX "endpoint_deliveries_email_id_idx" ON "endpoint_deliveries" USING btree ("email_id");--> statement-breakpoint
CREATE INDEX "sent_emails_user_created_idx" ON "sent_emails" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "sent_emails_user_status_created_idx" ON "sent_emails" USING btree ("user_id","status","created_at");--> statement-breakpoint
CREATE INDEX "structured_emails_user_created_idx" ON "structured_emails" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "structured_emails_user_id_idx" ON "structured_emails" USING btree ("user_id");