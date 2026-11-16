-- Uploaded files get an ownership record (multi-workspace Phase F, build -278).
-- Additive: one new table. Files uploaded before this have no row; their old
-- /api/files/d|s|f links keep working for the original workspace only.
CREATE TABLE `files` (
	`id` int AUTO_INCREMENT NOT NULL,
	`publicId` varchar(32) NOT NULL,
	`workspaceId` int NOT NULL,
	`ownerUserId` int,
	`store` varchar(40) NOT NULL DEFAULT 'platform',
	`backend` varchar(8) NOT NULL,
	`ref` varchar(1024) NOT NULL,
	`name` varchar(255) NOT NULL,
	`size` int,
	`mime` varchar(128),
	`isPublic` tinyint NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `files_id` PRIMARY KEY(`id`),
	CONSTRAINT `files_publicId_unique` UNIQUE(`publicId`)
);
--> statement-breakpoint
CREATE INDEX `idx_files_workspace` ON `files` (`workspaceId`);
