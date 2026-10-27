CREATE TABLE `audit_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`actorUserId` int,
	`actorName` varchar(255),
	`action` varchar(64) NOT NULL,
	`targetUserId` int,
	`targetType` varchar(32),
	`targetId` varchar(128),
	`detail` text,
	`ip` varchar(64),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `audit_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `idx_audit_log_created` ON `audit_log` (`createdAt`);
--> statement-breakpoint
CREATE TABLE `error_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`fingerprint` varchar(16) NOT NULL,
	`source` varchar(16) NOT NULL,
	`message` varchar(1000) NOT NULL,
	`stack` text,
	`location` varchar(512),
	`build` varchar(40),
	`userId` int,
	`userAgent` varchar(255),
	`count` int NOT NULL DEFAULT 1,
	`firstAt` timestamp NOT NULL DEFAULT (now()),
	`lastAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `error_log_id` PRIMARY KEY(`id`),
	CONSTRAINT `error_log_fingerprint_unique` UNIQUE(`fingerprint`)
);
--> statement-breakpoint
CREATE INDEX `idx_error_log_last` ON `error_log` (`lastAt`);
