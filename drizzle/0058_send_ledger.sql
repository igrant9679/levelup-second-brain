CREATE TABLE `send_ledger` (
	`userId` int NOT NULL,
	`kind` varchar(64) NOT NULL,
	`period` varchar(40) NOT NULL,
	`sentAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `send_ledger_pk` PRIMARY KEY(`userId`,`kind`,`period`)
);
