CREATE TABLE `bookmark_collection_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`collectionId` int NOT NULL,
	`bookmarkId` int NOT NULL,
	`userId` int NOT NULL,
	`addedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `bookmark_collection_items_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_bci_col_bm` UNIQUE(`collectionId`,`bookmarkId`)
);
--> statement-breakpoint
CREATE TABLE `bookmark_collections` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(128) NOT NULL,
	`description` text,
	`color` varchar(32) DEFAULT '#3B82F6',
	`icon` varchar(8) DEFAULT '📁',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `bookmark_collections_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `bookmark_shares` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`token` varchar(64) NOT NULL,
	`title` varchar(256),
	`description` text,
	`shareType` enum('collection','selection') NOT NULL DEFAULT 'selection',
	`collectionId` int,
	`bookmarkIds` text,
	`expiresAt` timestamp,
	`viewCount` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `bookmark_shares_id` PRIMARY KEY(`id`),
	CONSTRAINT `bookmark_shares_token_unique` UNIQUE(`token`)
);
--> statement-breakpoint
CREATE INDEX `idx_bci_collection` ON `bookmark_collection_items` (`collectionId`);--> statement-breakpoint
CREATE INDEX `idx_bci_bookmark` ON `bookmark_collection_items` (`bookmarkId`);--> statement-breakpoint
CREATE INDEX `idx_bc_user` ON `bookmark_collections` (`userId`);--> statement-breakpoint
CREATE INDEX `idx_bs_user` ON `bookmark_shares` (`userId`);--> statement-breakpoint
CREATE INDEX `idx_bs_token` ON `bookmark_shares` (`token`);