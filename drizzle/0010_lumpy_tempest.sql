CREATE TABLE `email_notification_prefs` (
	`userId` int NOT NULL,
	`optOutExpiryEmails` tinyint NOT NULL DEFAULT 0,
	`optOutDigestEmails` tinyint NOT NULL DEFAULT 0,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `email_notification_prefs_userId` PRIMARY KEY(`userId`)
);
