CREATE TABLE `team_invites` (
	`id` int AUTO_INCREMENT NOT NULL,
	`invitedBy` int NOT NULL,
	`email` varchar(320) NOT NULL,
	`name` varchar(128),
	`role` enum('user','admin') NOT NULL DEFAULT 'user',
	`token` varchar(64) NOT NULL,
	`accepted` tinyint NOT NULL DEFAULT 0,
	`acceptedAt` timestamp,
	`acceptedUserId` int,
	`expiresAt` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `team_invites_id` PRIMARY KEY(`id`),
	CONSTRAINT `team_invites_token_unique` UNIQUE(`token`)
);
--> statement-breakpoint
CREATE INDEX `idx_ti_invited_by` ON `team_invites` (`invitedBy`);--> statement-breakpoint
CREATE INDEX `idx_ti_email` ON `team_invites` (`email`);--> statement-breakpoint
CREATE INDEX `idx_ti_token` ON `team_invites` (`token`);