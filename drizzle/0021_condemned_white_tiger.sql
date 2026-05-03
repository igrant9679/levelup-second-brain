CREATE TABLE `bookmarks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`url` text NOT NULL,
	`title` varchar(512),
	`description` text,
	`favicon` text,
	`ogImage` text,
	`siteName` varchar(256),
	`tags` text,
	`notes` text,
	`isRead` tinyint NOT NULL DEFAULT 0,
	`isFavorite` tinyint NOT NULL DEFAULT 0,
	`color` varchar(32),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `bookmarks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `idx_bookmarks_user_created` ON `bookmarks` (`userId`,`createdAt`);