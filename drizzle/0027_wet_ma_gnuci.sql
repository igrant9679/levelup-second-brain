CREATE TABLE `user_activity_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`action` varchar(64) NOT NULL,
	`entityType` varchar(32),
	`entityTitle` varchar(255),
	`metadata` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `user_activity_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `idx_ual_user_id` ON `user_activity_log` (`userId`);--> statement-breakpoint
CREATE INDEX `idx_ual_action` ON `user_activity_log` (`action`);--> statement-breakpoint
CREATE INDEX `idx_ual_created_at` ON `user_activity_log` (`createdAt`);