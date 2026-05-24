ALTER TABLE `external_source_credentials` MODIFY COLUMN `apiToken` text;
--> statement-breakpoint
ALTER TABLE `external_source_credentials` ADD `clientId` varchar(255);
--> statement-breakpoint
ALTER TABLE `external_source_credentials` ADD `clientSecret` text;
--> statement-breakpoint
ALTER TABLE `external_source_credentials` ADD `refreshToken` text;
--> statement-breakpoint
ALTER TABLE `external_source_credentials` ADD `expiresAt` timestamp NULL;
--> statement-breakpoint
ALTER TABLE `external_source_credentials` ADD `scope` text;
