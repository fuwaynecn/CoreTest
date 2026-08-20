ALTER TABLE `question_templates` ADD `common_errors` text;--> statement-breakpoint
ALTER TABLE `question_templates` ADD `reading_card` integer;--> statement-breakpoint
ALTER TABLE `question_templates` ADD `source` text DEFAULT 'unknown' NOT NULL;--> statement-breakpoint
ALTER TABLE `question_templates` ADD `license_status` text DEFAULT 'unknown' NOT NULL;