CREATE TABLE `automation_rules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`trigger` varchar(64) NOT NULL,
	`triggerConfig` mediumtext,
	`action` varchar(64) NOT NULL,
	`actionConfig` mediumtext,
	`enabled` tinyint NOT NULL DEFAULT 1,
	`lastFiredAt` timestamp,
	`fireCount` int NOT NULL DEFAULT 0,
	`lastError` mediumtext,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `automation_rules_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `idx_auto_user` ON `automation_rules` (`userId`);
