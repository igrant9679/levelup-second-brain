CREATE TABLE `note_versions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`noteId` varchar(40) NOT NULL,
	`kind` varchar(16) NOT NULL,
	`label` varchar(255),
	`title` varchar(512),
	`bodyHtml` mediumtext,
	`body` mediumtext,
	`raw` mediumtext,
	`hash` varchar(16) NOT NULL,
	`chars` int NOT NULL DEFAULT 0,
	`savedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `note_versions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `idx_note_versions_note` ON `note_versions` (`userId`,`noteId`,`savedAt`);
--> statement-breakpoint
CREATE INDEX `idx_note_versions_kind` ON `note_versions` (`userId`,`kind`,`savedAt`);
