CREATE TABLE `subscriptions` (
	`id` varchar(255) NOT NULL,
	`plan` varchar(255) NOT NULL,
	`reference_id` varchar(255) NOT NULL,
	`stripe_customer_id` varchar(255),
	`stripe_subscription_id` varchar(255),
	`status` varchar(255) NOT NULL,
	`period_start` timestamp,
	`period_end` timestamp,
	`cancel_at_period_end` boolean DEFAULT false,
	`seats` int,
	`trial_start` timestamp,
	`trial_end` timestamp,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `subscriptions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` ADD `stripe_customer_id` varchar(255);