-- Add configuration_set_name column to ses_tenants table
-- This column stores the AWS SES configuration set name for tenant-level email tracking
ALTER TABLE "ses_tenants" ADD COLUMN IF NOT EXISTS "configuration_set_name" varchar(255);

