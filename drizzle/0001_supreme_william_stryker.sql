CREATE TABLE `tunes` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`composer` text,
	`key` text,
	`source_chart` text NOT NULL,
	`source_chart_status` text DEFAULT 'draft' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
