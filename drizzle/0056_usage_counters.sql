CREATE TABLE `usage_counters` (
	`userId` int NOT NULL,
	`bucket` varchar(32) NOT NULL,
	`day` varchar(10) NOT NULL,
	`n` int NOT NULL DEFAULT 0,
	`updatedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `usage_counters_pk` PRIMARY KEY(`userId`,`bucket`,`day`)
);
