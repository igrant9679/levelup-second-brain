CREATE TABLE `scheduled_task_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`taskName` varchar(128) NOT NULL,
	`ranAt` timestamp NOT NULL DEFAULT (now()),
	`durationMs` int,
	`emailsSent` int NOT NULL DEFAULT 0,
	`ownerNotified` tinyint NOT NULL DEFAULT 0,
	`error` text,
	CONSTRAINT `scheduled_task_log_id` PRIMARY KEY(`id`)
);
