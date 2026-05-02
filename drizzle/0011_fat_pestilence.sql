ALTER TABLE `user_oauth_credentials` ADD `sharedWithTeam` tinyint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `user_oauth_credentials` ADD `lastVerifiedAt` timestamp DEFAULT null;