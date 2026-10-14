CREATE TABLE `push_subscriptions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`endpoint` varchar(512) NOT NULL,
	`p256dh` varchar(255) NOT NULL,
	`auth` varchar(255) NOT NULL,
	`userAgent` varchar(255),
	`failCount` int NOT NULL DEFAULT 0,
	`lastOkAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `push_subscriptions_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_push_endpoint` UNIQUE(`endpoint`)
);
--> statement-breakpoint
CREATE INDEX `idx_push_user` ON `push_subscriptions` (`userId`);
