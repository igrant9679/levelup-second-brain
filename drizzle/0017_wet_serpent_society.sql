CREATE TABLE `email_notifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`provider` varchar(32) NOT NULL,
	`emailSubject` text NOT NULL,
	`emailFrom` varchar(320) NOT NULL,
	`emailId` varchar(255) NOT NULL,
	`read` tinyint NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `email_notifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `event_reminders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`provider` varchar(32) NOT NULL,
	`eventId` varchar(255) NOT NULL,
	`eventTitle` text NOT NULL,
	`eventStart` timestamp NOT NULL,
	`reminderType` enum('5min','15min','1hour') NOT NULL,
	`sent` tinyint NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `event_reminders_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sync_status` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`provider` varchar(32) NOT NULL,
	`lastSyncAt` timestamp,
	`lastSyncStatus` enum('success','failed','pending') NOT NULL DEFAULT 'pending',
	`syncErrorMessage` text,
	`totalEventsImported` int NOT NULL DEFAULT 0,
	`totalEmailsImported` int NOT NULL DEFAULT 0,
	`totalContactsImported` int NOT NULL DEFAULT 0,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sync_status_id` PRIMARY KEY(`id`)
);
