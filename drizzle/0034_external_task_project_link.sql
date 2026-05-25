ALTER TABLE `external_task_overrides` ADD `localProjectId` varchar(40);
--> statement-breakpoint
CREATE INDEX `idx_ext_override_proj` ON `external_task_overrides` (`userId`,`localProjectId`);
