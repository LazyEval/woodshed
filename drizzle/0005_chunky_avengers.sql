CREATE TABLE `simplified_charts` (
	`id` text PRIMARY KEY NOT NULL,
	`tune_id` text NOT NULL,
	`name` text NOT NULL,
	`origin` text NOT NULL,
	`chart` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`tune_id`) REFERENCES `tunes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `simplified_charts_tune_idx` ON `simplified_charts` (`tune_id`,`created_at`);