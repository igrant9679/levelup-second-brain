CREATE TABLE `notes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`noteId` varchar(40) NOT NULL,
	`title` varchar(512),
	`folderId` varchar(40),
	`pinned` tinyint NOT NULL DEFAULT 0,
	`starred` tinyint NOT NULL DEFAULT 0,
	`archived` tinyint NOT NULL DEFAULT 0,
	`color` varchar(32),
	`updatedAt` varchar(40),
	`createdAt` varchar(40),
	`raw` mediumtext,
	`syncedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `notes_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_notes_user_note` UNIQUE(`userId`,`noteId`)
);
--> statement-breakpoint
CREATE INDEX `idx_notes_user` ON `notes` (`userId`);
--> statement-breakpoint
CREATE TABLE `ideas` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`ideaId` varchar(40) NOT NULL,
	`title` varchar(512),
	`stage` varchar(32),
	`ideaType` varchar(32),
	`goalId` varchar(40),
	`iceImpact` int,
	`iceConfidence` int,
	`iceEase` int,
	`createdBy` varchar(255),
	`createdAt` varchar(40),
	`raw` mediumtext,
	`syncedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ideas_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_ideas_user_idea` UNIQUE(`userId`,`ideaId`)
);
--> statement-breakpoint
CREATE INDEX `idx_ideas_user` ON `ideas` (`userId`);