CREATE TABLE `bookmark_links` (
	`id` int AUTO_INCREMENT NOT NULL,
	`bookmarkId` int NOT NULL,
	`entityType` varchar(32) NOT NULL,
	`entityId` int NOT NULL,
	`userId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `bookmark_links_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `bookmarks` ADD `wordCount` int;--> statement-breakpoint
CREATE INDEX `idx_bl_bookmark` ON `bookmark_links` (`bookmarkId`);--> statement-breakpoint
CREATE INDEX `idx_bl_entity` ON `bookmark_links` (`entityType`,`entityId`);--> statement-breakpoint
CREATE INDEX `idx_bl_user` ON `bookmark_links` (`userId`);