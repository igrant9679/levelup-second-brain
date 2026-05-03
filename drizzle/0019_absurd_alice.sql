CREATE TABLE `secret_expiry_reminders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`provider` varchar(32) NOT NULL,
	`label` varchar(128) NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`notifyDaysBefore` int NOT NULL DEFAULT 30,
	`lastNotifiedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `secret_expiry_reminders_id` PRIMARY KEY(`id`)
);
