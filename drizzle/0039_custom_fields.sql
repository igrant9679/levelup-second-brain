CREATE TABLE `project_custom_field_defs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`projectId` varchar(40) NOT NULL,
	`name` varchar(128) NOT NULL,
	`type` varchar(16) NOT NULL DEFAULT 'text',
	`options` mediumtext,
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `project_custom_field_defs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `idx_pcfd_user_proj` ON `project_custom_field_defs` (`userId`,`projectId`);
--> statement-breakpoint
CREATE TABLE `task_custom_field_values` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`taskId` varchar(40) NOT NULL,
	`fieldId` int NOT NULL,
	`value` mediumtext,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `task_custom_field_values_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_tcfv_task_field` UNIQUE(`userId`,`taskId`,`fieldId`)
);
--> statement-breakpoint
CREATE INDEX `idx_tcfv_user_task` ON `task_custom_field_values` (`userId`,`taskId`);
--> statement-breakpoint
CREATE INDEX `idx_tcfv_field` ON `task_custom_field_values` (`fieldId`);
