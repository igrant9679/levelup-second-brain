CREATE TABLE `tasks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`taskId` varchar(40) NOT NULL,
	`title` varchar(512),
	`status` varchar(32),
	`priority` varchar(16),
	`due` varchar(32),
	`startDate` varchar(32),
	`completedAt` varchar(40),
	`projectId` varchar(40),
	`clusterId` varchar(40),
	`myDay` tinyint NOT NULL DEFAULT 0,
	`context` varchar(64),
	`assignedTo` varchar(255),
	`createdBy` varchar(255),
	`raw` mediumtext,
	`syncedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `tasks_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_tasks_user_task` UNIQUE(`userId`,`taskId`)
);
--> statement-breakpoint
CREATE INDEX `idx_tasks_user` ON `tasks` (`userId`);