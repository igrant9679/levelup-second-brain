CREATE TABLE `external_source_credentials` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`source` varchar(32) NOT NULL,
	`apiToken` text NOT NULL,
	`accountEmail` varchar(320),
	`accountDisplayName` varchar(255),
	`accountExternalId` varchar(128),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `external_source_credentials_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_ext_cred_user_source` UNIQUE(`userId`,`source`)
);
--> statement-breakpoint
CREATE INDEX `idx_ext_cred_user` ON `external_source_credentials` (`userId`);
--> statement-breakpoint
CREATE TABLE `smartsheet_watched_sheets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`sheetId` varchar(64) NOT NULL,
	`label` varchar(128),
	`ownerColumn` varchar(64) NOT NULL,
	`ownerMatchValue` varchar(128) NOT NULL,
	`matchMode` varchar(16) NOT NULL DEFAULT 'contains',
	`statusColumn` varchar(64),
	`dueColumn` varchar(64),
	`excludeDoneStatuses` varchar(256),
	`enabled` tinyint NOT NULL DEFAULT 1,
	`lastPulledAt` timestamp,
	`lastError` mediumtext,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `smartsheet_watched_sheets_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_ss_watch_user_sheet` UNIQUE(`userId`,`sheetId`)
);
--> statement-breakpoint
CREATE INDEX `idx_ss_watch_user` ON `smartsheet_watched_sheets` (`userId`);
--> statement-breakpoint
CREATE TABLE `nifty_watched_projects` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`projectId` varchar(64) NOT NULL,
	`label` varchar(128),
	`filterByAssignee` tinyint NOT NULL DEFAULT 1,
	`enabled` tinyint NOT NULL DEFAULT 1,
	`lastPulledAt` timestamp,
	`lastError` mediumtext,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `nifty_watched_projects_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_nifty_watch_user_project` UNIQUE(`userId`,`projectId`)
);
--> statement-breakpoint
CREATE INDEX `idx_nifty_watch_user` ON `nifty_watched_projects` (`userId`);
--> statement-breakpoint
CREATE TABLE `external_tasks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`source` varchar(32) NOT NULL,
	`sourceConfigId` int NOT NULL,
	`externalId` varchar(128) NOT NULL,
	`externalUrl` varchar(1024),
	`title` varchar(1024) NOT NULL,
	`description` mediumtext,
	`status` varchar(64),
	`priority` varchar(32),
	`due` varchar(32),
	`startDate` varchar(32),
	`assignee` varchar(255),
	`projectLabel` varchar(255),
	`parentExternalId` varchar(128),
	`raw` mediumtext,
	`fetchedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`removedAt` timestamp,
	CONSTRAINT `external_tasks_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_ext_task_user_source_id` UNIQUE(`userId`,`source`,`externalId`)
);
--> statement-breakpoint
CREATE INDEX `idx_ext_task_user` ON `external_tasks` (`userId`);
--> statement-breakpoint
CREATE INDEX `idx_ext_task_source_cfg` ON `external_tasks` (`sourceConfigId`);
--> statement-breakpoint
CREATE INDEX `idx_ext_task_due` ON `external_tasks` (`userId`,`due`);
--> statement-breakpoint
CREATE TABLE `external_task_overrides` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`source` varchar(32) NOT NULL,
	`externalId` varchar(128) NOT NULL,
	`myDay` tinyint NOT NULL DEFAULT 0,
	`localPriority` varchar(32),
	`localNote` mediumtext,
	`localTags` varchar(512),
	`localDue` varchar(32),
	`tombstoned` tinyint NOT NULL DEFAULT 0,
	`tombstonedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `external_task_overrides_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_ext_override_user_source_id` UNIQUE(`userId`,`source`,`externalId`)
);
--> statement-breakpoint
CREATE INDEX `idx_ext_override_user` ON `external_task_overrides` (`userId`);
--> statement-breakpoint
ALTER TABLE `tasks` ADD `parentTaskId` varchar(40);
--> statement-breakpoint
ALTER TABLE `tasks` ADD `recurrenceRule` mediumtext;
--> statement-breakpoint
CREATE INDEX `idx_tasks_parent` ON `tasks` (`userId`,`parentTaskId`);
--> statement-breakpoint
CREATE TABLE `time_entries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`taskId` varchar(40) NOT NULL,
	`source` varchar(32) NOT NULL DEFAULT 'local',
	`startedAt` timestamp NOT NULL,
	`endedAt` timestamp,
	`durationMins` int,
	`note` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `time_entries_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `idx_time_entries_user_task` ON `time_entries` (`userId`,`taskId`);
--> statement-breakpoint
CREATE INDEX `idx_time_entries_user_started` ON `time_entries` (`userId`,`startedAt`);
