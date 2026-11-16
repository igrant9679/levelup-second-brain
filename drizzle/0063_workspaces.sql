-- Multi-workspace foundation (build -278, docs/multi-tenant-plan.md). Additive:
-- two new tables, new columns, new NON-unique indexes. No existing column or
-- row is removed or rewritten except the new columns' backfill.
--
-- Model: a `users` row is one MEMBER of one workspace (users.workspaceId), so
-- every table keyed by userId is inside that workspace by construction. A
-- person in several workspaces has one login row (accountId NULL) plus one
-- member row per further workspace (accountId = the login row's id).
--
-- Backfill: workspace 1 is created here and every existing account, invite,
-- audit row and mail-log row is placed in it. Its owner (and the platform
-- operator) is set at boot by ensureWorkspaceBootstrap() — it depends on the
-- OWNER_OPEN_ID env value, which SQL cannot see.
--
-- Defaults: users.workspaceId and team_invites.workspaceId are added with
-- DEFAULT 1 (that IS the backfill) and then switched to DEFAULT 0. Workspace 0
-- never exists, so a row written without a workspace — by the previous build
-- still running while this one deploys, or by a future bug — is inert instead
-- of landing in somebody's workspace.
CREATE TABLE `workspaces` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(120) NOT NULL,
	`slug` varchar(64) NOT NULL,
	`status` varchar(16) NOT NULL DEFAULT 'active',
	`ownerUserId` int,
	`features` text,
	`storage` text,
	`branding` text,
	`quotas` text,
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`deletedAt` timestamp,
	CONSTRAINT `workspaces_id` PRIMARY KEY(`id`),
	CONSTRAINT `workspaces_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `workspace_settings` (
	`workspaceId` int NOT NULL,
	`key` varchar(128) NOT NULL,
	`value` text NOT NULL,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `workspace_settings_pk` PRIMARY KEY(`workspaceId`,`key`)
);
--> statement-breakpoint
INSERT INTO `workspaces` (`id`, `name`, `slug`, `status`, `features`) VALUES (1, 'LevelUp', 'main', 'active', '{"atlas":true,"cfLabels":true}');
--> statement-breakpoint
ALTER TABLE `users` ADD `workspaceId` int NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `users` ALTER COLUMN `workspaceId` SET DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `users` ADD `accountId` int;
--> statement-breakpoint
ALTER TABLE `users` ADD `platformRole` varchar(16);
--> statement-breakpoint
CREATE INDEX `idx_users_workspace` ON `users` (`workspaceId`);
--> statement-breakpoint
CREATE INDEX `idx_users_account` ON `users` (`accountId`);
--> statement-breakpoint
ALTER TABLE `team_invites` ADD `workspaceId` int NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `team_invites` ALTER COLUMN `workspaceId` SET DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `team_invites` ADD `asOwner` tinyint NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `audit_log` ADD `workspaceId` int;
--> statement-breakpoint
UPDATE `audit_log` SET `workspaceId` = 1;
--> statement-breakpoint
ALTER TABLE `email_delivery_log` ADD `workspaceId` int;
--> statement-breakpoint
UPDATE `email_delivery_log` SET `workspaceId` = 1;
--> statement-breakpoint
INSERT INTO `workspace_settings` (`workspaceId`, `key`, `value`)
	SELECT 1, `key`, `value` FROM `system_settings`
	WHERE `key` IN ('aiProvider', 'aiKey_openai', 'aiKey_claude', 'aiKey_gemini', 'notificationSender', 'teamStarterPreset');
