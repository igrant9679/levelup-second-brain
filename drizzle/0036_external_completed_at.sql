ALTER TABLE `external_tasks` ADD `completedAt` timestamp NULL;
--> statement-breakpoint
CREATE INDEX `idx_ext_task_completed` ON `external_tasks` (`userId`,`completedAt`);
