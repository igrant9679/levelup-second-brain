CREATE TABLE `pm_people` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`email` varchar(320),
	`org` varchar(255),
	`title` varchar(255),
	`phone` varchar(64),
	`linkedUserId` int,
	`linkedContactId` varchar(64),
	`costRate` int,
	`capacityHours` int,
	`notes` text,
	`archived` tinyint NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `pm_people_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `idx_pm_people_user` ON `pm_people` (`userId`);
--> statement-breakpoint
CREATE TABLE `pm_records` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`projectKey` varchar(128) NOT NULL DEFAULT '',
	`kind` varchar(32) NOT NULL,
	`refType` varchar(32),
	`refId` varchar(128),
	`title` varchar(500),
	`status` varchar(32),
	`data` mediumtext,
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()),
	`deletedAt` timestamp,
	CONSTRAINT `pm_records_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `idx_pm_rec_user_project` ON `pm_records` (`userId`,`projectKey`);
--> statement-breakpoint
CREATE INDEX `idx_pm_rec_user_kind` ON `pm_records` (`userId`,`kind`);
