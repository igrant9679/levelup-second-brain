CREATE TABLE `coach_messages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`kind` varchar(32) NOT NULL,
	`runKey` varchar(64) NOT NULL,
	`title` varchar(255) NOT NULL,
	`body` mediumtext NOT NULL,
	`pushText` varchar(255),
	`actions` mediumtext,
	`status` varchar(16) NOT NULL DEFAULT 'new',
	`applyState` varchar(16) NOT NULL DEFAULT 'none',
	`applyResult` mediumtext,
	`channels` varchar(64),
	`error` mediumtext,
	`emailedAt` timestamp,
	`pushedAt` timestamp,
	`readAt` timestamp,
	`appliedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `coach_messages_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_coach_run` UNIQUE(`userId`,`runKey`)
);
--> statement-breakpoint
CREATE INDEX `idx_coach_user_created` ON `coach_messages` (`userId`,`createdAt`);
