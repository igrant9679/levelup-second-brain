ALTER TABLE `external_task_overrides` ADD `pendingStatus` varchar(128);
--> statement-breakpoint
ALTER TABLE `external_task_overrides` ADD `pendingStatusAt` timestamp NULL;
--> statement-breakpoint
ALTER TABLE `external_task_overrides` ADD `pendingError` mediumtext;
