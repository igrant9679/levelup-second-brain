CREATE TABLE `onenote_import_jobs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`status` enum('pending','running','completed','failed') NOT NULL DEFAULT 'pending',
	`notebookId` varchar(256),
	`notebookName` varchar(256),
	`sectionId` varchar(256),
	`sectionName` varchar(256),
	`pageId` varchar(256),
	`totalPages` int NOT NULL DEFAULT 0,
	`importedPages` int NOT NULL DEFAULT 0,
	`failedPages` int NOT NULL DEFAULT 0,
	`errorMessage` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`completedAt` timestamp,
	CONSTRAINT `onenote_import_jobs_id` PRIMARY KEY(`id`)
);
