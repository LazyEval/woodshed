CREATE TABLE `practice_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`tune_id` text NOT NULL,
	`practiced_on` text NOT NULL,
	`rating` text NOT NULL,
	`chart` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`tune_id`) REFERENCES `tunes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `practice_sessions_tune_idx` ON `practice_sessions` (`tune_id`,`practiced_on`);--> statement-breakpoint
ALTER TABLE `tunes` ADD `verified_at` integer;--> statement-breakpoint
ALTER TABLE `tunes` ADD `shelved` integer DEFAULT false NOT NULL;