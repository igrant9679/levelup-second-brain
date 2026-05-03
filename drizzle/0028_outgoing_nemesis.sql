CREATE TABLE `user_app_data` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`tasks` mediumtext,
	`notes` mediumtext,
	`projects` mediumtext,
	`goals` mediumtext,
	`journal` mediumtext,
	`habits` mediumtext,
	`contacts` mediumtext,
	`ideas` mediumtext,
	`teams` mediumtext,
	`prefs` text,
	`calEvents` mediumtext,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `user_app_data_id` PRIMARY KEY(`id`),
	CONSTRAINT `user_app_data_userId_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
CREATE INDEX `idx_uad_user_id` ON `user_app_data` (`userId`);