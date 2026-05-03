CREATE TABLE `calendar_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`provider` varchar(32) NOT NULL,
	`eventId` varchar(512) NOT NULL,
	`title` text NOT NULL,
	`start` timestamp NOT NULL,
	`end` timestamp NOT NULL,
	`location` text,
	`description` text,
	`organizer` varchar(320),
	`isAllDay` tinyint NOT NULL DEFAULT 0,
	`status` varchar(64),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `calendar_events_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_cal_event_user_provider` UNIQUE(`userId`,`provider`,`eventId`)
);
--> statement-breakpoint
ALTER TABLE `email_notifications` ADD CONSTRAINT `uq_email_notif_user_email` UNIQUE(`userId`,`emailId`);--> statement-breakpoint
CREATE INDEX `idx_cal_events_user_start` ON `calendar_events` (`userId`,`start`);