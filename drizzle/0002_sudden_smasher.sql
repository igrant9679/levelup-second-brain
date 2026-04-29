CREATE TABLE `ai_help_conversations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`startedAt` timestamp NOT NULL DEFAULT (now()),
	`lastMessageAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `ai_help_conversations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ai_help_messages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`conversationId` int NOT NULL,
	`role` enum('user','assistant') NOT NULL,
	`body` text NOT NULL,
	`citedArticleIds` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `ai_help_messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `help_articles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`slug` varchar(128) NOT NULL,
	`title` varchar(256) NOT NULL,
	`summary` text,
	`bodyMarkdown` text,
	`categoryId` int,
	`tags` text,
	`status` enum('draft','published') NOT NULL DEFAULT 'draft',
	`associatedTourId` int,
	`authorId` int,
	`viewCount` int NOT NULL DEFAULT 0,
	`helpfulCount` int NOT NULL DEFAULT 0,
	`notHelpfulCount` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `help_articles_id` PRIMARY KEY(`id`),
	CONSTRAINT `help_articles_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `help_categories` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(128) NOT NULL,
	`icon` varchar(32) NOT NULL DEFAULT '📄',
	`sortOrder` int NOT NULL DEFAULT 0,
	CONSTRAINT `help_categories_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `help_search_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int,
	`query` varchar(512) NOT NULL,
	`resultsCount` int NOT NULL DEFAULT 0,
	`clickedResultId` int,
	`satisfied` enum('yes','no','unknown') DEFAULT 'unknown',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `help_search_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `tour_steps` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tourId` int NOT NULL,
	`sortOrder` int NOT NULL DEFAULT 0,
	`targetSelector` varchar(512),
	`targetDataTourId` varchar(128),
	`title` varchar(256) NOT NULL,
	`bodyMarkdown` text,
	`visualTreatment` enum('spotlight','pulse','arrow','coach') DEFAULT 'spotlight',
	`advanceCondition` enum('next_button','element_clicked','form_field_filled','route_changed','custom_event') DEFAULT 'next_button',
	`advanceConfig` text,
	`skipAllowed` int NOT NULL DEFAULT 1,
	`backAllowed` int NOT NULL DEFAULT 1,
	`branchingRules` text,
	CONSTRAINT `tour_steps_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `tours` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(256) NOT NULL,
	`description` text,
	`type` enum('onboarding','feature','whats_new','custom') NOT NULL DEFAULT 'feature',
	`roleTags` text,
	`estimatedMinutes` int NOT NULL DEFAULT 3,
	`prerequisiteTourId` int,
	`status` enum('draft','published') NOT NULL DEFAULT 'draft',
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `tours_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `user_learning_preferences` (
	`userId` int NOT NULL,
	`showCoachMascot` int NOT NULL DEFAULT 1,
	`showProactiveHints` int NOT NULL DEFAULT 1,
	`completedOnboarding` int NOT NULL DEFAULT 0,
	`preferredTourSpeed` enum('slow','normal','fast') DEFAULT 'normal',
	CONSTRAINT `user_learning_preferences_userId` PRIMARY KEY(`userId`)
);
--> statement-breakpoint
CREATE TABLE `user_tour_progress` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`tourId` int NOT NULL,
	`status` enum('not_started','in_progress','completed','skipped') NOT NULL DEFAULT 'not_started',
	`currentStep` int NOT NULL DEFAULT 0,
	`startedAt` timestamp,
	`completedAt` timestamp,
	`lastResumedAt` timestamp,
	CONSTRAINT `user_tour_progress_id` PRIMARY KEY(`id`)
);
