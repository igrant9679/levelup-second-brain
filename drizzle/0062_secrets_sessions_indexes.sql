-- Audit 2026-11-06 medium/low fixes, server side. Additive only: new columns with
-- defaults, one new table, new NON-unique indexes.
--
-- users.tokenVersion: session revocation (F20). A session JWT carries the version it
-- was issued at; password reset / set and "sign out everywhere" bump it.
-- users.email gets a plain (NOT unique) index (F70): a duplicate address already in
-- the table would make a UNIQUE index fail this migration and stop the app.
-- Account creation is serialised in code instead (GET_LOCK lu_user_create).
-- rate_limits: persistent sign-in / reset / invite throttling (F19).
-- user_app_data.aiChat / coachTrash: two more per-item synced lists.
-- Indexes for email_delivery_log, password_reset_tokens and the PM nudge scan (F70).
-- The secret columns (passwords, tokens, client secrets) stay TEXT: values are now
-- stored as an "enc:v1:" AES-256-GCM envelope (F25), encrypted by the app at boot.
CREATE TABLE `rate_limits` (
	`bucket` varchar(64) NOT NULL,
	`windowStart` bigint NOT NULL,
	`hits` int NOT NULL DEFAULT 0,
	CONSTRAINT `rate_limits_pk` PRIMARY KEY(`bucket`,`windowStart`)
);
--> statement-breakpoint
ALTER TABLE `user_app_data` ADD `aiChat` mediumtext;
--> statement-breakpoint
ALTER TABLE `user_app_data` ADD `coachTrash` mediumtext;
--> statement-breakpoint
ALTER TABLE `users` ADD `tokenVersion` int DEFAULT 0 NOT NULL;
--> statement-breakpoint
CREATE INDEX `idx_rate_limits_window` ON `rate_limits` (`windowStart`);
--> statement-breakpoint
CREATE INDEX `idx_edl_user_created` ON `email_delivery_log` (`userId`,`createdAt`);
--> statement-breakpoint
CREATE INDEX `idx_edl_created` ON `email_delivery_log` (`createdAt`);
--> statement-breakpoint
CREATE INDEX `idx_prt_user` ON `password_reset_tokens` (`userId`);
--> statement-breakpoint
CREATE INDEX `idx_pm_rec_kind_deleted` ON `pm_records` (`kind`,`deletedAt`);
--> statement-breakpoint
CREATE INDEX `idx_users_email` ON `users` (`email`);
