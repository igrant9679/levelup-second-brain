CREATE TABLE `credential_audit_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`provider` varchar(32) NOT NULL,
	`action` enum('saved','cleared') NOT NULL,
	`performedBy` int NOT NULL,
	`performedByName` varchar(256),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `credential_audit_log_id` PRIMARY KEY(`id`)
);
