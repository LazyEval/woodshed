CREATE TABLE `rules` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`text` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `simplified_charts` ADD `generation` text;