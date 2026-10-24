ALTER TABLE `simplified_charts` ADD `flagged_bars` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `simplified_charts` ADD `archived_at` integer;--> statement-breakpoint
ALTER TABLE `tunes` ADD `verified_chart` text;--> statement-breakpoint
UPDATE `tunes` SET `verified_chart` = `source_chart` WHERE `verified_at` IS NOT NULL;
