CREATE TABLE `clips` (
	`slug` text PRIMARY KEY NOT NULL,
	`content` text DEFAULT '' NOT NULL,
	`updated_at` integer NOT NULL
);
