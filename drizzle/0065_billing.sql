-- Self-serve sign-up and billing (build -279, Phase I of docs/multi-tenant-plan.md).
-- Additive: three new tables, no existing table or row is touched, and NO row
-- is inserted (a fresh database made by the migrations must stay empty apart
-- from 0063's workspace 1 — the backup restore depends on that).
--
-- A workspace WITHOUT a row in workspace_billing is not billed: never
-- trialled, limited by a plan or locked. That is every existing workspace.
CREATE TABLE `workspace_billing` (
	`workspaceId` int NOT NULL,
	`plan` varchar(32) NOT NULL DEFAULT 'comped',
	`status` varchar(16) NOT NULL DEFAULT 'comped',
	`trialEndsAt` timestamp NULL,
	`stripeCustomerId` varchar(64),
	`stripeSubscriptionId` varchar(64),
	`stripeItemId` varchar(64),
	`interval` varchar(8),
	`seats` int NOT NULL DEFAULT 0,
	`currentPeriodEnd` timestamp NULL,
	`cancelAtPeriodEnd` tinyint NOT NULL DEFAULT 0,
	`pastDueSince` timestamp NULL,
	`notified` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `workspace_billing_workspaceId` PRIMARY KEY(`workspaceId`)
);
--> statement-breakpoint
CREATE INDEX `idx_wsbilling_customer` ON `workspace_billing` (`stripeCustomerId`);
--> statement-breakpoint
CREATE TABLE `billing_events` (
	`eventId` varchar(96) NOT NULL,
	`type` varchar(64) NOT NULL,
	`workspaceId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `billing_events_eventId` PRIMARY KEY(`eventId`)
);
--> statement-breakpoint
CREATE INDEX `idx_billing_events_created` ON `billing_events` (`createdAt`);
--> statement-breakpoint
CREATE TABLE `signups` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tokenHash` varchar(64) NOT NULL,
	`email` varchar(320) NOT NULL,
	`name` varchar(128) NOT NULL,
	`workspaceName` varchar(120) NOT NULL,
	`passwordHash` varchar(255) NOT NULL,
	`ip` varchar(64),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`expiresAt` timestamp NOT NULL,
	`usedAt` timestamp NULL,
	CONSTRAINT `signups_id` PRIMARY KEY(`id`),
	CONSTRAINT `signups_tokenHash_unique` UNIQUE(`tokenHash`)
);
--> statement-breakpoint
CREATE INDEX `idx_signups_email` ON `signups` (`email`);
