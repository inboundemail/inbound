CREATE TABLE `account` (
	`id` varchar(36) NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` timestamp,
	`refresh_token_expires_at` timestamp,
	`scope` text,
	`password` text,
	`created_at` timestamp NOT NULL,
	`updated_at` timestamp NOT NULL,
	CONSTRAINT `account_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `email_addresses` (
	`id` varchar(255) NOT NULL,
	`address` varchar(255) NOT NULL,
	`domain_id` varchar(255),
	`is_active` boolean DEFAULT true,
	`created_at` timestamp DEFAULT (now()),
	`user_id` varchar(255) NOT NULL,
	CONSTRAINT `email_addresses_id` PRIMARY KEY(`id`),
	CONSTRAINT `email_addresses_address_unique` UNIQUE(`address`)
);
--> statement-breakpoint
CREATE TABLE `email_domains` (
	`id` varchar(255) NOT NULL,
	`domain` varchar(255) NOT NULL,
	`status` varchar(50) NOT NULL,
	`verification_token` varchar(255),
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`user_id` varchar(255) NOT NULL,
	CONSTRAINT `email_domains_id` PRIMARY KEY(`id`),
	CONSTRAINT `email_domains_domain_unique` UNIQUE(`domain`)
);
--> statement-breakpoint
CREATE TABLE `received_emails` (
	`id` varchar(255) NOT NULL,
	`message_id` varchar(255) NOT NULL,
	`from` varchar(255) NOT NULL,
	`to` text NOT NULL,
	`subject` text,
	`received_at` timestamp NOT NULL,
	`processed_at` timestamp,
	`status` varchar(50) NOT NULL,
	`metadata` text,
	`user_id` varchar(255) NOT NULL,
	CONSTRAINT `received_emails_id` PRIMARY KEY(`id`),
	CONSTRAINT `received_emails_message_id_unique` UNIQUE(`message_id`)
);
--> statement-breakpoint
CREATE TABLE `session` (
	`id` varchar(36) NOT NULL,
	`expires_at` timestamp NOT NULL,
	`token` varchar(255) NOT NULL,
	`created_at` timestamp NOT NULL,
	`updated_at` timestamp NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	CONSTRAINT `session_id` PRIMARY KEY(`id`),
	CONSTRAINT `session_token_unique` UNIQUE(`token`)
);
--> statement-breakpoint
CREATE TABLE `user` (
	`id` varchar(36) NOT NULL,
	`name` text NOT NULL,
	`email` varchar(255) NOT NULL,
	`email_verified` boolean NOT NULL,
	`image` text,
	`created_at` timestamp NOT NULL,
	`updated_at` timestamp NOT NULL,
	`stripe_customer_id` text,
	CONSTRAINT `user_id` PRIMARY KEY(`id`),
	CONSTRAINT `user_email_unique` UNIQUE(`email`)
);
--> statement-breakpoint
CREATE TABLE `verification` (
	`id` varchar(36) NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` timestamp NOT NULL,
	`created_at` timestamp,
	`updated_at` timestamp,
	CONSTRAINT `verification_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `webhook_deliveries` (
	`id` varchar(255) NOT NULL,
	`email_id` varchar(255),
	`endpoint` varchar(500) NOT NULL,
	`status` varchar(50) NOT NULL,
	`attempts` int DEFAULT 0,
	`last_attempt_at` timestamp,
	`response_code` int,
	`error` text,
	`created_at` timestamp DEFAULT (now()),
	CONSTRAINT `webhook_deliveries_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
DROP TABLE `accounts`;--> statement-breakpoint
DROP TABLE `sessions`;--> statement-breakpoint
DROP TABLE `users`;--> statement-breakpoint
DROP TABLE `verification_tokens`;--> statement-breakpoint
ALTER TABLE `account` ADD CONSTRAINT `account_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `session` ADD CONSTRAINT `session_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;