-- Audit 3 (build -288). Additive: two new tables, nothing existing is touched
-- and NO row is inserted (a fresh database made by the migrations must stay
-- empty apart from 0063's workspace 1 — the backup restore depends on that).
--
-- trial_claims: one free trial per person, ever (keyed by the normalised email).
-- email_changes: a change of sign-in email waits for the link sent to the new address.
CREATE TABLE `trial_claims` (
	`emailKey` varchar(64) NOT NULL,
	`loginId` int,
	`workspaceId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `trial_claims_emailKey` PRIMARY KEY(`emailKey`)
);
--> statement-breakpoint
CREATE INDEX `idx_trial_claims_login` ON `trial_claims` (`loginId`);
--> statement-breakpoint
CREATE TABLE `email_changes` (
	`tokenHash` varchar(64) NOT NULL,
	`userId` int NOT NULL,
	`newEmail` varchar(320) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`expiresAt` timestamp NOT NULL,
	`usedAt` timestamp NULL,
	CONSTRAINT `email_changes_tokenHash` PRIMARY KEY(`tokenHash`)
);
--> statement-breakpoint
CREATE INDEX `idx_email_changes_user` ON `email_changes` (`userId`);
--> statement-breakpoint
-- invitation links are stored as "h1:" + SHA-256 of the token (like reset and sign-up tokens);
-- the column grows to hold the prefix. Links sent before this change still work.
ALTER TABLE `team_invites` MODIFY COLUMN `token` varchar(80) NOT NULL;
