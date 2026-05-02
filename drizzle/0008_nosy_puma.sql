CREATE TABLE `email_delivery_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int,
	`to` varchar(320) NOT NULL,
	`subject` varchar(512) NOT NULL,
	`status` enum('sent','failed','skipped') NOT NULL,
	`errorMessage` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `email_delivery_log_id` PRIMARY KEY(`id`)
);
